// =====================================================
// GHOSTTRADE UNIFIED EXECUTION ENGINE
// Bridges Paper Trading (Simulation) & Live Broker APIs
// via the Universal Broker Adapter Layer.
// Enforces Risk Control, Kelly Position Sizing, and Compliance.
//
// MODES:
// - PAPER:      Simulation (default, always available)
// - LIVE_CRYPTO: Routes to Binance via user's API keys
// - LIVE_US:     Routes to Alpaca via user's API keys
// - LIVE_GLOBAL: Routes to IBKR via user's API keys
//
// SAFETY: If ANY live adapter fails, system falls back
// to PAPER mode automatically. Existing PAPER behavior
// is 100% unchanged from prior version.
// =====================================================
import { canOpenNewTrade } from './riskControlEngine.js';
import { computeKelly } from './kellyEngine.js';
import { getDb } from './mongoConfig.js';
import { createAdapter, loadAllAdapters } from './brokerAdapter.js';
import { getBrokerKeys } from './brokerKeyManager.js';
import { getBrokerForTicker } from './marketHoursEngine.js';

// Load all broker adapters on startup — store promise for awaiting
const _adaptersReady = loadAllAdapters().catch(err => console.warn('[EXECUTION ENGINE] Adapter loading warning:', err.message));

/**
 * Ensures all broker adapters are registered before routing.
 * Prevents race condition where a trade request arrives before
 * dynamic imports complete. Resolves instantly after first load.
 */
async function ensureAdaptersLoaded() {
    await _adaptersReady;
}

const VALID_LIVE_MODES = ['LIVE_CRYPTO', 'LIVE_US', 'LIVE_GLOBAL'];
const MODE_TO_BROKER = {
    'LIVE_CRYPTO': 'BINANCE',
    'LIVE_US':     'ALPACA',
    'LIVE_GLOBAL': 'IBKR',
};

class UnifiedExecutionEngine {
    constructor() {
        // Default: PAPER trading mode (backward compatible)
        this.mode = 'PAPER';
        this.isBrokerAuthenticated = false;
        this._adapterCache = new Map(); // Cache adapter instances per broker
    }

    /**
     * Toggles execution mode.
     * PAPER mode is always available. LIVE modes require broker credentials.
     * 
     * @param {'PAPER'|'LIVE_CRYPTO'|'LIVE_US'|'LIVE_GLOBAL'} targetMode
     * @param {string} userId — Required for LIVE modes to fetch broker keys
     * @returns {{ mode: string, isBrokerAuthenticated: boolean, message: string }}
     */
    async setExecutionMode(targetMode, userId) {
        // PAPER mode — always allowed, no credentials needed, no adapter wait
        if (!targetMode || targetMode === 'PAPER') {
            this.mode = 'PAPER';
            this.isBrokerAuthenticated = false;
            console.log(`[EXECUTION ENGINE] Mode set to: [PAPER]`);
            return { mode: 'PAPER', isBrokerAuthenticated: false, message: 'Paper trading mode active.' };
        }

        // Ensure all adapters are registered before routing to LIVE
        await ensureAdaptersLoaded();

        // Validate mode
        if (!VALID_LIVE_MODES.includes(targetMode)) {
            console.warn(`[EXECUTION ENGINE] Unknown mode "${targetMode}". Defaulting to PAPER.`);
            this.mode = 'PAPER';
            return { mode: 'PAPER', isBrokerAuthenticated: false, message: `Unknown mode. Defaulting to PAPER.` };
        }

        // LIVE modes — require broker credentials
        if (!userId) {
            console.warn('[EXECUTION ENGINE] userId required for LIVE mode. Defaulting to PAPER.');
            this.mode = 'PAPER';
            return { mode: 'PAPER', isBrokerAuthenticated: false, message: 'User ID required for live trading.' };
        }

        const brokerName = MODE_TO_BROKER[targetMode];
        try {
            const credentials = await getBrokerKeys(userId, brokerName);
            if (!credentials) {
                console.warn(`[EXECUTION ENGINE] No ${brokerName} credentials found for ${userId}. Staying in PAPER mode.`);
                this.mode = 'PAPER';
                return { mode: 'PAPER', isBrokerAuthenticated: false, message: `No ${brokerName} API keys configured. Add them in Settings.` };
            }

            // Create and authenticate adapter
            const adapter = createAdapter(brokerName, credentials);
            const authResult = await adapter.authenticate();

            if (authResult.success) {
                this.mode = targetMode;
                this.isBrokerAuthenticated = true;
                this._adapterCache.set(brokerName, adapter);
                console.log(`[EXECUTION ENGINE] Mode set to: [${targetMode}] via ${brokerName}`);
                return { mode: targetMode, isBrokerAuthenticated: true, message: authResult.message };
            } else {
                console.warn(`[EXECUTION ENGINE] ${brokerName} auth failed: ${authResult.message}. Staying in PAPER.`);
                this.mode = 'PAPER';
                return { mode: 'PAPER', isBrokerAuthenticated: false, message: authResult.message };
            }
        } catch (err) {
            console.error(`[EXECUTION ENGINE] Error setting ${targetMode}:`, err.message);
            this.mode = 'PAPER';
            return { mode: 'PAPER', isBrokerAuthenticated: false, message: `Broker connection failed: ${err.message}` };
        }
    }

    /**
     * Core Trade Execution Pipeline
     * Validates Risk Controls -> Computes Kelly Sizing -> Routes to Paper or Live Broker
     * 
     * BACKWARD COMPATIBILITY: When mode is PAPER, behavior is IDENTICAL
     * to the original implementation. Zero changes to existing flow.
     */
    async executeTrade({
        asset,
        side,
        entryPrice,
        stopLoss,
        takeProfit,
        accountBalance = 100000,
        regime = 'TRENDING',
        overrideMode,
        kellyOverride
    }, userId) {
        if (!userId) {
            throw new Error('[EXECUTION ENGINE] userId is required for trade execution.');
        }

        const activeMode = overrideMode || this.mode || 'PAPER';

        // Ensure adapters are loaded before any LIVE routing decision
        if (activeMode !== 'PAPER') await ensureAdaptersLoaded();

        console.log(`\n⚡ [EXECUTION] Processing ${side} setup on ${asset} @ $${entryPrice} [Mode: ${activeMode}]`);

        // 1. Portfolio Risk Check (includes Black Swan circuit breaker for crypto via live depth data)
        const riskCheck = await canOpenNewTrade(asset, side);
        if (!riskCheck.allowed) {
            console.warn(`❌ [EXECUTION BLOCKED] Risk control denied trade: ${riskCheck.reason}`);
            return { success: false, reason: riskCheck.reason };
        }

        // 2. Position Sizing — Use signal-level Kelly if provided, otherwise compute from regime
        const kellyResult = kellyOverride || computeKelly({
            mean_return: 0.025,
            variance: 0.0004,
            regime
        });

        // Compute position capital and share quantity
        const capitalAllocation = (accountBalance * (kellyResult.halfKelly / 100));
        const quantity = Math.max(1, Math.floor(capitalAllocation / entryPrice));

        console.log(`📊 [KELLY SIZING] Allocation: $${capitalAllocation.toFixed(2)} (${kellyResult.halfKelly}% of balance) ➔ Qty: ${quantity}`);

        const tradeId = `GT_${Date.now()}`;

        // =====================================================
        // 4. EXECUTION ROUTING
        // =====================================================

        // PAPER MODE — Original behavior (unchanged)
        if (activeMode === 'PAPER') {
            console.log(`📝 [PAPER TRADING] Simulating execution of ${quantity} units of ${asset} @ $${entryPrice}`);
            
            await this.logTradeToDb({
                id: tradeId,
                asset,
                side,
                entryPrice,
                stopLoss,
                takeProfit,
                quantity,
                kellySize: kellyResult.halfKelly,
                status: 'OPEN',
                mode: 'PAPER',
                executedAt: new Date().toISOString()
            }, userId);

            return {
                success: true,
                tradeId,
                mode: 'PAPER',
                quantity,
                entryPrice,
                message: 'Paper trade successfully logged in ledger.'
            };
        }

        // LIVE MODE — Route through Broker Adapter
        if (VALID_LIVE_MODES.includes(activeMode)) {
            const brokerName = MODE_TO_BROKER[activeMode] || getBrokerForTicker(asset);
            console.log(`🔴 [LIVE TRADING] Routing ${asset} via ${brokerName} adapter`);

            try {
                // Get or create adapter
                let adapter = this._adapterCache.get(brokerName);
                if (!adapter || !adapter.isAuthenticated) {
                    const credentials = await getBrokerKeys(userId, brokerName);
                    if (!credentials) {
                        // SAFETY FALLBACK: No credentials → fall back to paper
                        console.warn(`[EXECUTION ENGINE] No ${brokerName} keys. Falling back to PAPER.`);
                        return this._executePaperFallback(tradeId, asset, side, entryPrice, stopLoss, takeProfit, quantity, kellyResult, userId);
                    }
                    adapter = createAdapter(brokerName, credentials);
                    const auth = await adapter.authenticate();
                    if (!auth.success) {
                        console.warn(`[EXECUTION ENGINE] ${brokerName} auth failed. Falling back to PAPER.`);
                        return this._executePaperFallback(tradeId, asset, side, entryPrice, stopLoss, takeProfit, quantity, kellyResult, userId);
                    }
                    this._adapterCache.set(brokerName, adapter);
                }

                // Place order through broker
                const orderResult = await adapter.placeOrder({
                    symbol: asset,
                    side: side.toUpperCase(),
                    type: 'MARKET',
                    quantity,
                    price: entryPrice,
                    stopLoss,
                    takeProfit,
                });

                // Log trade to DB regardless of success (for audit trail)
                await this.logTradeToDb({
                    id: tradeId,
                    asset,
                    side,
                    entryPrice: orderResult.filledPrice || entryPrice,
                    stopLoss,
                    takeProfit,
                    quantity,
                    kellySize: kellyResult.halfKelly,
                    status: orderResult.success ? 'OPEN' : 'FAILED',
                    mode: activeMode,
                    broker: brokerName,
                    brokerOrderId: orderResult.orderId,
                    executedAt: new Date().toISOString()
                }, userId);

                if (orderResult.success) {
                    console.log(`✅ [LIVE] Order filled: ${orderResult.orderId} @ $${orderResult.filledPrice}`);
                    return {
                        success: true,
                        tradeId,
                        mode: activeMode,
                        broker: brokerName,
                        brokerOrderId: orderResult.orderId,
                        quantity,
                        entryPrice: orderResult.filledPrice || entryPrice,
                        message: orderResult.message,
                    };
                } else {
                    console.warn(`⚠️ [LIVE] Order failed: ${orderResult.message}`);
                    return { success: false, tradeId, mode: activeMode, reason: orderResult.message };
                }
            } catch (err) {
                console.error(`[EXECUTION ENGINE] Live execution error:`, err.message);
                // SAFETY: Fall back to paper on any live execution error
                return this._executePaperFallback(tradeId, asset, side, entryPrice, stopLoss, takeProfit, quantity, kellyResult, userId);
            }
        }

        // Unknown mode fallback
        console.warn(`[EXECUTION ENGINE] Unknown mode "${activeMode}". Executing as PAPER.`);
        return this._executePaperFallback(tradeId, asset, side, entryPrice, stopLoss, takeProfit, quantity, kellyResult, userId);
    }

    /**
     * Paper trade fallback — used when LIVE mode fails for any reason.
     * Ensures no trade is ever silently dropped.
     */
    async _executePaperFallback(tradeId, asset, side, entryPrice, stopLoss, takeProfit, quantity, kellyResult, userId) {
        console.log(`📝 [PAPER FALLBACK] Simulating ${quantity} units of ${asset} @ $${entryPrice}`);
        
        await this.logTradeToDb({
            id: tradeId,
            asset,
            side,
            entryPrice,
            stopLoss,
            takeProfit,
            quantity,
            kellySize: kellyResult.halfKelly,
            status: 'OPEN',
            mode: 'PAPER',
            fallbackReason: 'Live execution failed — logged as paper trade',
            executedAt: new Date().toISOString()
        }, userId);

        return {
            success: true,
            tradeId,
            mode: 'PAPER',
            quantity,
            entryPrice,
            message: 'Live execution unavailable. Paper trade logged as fallback.',
        };
    }

    /**
     * Logs executed or simulated trades to MongoDB `paper_trades` collection.
     */
    async logTradeToDb(tradeData, userId) {
        try {
            const db = await getDb();
            if (db) {
                const doc = { ...tradeData, userId };
                await db.collection('paper_trades').updateOne(
                    { id: tradeData.id },
                    { $set: doc },
                    { upsert: true }
                );
            }
        } catch (err) {
            console.error('[EXECUTION ENGINE] Failed to log trade to database:', err.message);
        }
    }
}

export class ExecutionManager {
    constructor() {
        this.engines = new Map(); // Map<UserId, UnifiedExecutionEngine>
    }

    /**
     * Gets or creates a UnifiedExecutionEngine for a specific user.
     * @param {string} userId
     * @returns {UnifiedExecutionEngine}
     */
    getEngine(userId) {
        if (!userId) throw new Error('ExecutionManager.getEngine requires a valid userId');
        
        if (!this.engines.has(userId)) {
            console.log(`[EXECUTION MANAGER] Spawning new Execution Engine for user: ${userId}`);
            this.engines.set(userId, new UnifiedExecutionEngine());
        }
        return this.engines.get(userId);
    }
}

export const executionManager = new ExecutionManager();
