// =====================================================
// DETERMINISTIC SIGNAL GENERATOR — The Engine's Brain
// Produces mathematically-calculated BUY/SELL/HOLD signals
// using Pattern Detection, Hurst Regime, Technical Confluence,
// Order Flow Imbalance, Volume Analysis, and Historical Win Rates.
//
// Gemini does NOT decide the direction or confidence.
// This module is the single source of truth.
// =====================================================

import { detectPatterns } from './patternEngine.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { calculateOrderFlowImbalance } from './orderFlowEngine.js';
import { rsi, macd, bollingerBands, atr, sma, volumeAnalysis, vwap } from './technicalEngine.js';
import { getClosePrices, getLogReturns } from './dataFetcher.js';
import { constructSetupId, CURRENT_LOGIC_VERSION } from './sharedConfig.js';
import { computeKelly } from './kellyEngine.js';
import { getDb } from './mongoConfig.js';

// =====================================================
// SCORING WEIGHTS — Empirically tuned composite weights
// =====================================================
const SCORE_WEIGHTS = {
  REGIME_ALIGNMENT:      0.25,  // Is pattern aligned with Hurst regime?
  TECHNICAL_CONFLUENCE:  0.25,  // RSI + MACD + Bollinger + MA all agree?
  ORDER_FLOW:            0.20,  // Real OFI confirms direction?
  VOLUME_CONFIRMATION:   0.15,  // Above-average volume?
  HISTORICAL_WIN_RATE:   0.15,  // Backtest win rate for this setup_id
};

// Minimum composite score to generate a trade signal (0-100)
// TUNED: 45 allows borderline-actionable signals through while still filtering noise
// (was 60 — too strict, caused 87% NEUTRAL predictions)
const MIN_SIGNAL_SCORE = 45;

// Minimum directional votes required (out of ~5-7 voters: Pattern, MA, Partial MA, RSI, MACD, BB, OFI)
// Pattern is null ~70% of the time → effective voter pool is usually 6
// 2/6 = 33% minimum, but must still beat NEUTRAL count to win
// (was 3 — required 60% agreement which almost never happens with tight indicator bands)
const MIN_DIRECTIONAL_VOTES = 2;

// Bullish patterns defined once
const BULLISH_PATTERNS = ['hammer', 'bullish_engulfing', 'morning_star', 'three_white_soldiers'];
const BEARISH_PATTERNS = ['shooting_star', 'bearish_engulfing', 'evening_star'];

/**
 * Generates a fully deterministic trade signal from raw OHLCV candle data.
 * This is the CORE decision engine. No LLM is involved.
 *
 * @param {string} ticker - Asset ticker (e.g., 'BTC', 'AAPL')
 * @param {Array} candles - Daily OHLCV array (minimum 200 bars for Hurst/Regime)
 * @param {Object} [options] - Optional overrides
 * @param {Array} [options.candles1h] - 1h candles for directional voting (more accurate for 4h predictions)
 * @param {Array} [options.candles15m] - 15m candles for predictive horizon
 * @param {string} [options.ofiSource] - Source of OFI data
 * @returns {SignalResult}
 */
export async function generateSignal(ticker, candles, options = {}) {
  if (!candles || candles.length < 50) {
    return {
      action: 'NO_SIGNAL',
      reason: `Insufficient data: ${candles?.length || 0} bars (need 50+)`,
      ticker,
      score: 0,
    };
  }

  const closes = getClosePrices(candles);
  // Institutional Circuit Breaker: Always anchor the entire engine's logic to the true Live Price if provided, falling back to OHLCV close
  const currentPrice = options.livePrice || closes[closes.length - 1];

  // ─────────────────────────────────────────────────────
  // MULTI-TIMEFRAME STRATEGY:
  // • Daily candles → Hurst/Regime detection (long-term market structure)
  // • 1h candles → Directional voting (RSI, MACD, BB, SMA, Patterns, OFI)
  //   because 1h resolution matches 4-hour prediction window
  // • If 1h candles unavailable, fall back to daily
  // ─────────────────────────────────────────────────────
  const votingCandles = (options.candles1h && options.candles1h.length >= 50)
    ? options.candles1h
    : candles;
  const votingCloses = getClosePrices(votingCandles);
  const votingPrice = votingCloses[votingCloses.length - 1];

  // ─────────────────────────────────────────────────────
  // LAYER 1: PATTERN DETECTION (on voting-timeframe candles)
  // ─────────────────────────────────────────────────────
  const pattern = detectPatterns(votingCandles);

  // ─────────────────────────────────────────────────────
  // LAYER 2: REGIME CLASSIFICATION (Hurst Exponent — DAILY data)
  // Regime detection is correct on daily bars (long-term structure)
  // ─────────────────────────────────────────────────────
  const logReturns = getLogReturns(candles);
  const hurstResult = calculateHurst(logReturns);
  const regimeResult = classifyRegime(hurstResult);

  // ─────────────────────────────────────────────────────
  // LAYER 3: TECHNICAL INDICATORS (on voting-timeframe candles)
  // ─────────────────────────────────────────────────────
  const rsiResult = rsi(votingCloses);
  const macdResult = macd(votingCloses);
  const bbResult = bollingerBands(votingCloses);
  const atrResult = atr(votingCandles);
  const volResult = volumeAnalysis(votingCandles);
  const sma20 = sma(votingCloses, 20);
  const sma50 = sma(votingCloses, 50);
  const sma200 = sma(closes, 200); // SMA200 stays on daily — structural level
  const vwapResult = vwap(votingCandles);

  // ─────────────────────────────────────────────────────
  // LAYER 4: ORDER FLOW IMBALANCE (on voting-timeframe candles)
  // ─────────────────────────────────────────────────────
  const ofiResult = calculateOrderFlowImbalance(votingCandles, 14);
  const ofiSource = options.ofiSource || 'CANDLE_APPROXIMATION';
  const ofiSourcePenalty = ofiSource === 'BINANCE_AGGTRADE' ? 1.0 : 0.6;

  // ─────────────────────────────────────────────────────
  // LAYER 5: MACRO TREND ALIGNMENT
  // ─────────────────────────────────────────────────────
  let macroTrend = 'UNKNOWN';
  if (options.macroCandles && options.macroCandles.length >= 50) {
    const macroCloses = getClosePrices(options.macroCandles);
    const mPrice = macroCloses[macroCloses.length - 1];
    const mSma20 = sma(macroCloses, 20);
    const mSma50 = sma(macroCloses, 50);
    if (mSma20 && mSma50) {
      if (mPrice > mSma50 && mSma20 > mSma50) macroTrend = 'BULLISH';
      else if (mPrice < mSma50 && mSma20 < mSma50) macroTrend = 'BEARISH';
      else macroTrend = 'NEUTRAL';
    }
  }

  // ─────────────────────────────────────────────────────
  // LAYER 5b: MESO TREND ALIGNMENT (4H)
  // ─────────────────────────────────────────────────────
  let mesoTrend = 'UNKNOWN';
  if (options.candles4h && options.candles4h.length >= 50) {
    const mesoCloses = getClosePrices(options.candles4h);
    const mePrice = mesoCloses[mesoCloses.length - 1];
    const meSma20 = sma(mesoCloses, 20);
    const meSma50 = sma(mesoCloses, 50);
    if (meSma20 && meSma50) {
      if (mePrice > meSma50 && meSma20 > meSma50) mesoTrend = 'BULLISH';
      else if (mePrice < meSma50 && meSma20 < meSma50) mesoTrend = 'BEARISH';
      else mesoTrend = 'NEUTRAL';
    }
  }

  // ─────────────────────────────────────────────────────
  // DECISION: DETERMINE DIRECTION FROM MATH, NOT AI TEXT
  // ─────────────────────────────────────────────────────
  const directionVotes = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
  const reasons = [];

  // Vote 1: Pattern Direction
  if (pattern) {
    if (BULLISH_PATTERNS.includes(pattern)) {
      directionVotes.BULLISH += 2;
      reasons.push(`Bullish candlestick pattern detected: ${pattern}`);
    } else if (BEARISH_PATTERNS.includes(pattern)) {
      directionVotes.BEARISH += 2;
      reasons.push(`Bearish candlestick pattern detected: ${pattern}`);
    } else if (pattern === 'doji') {
      directionVotes.NEUTRAL += 1;
      reasons.push('Doji indecision candle — no directional bias');
    }
  }

  // Vote 2: Moving Average Alignment (Perfect)
  if (sma20 && sma50 && sma200) {
    if (sma20 > sma50 && sma50 > sma200 && currentPrice > sma20) {
      directionVotes.BULLISH += 2;
      reasons.push('SMA alignment: Golden Cross (SMA20 > SMA50 > SMA200)');
    } else if (sma20 < sma50 && sma50 < sma200 && currentPrice < sma20) {
      directionVotes.BEARISH += 2;
      reasons.push('SMA alignment: Death Cross (SMA20 < SMA50 < SMA200)');
    }
  }

  // Vote 2b: Partial Moving Average Alignment (price trending above/below short-term MAs)
  if (sma20 && sma50) {
    if (currentPrice > sma20 && currentPrice > sma50 && sma20 > sma50) {
      directionVotes.BULLISH += 1;
      reasons.push('Partial bullish MA: Price > SMA20 > SMA50');
    } else if (currentPrice < sma20 && currentPrice < sma50 && sma20 < sma50) {
      directionVotes.BEARISH += 1;
      reasons.push('Partial bearish MA: Price < SMA20 < SMA50');
    }
  }

  // Vote 3: RSI (widened bands: 52/48 instead of 55/45 to capture more directional signals)
  if (rsiResult) {
    if (rsiResult.value > 52) {
      directionVotes.BULLISH += 1;
      reasons.push(`RSI(14) = ${rsiResult.value} — bullish momentum`);
    } else if (rsiResult.value < 48) {
      directionVotes.BEARISH += 1;
      reasons.push(`RSI(14) = ${rsiResult.value} — bearish momentum`);
    }
  }

  // Vote 4: MACD (relaxed: vote on histogram direction alone, not requiring macd line same sign)
  if (macdResult) {
    if (macdResult.histogram > 0) {
      directionVotes.BULLISH += 1;
      reasons.push(`MACD bullish: histogram=${macdResult.histogram.toFixed(4)}`);
    } else if (macdResult.histogram < 0) {
      directionVotes.BEARISH += 1;
      reasons.push(`MACD bearish: histogram=${macdResult.histogram.toFixed(4)}`);
    }
  }

  // Vote 5: Bollinger Bands (widened: 0.65/0.35 instead of 0.8/0.2 — upper half = bullish bias)
  if (bbResult) {
    if (bbResult.percentB > 0.65) {
      directionVotes.BULLISH += 1;
      reasons.push(`Price in upper Bollinger zone (%B=${bbResult.percentB.toFixed(2)})`);
    } else if (bbResult.percentB < 0.35) {
      directionVotes.BEARISH += 1;
      reasons.push(`Price in lower Bollinger zone (%B=${bbResult.percentB.toFixed(2)})`);
    }
  }

  // Vote 6: Order Flow Imbalance (widened: 0.10 threshold instead of 0.15)
  if (ofiResult.ofi > 0.10) {
    directionVotes.BULLISH += 1;
    reasons.push(`Order Flow: Buy aggression detected (OFI=${ofiResult.ofi.toFixed(3)})`);
  } else if (ofiResult.ofi < -0.10) {
    directionVotes.BEARISH += 1;
    reasons.push(`Order Flow: Sell aggression detected (OFI=${ofiResult.ofi.toFixed(3)})`);
  }

  // Final Direction from votes — HARDENED: requires MIN_DIRECTIONAL_VOTES agreement
  let direction;
  const dominantCount = Math.max(directionVotes.BULLISH, directionVotes.BEARISH);
  if (directionVotes.BULLISH > directionVotes.BEARISH && directionVotes.BULLISH > directionVotes.NEUTRAL && directionVotes.BULLISH >= MIN_DIRECTIONAL_VOTES) {
    direction = 'BULLISH';
  } else if (directionVotes.BEARISH > directionVotes.BULLISH && directionVotes.BEARISH > directionVotes.NEUTRAL && directionVotes.BEARISH >= MIN_DIRECTIONAL_VOTES) {
    direction = 'BEARISH';
  } else {
    direction = 'NEUTRAL';
    if (dominantCount > 0 && dominantCount < MIN_DIRECTIONAL_VOTES) {
      reasons.push(`Directional votes (${dominantCount}) below minimum threshold (${MIN_DIRECTIONAL_VOTES}) — insufficient consensus`);
    }
  }

  // ─────────────────────────────────────────────────────
  // COMPOSITE SIGNAL SCORE (0 to 100)
  // ─────────────────────────────────────────────────────
  let scoreBreakdown = {};

  // 1. Regime Alignment Score (0-100)
  let regimeScore = 0;
  if (regimeResult.regime === 'TRENDING' && direction !== 'NEUTRAL') {
    regimeScore = regimeResult.heuristicScore; // Already 0-100
    if (pattern) {
      const patternAligned = (direction === 'BULLISH' && BULLISH_PATTERNS.includes(pattern))
        || (direction === 'BEARISH' && BEARISH_PATTERNS.includes(pattern));
      if (patternAligned) regimeScore = Math.min(100, regimeScore + 15);
    }
  } else if (regimeResult.regime === 'MEAN_REVERTING') {
    // Mean-reverting is only good for reversal patterns at extremes
    if (rsiResult && (rsiResult.value > 70 || rsiResult.value < 30)) {
      regimeScore = regimeResult.heuristicScore;
    } else {
      regimeScore = regimeResult.heuristicScore * 0.4; // Penalize if RSI not extreme
    }
  } else {
    // RANDOM_WALK — no systematic edge
    regimeScore = 0;
  }
  scoreBreakdown.regimeAlignment = Math.round(regimeScore);

  // 2. Technical Confluence Score (0-100)
  let techScore = 0;
  const totalVoters = directionVotes.BULLISH + directionVotes.BEARISH + directionVotes.NEUTRAL;
  const dominantVotes = Math.max(directionVotes.BULLISH, directionVotes.BEARISH);
  if (totalVoters > 0) {
    techScore = Math.round((dominantVotes / totalVoters) * 100);
  }
  scoreBreakdown.technicalConfluence = techScore;

  // 3. Order Flow Score (0-100)
  let ofiScore = 50; // Neutral baseline
  const absOfi = Math.abs(ofiResult.ofi);
  if (direction === 'BULLISH' && ofiResult.ofi > 0) {
    ofiScore = Math.min(100, 50 + absOfi * 150);
  } else if (direction === 'BEARISH' && ofiResult.ofi < 0) {
    ofiScore = Math.min(100, 50 + absOfi * 150);
  } else if ((direction === 'BULLISH' && ofiResult.ofi < -0.1) || (direction === 'BEARISH' && ofiResult.ofi > 0.1)) {
    ofiScore = Math.max(0, 50 - absOfi * 150); // Opposing flow = penalty
  }
  scoreBreakdown.orderFlow = Math.round(ofiScore * ofiSourcePenalty);
  scoreBreakdown.ofiSource = ofiSource;

  // 4. Volume Confirmation Score (0-100)
  let volumeScore = 50;
  if (volResult) {
    if (volResult.relativeVolume >= 2.0) volumeScore = 100;
    else if (volResult.relativeVolume >= 1.3) volumeScore = 75;
    else if (volResult.relativeVolume >= 0.8) volumeScore = 50;
    else volumeScore = 20; // Low volume = unreliable move

    // Volume divergence penalty
    if (direction === 'BULLISH' && volResult.divergence === 'BEARISH_DIVERGENCE') volumeScore *= 0.5;
    if (direction === 'BEARISH' && volResult.divergence === 'BULLISH_DIVERGENCE') volumeScore *= 0.5;
  }
  scoreBreakdown.volumeConfirmation = Math.round(volumeScore);

  // 5. Historical Win Rate (0-100)
  let histScore = 50; // Default if no data
  let setupId = null;
  let setupStats = null;
  if (pattern && pattern !== 'doji') {
    setupId = constructSetupId(pattern, regimeResult.regime, closes);
    try {
      const db = await getDb();
      setupStats = await db.collection('setup_stats').findOne({
        setup_id: setupId,
        logic_version: CURRENT_LOGIC_VERSION
      });
      if (setupStats && setupStats.sample_size >= 10) {
        histScore = Math.round(setupStats.win_rate * 100);
        reasons.push(`Historical win rate for ${setupId}: ${histScore}% (${setupStats.sample_size} samples)`);
      } else {
        reasons.push(`Setup ${setupId || 'unknown'}: Insufficient backtest data — using baseline`);
      }
    } catch (e) {
      // DB error — use baseline
    }
  }
  scoreBreakdown.historicalWinRate = histScore;

  // ─── WEIGHTED COMPOSITE SCORE ───
  const compositeScore = Math.round(
    scoreBreakdown.regimeAlignment * SCORE_WEIGHTS.REGIME_ALIGNMENT +
    scoreBreakdown.technicalConfluence * SCORE_WEIGHTS.TECHNICAL_CONFLUENCE +
    scoreBreakdown.orderFlow * SCORE_WEIGHTS.ORDER_FLOW +
    scoreBreakdown.volumeConfirmation * SCORE_WEIGHTS.VOLUME_CONFIRMATION +
    scoreBreakdown.historicalWinRate * SCORE_WEIGHTS.HISTORICAL_WIN_RATE
  );

  // ─────────────────────────────────────────────────────
  // HURST CI REGIME-SPAN CHECK — Reject when CI spans all 3 regimes
  // If the 95% CI crosses both 0.45 and 0.55, the Hurst read is useless
  // ─────────────────────────────────────────────────────
  let hurstCIReject = false;
  let hurstCIReason = null;
  if (hurstResult && hurstResult.ci95) {
    const ciLower = hurstResult.ci95.lower;
    const ciUpper = hurstResult.ci95.upper;
    // CI spans deep into opposite regime zones — truly ambiguous
    // Using 0.40/0.60 instead of 0.45/0.55 to avoid blocking ~78% of readings
    // This catches only deeply uncertain CIs (e.g., [0.30, 0.70]) not borderline ones
    if (ciLower < 0.40 && ciUpper > 0.60) {
      hurstCIReject = true;
      hurstCIReason = `Hurst 95% CI [${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}] spans all 3 regimes — no statistical edge detectable`;
      reasons.push(hurstCIReason);
    }
  }

  // ─────────────────────────────────────────────────────
  // SHIELD MODE: Reject weak signals and Counter-Trend setups
  // ─────────────────────────────────────────────────────
  let macroReject = false;
  let macroReason = null;
  if (macroTrend === 'BULLISH' && direction === 'BEARISH') {
    macroReject = true;
    macroReason = 'Counter-Trend Block: Micro signal is BEARISH but Macro 1D trend is BULLISH.';
    reasons.push(macroReason);
  } else if (macroTrend === 'BEARISH' && direction === 'BULLISH') {
    macroReject = true;
    macroReason = 'Counter-Trend Block: Micro signal is BULLISH but Macro 1D trend is BEARISH.';
    reasons.push(macroReason);
  }

  let mesoReject = false;
  if (mesoTrend === 'BULLISH' && direction === 'BEARISH') {
    mesoReject = true;
    macroReason = 'Counter-Trend Block: Micro signal is BEARISH but Meso 4H trend is BULLISH.';
    reasons.push(macroReason);
  } else if (mesoTrend === 'BEARISH' && direction === 'BULLISH') {
    mesoReject = true;
    macroReason = 'Counter-Trend Block: Micro signal is BULLISH but Meso 4H trend is BEARISH.';
    reasons.push(macroReason);
  }

  let vwapReject = false;
  let vwapReason = null;
  if (vwapResult) {
      if (direction === 'BULLISH' && currentPrice > vwapResult.upperBand) {
          vwapReject = true;
          vwapReason = `VWAP Overextension Block: Price ($${currentPrice}) is > 2 StdDev above VWAP ($${vwapResult.vwap}). High risk of immediate pullback.`;
          reasons.push(vwapReason);
      } else if (direction === 'BEARISH' && currentPrice < vwapResult.lowerBand) {
          vwapReject = true;
          vwapReason = `VWAP Overextension Block: Price ($${currentPrice}) is > 2 StdDev below VWAP ($${vwapResult.vwap}). High risk of immediate bounce.`;
          reasons.push(vwapReason);
      }
  }

  if (direction === 'NEUTRAL' || compositeScore < MIN_SIGNAL_SCORE || regimeResult.regime === 'RANDOM_WALK' || hurstCIReject || macroReject || mesoReject || vwapReject) {
    return {
      action: 'SHIELD_MODE',
      reason: direction === 'NEUTRAL'
        ? 'No clear directional consensus from technical analysis'
        : vwapReject
        ? vwapReason
        : hurstCIReject
        ? hurstCIReason
        : (macroReject || mesoReject)
        ? macroReason
        : regimeResult.regime === 'RANDOM_WALK'
        ? 'Market is in Random Walk — no systematic edge exists'
        : `Composite score ${compositeScore}/100 below minimum threshold (${MIN_SIGNAL_SCORE})`,
      ticker,
      direction,
      score: compositeScore,
      scoreBreakdown,
      regime: regimeResult,
      hurst: hurstResult,
      ofi: ofiResult,
      pattern: pattern || null,
      reasons,
      currentPrice,
      kelly: { action: 'SHIELD_MODE', halfKelly: 0, kellyF: 0, reason: 'Shield Mode — no trade' },
    };
  }

  // ─────────────────────────────────────────────────────
  // STOP LOSS / TAKE PROFIT (Deterministic, ATR-based)
  // Use voting-timeframe candles for SL/TP (1h ATR matches 4h prediction window)
  // ─────────────────────────────────────────────────────
  const tradeSide = direction === 'BULLISH' ? 'LONG' : 'SHORT';
  const slTpResult = computeStopLossTakeProfit(votingCandles, tradeSide, currentPrice, 1.5, 2.0);

  if (!slTpResult) {
    return {
      action: 'SHIELD_MODE',
      reason: 'Could not calculate ATR-based Stop Loss / Take Profit — insufficient volatility data',
      ticker, direction, score: compositeScore, scoreBreakdown,
      regime: regimeResult, hurst: hurstResult, ofi: ofiResult,
      pattern, reasons, currentPrice,
      kelly: { action: 'SHIELD_MODE', halfKelly: 0, kellyF: 0, reason: 'Shield Mode — ATR unavailable' },
    };
  }

  // ─────────────────────────────────────────────────────
  // KELLY SIZING (from backtest stats or heuristic)
  // ─────────────────────────────────────────────────────
  let kellyResult;
  if (setupStats && setupStats.confidence_flag !== 'INSUFFICIENT_DATA' && setupStats.sample_size >= 30) {
    kellyResult = computeKelly({
      mean_return: setupStats.mean_return || 0.02,
      variance: setupStats.variance || 0.005,
      regime: regimeResult.regime
    });
    kellyResult.reason = `Setup ${setupId}: Statistical Kelly from ${setupStats.sample_size} backtested samples`;
  } else {
    // Heuristic Kelly — use a conservative 2% edge estimate
    kellyResult = computeKelly({
      mean_return: 0.02,
      variance: 0.005,
      regime: regimeResult.regime
    });
    kellyResult.reason = 'Heuristic Kelly sizing (insufficient backtest data for this setup)';
  }

  // If Kelly says no edge, override to SHIELD
  if (kellyResult.action === 'SHIELD_MODE') {
    return {
      action: 'SHIELD_MODE',
      reason: `Kelly Criterion rejected: ${kellyResult.reason}`,
      ticker, direction, score: compositeScore, scoreBreakdown,
      regime: regimeResult, hurst: hurstResult, ofi: ofiResult,
      pattern, reasons, currentPrice,
    };
  }

  // ─────────────────────────────────────────────────────
  // FINAL SIGNAL OUTPUT
  // ─────────────────────────────────────────────────────
  return {
    action: 'TRADE',
    ticker,
    direction,
    tradeSide,
    score: compositeScore,
    scoreBreakdown,

    // Price Levels (all calculated by engine, NOT by AI)
    currentPrice,
    stopLoss: slTpResult.stopLoss,
    takeProfit: slTpResult.takeProfit,
    takeProfit1: slTpResult.takeProfit1,
    takeProfit2: slTpResult.takeProfit2,
    atr: slTpResult.atr,
    riskDistance: slTpResult.slDistance,
    rewardDistance: slTpResult.tpDistance,

    // Kelly Sizing
    kelly: kellyResult,

    // Regime Data
    regime: regimeResult,
    hurst: hurstResult,

    // Technical Data
    rsi: rsiResult,
    macd: macdResult,
    bollingerBands: bbResult,
    volumeAnalysis: volResult,

    // Order Flow (REAL, not fake)
    ofi: ofiResult,
    buyerPercent: Math.round(((ofiResult.ofi + 1) / 2) * 100), // Normalize OFI [-1,1] to [0%,100%]

    // Pattern & Setup
    pattern: pattern || null,
    setupId,
    setupStats: setupStats ? {
      winRate: setupStats.win_rate,
      sampleSize: setupStats.sample_size,
      confidenceFlag: setupStats.confidence_flag
    } : null,

    // Moving Averages
    smaAlignment: sma20 && sma50 && sma200
      ? (sma20 > sma50 && sma50 > sma200 ? 'BULLISH' : sma20 < sma50 && sma50 < sma200 ? 'BEARISH' : 'NEUTRAL')
      : 'UNKNOWN',

    // Human-readable reasons (for Gemini to translate)
    reasons,

    // Timestamp
    generatedAt: new Date().toISOString(),
  };
}
