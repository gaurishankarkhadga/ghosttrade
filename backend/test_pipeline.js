import { fetchMultiTimeframeOHLCV } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { getLogReturns } from './dataFetcher.js';
import { classifyRegime } from './regimeClassifier.js';
import { detectPatterns } from './patternEngine.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import { computeKelly } from './kellyEngine.js';

async function runTest() {
  console.log("1. Fetching data for BTC-USD...");
  const data = await fetchMultiTimeframeOHLCV('BTC', 300);
  if (data.error) {
    console.error("Data Fetch Error:", data.message);
    return;
  }
  console.log(`Fetched 1D bars: ${data.timeframes['1d'].length}`);
  
  console.log("2. Calculating Hurst Exponent (1D)...");
  const returns = getLogReturns(data.timeframes['1d']);
  const hurst = calculateHurst(returns);
  console.log(`Hurst Mean: ${hurst.meanH.toFixed(3)}, Stable: ${hurst.isStable}`);
  
  console.log("3. Classifying Regime...");
  const regime = classifyRegime(hurst);
  console.log(`Regime: ${regime.regime}, Actionable: ${regime.isActionable}`);
  
  console.log("4. Detecting Patterns (15m)...");
  const pattern = detectPatterns(data.timeframes['15m']);
  console.log(`Detected Pattern: ${pattern || 'None'}`);
  
  console.log("5. Checking Portfolio Risk (Long BTC)...");
  const risk = await canOpenNewTrade('BTC-USD', 'LONG');
  console.log(`Risk Action: ${risk.allowed ? 'PROCEED' : 'SHIELD_MODE'}, Reason: ${risk.reason}`);
  
  console.log("6. Computing Kelly Criterion (Missing Empirical Data)...");
  const kelly = computeKelly({
     rewardPercent: 0.05,
     riskPercent: 0.02,
     empiricalData: { confidence_flag: 'INSUFFICIENT_DATA' }
  });
  console.log(`Kelly Action: ${kelly.action}, Size: ${kelly.halfKelly}%`);
  
  console.log("Pipeline OK!");
  process.exit(0);
}
runTest();
