// =====================================================
// ANGELONE SMARTAPI BROKER ADAPTER
// Handles automated login via TOTP & Order Execution for Indian Market (NSE/BSE)
// =====================================================

import { SmartAPI } from 'smartapi-javascript';
import { TOTP } from 'totp-generator';

class AngelOneBrokerAdapter {
    constructor() {
        this.smartApi = null;
        this.sessionData = null;
        this.isLoggedIn = false;
    }

    /**
     * Initializes & Logs into AngelOne SmartAPI using TOTP authentication.
     */
    async initialize() {
        const apiKey = process.env.ANGEL_API_KEY;
        const clientCode = process.env.ANGEL_CLIENT_CODE;
        const password = process.env.ANGEL_PASSWORD;
        const totpSecret = process.env.ANGEL_TOTP_SECRET;

        if (!apiKey || !clientCode || !password || !totpSecret) {
            console.warn('[ANGELONE BROKER] Missing API credentials in .env. Execution in SIMULATION mode.');
            return false;
        }

        try {
            console.log(`[ANGELONE BROKER] Authenticating client ${clientCode}...`);
            this.smartApi = new SmartAPI({
                api_key: apiKey
            });

            // Generate 2FA TOTP token
            const token = TOTP.generate(totpSecret).otp;

            this.sessionData = await this.smartApi.generateSession(clientCode, password, token);
            
            if (this.sessionData && this.sessionData.status) {
                this.isLoggedIn = true;
                console.log(`[ANGELONE BROKER] Authentication successful! JWT Token acquired.`);
                return true;
            } else {
                console.error('[ANGELONE BROKER] Login failed:', this.sessionData?.message);
                return false;
            }
        } catch (error) {
            console.error('[ANGELONE BROKER] Auth error:', error.message);
            return false;
        }
    }

    /**
     * Places a live market/limit order on AngelOne (NSE/BSE).
     * @param {Object} params
     * @param {string} params.symbol        - e.g., "RELIANCE-EQ"
     * @param {string} params.token         - AngelOne symbol token (e.g., "2885")
     * @param {string} params.action        - "BUY" or "SELL"
     * @param {number} params.quantity      - Number of shares computed by Kelly Engine
     * @param {number} [params.price]       - Price for LIMIT order
     * @returns {Promise<Object>} Execution result
     */
    async placeOrder({ symbol, token, action, quantity, price = 0 }) {
        if (!this.isLoggedIn) {
            console.log(`[ANGELONE SIMULATION] Mock ${action} ${quantity} qty of ${symbol} @ ₹${price}`);
            return {
                status: true,
                orderId: `SIM_${Date.now()}`,
                message: 'Simulation Order Executed (Add AngelOne credentials to .env for live order routing)'
            };
        }

        try {
            const orderParams = {
                variety: "NORMAL",
                tradingsymbol: symbol,
                symboltoken: token,
                transactiontype: action.toUpperCase(),
                exchange: "NSE",
                ordertype: price > 0 ? "LIMIT" : "MARKET",
                producttype: "INTRADAY", // or "DELIVERY"
                duration: "DAY",
                price: price.toString(),
                squareoff: "0",
                stoploss: "0",
                quantity: quantity.toString()
            };

            console.log(`[ANGELONE LIVE ORDER] Sending payload:`, orderParams);
            const response = await this.smartApi.placeOrder(orderParams);
            console.log(`[ANGELONE LIVE ORDER SUCCESS] Order ID:`, response.data?.orderid);
            return {
                status: true,
                orderId: response.data?.orderid,
                response: response.data
            };
        } catch (error) {
            console.error(`[ANGELONE ORDER ERROR] Failed to execute ${action} on ${symbol}:`, error.message);
            return {
                status: false,
                error: error.message
            };
        }
    }
}

export const angelOneBroker = new AngelOneBrokerAdapter();
