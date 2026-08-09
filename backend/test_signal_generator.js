// =====================================================
// SIGNAL GENERATOR TEST — Validates the deterministic engine
// Runs against BTC and ETH with live Yahoo Finance data
// =====================================================

import { generateSignal } from './signalGenerator.js';
import { fetchOHLCV } from './dataFetcher.js';
import { closeDb } from './mongoConfig.js';

const ASSETS_TO_TEST = ['BTC', 'ETH', 'SOL'];

async function runTest() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  DETERMINISTIC SIGNAL GENERATOR — VALIDATION TEST');
  console.log('═══════════════════════════════════════════════════\n');

  for (const asset of ASSETS_TO_TEST) {
    console.log(`\n─── Testing ${asset} ───`);
    
    const data = await fetchOHLCV(asset, 300);
    if (data.error) {
      console.error(`  ✗ Data fetch failed: ${data.error} — ${data.message}`);
      continue;
    }

    console.log(`  ✓ Fetched ${data.bars.length} daily bars for ${data.symbol}`);
    
    const signal = await generateSignal(asset, data.bars);
    
    console.log(`  ✓ Action: ${signal.action}`);
    console.log(`  ✓ Direction: ${signal.direction}`);
    console.log(`  ✓ Composite Score: ${signal.score}/100`);
    
    if (signal.scoreBreakdown) {
      console.log(`    ├── Regime Alignment:     ${signal.scoreBreakdown.regimeAlignment}/100`);
      console.log(`    ├── Technical Confluence: ${signal.scoreBreakdown.technicalConfluence}/100`);
      console.log(`    ├── Order Flow:           ${signal.scoreBreakdown.orderFlow}/100`);
      console.log(`    ├── Volume Confirmation:  ${signal.scoreBreakdown.volumeConfirmation}/100`);
      console.log(`    └── Historical Win Rate:  ${signal.scoreBreakdown.historicalWinRate}/100`);
    }
    
    if (signal.currentPrice) console.log(`  ✓ Current Price: $${signal.currentPrice.toLocaleString()}`);
    if (signal.stopLoss) console.log(`  ✓ Stop Loss: $${signal.stopLoss.toFixed(2)}`);
    if (signal.takeProfit) console.log(`  ✓ Take Profit: $${signal.takeProfit.toFixed(2)}`);
    if (signal.regime) console.log(`  ✓ Regime: ${signal.regime.regime} (Heuristic: ${signal.regime.heuristicScore}%)`);
    if (signal.pattern) console.log(`  ✓ Pattern: ${signal.pattern}`);
    if (signal.ofi) console.log(`  ✓ Real OFI: ${signal.ofi.ofi} (${signal.ofi.flowBias})`);
    if (signal.buyerPercent !== undefined) console.log(`  ✓ Buyer %: ${signal.buyerPercent}%`);
    if (signal.kelly) console.log(`  ✓ Kelly: ${signal.kelly.halfKelly}% (${signal.kelly.reason})`);
    if (signal.reasons) {
      console.log(`  ✓ Reasons:`);
      signal.reasons.forEach(r => console.log(`    • ${r}`));
    }
    if (signal.reason) console.log(`  ✓ Reason: ${signal.reason}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════\n');
  
  await closeDb();
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
