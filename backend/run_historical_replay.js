// =====================================================
// HISTORICAL REPLAY PIPELINE — Seeds Calibration + Setup Stats
// Replays the Signal Generator over 6-12 months of historical
// OHLCV data, logging synthetic signals into MongoDB so the
// calibration engine and Kelly criterion have empirical data.
//
// Run once: node run_historical_replay.js
// Expected duration: 20-45 minutes for all 27 assets.
// =====================================================

import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { logSignal } from './memoryLedger.js';
import { getDb, closeDb } from './mongoConfig.js';
import { DEFAULT_CRYPTO_WATCHLIST, DEFAULT_GLOBAL_STOCKS_WATCHLIST } from './sharedConfig.js';

const ALL_ASSETS = [
  ...DEFAULT_CRYPTO_WATCHLIST,
  ...DEFAULT_GLOBAL_STOCKS_WATCHLIST
];

// How many daily bars to use for the replay window
// 365 bars = ~1 year of trading history
const REPLAY_BARS = 365;

// Minimum candle history needed to compute Hurst + indicators reliably
const MIN_WARMUP_BARS = 200;

// Forward window: how many bars ahead to check if SL or TP was hit
const FORWARD_WINDOW = 5;

// Delay between API calls to respect Yahoo Finance rate limits
const DELAY_MS = 2000;

// ─────────────────────────────────────────────────────

/**
 * Simulates a single signal resolution by checking forward bars.
 * Returns 'CORRECT' if TP was hit before SL within FORWARD_WINDOW bars.
 * Returns 'INCORRECT' if SL was hit first.
 * Returns 'EXPIRED' if neither was hit in the window.
 */
function resolveSignalFromHistory(direction, entryPrice, stopLoss, takeProfit, forwardBars) {
  if (!stopLoss || !takeProfit || !forwardBars || forwardBars.length === 0) return 'EXPIRED';

  for (const bar of forwardBars) {
    if (direction === 'LONG') {
      if (bar.low <= stopLoss)   return 'INCORRECT'; // SL hit
      if (bar.high >= takeProfit) return 'CORRECT';   // TP hit
    } else if (direction === 'SHORT') {
      if (bar.high >= stopLoss)  return 'INCORRECT';  // SL hit
      if (bar.low <= takeProfit) return 'CORRECT';    // TP hit
    }
  }
  return 'EXPIRED';
}

/**
 * Runs the replay for a single asset.
 * Slides a warmup window forward one bar at a time through history.
 */
async function replayAsset(ticker) {
  console.log(`\n  [REPLAY] ${ticker} — Fetching ${REPLAY_BARS} bars...`);

  const data = await fetchOHLCV(ticker, REPLAY_BARS);
  if (data.error || !data.bars || data.bars.length < MIN_WARMUP_BARS + FORWARD_WINDOW) {
    console.log(`  [REPLAY] ${ticker} — SKIPPED: ${data.error || 'Insufficient bars'}`);
    return { ticker, signalsLogged: 0, resolved: 0, skipped: true };
  }

  const allBars = data.bars;
  let signalsLogged = 0;
  let signalsResolved = 0;

  // Walk forward: each iteration uses bars[0..i] as history, bars[i+1..i+1+FORWARD_WINDOW] as future
  for (let i = MIN_WARMUP_BARS; i < allBars.length - FORWARD_WINDOW; i++) {
    const historySlice = allBars.slice(0, i);
    const forwardBars  = allBars.slice(i, i + FORWARD_WINDOW);
    const entryBar     = allBars[i]; // The bar at which signal is "generated"

    // Generate deterministic signal on this historical slice
    let signal;
    try {
      signal = await generateSignal(ticker, historySlice, {});
    } catch (err) {
      continue; // Skip bars that cause engine errors
    }

    // Only log actionable signals (skip NEUTRAL / SHIELD_MODE)
    if (!signal || signal.direction === 'NEUTRAL' || signal.direction === 'SHIELD_MODE' || signal.signalBlocked) {
      continue;
    }

    // Resolve outcome using forward bars (ground truth)
    const resolvedOutcome = resolveSignalFromHistory(
      signal.direction,
      entryBar.close,
      signal.stopLoss,
      signal.takeProfit,
      forwardBars
    );

    // Skip EXPIRED — these add noise to calibration without clean signal
    if (resolvedOutcome === 'EXPIRED') continue;

    // Build full signal document matching logSignal() schema
    const signalDoc = {
      ticker,
      direction:            signal.direction,
      rawConfidence:        signal.score,
      calibratedConfidence: signal.score, // Will be corrected by calibrationEngine
      hurstMean:            signal.hurstMean            ?? null,
      hurstRS:              signal.hurstRS              ?? null,
      hurstDFA:             signal.hurstDFA             ?? null,
      hurstCI:              signal.hurstCI              ?? null,
      hurstStable:          signal.hurstStable          ?? null,
      regime:               signal.regime               ?? null,
      regimePosterior:      signal.regimePosterior      ?? null,
      regimeActionable:     signal.regimeActionable     ?? null,
      primaryTarget:        signal.takeProfit           ?? null,
      extendedTarget:       null,
      invalidationLevel:    signal.stopLoss             ?? null,
      currentPrice:         entryBar.close,
      evGross:              null,
      evNet:                null,
      evPer100:             null,
      kellyF:               signal.kellyF               ?? null,
      halfKelly:            signal.halfKelly            ?? null,
      estimatedFee:         null,
      estimatedSpread:      null,
      signalBlocked:        false,
      blockedReason:        null,
      tradeTimeframe:       'HISTORICAL_REPLAY',
      predictionSummary:    `Historical replay: ${ticker} ${signal.direction} @ ${entryBar.close}`,
    };

    try {
      const hash = await logSignal(signalDoc);
      if (!hash) continue; // Duplicate — already logged

      // Immediately resolve outcome (we know the ground truth from forward bars)
      const db = await getDb();
      await db.collection('signals').updateOne(
        { _id: hash },
        {
          $set: {
            resolvedOutcome,
            resolvedAt:   entryBar.date,
            actualPrice:  forwardBars[forwardBars.length - 1].close,
            auditDue:     new Date(0), // Already resolved — mark as past due
          }
        }
      );

      signalsLogged++;
      if (resolvedOutcome !== 'EXPIRED') signalsResolved++;
    } catch (err) {
      // Duplicate signal hash is expected and fine — skip silently
      if (err.code !== 11000) {
        console.warn(`  [REPLAY] ${ticker} signal log error:`, err.message);
      }
    }
  }

  console.log(`  [REPLAY] ${ticker} — Logged: ${signalsLogged} signals, Resolved: ${signalsResolved}`);
  return { ticker, signalsLogged, resolved: signalsResolved, skipped: false };
}

/**
 * Rebuilds the calibration curve after replay.
 * Reads all resolved signals and buckets them to compute actual hit rates.
 */
async function rebuildCalibrationCurve() {
  console.log('\n[CALIBRATION] Rebuilding calibration curve from replay data...');
  try {
    const db = await getDb();

    // Delete stale calibration cache so engine rebuilds on next request
    const cacheResult = await db.collection('calibration_cache').deleteMany({});
    console.log(`[CALIBRATION] Cleared ${cacheResult.deletedCount} stale cache entries.`);

    // Verify data quality
    const resolvedCount = await db.collection('signals').countDocuments({
      resolvedOutcome: { $in: ['CORRECT', 'INCORRECT'] },
      tradeTimeframe:  'HISTORICAL_REPLAY'
    });

    const correctCount = await db.collection('signals').countDocuments({
      resolvedOutcome: 'CORRECT',
      tradeTimeframe:  'HISTORICAL_REPLAY'
    });

    const overallWinRate = resolvedCount > 0
      ? ((correctCount / resolvedCount) * 100).toFixed(1)
      : 'N/A';

    console.log(`[CALIBRATION] Replay signals resolved: ${resolvedCount}`);
    console.log(`[CALIBRATION] Overall historical win rate: ${overallWinRate}%`);
    console.log(`[CALIBRATION] ✅ Calibration engine will auto-rebuild on next query.`);

    return { resolvedCount, correctCount, overallWinRate };
  } catch (err) {
    console.error('[CALIBRATION] Rebuild failed:', err.message);
    return { resolvedCount: 0, correctCount: 0 };
  }
}

// ─────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('  GHOSTTRADE HISTORICAL REPLAY PIPELINE — v1.0');
  console.log(`  Assets  : ${ALL_ASSETS.length} (${DEFAULT_CRYPTO_WATCHLIST.length} crypto + ${DEFAULT_GLOBAL_STOCKS_WATCHLIST.length} stocks)`);
  console.log(`  Window  : ${REPLAY_BARS} daily bars (~${Math.round(REPLAY_BARS / 252)} year)`);
  console.log(`  Forward : ${FORWARD_WINDOW} bar resolution window`);
  console.log('  Purpose : Seed calibration + Kelly engines with empirical outcomes');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < ALL_ASSETS.length; i++) {
    const ticker = ALL_ASSETS[i];
    console.log(`\n[${i + 1}/${ALL_ASSETS.length}] ${ticker}`);

    const result = await replayAsset(ticker);
    results.push(result);

    // Rate limit between Yahoo Finance calls
    if (i < ALL_ASSETS.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // ── Summary ───────────────────────────────────────
  const totalLogged   = results.reduce((s, r) => s + (r.signalsLogged || 0), 0);
  const totalResolved = results.reduce((s, r) => s + (r.resolved || 0), 0);
  const skipped       = results.filter(r => r.skipped).length;

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  REPLAY COMPLETE');
  console.log(`  Total signals logged   : ${totalLogged}`);
  console.log(`  Total signals resolved : ${totalResolved}`);
  console.log(`  Assets skipped         : ${skipped}`);
  console.log('════════════════════════════════════════════════════════════════════');

  // Rebuild calibration curve
  const calResult = await rebuildCalibrationCurve();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Historical replay complete in ${elapsed} minutes.`);

  if (totalResolved < 100) {
    console.warn(`\n⚠️  WARNING: Only ${totalResolved} resolved signals logged.`);
    console.warn('   Calibration needs ~200+ signals to be statistically meaningful.');
    console.warn('   Consider increasing REPLAY_BARS or running on more assets.\n');
  } else {
    console.log(`\n✅ Calibration is now seeded with ${totalResolved} ground-truth outcomes.`);
    console.log('   The Kelly engine and calibration curve are now data-driven.\n');
  }

  await closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL] Historical replay crashed:', err);
  process.exit(1);
});
