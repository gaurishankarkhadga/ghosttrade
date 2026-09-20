import { runBacktest } from './backtestEngine.js';
import dotenv from 'dotenv';
dotenv.config();

console.log("Starting ETHUSDT backtest for 1 year (365 trading days)...");
runBacktest('ETHUSDT', 565).then((res) => {
    console.log("==========================================");
    console.log(" 📊 SYSTEM BACKTEST RESULTS: ETHUSDT");
    console.log("==========================================");
    console.log("Total Signals Taken:", res.totalSignalsTaken);
    console.log("BASELINE:", res.baseline);
    console.log("IMPROVED (GhostMind AI):", res.improved);
    process.exit(0);
}).catch(err => {
    console.error("ERROR", err);
    process.exit(1);
});
