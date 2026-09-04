import { executionManager } from './executionEngine.js';
import { getDb } from './mongoConfig.js';
async function test() {
    const engine = executionManager.getEngine('ai-tester@ghosttrade.com');
    await engine.setExecutionMode('LIVE_CRYPTO', 'ai-tester@ghosttrade.com');
    const result = await engine.executeTrade({
        asset: 'BTC-USD',
        side: 'BUY',
        entryPrice: 80000,
        stopLoss: 75000,
        takeProfit: 85000,
        accountBalance: 100000,
        regime: 'TRENDING',
        overrideMode: 'LIVE_CRYPTO'
    }, 'ai-tester@ghosttrade.com');
    console.log('\n--- EXPECTED API OUTPUT FOR FAILED LIVE TRADE ---');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}
test();
