import { runBacktest } from './backtestEngine.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log("Starting Real Backtest via GhostTrade System...");
  try {
    // Run for the last 365 days on BTCUSDT to satisfy Hurst exponent bar requirements
    const result = await runBacktest('BTCUSDT', 365);
    
    if (result.error) {
      console.error("Backtest Error:", result.error);
      process.exit(1);
    }
    
    console.log("\n==========================================");
    console.log(` 📊 SYSTEM BACKTEST RESULTS: ${result.asset}`);
    console.log("==========================================");
    console.log(`Days Simulated: ${result.daysSimulated}`);
    console.log(`Total Signals Taken: ${result.totalSignalsTaken}`);
    console.log("\n--- BASELINE (Old Logic) ---");
    console.log(`Wins: ${result.baseline.wins} | Losses: ${result.baseline.losses}`);
    console.log(`Win Rate: ${result.baseline.winRate}%`);
    console.log(`Total R-Multiple: ${result.baseline.totalProfitRR}R`);
    
    console.log("\n--- IMPROVED (New Logic) ---");
    console.log(`Full Wins: ${result.improved.fullWins} | Partial Wins: ${result.improved.partialWins} | Losses: ${result.improved.losses}`);
    console.log(`Win Rate: ${result.improved.winRate}%`);
    console.log(`Losses Prevented: ${result.improved.lossesPrevented}`);
    console.log(`Total R-Multiple: ${result.improved.totalProfitRR}R`);
    
    console.log("\n==========================================");
    console.log(" 📝 COMPLETE TRADE LOG (Sample of last 10 trades)");
    console.log("==========================================");
    
    // Print the last 10 trades taken to avoid spamming the console
    const trades = result.tradeLog.slice(-10);
    trades.forEach((t, i) => {
      console.log(`\nTrade #${result.tradeLog.length - trades.length + i + 1} | ${t.date} | ${t.side}`);
      console.log(`  Entry: $${t.entryPrice.toFixed(2)}`);
      console.log(`  Stop Loss: $${t.stopLossOriginal.toFixed(2)}`);
      console.log(`  Take Profit 1: $${t.target1.toFixed(2)}`);
      console.log(`  Take Profit 2: $${t.target2.toFixed(2)}`);
      console.log(`  GhostMind Gate Status: ${t.gateStatus || 'PASSED'}`);
      console.log(`  Baseline Outcome: ${t.baselineResult} (Exit: $${t.exitPriceBaseline.toFixed(2)})`);
      console.log(`  Improved Outcome: ${t.improvedResult} (Exit: $${t.exitPriceImproved.toFixed(2)})`);
      if (t.improvedResult === 'WIN_PARTIAL') {
         console.log(`    * System locked breakeven and took partial profit!`);
      }
      if (t.improvedResult === 'STOPPED_OUT' && t.baselineResult === 'STOPPED_OUT') {
         if (t.exitPriceImproved !== t.exitPriceBaseline) {
            console.log(`    * System trailed stop loss, reducing the loss amount!`);
         }
      }
    });
    
  } catch (err) {
    console.error("Execution Error:", err);
  }
  process.exit(0);
}

main();
