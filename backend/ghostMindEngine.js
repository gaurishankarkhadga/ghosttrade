// =====================================================
// GHOSTMIND ENGINE — Loss-to-Win Intelligence Layer
// Master pre-trade gate that wraps around generateSignal()
// to prevent bad trades before they happen.
//
// Features:
// 1. BTC Market Leader Regime Override (block counter-trend alts)
// 2. Signal Deduplication (MongoDB-level, no duplicate tickers)
// 3. Recent Loss Memory Gate (require higher confidence after losses)
// 4. Loss Pattern Detection (block historically losing patterns)
// =====================================================

import { getDb } from './mongoConfig.js';
import { fetchOHLCV, fetchLivePrice, getClosePrices, getLogReturns } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { sma } from './technicalEngine.js';

// ─────────────────────────────────────────────────────
// BTC REGIME CACHE — Prevents redundant API calls
// ─────────────────────────────────────────────────────
let btcRegimeCache = null;
let btcRegimeCacheTime = 0;
const BTC_REGIME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Crypto tickers that should be gated by BTC regime
const CRYPTO_SUFFIXES = ['USD', 'USDT', 'USDC', 'BTC', 'ETH', 'BUSD'];
const BTC_TICKERS = ['BTC', 'BTCUSDT', 'BTC-USD', 'BTCUSD'];

function isCryptoTicker(ticker) {
  const upper = (ticker || '').toUpperCase();
  return CRYPTO_SUFFIXES.some(s => upper.includes(s)) || upper.includes('COIN');
}

function isBTCTicker(ticker) {
  const upper = (ticker || '').toUpperCase().replace(/-/g, '');
  return BTC_TICKERS.some(btc => upper.includes(btc));
}

// ─────────────────────────────────────────────────────
// 1. BTC MARKET LEADER REGIME OVERRIDE
// If BTC is trending BULLISH → block all altcoin BEARISH
// If BTC is trending BEARISH → block all altcoin BULLISH
// ─────────────────────────────────────────────────────
async function getMarketLeaderRegime() {
  const now = Date.now();
  if (btcRegimeCache && (now - btcRegimeCacheTime) < BTC_REGIME_CACHE_TTL) {
    return btcRegimeCache;
  }

  try {
    const btcCandles = await fetchOHLCV('BTCUSDT', '1d', 200);
    if (!btcCandles || btcCandles.length < 50) {
      console.warn('[GHOSTMIND] Could not fetch BTC daily candles for regime check');
      return { trend: 'UNKNOWN', regime: null, confidence: 0 };
    }

    const btcCloses = getClosePrices(btcCandles);
    const btcPrice = btcCloses[btcCloses.length - 1];
    const btcSma20 = sma(btcCloses, 20);
    const btcSma50 = sma(btcCloses, 50);

    // Hurst regime classification
    const btcLogReturns = getLogReturns(btcCandles);
    const btcHurst = calculateHurst(btcLogReturns);
    const btcRegime = classifyRegime(btcHurst);

    let btcTrend = 'NEUTRAL';
    if (btcSma20 && btcSma50) {
      if (btcPrice > btcSma50 && btcSma20 > btcSma50) btcTrend = 'BULLISH';
      else if (btcPrice < btcSma50 && btcSma20 < btcSma50) btcTrend = 'BEARISH';
    }

    const result = {
      trend: btcTrend,
      regime: btcRegime,
      price: btcPrice,
      sma20: btcSma20,
      sma50: btcSma50,
      confidence: btcRegime?.heuristicScore || 0,
      updatedAt: new Date().toISOString()
    };

    btcRegimeCache = result;
    btcRegimeCacheTime = now;
    console.log(`[GHOSTMIND] BTC Regime: ${btcTrend} | Hurst Regime: ${btcRegime?.regime || 'N/A'} | Confidence: ${result.confidence}%`);
    return result;
  } catch (err) {
    console.error('[GHOSTMIND] BTC regime check failed:', err.message);
    return { trend: 'UNKNOWN', regime: null, confidence: 0 };
  }
}

// ─────────────────────────────────────────────────────
// 2. SIGNAL DEDUPLICATION (MongoDB-Level)
// Block duplicate signals on same ticker+direction within 6 hours
// ─────────────────────────────────────────────────────
async function isDuplicateSignal(ticker, direction) {
  try {
    const db = await getDb();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const existing = await db.collection('signals').findOne({
      ticker: { $regex: new RegExp(`^${ticker.replace(/-/g, '[-]?')}$`, 'i') },
      direction,
      resolvedOutcome: null,
      timestamp: { $gte: sixHoursAgo }
    });
    return !!existing;
  } catch (err) {
    console.error('[GHOSTMIND] Dedup check failed:', err.message);
    return false; // Fail open — allow the signal
  }
}

// ─────────────────────────────────────────────────────
// 3. RECENT LOSS MEMORY GATE
// After a loss on this ticker within 4h, require +15 higher confidence
// ─────────────────────────────────────────────────────
async function getRecentLossConfidenceBoost(ticker) {
  try {
    const db = await getDb();
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentLoss = await db.collection('signals').findOne({
      ticker: { $regex: new RegExp(ticker.replace(/-/g, '[-]?'), 'i') },
      resolvedOutcome: 'INCORRECT',
      resolvedAt: { $gte: fourHoursAgo }
    });
    return recentLoss ? 15 : 0;
  } catch (err) {
    console.error('[GHOSTMIND] Recent loss check failed:', err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────
// 4. LOSS PATTERN DETECTION
// Check if this regime+direction combo has been losing heavily
// ─────────────────────────────────────────────────────
async function checkLossPatterns(ticker, direction, regime) {
  try {
    const db = await getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentLosses = await db.collection('signals').countDocuments({
      direction,
      'regime.regime': regime,
      resolvedOutcome: 'INCORRECT',
      timestamp: { $gte: thirtyDaysAgo }
    });

    const recentWins = await db.collection('signals').countDocuments({
      direction,
      'regime.regime': regime,
      resolvedOutcome: 'CORRECT',
      timestamp: { $gte: thirtyDaysAgo }
    });

    const total = recentLosses + recentWins;
    if (total >= 5 && total > 0 && (recentLosses / total) > 0.65) {
      return {
        blocked: true,
        reason: `Loss pattern detected: ${recentLosses}/${total} recent ${regime} ${direction} signals were incorrect (>${Math.round((recentLosses/total)*100)}% loss rate)`
      };
    }

    return { blocked: false };
  } catch (err) {
    console.error('[GHOSTMIND] Loss pattern check failed:', err.message);
    return { blocked: false };
  }
}

// ─────────────────────────────────────────────────────
// MASTER PRE-TRADE GATE — The single entry point
// Called after generateSignal() but BEFORE logging/executing
// ─────────────────────────────────────────────────────
export async function preTradeGate(signal, ticker) {
  // Only gate TRADE signals (SHIELD_MODE already blocked)
  if (!signal || signal.action !== 'TRADE') {
    return { blocked: false, signal };
  }

  const direction = signal.direction;
  const score = signal.score || 0;
  const regime = signal.regime?.regime || 'UNKNOWN';
  const reasons = [];

  // ── Gate 1: BTC Market Leader Regime Override ──
  if (isCryptoTicker(ticker) && !isBTCTicker(ticker)) {
    try {
      const btcState = await getMarketLeaderRegime();
      if (btcState.trend === 'BULLISH' && direction === 'BEARISH' && btcState.confidence >= 55) {
        console.log(`[GHOSTMIND] 🛡️ BTC REGIME GATE: Blocking ${ticker} BEARISH — BTC macro is BULLISH (confidence: ${btcState.confidence}%)`);
        return {
          blocked: true,
          reason: `BTC Market Leader Override: BTC macro trend is BULLISH (${btcState.confidence}% confidence) — blocking altcoin BEARISH signal. ~80% of crypto is correlated to BTC.`,
          gate: 'BTC_REGIME_OVERRIDE'
        };
      }
      if (btcState.trend === 'BEARISH' && direction === 'BULLISH' && btcState.confidence >= 55) {
        console.log(`[GHOSTMIND] 🛡️ BTC REGIME GATE: Blocking ${ticker} BULLISH — BTC macro is BEARISH (confidence: ${btcState.confidence}%)`);
        return {
          blocked: true,
          reason: `BTC Market Leader Override: BTC macro trend is BEARISH (${btcState.confidence}% confidence) — blocking altcoin BULLISH signal. ~80% of crypto is correlated to BTC.`,
          gate: 'BTC_REGIME_OVERRIDE'
        };
      }
    } catch (err) {
      console.warn('[GHOSTMIND] BTC regime gate skipped:', err.message);
    }
  }

  // ── Gate 2: Signal Deduplication ──
  try {
    const isDupe = await isDuplicateSignal(ticker, direction);
    if (isDupe) {
      console.log(`[GHOSTMIND] 🛡️ DEDUP GATE: Blocking duplicate ${ticker} ${direction} — active unresolved signal exists within 6h`);
      return {
        blocked: true,
        reason: `Signal Deduplication: An active unresolved ${direction} signal for ${ticker} already exists within the last 6 hours. Preventing duplicate exposure.`,
        gate: 'SIGNAL_DEDUPLICATION'
      };
    }
  } catch (err) {
    console.warn('[GHOSTMIND] Dedup gate skipped:', err.message);
  }

  // ── Gate 3: Recent Loss Memory ──
  try {
    const confidenceBoost = await getRecentLossConfidenceBoost(ticker);
    if (confidenceBoost > 0) {
      const requiredScore = 65 + confidenceBoost; // 65 (MIN_SIGNAL_SCORE) + 15 = 80
      if (score < requiredScore) {
        console.log(`[GHOSTMIND] 🛡️ LOSS MEMORY GATE: Blocking ${ticker} — recent loss requires score ${requiredScore}+, got ${score}`);
        return {
          blocked: true,
          reason: `Recent Loss Memory: ${ticker} had an incorrect signal within the last 4 hours. Requiring elevated confidence (${requiredScore}+) for re-entry, current score: ${score}.`,
          gate: 'RECENT_LOSS_MEMORY'
        };
      }
      reasons.push(`[GHOSTMIND] Loss memory: Recent loss detected, but score ${score} meets elevated threshold ${requiredScore}`);
    }
  } catch (err) {
    console.warn('[GHOSTMIND] Loss memory gate skipped:', err.message);
  }

  // ── Gate 4: Loss Pattern Detection ──
  try {
    const patternCheck = await checkLossPatterns(ticker, direction, regime);
    if (patternCheck.blocked) {
      console.log(`[GHOSTMIND] 🛡️ LOSS PATTERN GATE: Blocking ${ticker} ${direction} in ${regime} — high loss rate detected`);
      return {
        blocked: true,
        reason: patternCheck.reason,
        gate: 'LOSS_PATTERN_DETECTION'
      };
    }
  } catch (err) {
    console.warn('[GHOSTMIND] Loss pattern gate skipped:', err.message);
  }

  // All gates passed
  if (reasons.length > 0) {
    console.log(`[GHOSTMIND] ✅ ${ticker} ${direction} passed all gates with notes: ${reasons.join('; ')}`);
  } else {
    console.log(`[GHOSTMIND] ✅ ${ticker} ${direction} (score: ${score}) passed all pre-trade gates`);
  }

  return { blocked: false, signal, additionalReasons: reasons };
}

// ─────────────────────────────────────────────────────
// UTILITY: Force-clear BTC regime cache (for testing)
// ─────────────────────────────────────────────────────
export function clearBTCRegimeCache() {
  btcRegimeCache = null;
  btcRegimeCacheTime = 0;
}

export { getMarketLeaderRegime };
