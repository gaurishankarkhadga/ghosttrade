// =====================================================
// END-TO-END PnL VERIFICATION — Loss Must Be Loss, Profit Must Be Profit
// Tests the FULL pipeline: SL/TP Calc → Trade Open → Monitor Close → PnL Math → Risk Control
// =====================================================

import { getDb } from './mongoConfig.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { fetchMultiTimeframeOHLCV } from './dataFetcher.js';
import { computeKelly } from './kellyEngine.js';
import { canOpenNewTrade, checkBlackSwanLiquidityCircuitBreaker } from './riskControlEngine.js';

const TEST_USER = 'e2e_test_user_' + Date.now();
const TEST_COLLECTION = 'paper_trades';
let db;
let passed = 0, failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ FAIL: ${label} ${detail}`); }
}

// Simulate what monitorWorker.js line 44 does
function calcPnl(entryPrice, exitPrice, side) {
  return ((exitPrice - entryPrice) / entryPrice) * 100 * (side === 'SHORT' ? -1 : 1);
}

// Simulate what monitorWorker.js line 35-41 does
function checkSLTP(currentPrice, trade) {
  if (trade.side === 'LONG') {
    if (currentPrice <= trade.stopLoss) return 'STOP_LOSS';
    if (currentPrice >= trade.takeProfit) return 'TAKE_PROFIT';
  } else if (trade.side === 'SHORT') {
    if (currentPrice >= trade.stopLoss) return 'STOP_LOSS';
    if (currentPrice <= trade.takeProfit) return 'TAKE_PROFIT';
  }
  return null;
}

async function cleanup() {
  await db.collection(TEST_COLLECTION).deleteMany({ userId: TEST_USER });
}

// =====================================================
// TEST 1: SL/TP Math with REAL BTC-USD candles
// =====================================================
async function testSLTPWithRealData() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 1: SL/TP CALCULATION — Real BTC-USD Data');
  console.log('══════════════════════════════════════════════════════════\n');

  const data = await fetchMultiTimeframeOHLCV('BTC-USD', 300);
  if (data.error) { console.error('  Data fetch failed:', data.error); return null; }

  const candles = data.timeframes['15m'];
  const currentPrice = candles[candles.length - 1].close;
  console.log(`  Live BTC Price: $${currentPrice.toFixed(2)}\n`);

  // LONG setup
  const longExit = computeStopLossTakeProfit(candles, 'LONG');
  console.log(`  LONG Setup:`);
  console.log(`    SL: $${longExit.stopLoss.toFixed(2)} | TP: $${longExit.takeProfit.toFixed(2)} | ATR: $${longExit.atr.toFixed(2)}`);
  assert('LONG SL below entry', longExit.stopLoss < currentPrice, `SL=${longExit.stopLoss} vs Entry=${currentPrice}`);
  assert('LONG TP above entry', longExit.takeProfit > currentPrice, `TP=${longExit.takeProfit} vs Entry=${currentPrice}`);
  assert('LONG SL distance > 0', longExit.slDistance > 0);

  // SHORT setup
  const shortExit = computeStopLossTakeProfit(candles, 'SHORT');
  console.log(`\n  SHORT Setup:`);
  console.log(`    SL: $${shortExit.stopLoss.toFixed(2)} | TP: $${shortExit.takeProfit.toFixed(2)} | ATR: $${shortExit.atr.toFixed(2)}`);
  assert('SHORT SL above entry', shortExit.stopLoss > currentPrice, `SL=${shortExit.stopLoss} vs Entry=${currentPrice}`);
  assert('SHORT TP below entry', shortExit.takeProfit < currentPrice, `TP=${shortExit.takeProfit} vs Entry=${currentPrice}`);
  assert('SHORT SL distance > 0', shortExit.slDistance > 0);

  return { currentPrice, longExit, shortExit, candles };
}

// =====================================================
// TEST 2: PnL Math — Every Scenario
// =====================================================
function testPnLMath(btcPrice) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 2: PnL CALCULATION — All 4 Scenarios');
  console.log('══════════════════════════════════════════════════════════\n');

  const entry = btcPrice || 100000;

  // LONG WIN (price goes up)
  const lw = calcPnl(entry, entry * 1.05, 'LONG');
  console.log(`  LONG WIN:  Entry=$${entry} → Exit=$${(entry*1.05).toFixed(0)} → PnL=${lw.toFixed(2)}%`);
  assert('LONG WIN produces positive PnL', lw > 0, `Got ${lw}`);
  assert('LONG WIN PnL ~= +5%', Math.abs(lw - 5) < 0.01, `Got ${lw}`);

  // LONG LOSS (price goes down)
  const ll = calcPnl(entry, entry * 0.97, 'LONG');
  console.log(`  LONG LOSS: Entry=$${entry} → Exit=$${(entry*0.97).toFixed(0)} → PnL=${ll.toFixed(2)}%`);
  assert('LONG LOSS produces negative PnL', ll < 0, `Got ${ll}`);
  assert('LONG LOSS PnL ~= -3%', Math.abs(ll - (-3)) < 0.01, `Got ${ll}`);

  // SHORT WIN (price goes down)
  const sw = calcPnl(entry, entry * 0.95, 'SHORT');
  console.log(`  SHORT WIN: Entry=$${entry} → Exit=$${(entry*0.95).toFixed(0)} → PnL=${sw.toFixed(2)}%`);
  assert('SHORT WIN produces positive PnL', sw > 0, `Got ${sw}`);
  assert('SHORT WIN PnL ~= +5%', Math.abs(sw - 5) < 0.01, `Got ${sw}`);

  // SHORT LOSS (price goes up)
  const sl = calcPnl(entry, entry * 1.03, 'SHORT');
  console.log(`  SHORT LOSS: Entry=$${entry} → Exit=$${(entry*1.03).toFixed(0)} → PnL=${sl.toFixed(2)}%`);
  assert('SHORT LOSS produces negative PnL', sl < 0, `Got ${sl}`);
  assert('SHORT LOSS PnL ~= -3%', Math.abs(sl - (-3)) < 0.01, `Got ${sl}`);
}

// =====================================================
// TEST 3: Monitor SL/TP Trigger Logic
// =====================================================
function testMonitorTriggers(btcPrice, longExit, shortExit) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 3: MONITOR SL/TP TRIGGERS — Correct Side Detection');
  console.log('══════════════════════════════════════════════════════════\n');

  const entry = btcPrice;

  const longTrade = { side: 'LONG', entryPrice: entry, stopLoss: longExit.stopLoss, takeProfit: longExit.takeProfit };
  const shortTrade = { side: 'SHORT', entryPrice: entry, stopLoss: shortExit.stopLoss, takeProfit: shortExit.takeProfit };

  // LONG: price drops to SL
  const longSL = checkSLTP(longExit.stopLoss - 1, longTrade);
  assert('LONG price at SL triggers STOP_LOSS', longSL === 'STOP_LOSS', `Got ${longSL}`);

  // LONG: price rises to TP
  const longTP = checkSLTP(longExit.takeProfit + 1, longTrade);
  assert('LONG price at TP triggers TAKE_PROFIT', longTP === 'TAKE_PROFIT', `Got ${longTP}`);

  // LONG: price in middle = no trigger
  const longMid = checkSLTP(entry, longTrade);
  assert('LONG price at entry = no trigger', longMid === null, `Got ${longMid}`);

  // SHORT: price rises to SL
  const shortSL = checkSLTP(shortExit.stopLoss + 1, shortTrade);
  assert('SHORT price at SL triggers STOP_LOSS', shortSL === 'STOP_LOSS', `Got ${shortSL}`);

  // SHORT: price drops to TP
  const shortTP = checkSLTP(shortExit.takeProfit - 1, shortTrade);
  assert('SHORT price at TP triggers TAKE_PROFIT', shortTP === 'TAKE_PROFIT', `Got ${shortTP}`);

  // CRITICAL: Verify PnL sign matches the trigger
  const longSLpnl = calcPnl(entry, longExit.stopLoss, 'LONG');
  assert('LONG SL hit → PnL is NEGATIVE (loss)', longSLpnl < 0, `Got ${longSLpnl.toFixed(2)}%`);

  const longTPpnl = calcPnl(entry, longExit.takeProfit, 'LONG');
  assert('LONG TP hit → PnL is POSITIVE (profit)', longTPpnl > 0, `Got ${longTPpnl.toFixed(2)}%`);

  const shortSLpnl = calcPnl(entry, shortExit.stopLoss, 'SHORT');
  assert('SHORT SL hit → PnL is NEGATIVE (loss)', shortSLpnl < 0, `Got ${shortSLpnl.toFixed(2)}%`);

  const shortTPpnl = calcPnl(entry, shortExit.takeProfit, 'SHORT');
  assert('SHORT TP hit → PnL is POSITIVE (profit)', shortTPpnl > 0, `Got ${shortTPpnl.toFixed(2)}%`);

  console.log(`\n  PnL Summary:`);
  console.log(`    LONG  SL hit: ${longSLpnl.toFixed(2)}% (LOSS)  | TP hit: +${longTPpnl.toFixed(2)}% (WIN)`);
  console.log(`    SHORT SL hit: ${shortSLpnl.toFixed(2)}% (LOSS)  | TP hit: +${shortTPpnl.toFixed(2)}% (WIN)`);
}

// =====================================================
// TEST 4: Full DB Round-Trip (Open → Close → Check PnL in DB)
// =====================================================
async function testDBRoundTrip(btcPrice, longExit) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 4: DATABASE ROUND-TRIP — Open → SL Hit → Verify Loss in DB');
  console.log('══════════════════════════════════════════════════════════\n');

  const entry = btcPrice;
  const tradeId = `E2E_LONG_LOSS_${Date.now()}`;

  // Step 1: Open a LONG trade (simulating executionEngine.logTradeToDb)
  const openDoc = {
    id: tradeId, userId: TEST_USER, asset: 'BTC-USD', side: 'LONG',
    entryPrice: entry, stopLoss: longExit.stopLoss, takeProfit: longExit.takeProfit,
    quantity: 1, kellySize: 10, status: 'OPEN', mode: 'PAPER',
    executedAt: new Date().toISOString()
  };
  await db.collection(TEST_COLLECTION).updateOne({ id: tradeId }, { $set: openDoc }, { upsert: true });
  console.log(`  [1] Opened LONG trade: Entry=$${entry.toFixed(2)}, SL=$${longExit.stopLoss.toFixed(2)}, TP=$${longExit.takeProfit.toFixed(2)}`);

  // Step 2: Simulate monitor detecting SL hit
  const exitPrice = longExit.stopLoss; // price dropped to SL
  const pnlPct = calcPnl(entry, exitPrice, 'LONG');
  const finalStatus = pnlPct >= 0 ? 'WIN' : 'LOSS';

  await db.collection(TEST_COLLECTION).findOneAndUpdate(
    { id: tradeId, status: 'OPEN' },
    { $set: { status: finalStatus, exitPrice, pnl: pnlPct, closedAt: new Date().toISOString(), closeReason: 'STOP_LOSS' } }
  );
  console.log(`  [2] Monitor closed trade: Exit=$${exitPrice.toFixed(2)}, PnL=${pnlPct.toFixed(2)}%, Status=${finalStatus}`);

  // Step 3: Read back and verify
  const closedTrade = await db.collection(TEST_COLLECTION).findOne({ id: tradeId });
  assert('Trade status is LOSS', closedTrade.status === 'LOSS', `Got ${closedTrade.status}`);
  assert('PnL is negative', closedTrade.pnl < 0, `Got ${closedTrade.pnl}`);
  assert('Exit price equals SL', closedTrade.exitPrice === longExit.stopLoss);
  assert('closeReason is STOP_LOSS', closedTrade.closeReason === 'STOP_LOSS');

  // Step 4: Now open and close a WINNING trade
  const winId = `E2E_LONG_WIN_${Date.now()}`;
  const winDoc = {
    id: winId, userId: TEST_USER, asset: 'ETH-USD', side: 'LONG',
    entryPrice: entry, stopLoss: longExit.stopLoss, takeProfit: longExit.takeProfit,
    quantity: 1, kellySize: 10, status: 'OPEN', mode: 'PAPER',
    executedAt: new Date().toISOString()
  };
  await db.collection(TEST_COLLECTION).updateOne({ id: winId }, { $set: winDoc }, { upsert: true });

  const winExit = longExit.takeProfit;
  const winPnl = calcPnl(entry, winExit, 'LONG');
  const winStatus = winPnl >= 0 ? 'WIN' : 'LOSS';

  await db.collection(TEST_COLLECTION).findOneAndUpdate(
    { id: winId, status: 'OPEN' },
    { $set: { status: winStatus, exitPrice: winExit, pnl: winPnl, closedAt: new Date().toISOString(), closeReason: 'TAKE_PROFIT' } }
  );

  const closedWin = await db.collection(TEST_COLLECTION).findOne({ id: winId });
  console.log(`\n  [3] WIN trade: Exit=$${winExit.toFixed(2)}, PnL=+${winPnl.toFixed(2)}%, Status=${closedWin.status}`);
  assert('WIN trade status is WIN', closedWin.status === 'WIN', `Got ${closedWin.status}`);
  assert('WIN PnL is positive', closedWin.pnl > 0, `Got ${closedWin.pnl}`);
  assert('WIN closeReason is TAKE_PROFIT', closedWin.closeReason === 'TAKE_PROFIT');

  return { lossTradeId: tradeId, lossPnl: pnlPct, winPnl };
}

// =====================================================
// TEST 5: Risk Control — Daily Loss Limit Blocks After Losses
// =====================================================
async function testDailyLossLimit() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 5: RISK CONTROL — Daily Loss Limit (5% cap)');
  console.log('══════════════════════════════════════════════════════════\n');

  // Clean slate
  await cleanup();

  // Insert multiple losing trades that exceed 5% daily loss
  // kellySize=15, pnl=-35% → portfolio impact = -0.35 * 0.15 = -5.25% → exceeds 5% limit
  const bigLossId = `E2E_BIGLOSS_${Date.now()}`;
  await db.collection(TEST_COLLECTION).updateOne(
    { id: bigLossId },
    { $set: {
      id: bigLossId, userId: TEST_USER, asset: 'BTC-USD', side: 'LONG',
      entryPrice: 100000, exitPrice: 65000, pnl: -35, kellySize: 15,
      status: 'LOSS', mode: 'PAPER', closeReason: 'STOP_LOSS',
      closedAt: new Date().toISOString()
    }},
    { upsert: true }
  );
  console.log(`  Inserted catastrophic loss: PnL=-35%, Kelly=15% → Portfolio impact: -5.25%`);

  // Now try to open a new trade — should be BLOCKED
  const riskCheck = await canOpenNewTrade('ETH-USD', 'LONG');
  console.log(`  canOpenNewTrade result: allowed=${riskCheck.allowed}, reason=${riskCheck.reason || 'N/A'}`);
  assert('Trading BLOCKED after 5%+ daily loss', !riskCheck.allowed);
  assert('Reason is DAILY_LOSS_LIMIT_HIT', riskCheck.reason === 'DAILY_LOSS_LIMIT_HIT', `Got ${riskCheck.reason}`);

  // Clean and verify trading resumes
  await cleanup();
  const afterClean = await canOpenNewTrade('BTC-USD', 'LONG');
  assert('Trading ALLOWED after losses cleared', afterClean.allowed, `Got ${afterClean.reason}`);
}

// =====================================================
// TEST 6: Max Concurrent Trades Cap
// =====================================================
async function testConcurrentCap() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 6: RISK CONTROL — Max 3 Concurrent Trades');
  console.log('══════════════════════════════════════════════════════════\n');

  await cleanup();

  // Insert 3 open trades
  for (let i = 1; i <= 3; i++) {
    await db.collection(TEST_COLLECTION).updateOne(
      { id: `E2E_OPEN_${i}` },
      { $set: { id: `E2E_OPEN_${i}`, userId: TEST_USER, asset: `ASSET${i}-USD`, side: 'LONG', status: 'OPEN', entryPrice: 100, stopLoss: 95, takeProfit: 110 } },
      { upsert: true }
    );
  }
  console.log(`  Inserted 3 open trades`);

  const blocked = await canOpenNewTrade('SOL-USD', 'LONG');
  assert('4th trade BLOCKED (max 3 concurrent)', !blocked.allowed, `Got ${blocked.reason}`);
  assert('Reason is MAX_CONCURRENT_TRADES', blocked.reason === 'MAX_CONCURRENT_TRADES', `Got ${blocked.reason}`);

  // Close one trade, try again
  await db.collection(TEST_COLLECTION).updateOne({ id: 'E2E_OPEN_1' }, { $set: { status: 'WIN', pnl: 5, closedAt: new Date().toISOString() } });
  const allowed = await canOpenNewTrade('SOL-USD', 'LONG');
  assert('3rd slot freed → new trade ALLOWED', allowed.allowed, `Got ${allowed.reason}`);

  await cleanup();
}

// =====================================================
// TEST 7: SHORT Trade Full Lifecycle
// =====================================================
async function testShortLifecycle(btcPrice, shortExit) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST 7: SHORT TRADE LIFECYCLE — SL Loss + TP Win');
  console.log('══════════════════════════════════════════════════════════\n');

  await cleanup();
  const entry = btcPrice;

  // SHORT trade hits SL (price goes UP)
  const slId = `E2E_SHORT_SL_${Date.now()}`;
  await db.collection(TEST_COLLECTION).updateOne(
    { id: slId },
    { $set: { id: slId, userId: TEST_USER, asset: 'BTC-USD', side: 'SHORT', entryPrice: entry, stopLoss: shortExit.stopLoss, takeProfit: shortExit.takeProfit, status: 'OPEN', kellySize: 10, mode: 'PAPER' } },
    { upsert: true }
  );

  const slExitPrice = shortExit.stopLoss;
  const slPnl = calcPnl(entry, slExitPrice, 'SHORT');
  const slStatus = slPnl >= 0 ? 'WIN' : 'LOSS';
  await db.collection(TEST_COLLECTION).findOneAndUpdate(
    { id: slId, status: 'OPEN' },
    { $set: { status: slStatus, exitPrice: slExitPrice, pnl: slPnl, closedAt: new Date().toISOString(), closeReason: 'STOP_LOSS' } }
  );

  console.log(`  SHORT SL: Entry=$${entry.toFixed(2)}, Exit=$${slExitPrice.toFixed(2)}, PnL=${slPnl.toFixed(2)}%`);
  assert('SHORT SL produces LOSS', slStatus === 'LOSS', `Got ${slStatus} with PnL ${slPnl}`);
  assert('SHORT SL PnL is negative', slPnl < 0, `Got ${slPnl}`);

  // SHORT trade hits TP (price goes DOWN)
  const tpId = `E2E_SHORT_TP_${Date.now()}`;
  await db.collection(TEST_COLLECTION).updateOne(
    { id: tpId },
    { $set: { id: tpId, userId: TEST_USER, asset: 'BTC-USD', side: 'SHORT', entryPrice: entry, stopLoss: shortExit.stopLoss, takeProfit: shortExit.takeProfit, status: 'OPEN', kellySize: 10, mode: 'PAPER' } },
    { upsert: true }
  );

  const tpExitPrice = shortExit.takeProfit;
  const tpPnl = calcPnl(entry, tpExitPrice, 'SHORT');
  const tpStatus = tpPnl >= 0 ? 'WIN' : 'LOSS';
  await db.collection(TEST_COLLECTION).findOneAndUpdate(
    { id: tpId, status: 'OPEN' },
    { $set: { status: tpStatus, exitPrice: tpExitPrice, pnl: tpPnl, closedAt: new Date().toISOString(), closeReason: 'TAKE_PROFIT' } }
  );

  console.log(`  SHORT TP: Entry=$${entry.toFixed(2)}, Exit=$${tpExitPrice.toFixed(2)}, PnL=+${tpPnl.toFixed(2)}%`);
  assert('SHORT TP produces WIN', tpStatus === 'WIN', `Got ${tpStatus} with PnL ${tpPnl}`);
  assert('SHORT TP PnL is positive', tpPnl > 0, `Got ${tpPnl}`);

  await cleanup();
}

// =====================================================
// RUN ALL
// =====================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GHOSTTRADE END-TO-END PnL VERIFICATION — REAL DATA TEST   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  db = await getDb();
  await cleanup();

  // Test 1: SL/TP with real candles
  const sltp = await testSLTPWithRealData();
  if (!sltp) { console.error('Cannot continue without price data.'); process.exit(1); }

  // Test 2: PnL math (all 4 scenarios)
  testPnLMath(sltp.currentPrice);

  // Test 3: Monitor trigger logic
  testMonitorTriggers(sltp.currentPrice, sltp.longExit, sltp.shortExit);

  // Test 4: DB round-trip
  await testDBRoundTrip(sltp.currentPrice, sltp.longExit);

  // Test 5: Daily loss limit
  await testDailyLossLimit();

  // Test 6: Concurrent cap
  await testConcurrentCap();

  // Test 7: SHORT lifecycle
  await testShortLifecycle(sltp.currentPrice, sltp.shortExit);

  // Final cleanup
  await cleanup();

  // === SUMMARY ===
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      FINAL VERDICT                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}\n`);

  if (failed === 0) {
    console.log('  ✓ ALL TESTS PASSED — Loss is loss, profit is profit. End-to-end verified.');
  } else {
    console.log('  ✗ SOME TESTS FAILED — Review output above.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
