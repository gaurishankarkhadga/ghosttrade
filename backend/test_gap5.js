import { startMonitorWorker } from './monitorWorker.js';
import { getDb, closeDb } from './mongoConfig.js';
import { fetchLivePrice } from './dataFetcher.js';

async function runGap5Tests() {
  console.log("=== GAP 5: MONITOR WORKER SL/TP TEST ===");

  const db = await getDb();
  await db.collection('paper_trades').deleteMany({}); // clean

  // Fetch actual live price of BTC to create a fake trade that is immediately stopped out
  const liveBTC = await fetchLivePrice('BTC-USD');
  if (!liveBTC) {
    console.error("Failed to fetch live BTC price for test setup.");
    await closeDb();
    return;
  }

  // Create a LONG trade that is instantly stopped out 
  // (Entry was higher, stop loss is just slightly above current live price)
  const fakeEntry = liveBTC * 1.05; // entered 5% higher
  const fakeSL = liveBTC * 1.01;    // stop loss is 1% higher than current price (so it's triggered)
  const fakeTP = liveBTC * 1.10;    // tp is 10% higher

  await db.collection('paper_trades').insertOne({
    asset: 'BTC-USD',
    side: 'LONG',
    status: 'OPEN',
    entryPrice: fakeEntry,
    stopLoss: fakeSL,
    takeProfit: fakeTP,
    kellySize: 1,
    openedAt: new Date().toISOString()
  });

  console.log(`[TEST] Inserted fake BTC-USD LONG trade (OPEN)`);
  console.log(`       Live Price: $${liveBTC.toFixed(2)}`);
  console.log(`       Entry: $${fakeEntry.toFixed(2)} | SL: $${fakeSL.toFixed(2)} (Should trigger SL instantly)`);

  const worker = startMonitorWorker();

  // Wait 12 seconds for the worker to poll
  console.log(`[TEST] Waiting 12 seconds for monitor to trigger...`);
  await new Promise(resolve => setTimeout(resolve, 12000));

  worker.stop();

  const trade = await db.collection('paper_trades').findOne({ asset: 'BTC-USD' });
  console.log(`\n[TEST RESULTS] Trade final status: ${trade.status}`);
  console.log(`                 Close Reason: ${trade.closeReason}`);
  console.log(`                 PnL: ${trade.pnl?.toFixed(2)}%`);

  if (trade.status === 'LOSS' && trade.closeReason === 'STOP_LOSS' && trade.pnl < 0) {
    console.log("Result: PASSED (Trade correctly closed via Stop Loss)");
  } else {
    console.log("Result: FAILED (Trade was not closed as expected)");
  }

  await db.collection('paper_trades').deleteMany({});
  await closeDb();
}

runGap5Tests().catch(console.error);
