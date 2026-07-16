// =====================================================
// REGIME MONITOR — Real-time Candle-Close Regime Recheck
// Monitors all open signals. If regime flips mid-trade,
// fires a "thesis_invalidated" event immediately.
// PRD §4.3 — does not wait for stop-loss.
// =====================================================

import { fetchOHLCV, getLogReturns } from './dataFetcher.js';
import { calculateHurst }            from './hurstEngine.js';
import { classifyRegime }            from './regimeClassifier.js';
import { getDb }                     from './mongoConfig.js';

// Recheck every 5 minutes (300 seconds)
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

// In-memory map of active signals: signalId → { ticker, regime, clientWs? }
const openSignals = new Map();

// Active WebSocket clients that can receive invalidation pushes
const activeClients = new Set();

let monitorIntervalId = null;

/**
 * Registers a new signal for ongoing regime monitoring.
 * Called by geminiEngine.js after a successful analysis.
 *
 * @param {string} signalId    - MongoDB signal document ID
 * @param {string} ticker      - Asset ticker (e.g., "BTC")
 * @param {string} regime      - Regime at signal creation (e.g., "TRENDING")
 */
export function registerSignal(signalId, ticker, regime) {
  openSignals.set(signalId, {
    ticker,
    originalRegime: regime,
    registeredAt:   new Date(),
  });
  console.log(`[REGIME MONITOR] Tracking signal ${signalId} | ${ticker} | Regime: ${regime}`);
}

/**
 * Removes a signal from monitoring (called after audit resolves it).
 */
export function unregisterSignal(signalId) {
  openSignals.delete(signalId);
}

/**
 * Registers a client WebSocket to receive regime invalidation events.
 */
export function registerClient(ws) {
  activeClients.add(ws);
  ws.on('close', () => activeClients.delete(ws));
}

/**
 * Pushes a "thesis_invalidated" event to all connected clients.
 */
function broadcastInvalidation(signalId, ticker, originalRegime, newRegime) {
  const payload = JSON.stringify({
    type:           'regime_invalidated',
    signalId,
    ticker,
    originalRegime,
    newRegime,
    message:        `THESIS INVALIDATED: ${ticker} regime flipped from ${originalRegime} → ${newRegime}. Do not wait for stop-loss — structural basis is gone.`,
    timestamp:      new Date().toISOString(),
  });

  let clientsNotified = 0;
  for (const ws of activeClients) {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
        clientsNotified++;
      }
    } catch (e) {
      console.warn('[REGIME MONITOR] Failed to notify client:', e.message);
    }
  }
  console.log(`[REGIME MONITOR] Invalidation broadcast for ${ticker}: ${clientsNotified} clients notified`);
}

/**
 * Writes a regime invalidation event to MongoDB for auditing.
 */
async function logInvalidationToDb(signalId, ticker, originalRegime, newRegime) {
  try {
    const db = await getDb();
    await db.collection('regime_invalidations').insertOne({
      signalId,
      ticker,
      originalRegime,
      newRegime,
      invalidatedAt: new Date(),
    });

    // Also flag the original signal
    await db.collection('signals').updateOne(
      { _id: signalId },
      { $set: { regimeInvalidated: true, invalidatedAt: new Date(), newRegime } }
    );
  } catch (err) {
    console.error('[REGIME MONITOR] DB log failed:', err.message);
  }
}

/**
 * Runs a single recheck cycle for all open signals.
 */
async function runRecheckCycle() {
  if (openSignals.size === 0) return;

  console.log(`[REGIME MONITOR] Recheck cycle — ${openSignals.size} open signal(s)`);

  // Group by ticker to avoid redundant Yahoo Finance calls
  const tickerMap = new Map();
  for (const [signalId, entry] of openSignals.entries()) {
    if (!tickerMap.has(entry.ticker)) {
      tickerMap.set(entry.ticker, []);
    }
    tickerMap.get(entry.ticker).push({ signalId, ...entry });
  }

  for (const [ticker, signals] of tickerMap.entries()) {
    try {
      // Fetch fresh data
      const dataResult = await fetchOHLCV(ticker);
      if (dataResult.error) {
        console.warn(`[REGIME MONITOR] Cannot recheck ${ticker}: ${dataResult.error}`);
        continue;
      }

      const logReturns = getLogReturns(dataResult.bars);
      const hurstResult = calculateHurst(logReturns);

      if (hurstResult.error) {
        console.warn(`[REGIME MONITOR] Hurst failed for ${ticker}: ${hurstResult.error}`);
        continue;
      }

      const regimeResult = classifyRegime(hurstResult);
      const currentRegime = regimeResult.regime;

      // Check each signal using this ticker's fresh regime
      for (const signal of signals) {
        if (currentRegime !== signal.originalRegime) {
          console.warn(`[REGIME MONITOR] FLIP DETECTED: ${ticker} | ${signal.originalRegime} → ${currentRegime} | Signal: ${signal.signalId}`);

          // Broadcast to connected clients
          broadcastInvalidation(signal.signalId, ticker, signal.originalRegime, currentRegime);

          // Log to DB and flag the signal
          await logInvalidationToDb(signal.signalId, ticker, signal.originalRegime, currentRegime);

          // Remove from monitoring — thesis is done
          unregisterSignal(signal.signalId);
        }
      }

      // Rate limit between Yahoo Finance calls
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`[REGIME MONITOR] Error rechecking ${ticker}:`, err.message);
    }
  }
}

/**
 * Starts the regime monitor background loop.
 * Called by server.js alongside the audit daemon.
 */
export function startRegimeMonitor() {
  console.log(`[REGIME MONITOR] Started — rechecking every ${RECHECK_INTERVAL_MS / 1000}s`);

  // Initial delay of 60s to let server warm up
  setTimeout(() => {
    runRecheckCycle();
    monitorIntervalId = setInterval(runRecheckCycle, RECHECK_INTERVAL_MS);
  }, 60000);
}

/**
 * Stops the regime monitor.
 */
export function stopRegimeMonitor() {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
    console.log('[REGIME MONITOR] Stopped');
  }
}
