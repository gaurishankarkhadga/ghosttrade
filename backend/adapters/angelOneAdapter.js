import { SmartAPI } from 'smartapi-javascript';
import speakeasy from 'speakeasy';
import { BaseBrokerAdapter, registerAdapter } from '../brokerAdapter.js';

export class AngelOneAdapter extends BaseBrokerAdapter {
    constructor(credentials) {
        super('ANGEL_ONE', credentials);
        if (!credentials.apiKey || !credentials.clientCode || !credentials.password || !credentials.totpSecret) {
            throw new Error('Angel One adapter requires apiKey, clientCode, password, and totpSecret.');
        }

        this.apiKey = credentials.apiKey;
        this.clientCode = credentials.clientCode;
        this.password = credentials.password;
        this.totpSecret = credentials.totpSecret;
        
        this.smartApi = new SmartAPI({
            api_key: this.apiKey,
        });

        this.jwtToken = null;
        this.refreshToken = null;
        this.feedToken = null;
        this.isLoggedIn = false;
    }

    /**
     * Authenticate with Angel One using automated TOTP.
     * Bypasses the need for daily manual user logins.
     */
    async authenticate() {
        if (this.isLoggedIn && this.jwtToken) return true;

        try {
            console.log(`[ANGEL ONE] Authenticating user ${this.clientCode}... generating automated TOTP.`);
            
            // Generate TOTP on the fly using the Secret Key
            const totpCode = speakeasy.totp({
                secret: this.totpSecret,
                encoding: 'base32'
            });

            // Login to SmartAPI
            const response = await this.smartApi.generateSession(this.clientCode, this.password, totpCode);
            
            if (response && response.status && response.data) {
                this.jwtToken = response.data.jwtToken;
                this.refreshToken = response.data.refreshToken;
                this.feedToken = response.data.feedToken;
                this.isLoggedIn = true;
                console.log(`[ANGEL ONE] Successfully authenticated ${this.clientCode}`);
                return true;
            } else {
                console.error('[ANGEL ONE] Auth Failed:', response.message || 'Unknown error');
                return false;
            }
        } catch (error) {
            console.error('[ANGEL ONE] Auth Exception:', error.message);
            return false;
        }
    }

    /**
     * Fetch Account Balance / Margins
     */
    async getBalance() {
        await this.authenticate();
        try {
            const margin = await this.smartApi.getRMS();
            if (margin && margin.status && margin.data) {
                return {
                    availableMargin: parseFloat(margin.data.availablecash),
                    totalMargin: parseFloat(margin.data.net || margin.data.availablecash)
                };
            }
            return { availableMargin: 0, totalMargin: 0 };
        } catch (error) {
            console.error('[ANGEL ONE] Margin Error:', error.message);
            return { availableMargin: 0, totalMargin: 0 };
        }
    }

    /**
     * Standardized Place Order Interface
     */
    async placeOrder(params) {
        await this.authenticate();
        
        const { asset, side, quantity, price, orderType = 'MARKET' } = params;

        // F&O Mapping: For simplicity in GhostTrade's architecture, 
        // we map standard AI F&O signals into Angel One's required fields.
        // We assume 'asset' contains the trading symbol, e.g., 'BANKNIFTY15JUN2352000CE'

        const orderParams = {
            variety: "NORMAL",
            tradingsymbol: asset,
            symboltoken: params.symbolToken || "3045", // Will require token lookup in production F&O
            transactiontype: side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            exchange: "NFO", // National F&O Exchange
            ordertype: orderType.toUpperCase(),
            producttype: "CARRYFORWARD",
            duration: "DAY",
            price: orderType.toUpperCase() === 'LIMIT' ? price.toString() : "0",
            squareoff: "0",
            stoploss: "0",
            quantity: quantity.toString()
        };

        try {
            console.log(`[ANGEL ONE] Submitting order for ${quantity}x ${asset} on NFO`);
            const response = await this.smartApi.placeOrder(orderParams);
            
            if (response && response.status) {
                return {
                    success: true,
                    orderId: response.data.orderid,
                    filledPrice: price, // Estimate, actual fill requires websocket check
                    message: response.message
                };
            } else {
                return {
                    success: false,
                    reason: response.message || 'Unknown API Rejection'
                };
            }
        } catch (error) {
            console.error('[ANGEL ONE] Order Execution Error:', error.message);
            return {
                success: false,
                reason: error.message
            };
        }
    }
}

// Auto-register the adapter
registerAdapter('ANGEL_ONE', AngelOneAdapter);
