import { fetchOHLCV, fetchLivePrice, getLogReturns } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { calculateAllIndicators } from './technicalEngine.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { generateSignal } from './signalGenerator.js';

async function runTests() {
  console.log("==================================================");
  console.log("🚀 STARTING END-TO-END FUNCTIONALITY VERIFICATION");
  console.log("==================================================\n");

  const ticker = 'BTC';

  // 1. DATA FETCHER FUNCTIONALITY
  console.log("--- 1. DATA FETCHER ---");
  const dataResult = await fetchOHLCV(ticker, 300);
  if (dataResult.error) {
    console.log("❌ Data Fetcher Failed:", dataResult.error);
    return;
  }
  const ohlcv = dataResult.bars;
  const prices = ohlcv.map(b => b.close);
  console.log(`✅ Successfully fetched ${ohlcv.length} bars for ${ticker}.`);
  console.log(`   Sample Close Prices: [..., ${prices[prices.length-3].toFixed(2)}, ${prices[prices.length-2].toFixed(2)}, ${prices[prices.length-1].toFixed(2)}]\n`);

  // 2. HURST ENGINE FUNCTIONALITY
  console.log("--- 2. HURST ENGINE ---");
  const logReturns = getLogReturns(ohlcv);
  const hurstResult = calculateHurst(logReturns);
  console.log(`✅ Hurst Calculation Complete.`);
  console.log(`   R/S Hurst: ${hurstResult.rsH?.toFixed(4)}`);
  console.log(`   DFA Hurst: ${hurstResult.dfaH?.toFixed(4)}`);
  console.log(`   Mean Hurst: ${hurstResult.meanH?.toFixed(4)}`);
  console.log(`   Is Stable: ${hurstResult.isStable}\n`);

  // 3. REGIME CLASSIFIER FUNCTIONALITY
  console.log("--- 3. REGIME CLASSIFIER ---");
  const regimeResult = classifyRegime(hurstResult);
  console.log(`✅ Regime Classification Complete.`);
  console.log(`   Identified Regime: ${regimeResult.regime}`);
  console.log(`   Actionable: ${regimeResult.isActionable}`);
  console.log(`   Heuristic Score: ${regimeResult.heuristicScore?.toFixed(2)}%\n`);

  // 4. TECHNICAL INDICATORS FUNCTIONALITY
  console.log("--- 4. TECHNICAL ENGINE ---");
  const techResult = calculateAllIndicators(ohlcv);
  console.log(`✅ Technical Indicators Output (Truncated):\n`);
  console.log(techResult.substring(0, 500) + '...\n');

  // 5. SL/TP CALCULATOR FUNCTIONALITY
  console.log("--- 5. SL/TP CALCULATOR ---");
  const currentPrice = prices[prices.length - 1];
  const slTpResult = computeStopLossTakeProfit(ohlcv, 'BUY', 1.5, 2.0);
  console.log(`✅ SL/TP Calculation Complete.`);
  console.log(`   Entry Price: $${currentPrice.toFixed(2)}`);
  console.log(`   Stop Loss: $${slTpResult.stopLoss?.toFixed(2)}`);
  console.log(`   Take Profit: $${slTpResult.takeProfit?.toFixed(2)}\n`);

  // 6. SIGNAL GENERATOR PIPELINE FUNCTIONALITY
  console.log("--- 6. SIGNAL GENERATOR (FULL PIPELINE) ---");
  const signalResult = await generateSignal(ticker, ohlcv);
  console.log(`✅ Signal Generator Complete.`);
  console.log(`   Action: ${signalResult.action}`);
  console.log(`   Direction: ${signalResult.direction}`);
  console.log(`   Composite Score (Confidence): ${signalResult.score}`);
  if (signalResult.action === 'TRADE') {
    console.log(`   Target Price: $${signalResult.takeProfit}`);
    console.log(`   Stop Loss: $${signalResult.stopLoss}`);
  } else if (signalResult.action === 'SHIELD_MODE') {
    console.log(`   Shield Mode Reason: ${signalResult.reason}`);
  }
  
  console.log("\n==================================================");
  console.log("🏁 FUNCTIONALITY VERIFICATION FINISHED");
  console.log("==================================================");
}

runTests().catch(console.error);
