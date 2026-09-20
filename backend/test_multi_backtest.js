import { runBacktest } from './backtestEngine.js';
import dotenv from 'dotenv';
dotenv.config();

async function runAll() {
    const coins = ['SOLUSDT', 'BNBUSDT'];
    for (const coin of coins) {
        console.log(`\nStarting ${coin} backtest for 1 year (365 trading days)...`);
        try {
            const res = await runBacktest(coin, 565);
            console.log("==========================================");
            console.log(` 📊 SYSTEM BACKTEST RESULTS: ${coin}`);
            console.log("==========================================");
            console.log("Total Signals Taken:", res.totalSignalsTaken);
            console.log("BASELINE:", res.baseline);
            console.log("IMPROVED (GhostMind AI):", res.improved);
        } catch (err) {
            console.error(`ERROR on ${coin}:`, err);
        }
    }
    process.exit(0);
}
runAll();
