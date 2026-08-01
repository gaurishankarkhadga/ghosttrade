import { runBacktest } from './backtestEngine.js';
import { getDb, closeDb } from './mongoConfig.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import { computeKelly } from './kellyEngine.js';

async function runRealBacktest() {
  console.log("=== BRUTAL HONEST BACKTEST ===");
  const db = await getDb();
  await db.collection('setup_stats').deleteMany({ asset_class: 'crypto' });

  console.log("\n[RUNNING 1H INSTITUTIONAL BACKTEST OVER 3000 HOURS FOR BTC...]");
  await runBacktest("BTC-USD", "1h");

  console.log("\n[RUNNING 1H INSTITUTIONAL BACKTEST OVER 3000 HOURS FOR ETH...]");
  await runBacktest("ETH-USD", "1h");

  const db2 = await getDb();
  const setups = await db2.collection('setup_stats').find({ asset_class: 'crypto' }).toArray();
  console.log(`\n======================================================`);
  console.log(`[RESULTS] Found ${setups.length} valid Institutional Setups in 6,000 hours:`);
  
  if (setups.length === 0) {
    console.log("-> EXACTLY ZERO. This means in the last 250 days, neither BTC nor ETH formed a single hammer/engulfing pattern that was backed by a 1.5x volume spike OR bounced off VWAP. Retail traders are getting chopped to pieces on fake signals.");
  } else {
    for (const setup of setups) {
      console.log(`\nSetup: ${setup.setup_id}`);
      console.log(`  - Win Rate: ${(setup.win_rate * 100).toFixed(2)}%`);
      console.log(`  - Sample Size: ${setup.sample_size}`);
      console.log(`  - Mean Return (Accounting for Phase 4 Slippage): ${(setup.mean_return * 100).toFixed(4)}%`);
      
      const kellyCont = computeKelly({
        mean_return: setup.mean_return,
        variance: setup.variance
      });
      console.log(`  - Continuous Kelly Sizing: ${(kellyCont.halfKelly).toFixed(2)}% of Portfolio`);
    }
  }

  await closeDb();
  console.log("\nComplete.");
}

runRealBacktest().catch(console.error);
