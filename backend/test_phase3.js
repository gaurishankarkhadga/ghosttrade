import { fetchMultiTimeframeOHLCV } from './dataFetcher.js';
import { detectPatterns } from './patternEngine.js';
import { calculateAllIndicators } from './technicalEngine.js';
import { computeKelly } from './kellyEngine.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import { getDb, closeDb } from './mongoConfig.js';

async function runPhase3() {
  console.log("=== PHASE 3: DEEP DATA PIPELINE TEST ===");
  
  // 1. Deep Pagination Fetch (Phase 3)
  console.log("\n1. Fetching 3000 bars of 15m data for BTC-USD (Pagination Test)...");
  const startTime = Date.now();
  const result = await fetchMultiTimeframeOHLCV('BTC-USD', 3000);
  console.log(`Fetch completed in ${(Date.now() - startTime) / 1000} seconds.`);
  
  if (result.error) {
    console.error("Fetch Failed:", result.message);
    process.exit(1);
  }
  
  const bars15m = result.timeframes['15m'];
  console.log(`Successfully fetched and stitched ${bars15m.length} chronological bars.`);
  console.log(`Oldest bar: ${bars15m[0].date}`);
  console.log(`Newest bar: ${bars15m[bars15m.length - 1].date}`);

  // 2. Technical Engine & VWAP (Phase 2)
  console.log("\n2. Passing to Technical Engine (Phase 2)...");
  const techBlock = calculateAllIndicators(bars15m);
  if (techBlock.includes('VWAP')) {
    console.log("VWAP successfully calculated on deep array.");
  }
  
  const pattern = detectPatterns(bars15m);
  console.log(`Detected Pattern on live data: ${pattern || 'NONE (Awaiting setup)'}`);

  // 3. Continuous Kelly Engine (Phase 1)
  console.log("\n3. Testing Risk Engines (Phase 1)...");
  
  // Seed fake open trade to test risk matrix
  const db = await getDb();
  await db.collection('paper_trades').deleteMany({});
  await db.collection('paper_trades').insertOne({
    asset: 'ETH-USD', side: 'LONG', status: 'OPEN', 
    entryPrice: 3000, stopLoss: 2900, takeProfit: 3500, 
    kellySize: 1.5, openedAt: new Date().toISOString()
  });

  console.log("Checking Portfolio Covariance Risk for BTC-USD...");
  const riskResult = await canOpenNewTrade('BTC-USD', 'LONG');
  console.log(`Covariance Check Result: ${riskResult.allowed ? 'PROCEED' : 'SHIELD_MODE'} - ${riskResult.reason || 'Safe to proceed'}`);

  console.log("\nCalculating Continuous Kelly...");
  const kellyCont = computeKelly({
    rewardPercent: 0.03,
    riskPercent: 0.015,
    empiricalData: {
      confidence_flag: 'OK',
      mean_return: 0.015,
      variance: Math.pow(0.04, 2)
    }
  });
  console.log(`Continuous Kelly Output: ${(kellyCont.kellyF).toFixed(2)}% (Half Kelly: ${(kellyCont.halfKelly).toFixed(2)}%)`);

  console.log("\nCleaning up...");
  await db.collection('paper_trades').deleteMany({});
  await closeDb();
  console.log("Tests Complete.");
}

runPhase3().catch(console.error);
