import { calculateHurst } from './hurstEngine.js';

function generateRandomWalk(n) {
  let val = 100;
  const series = [];
  for(let i=0; i<n; i++) {
    val += (Math.random() - 0.5) * 2;
    series.push(val);
  }
  return series;
}

function generateTrending(n) {
  let val = 100;
  const series = [];
  for(let i=0; i<n; i++) {
    val += (Math.random() * 2); // strictly positive bias
    series.push(val);
  }
  return series;
}

function getLogReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
}

async function runGap3Tests() {
  console.log("=== GAP 3: HURST CONFIDENCE INTERVAL TESTS ===");
  
  const rwPrices = generateRandomWalk(1000);
  const rwReturns = getLogReturns(rwPrices);

  console.log("\n--- TEST 1: SYNTHETIC PURE NOISE (RANDOM WALK) ---");
  const rwResult = calculateHurst(rwReturns);
  console.log(`Expected: LOW or MEDIUM confidence. Expected H near 0.5.`);
  console.log(`Actual H: ${rwResult.meanH.toFixed(3)}, Confidence: ${rwResult.confidenceLevel}`);
  console.log(`CI: [${rwResult.ci95.lower.toFixed(3)}, ${rwResult.ci95.upper.toFixed(3)}]`);
  if (rwResult.confidenceLevel !== 'HIGH' && (rwResult.ci95.lower < 0.45 && rwResult.ci95.upper > 0.55)) {
    console.log("Result: PASSED (CI straddles thresholds)");
  } else {
    console.log("Result: FAILED or inconclusive (may require re-run due to randomness)");
  }

  console.log("\n--- TEST 2: SYNTHETIC TRENDING SERIES ---");
  const trendPrices = generateTrending(1000);
  const trendReturns = getLogReturns(trendPrices);
  const trendResult = calculateHurst(trendReturns);
  console.log(`Expected: HIGH confidence. Expected H > 0.55`);
  console.log(`Actual H: ${trendResult.meanH.toFixed(3)}, Confidence: ${trendResult.confidenceLevel}`);
  console.log(`CI: [${trendResult.ci95.lower.toFixed(3)}, ${trendResult.ci95.upper.toFixed(3)}]`);
  
  if (trendResult.confidenceLevel === 'HIGH' && trendResult.meanH > 0.55) {
    console.log("Result: PASSED");
  } else {
    console.log("Result: FAILED or inconclusive");
  }
}

runGap3Tests().catch(console.error);
