import { runBacktest } from './backtestEngine.js';
import dotenv from 'dotenv';
dotenv.config();

runBacktest('BTCUSDT', 305).then((res) => {
    console.log("BACKTEST COMPLETED", res);
    process.exit(0);
}).catch(err => {
    console.error("ERROR", err);
    process.exit(1);
});
