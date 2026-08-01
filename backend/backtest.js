import { runBulkScanPhase4 } from './scannerEngine.js';
import { DEFAULT_CRYPTO_WATCHLIST, DEFAULT_NSE_WATCHLIST } from './sharedConfig.js';
import { startWebSocketPipeline, liveMemoryState } from './websocketEngine.js';

// Combine watchlists for a full global test
const backtestWatchlist = [
  ...DEFAULT_CRYPTO_WATCHLIST.slice(0, 5), // Top 5 Crypto
  ...DEFAULT_NSE_WATCHLIST.slice(0, 3)     // Top 3 NSE
];

async function runBacktest() {
  console.log('====================================================');
  console.log('🚀 GHOST TRADE AI - BACKTEST STARTING');
  console.log('====================================================\n');
  
  console.log(`[1] Injecting Watchlist: ${backtestWatchlist.join(', ')}`);
  
  // Need to prime the websocket for crypto flow bias
  console.log(`[2] Priming WebSocket Telemetry for Order Flow Analysis...`);
  await startWebSocketPipeline(backtestWatchlist.filter(t => t.endsWith('-USD')));
  
  console.log(`[3] Waiting 3 seconds to accumulate order flow buffer...`);
  await new Promise(r => setTimeout(r, 3000));
  
  console.log(`[4] Executing Phase 4 Market-Wide Scan...\n`);
  
  const startTime = Date.now();
  const rawResults = await runBulkScanPhase4(backtestWatchlist);
  const scanTime = Date.now() - startTime;
  
  console.log(`\n====================================================`);
  console.log(`📊 GHOST TRADE AI - BACKTEST RESULTS`);
  console.log(`⏱️  Scan Time: ${scanTime}ms`);
  console.log(`====================================================`);
  
  console.log(`\n--- RAW UNFILTERED OUTPUT (${rawResults.length} assets) ---`);
  rawResults.forEach(r => {
      console.log(`${r.ticker.padEnd(12)} | Score: ${r.score} | Size: ${r.recommendedSize.toFixed(2)}% | Error: ${r.status === 'error' ? r.reason : 'None'}`);
  });
  
  // Apply the same strict filtering we use in server.js broadcast
  const strictlyFilteredResults = rawResults.filter(r => r.status === 'success' && r.recommendedSize > 0);
  
  console.log(`\n--- STRICT EXECUTION FILTER APPLIED (${strictlyFilteredResults.length} assets) ---`);
  if (strictlyFilteredResults.length === 0) {
      console.log(`⚠️ NO PROFITABLE TRADES FOUND. Shield actively protecting capital.`);
  } else {
      strictlyFilteredResults.forEach(r => {
          console.log(`\n✅ APPROVED EXECUTION: ${r.ticker}`);
          console.log(`   - Current Price:    $${r.currentPrice}`);
          console.log(`   - QuantScore:       ${r.score}/100`);
          console.log(`   - Expected Value:   ${r.evNet}%`);
          console.log(`   - Kelly Sizing:     ${r.recommendedSize.toFixed(2)}% of Capital`);
          console.log(`   - Flow Bias:        ${r.flowBias}`);
          console.log(`   - Macro Regime:     ${r.macroRegime}`);
          console.log(`   - Micro Regime:     ${r.microRegime}`);
          console.log(`   - Expectancy:       ${r.expectancy.winRate} Win Rate`);
          console.log(`   - Invalidation:     $${r.invalidationPrice} (Stop Loss)`);
          console.log(`   - Valid Until:      ${new Date(r.validUntil).toLocaleTimeString()}`);
      });
  }
  
  console.log('\n====================================================');
  console.log('✅ BACKTEST COMPLETE');
  console.log('====================================================\n');
  
  process.exit(0);
}

runBacktest().catch(e => {
  console.error("Backtest Failed:", e);
  process.exit(1);
});
