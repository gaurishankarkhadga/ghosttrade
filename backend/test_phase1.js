import { computeKelly } from './kellyEngine.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import { getDb, closeDb } from './mongoConfig.js';
import { fetchOHLCV, getLogReturns } from './dataFetcher.js';

async function runPhase1Tests() {
  console.log("=== PHASE 1: KELLY & RISK ENGINE TEST ===");

  const db = await getDb();
  await db.collection('paper_trades').deleteMany({}); // Clean slate

  // 1. MAX CONCURRENT TRADES TEST
  console.log(`\n--- TEST 1: MAX CONCURRENT TRADES ---`);
  await db.collection('paper_trades').insertMany([
    { asset: 'BTC-USD', status: 'OPEN', side: 'LONG', openedAt: new Date().toISOString() },
    { asset: 'AAPL', status: 'OPEN', side: 'LONG', openedAt: new Date().toISOString() },
    { asset: 'GOLD', status: 'OPEN', side: 'LONG', openedAt: new Date().toISOString() }
  ]);
  const resMax = await canOpenNewTrade('ETH-USD', 'LONG');
  console.log(`Expected blocked by MAX_CONCURRENT_TRADES. Result: ${resMax.allowed ? 'FAILED' : 'PASSED'} (${resMax.reason})`);

  await db.collection('paper_trades').deleteMany({}); 

  // 2. DAILY LOSS LIMIT TEST
  console.log(`\n--- TEST 2: DAILY LOSS LIMIT ---`);
  // Simulate 6% loss
  await db.collection('paper_trades').insertOne({
    asset: 'TSLA',
    status: 'LOSS',
    side: 'LONG',
    entryPrice: 100,
    pnl: -6, // -6% loss
    kellySize: 100, // 100% size for easy math: (-6/100) * (100/100) * 100 = -6% daily pnl
    closedAt: new Date().toISOString()
  });
  const resLoss = await canOpenNewTrade('ETH-USD', 'LONG');
  console.log(`Expected blocked by DAILY_LOSS_LIMIT_HIT. Result: ${resLoss.allowed ? 'FAILED' : 'PASSED'} (${resLoss.reason})`);

  await db.collection('paper_trades').deleteMany({});

  // 3. CORRELATION TEST
  console.log(`\n--- TEST 3: CORRELATION COVARIANCE ---`);
  await db.collection('paper_trades').insertOne({
    asset: 'BTC-USD',
    status: 'OPEN',
    side: 'LONG',
    openedAt: new Date().toISOString()
  });
  const resCorr = await canOpenNewTrade('ETH-USD', 'LONG');
  console.log(`Expected blocked by CORRELATION_LIMIT. Result: ${resCorr.allowed ? 'FAILED' : 'PASSED'} (${resCorr.reason})`);

  console.log("\nCleaning up...");
  await db.collection('paper_trades').deleteMany({});
  await closeDb();
  console.log("=== PHASE 1 TEST COMPLETE ===");
}

runPhase1Tests().catch(e => { console.error(e); process.exit(1); });
