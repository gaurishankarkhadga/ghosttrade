import { executionManager } from './executionEngine.js';
import { getDb } from './mongoConfig.js';

async function runDualTest() {
    console.log("==========================================");
    console.log("🚀 TESTING DUAL-EXECUTION ARCHITECTURE");
    console.log("==========================================\n");

    const email = 'ai-tester@ghosttrade.com';
    const engine = executionManager.getEngine(email);

    // 1. Set mode to LIVE_CRYPTO
    await engine.setExecutionMode('LIVE_CRYPTO', email);

    console.log("[1] Triggering Live Trade for BTC-USD...");
    
    // 2. Execute trade
    const result = await engine.executeTrade({
        asset: 'BTC-USD',
        side: 'BUY',
        entryPrice: 85000,
        stopLoss: 80000,
        takeProfit: 95000,
        accountBalance: 100000,
        regime: 'TRENDING',
        overrideMode: 'LIVE_CRYPTO'
    }, email);

    console.log("\n=== EXPECTED OUTPUT: LIVE TRADE RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n[2] Verifying Shadow Paper Trade in Database...");
    
    // 3. Check MongoDB for the Shadow Paper Trade
    const db = await getDb();
    if (db) {
        const shadowTradeId = result.tradeId + '_PAPER';
        const shadowTrade = await db.collection('paper_trades').findOne({ id: shadowTradeId });
        
        console.log("\n=== EXPECTED OUTPUT: DATABASE SHADOW PAPER TRADE ===");
        if (shadowTrade) {
            console.log("✅ Dual-Verification Paper Trade successfully found in DB!");
            console.log(JSON.stringify(shadowTrade, null, 2));
        } else {
            console.log("❌ Shadow Paper Trade NOT found in DB!");
        }
    }

    console.log("\n==========================================");
    console.log("🏁 DUAL-EXECUTION TEST COMPLETE");
    console.log("==========================================");
    process.exit(0);
}

runDualTest();
