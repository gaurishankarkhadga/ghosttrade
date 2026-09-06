import { SmartAPI } from 'smartapi-javascript';
import speakeasy from 'speakeasy';
import { BaseBrokerAdapter, registerAdapter } from '../brokerAdapter.js';
import { getDb } from '../mongoConfig.js';

// In-memory cache for process lifetime
let _inMemorySession = null;

// Sequential rate limiter queue for SmartAPI endpoints (max ~2.5 requests/second, strictly under the 3 req/s limit)
class AngelRateLimiter {
    constructor(minDelayMs = 400) {
        this.minDelayMs = minDelayMs;
        this.lastCallTime = 0;
        this.queue = Promise.resolve();
    }

    enqueue(fn) {
        const next = this.queue.then(async () => {
            const now = Date.now();
            const elapsed = now - this.lastCallTime;
            if (elapsed < this.minDelayMs) {
                await new Promise(r => setTimeout(r, this.minDelayMs - elapsed));
            }
            this.lastCallTime = Date.now();
            return fn();
        });
        this.queue = next.catch(() => {}); // Prevent unhandled queue crash
        return next;
    }
}

const angelRateLimiter = new AngelRateLimiter(400);

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
        this.tokenCreatedAt = 0;
    }

    /**
     * Authenticate with Angel One using automated TOTP.
     * Bypasses the need for daily manual user logins.
     * Authenticate with Angel One using persistent 20-hour session cache.
     * Reuses active tokens to completely eliminate the "Access denied because of exceeding access rate" error.
     */
    async authenticate() {
        if (this.isLoggedIn && this.jwtToken) return true;
        const SESSION_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours (SmartAPI tokens last 24h)

        // 1. Check in-instance session
        if (this.isLoggedIn && this.jwtToken && (Date.now() - this.tokenCreatedAt < SESSION_MAX_AGE_MS)) {
            return true;
        }

        // 2. Check process in-memory session
        if (_inMemorySession && _inMemorySession.clientCode === this.clientCode && (Date.now() - _inMemorySession.updatedAt < SESSION_MAX_AGE_MS)) {
            this.jwtToken = _inMemorySession.jwtToken;
            this.refreshToken = _inMemorySession.refreshToken;
            this.feedToken = _inMemorySession.feedToken;
            this.smartApi.setAccessToken(this.jwtToken);
            this.smartApi.setPublicToken(this.refreshToken);
            this.smartApi.setClientCode(this.clientCode);
            this.isLoggedIn = true;
            this.tokenCreatedAt = _inMemorySession.updatedAt;
            return true;
        }

        // 3. Check persistent database session (shared across worker threads and server restarts)
        try {
            const db = await getDb();
            const savedSession = await db.collection('broker_sessions').findOne({
                broker: 'ANGEL_ONE',
                clientCode: this.clientCode
            });

            if (savedSession && savedSession.jwtToken && (Date.now() - savedSession.updatedAt < SESSION_MAX_AGE_MS)) {
                this.jwtToken = savedSession.jwtToken;
                this.refreshToken = savedSession.refreshToken;
                this.feedToken = savedSession.feedToken;
                this.smartApi.setAccessToken(this.jwtToken);
                this.smartApi.setPublicToken(this.refreshToken);
                this.smartApi.setClientCode(this.clientCode);
                this.isLoggedIn = true;
                this.tokenCreatedAt = savedSession.updatedAt;
                _inMemorySession = savedSession;
                console.log(`[ANGEL ONE] Restored active session for ${this.clientCode} from database cache (valid for ${((SESSION_MAX_AGE_MS - (Date.now() - savedSession.updatedAt)) / 3600000).toFixed(1)}h).`);
                return true;
            }
        } catch (dbErr) {
            // DB session lookup non-fatal; continue to fresh login
        }

        // 4. Session missing or expired: Perform TOTP login through SmartAPI
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
                this.tokenCreatedAt = Date.now();

                const sessionRecord = {
                    broker: 'ANGEL_ONE',
                    clientCode: this.clientCode,
                    jwtToken: this.jwtToken,
                    refreshToken: this.refreshToken,
                    feedToken: this.feedToken,
                    updatedAt: this.tokenCreatedAt
                };

                _inMemorySession = sessionRecord;

                // Persist session to MongoDB for all workers to reuse
                try {
                    const db = await getDb();
                    await db.collection('broker_sessions').updateOne(
                        { broker: 'ANGEL_ONE', clientCode: this.clientCode },
                        { $set: sessionRecord },
                        { upsert: true }
                    );
                } catch (saveErr) {
                    console.warn('[ANGEL ONE] Failed to persist session to DB:', saveErr.message);
                }

                console.log(`[ANGEL ONE] Successfully authenticated ${this.clientCode} and cached 24h session.`);
                return true;
            } else {
                console.error('[ANGEL ONE] Auth Failed:', response.message || 'Unknown error');
                console.error('[ANGEL ONE] Auth Failed:', response?.message || 'Unknown error');
                return false;
            }
        } catch (error) {
            console.error('[ANGEL ONE] Auth Exception:', error.message);
            return false;
        }
    }

    /**
     * Rate-limited Candle Data Fetcher
     * Enforces queue serialization to guarantee <= 2.5 req/sec (below Angel One 3 req/sec limit)
     */
    async getCandleData(params) {
        await this.authenticate();
        return angelRateLimiter.enqueue(async () => {
            try {
                const res = await this.smartApi.getCandleData(params);
                if (res && res.message && res.message.includes('exceeding access rate')) {
                    console.warn('[ANGEL ONE] 429 Rate limited on candle data. Backing off 2.5s...');
                    await new Promise(r => setTimeout(r, 2500));
                    return await this.smartApi.getCandleData(params);
                }
                return res;
            } catch (err) {
                console.error('[ANGEL ONE] getCandleData error:', err.message);
                return null;
            }
        });
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

        if (!params.symbolToken) {
            return {
                success: false,
                reason: 'Missing strictly required symbolToken for Angel One F&O execution.'
            };
        }

        const orderParams = {
            variety: "NORMAL",
            tradingsymbol: asset,
            symboltoken: params.symbolToken,
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
