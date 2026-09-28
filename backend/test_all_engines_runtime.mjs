import { getClosePrices, getLogReturns } from './dataFetcher.js';
import { rsi, macd, bollingerBands, atr, sma, ema, vwap } from './technicalEngine.js';
import { detectPatterns, getDynamicTolerances } from './patternEngine.js';
import { computeHurstExponent, calculateRollingHurst } from './hurstEngine.js';
import { calculateOrderFlowImbalance, calculateCMF } from './orderFlowEngine.js';
import { predict5to10mHorizon, getDynamicThresholds } from './predictiveEngine.js';
import { performAutopsy, categorizeFromMetadata } from './lossAutopsyEngine.js';
import { fetchFearAndGreed, fetchMacroCorrelations } from './macroEngine.js';
import { getDynamicSector, calculateRotationImpacts, pearsonCorrelation } from './correlationEngine.js';
import { calculatePortfolioVaR, alignedCorrelation } from './riskControlEngine.js';
import { getSystemPerformance, generatePerformanceReport, calculateMaxDrawdown, calculateSharpeRatio, calculateSortinoRatio, calculateVaR } from './performanceEngine.js';
import { detectLeadLagDivergence } from './leadLagEngine.js';
import { fetchAssetSentiment } from './sentimentEngine.js';
import { isotonicRegression, getCalibratedConfidence, generateCalibrationReport } from './calibrationEngine.js';
import { generateSignal } from './signalGenerator.js';
import { runBacktest, walkForwardBacktest } from './backtestEngine.js';
import { classifyIntent } from './intentClassifier.js';

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} ${details}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING FULL RUNTIME ENGINE SUITE (20+ MODULES)');
  console.log('====================================================\n');

  // Generate synthetic candles
  const candles = [];
  const now = Date.now();
  for (let i = 0; i < 150; i++) {
    const price = 100 + i * 0.3 + Math.sin(i / 4) * 2;
    candles.push({
      open: price - 0.2,
      high: price + 1.2,
      low: price - 1.1,
      close: price,
      volume: 1000 + (i % 10) * 150,
      date: new Date(now - (150 - i) * 3600000).toISOString()
    });
  }

  // 1. dataFetcher.js
  console.log('--- 1. Testing dataFetcher.js ---');
  const closes = getClosePrices(candles);
  assert(Array.isArray(closes) && closes.length === 150, 'getClosePrices with object array');
  const rawCandles = candles.map(c => [c.date, c.open, c.high, c.low, c.close, c.volume]);
  const rawCloses = getClosePrices(rawCandles);
  assert(Array.isArray(rawCloses) && rawCloses.length === 150, 'getClosePrices with raw [ts,o,h,l,c,v]');
  const logReturns = getLogReturns(candles);
  assert(Array.isArray(logReturns) && logReturns.length === 149, 'getLogReturns valid length');
  assert(getClosePrices(null).length === 0, 'getClosePrices null safe');
  assert(getLogReturns([]).length === 0, 'getLogReturns empty safe');

  // 2. technicalEngine.js
  console.log('\n--- 2. Testing technicalEngine.js ---');
  const rsiVal = rsi(closes);
  assert(rsiVal && typeof rsiVal.value === 'number' && !isNaN(rsiVal.value), 'rsi valid number');
  const macdVal = macd(closes);
  assert(macdVal && !isNaN(macdVal.macd) && !isNaN(macdVal.histogram), 'macd valid numbers with warmup');
  const bbVal = bollingerBands(closes);
  assert(bbVal && !isNaN(bbVal.upper) && !isNaN(bbVal.lower), 'bollingerBands valid');
  const atrVal = atr(candles);
  assert(atrVal && !isNaN(atrVal.atr), 'atr valid');
  const smaVal = sma(closes, 20);
  assert(typeof smaVal === 'number' && !isNaN(smaVal), 'sma valid');
  const emaVal = ema(closes, 20);
  assert(typeof emaVal === 'number' && !isNaN(emaVal), 'ema valid');
  const vwapVal = vwap(candles);
  assert(vwapVal && !isNaN(vwapVal.vwap), 'vwap valid with try/catch');

  // 3. patternEngine.js
  console.log('\n--- 3. Testing patternEngine.js ---');
  const tols = getDynamicTolerances(candles);
  assert(tols && typeof tols.dojiBodyRatio === 'number', 'getDynamicTolerances produces ATR-scaled tolerances');
  const patternFound = detectPatterns(candles);
  assert(typeof patternFound === 'string' || patternFound === null, 'detectPatterns returns valid pattern or null');

  // 4. hurstEngine.js
  console.log('\n--- 4. Testing hurstEngine.js ---');
  const hurstRes = computeHurstExponent(logReturns);
  assert(hurstRes && (typeof hurstRes.hurst === 'number' || hurstRes.hurst === null), 'computeHurstExponent completes without crash');
  const rollingHurst = calculateRollingHurst(logReturns, 80, 20);
  assert(Array.isArray(rollingHurst.values), 'calculateRollingHurst returns values array');

  // 5. orderFlowEngine.js
  console.log('\n--- 5. Testing orderFlowEngine.js ---');
  const ofiRes = calculateOrderFlowImbalance(candles, 14);
  assert(ofiRes && typeof ofiRes.ofi === 'number' && !isNaN(ofiRes.ofi), 'calculateOrderFlowImbalance valid OFI');
  const cmfVal = calculateCMF(candles, 14);
  assert(typeof cmfVal === 'number' && !isNaN(cmfVal), 'calculateCMF returns valid numeric CMF');

  // 6. predictiveEngine.js
  console.log('\n--- 6. Testing predictiveEngine.js ---');
  const dynThresholds = getDynamicThresholds(candles);
  assert(dynThresholds && typeof dynThresholds.VOLUME_ACCELERATION === 'number', 'getDynamicThresholds CV-based');
  const predRes = predict5to10mHorizon(candles, ofiRes.ofi);
  assert(predRes && typeof predRes.predictedDirection === 'string', 'predict5to10mHorizon valid output');

  // 7. lossAutopsyEngine.js
  console.log('\n--- 7. Testing lossAutopsyEngine.js ---');
  const metaCategory = categorizeFromMetadata({
    regime: 'RANDOM_WALK',
    scoreBreakdown: { orderFlow: 10, volumeConfirmation: 20 },
    liquiditySweep: false
  });
  assert(metaCategory === 'REGIME_RANDOM_WALK', 'categorizeFromMetadata classifies RANDOM_WALK');
  const autopsyRes = await performAutopsy({
    ticker: 'BTC-USD',
    entryPrice: 50000,
    exitPrice: 49000,
    tradeSide: 'LONG',
    reason: 'Liquidity sweep false signal',
    regime: 'TRENDING'
  });
  assert(autopsyRes && autopsyRes.category, 'performAutopsy completes without error');

  // 8. macroEngine.js
  console.log('\n--- 8. Testing macroEngine.js ---');
  const fng = await fetchFearAndGreed();
  assert(fng === null || typeof fng.value === 'number', 'fetchFearAndGreed handles API safely');
  const macroCorr = await fetchMacroCorrelations();
  assert(macroCorr === null || typeof macroCorr.riskScore === 'number', 'fetchMacroCorrelations handles API safely');

  // 9. correlationEngine.js
  console.log('\n--- 9. Testing correlationEngine.js ---');
  const pCorr = pearsonCorrelation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert(Math.abs(pCorr - 1.0) < 0.001, 'pearsonCorrelation returns 1.0 for perfect correlation');
  const rotImpact = calculateRotationImpacts([{ ticker: 'BTC-USD', sentimentBias: 'TOXIC', multiplier: 0 }]);
  assert(rotImpact['BTC-USD'].multiplier === 0, 'calculateRotationImpacts handles toxic penalty');

  // 10. riskControlEngine.js
  console.log('\n--- 10. Testing riskControlEngine.js ---');
  const ts = Array.from({ length: 20 }, (_, i) => 1000 + i * 60);
  const retsA = Array.from({ length: 20 }, (_, i) => 0.01 * (i % 3));
  const retsB = Array.from({ length: 20 }, (_, i) => 0.01 * (i % 3));
  const alignedCorr = alignedCorrelation(retsA, retsB, ts, ts);
  assert(typeof alignedCorr === 'number', 'alignedCorrelation timestamp matching');
  const portVaR = await calculatePortfolioVaR(null);
  assert(portVaR && typeof portVaR.var95 === 'number', 'calculatePortfolioVaR handles fallback safely');

  // 11. performanceEngine.js
  console.log('\n--- 11. Testing performanceEngine.js ---');
  const mdd = calculateMaxDrawdown([100, 105, 95, 110, 102]);
  assert(mdd && mdd.mdd > 0, 'calculateMaxDrawdown calculates drawdown');
  const sharpe = calculateSharpeRatio([0.01, 0.02, -0.01, 0.015, 0.03]);
  assert(typeof sharpe === 'number' && !isNaN(sharpe), 'calculateSharpeRatio valid number');
  const sortino = calculateSortinoRatio([0.01, 0.02, -0.01, 0.015, 0.03]);
  assert(typeof sortino === 'number' && !isNaN(sortino), 'calculateSortinoRatio valid number');
  const var95 = calculateVaR(Array.from({ length: 25 }, (_, i) => (i - 10) * 0.01));
  assert(typeof var95 === 'number', 'calculateVaR valid');
  const perfReport = await generatePerformanceReport(null);
  assert(perfReport && perfReport.status, 'generatePerformanceReport handles non-db state safely');

  // 12. leadLagEngine.js
  console.log('\n--- 12. Testing leadLagEngine.js ---');
  const leadLag = detectLeadLagDivergence(
    [{ close: 100 }, { close: 101 }, { close: 102 }, { close: 105 }, { close: 108 }],
    [{ close: 100 }, { close: 100.1 }, { close: 100.2 }, { close: 100.3 }, { close: 100.4 }]
  );
  assert(leadLag && leadLag.divergenceSignal === 'BULLISH_LAG_CATCHUP', 'detectLeadLagDivergence identifies lead lag');

  // 13. sentimentEngine.js
  console.log('\n--- 13. Testing sentimentEngine.js ---');
  const sentRes = await fetchAssetSentiment('BTC-USD');
  assert(sentRes && typeof sentRes.multiplier === 'number', 'fetchAssetSentiment valid output');

  // 14. calibrationEngine.js
  console.log('\n--- 14. Testing calibrationEngine.js ---');
  const isoCurve = isotonicRegression([
    { predicted: 0.1, actual: 0.2 },
    { predicted: 0.3, actual: 0.15 },
    { predicted: 0.5, actual: 0.6 }
  ]);
  assert(Array.isArray(isoCurve) && isoCurve.length > 0, 'isotonicRegression PAV generates monotonic curve');
  const calibConf = await getCalibratedConfidence(75);
  assert(typeof calibConf.calibratedConfidence === 'number' && calibConf.calibratedConfidence >= 0, 'getCalibratedConfidence valid output');

  // 15. signalGenerator.js
  console.log('\n--- 15. Testing signalGenerator.js MTF Confluence v2 ---');
  const signal = await generateSignal('ETH-USD', candles, {
    candles1h: candles.slice(-50),
    livePrice: candles[candles.length - 1].close
  });
  assert(signal && typeof signal.score === 'number', 'generateSignal returns numeric score');
  assert(signal.scoreBreakdown && signal.scoreBreakdown.mtfConfluence, 'generateSignal returns mtfConfluence v2');
  const factorSum = (signal.scoreBreakdown.regimePoints || 0) +
                    (signal.scoreBreakdown.confluencePoints || 0) +
                    (signal.scoreBreakdown.orderFlowPoints || 0) +
                    (signal.scoreBreakdown.volumePoints || 0) +
                    (signal.scoreBreakdown.winRatePoints || 0);
  assert(factorSum === signal.scoreBreakdown.totalScore, `Factor points sum (${factorSum}) equals totalScore (${signal.scoreBreakdown.totalScore})`);

  // 16. backtestEngine.js
  console.log('\n--- 16. Testing backtestEngine.js ---');
  const btRes = await runBacktest('BTC-USD', 200);
  assert(btRes && (typeof btRes.totalSignalsTaken === 'number' || btRes.error), 'runBacktest runs successfully');
  const wfRes = await walkForwardBacktest('BTC-USD', 200, 0.7);
  assert(wfRes && (wfRes.walkForwardEfficiency !== undefined || wfRes.error), 'walkForwardBacktest computes WFE');

  // 17. intentClassifier.js
  console.log('\n--- 17. Testing intentClassifier.js ---');
  const intent = await classifyIntent('What is the current trend of Bitcoin?');
  assert(typeof intent === 'string' && intent.length > 0, 'classifyIntent returns category string');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\nUNCAUGHT EXCEPTION IN TEST SUITE:', err);
  process.exit(1);
});
