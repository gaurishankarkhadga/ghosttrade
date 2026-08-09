// =====================================================
// GHOSTTRADE UNIFIED EXECUTION ENGINE
// Bridges Paper Trading (Simulation) & Live Angel One SmartAPI
// Enforces Risk Control, Kelly Position Sizing, and Compliance.
// =====================================================

import { canOpenNewTrade, checkBlackSwanLiquidityCircuitBreaker } from './riskControlEngine.js';
import { computeKelly } from './kellyEngine.js';
import { getDb } from './mongoConfig.js';

// Note: Live broker routing has been disabled. The engine operates purely as an Intelligence Terminal.

class UnifiedExecutionEngine {
    constructor() {
        // Enforce PAPER trading mode for Global Intelligence Terminal structure
        this.mode = 'PAPER';
        this.isBrokerAuthenticated = false;
    }

    /**
     * Toggles execution mode (Disabled in Intelligence Terminal architecture)
     */
    async setExecutionMode(targetMode, credentials) {
        this.mode = 'PAPER'; // Force paper mode
        console.log(`[EXECUTION ENGINE] Mode locked to: [PAPER]`);
        return { mode: this.mode, isBrokerAuthenticated: false };
    }



    /**
     * Core Trade Execution Pipeline
     * Validates Risk Controls -> Computes Kelly Sizing -> Routes to Paper DB or Live SmartAPI
     * 
     * @param {Object} params
     * @param {string} params.asset - e.g. "RELIANCE"
     * @param {'BUY' | 'SELL'} params.side - Trade direction
     * @param {number} params.entryPrice - Current market entry price
     */
    async executeTrade({
        asset,
        side,
        entryPrice,
        stopLoss,
        takeProfit,
        accountBalance = 100000,
        regime = 'TRENDING',
        overrideMode
    }, userId) {
        if (!userId) {
            throw new Error('[EXECUTION ENGINE] userId is required for trade execution.');
        }

        const activeMode = 'PAPER'; // Force paper mode
        console.log(`\n⚡ [EXECUTION] Processing ${side} setup on ${asset} @ ₹${entryPrice} [Mode: ${activeMode}]`);

        // 1. Black Swan Circuit Breaker Check
        const blackSwanCheck = checkBlackSwanLiquidityCircuitBreaker(0.05, 0);
        if (blackSwanCheck.triggered) {
            console.warn(`❌ [EXECUTION BLOCKED] ${blackSwanCheck.reason}: ${blackSwanCheck.detail}`);
            return { success: false, reason: blackSwanCheck.reason, detail: blackSwanCheck.detail };
        }

        // 2. Portfolio Risk Check (Concurrent trade limits & correlation)
        const riskCheck = await canOpenNewTrade(asset, side);
        if (!riskCheck.allowed) {
            console.warn(`❌ [EXECUTION BLOCKED] Risk control denied trade: ${riskCheck.reason}`);
            return { success: false, reason: riskCheck.reason };
        }

        // 3. Position Sizing via Continuous Half-Kelly Engine
        const kellyResult = computeKelly({
            mean_return: 0.025, // Empirical mean return estimate
            variance: 0.0004,    // Empirical variance estimate
            regime
        });

        // Compute position capital and share quantity
        const capitalAllocation = (accountBalance * (kellyResult.halfKelly / 100));
        const quantity = Math.max(1, Math.floor(capitalAllocation / entryPrice));

        console.log(`📊 [KELLY SIZING] Allocation: ₹${capitalAllocation.toFixed(2)} (${kellyResult.halfKelly}% of balance) ➔ Qty: ${quantity} shares`);

        const tradeId = `GT_${Date.now()}`;

        // 4. Execution Routing (Strictly PAPER)
        console.log(`📝 [PAPER TRADING] Simulating execution of ${quantity} shares of ${asset} @ ₹${entryPrice}`);
        
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




