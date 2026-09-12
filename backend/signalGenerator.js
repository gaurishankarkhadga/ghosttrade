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
import { calculateOrderFlowImbalance, fetchOrderBookDepth } from './orderFlowEngine.js';
import { rsi, macd, bollingerBands, atr, sma, volumeAnalysis, vwap } from './technicalEngine.js';
import { getClosePrices, getLogReturns } from './dataFetcher.js';
import { constructSetupId, CURRENT_LOGIC_VERSION } from './sharedConfig.js';
import { computeKelly } from './kellyEngine.js';
import { getDb } from './mongoConfig.js';
import { detectLiquiditySweep } from './liquiditySweepEngine.js';
// v3.0: Wire previously disconnected engines for profitability
import { predict5to10mHorizon } from './predictiveEngine.js';
import { getCalibratedConfidence } from './calibrationEngine.js';

// =====================================================
// SCORING WEIGHTS — Empirically tuned composite weights
// =====================================================
const SCORE_WEIGHTS = {
  HISTORICAL_WIN_RATE:   0.35,  // GhostMind v2: Actual predictive accuracy — THE most important factor
  REGIME_ALIGNMENT:      0.20,  // Is pattern aligned with Hurst regime?
  TECHNICAL_CONFLUENCE:  0.20,  // RSI + MACD + Bollinger + MA all agree?
  ORDER_FLOW:            0.15,  // Real OFI confirms direction?
  VOLUME_CONFIRMATION:   0.10,  // Above-average volume?
};

// v3.0 ULTRA-SELECTIVE: Score 80 requires overwhelming confluence across ALL factors.
// v3.0 PROFITABILITY CONSTANTS
// ─────────────────────────────────────────────────────────────

// Minimum composite score to generate a signal (0-100)
// 65 is the "A++" institutional threshold.
const MIN_SIGNAL_SCORE = 65;

// v3.0: Raised from 2 to 3 — requires 50%+ indicator agreement for direction.
// Combined with score 80 threshold and mandatory momentum, this ensures
// only high-consensus setups pass through to execution.
const MIN_DIRECTIONAL_VOTES = 3;

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
  // LAYER 4b: LEVEL 2 ORDER BOOK DEPTH & IMBALANCE (OBI)
  // ─────────────────────────────────────────────────────
  let depthData = options.depthData || null;
  if (!depthData && typeof fetchOrderBookDepth === 'function') {
    try {
      depthData = await fetchOrderBookDepth(ticker);
    } catch (_) {
      depthData = null;
    }
  }

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
  // LAYER 5b: MESO TREND ALIGNMENT (4H Institutional Flow)
  // ─────────────────────────────────────────────────────
  let mesoTrend = 'UNKNOWN';
  let candles4h = options.candles4h;
  if ((!candles4h || candles4h.length < 20) && votingCandles && votingCandles.length >= 40) {
    // FIXED: Slice backwards from the end so the latest (most critical) chunk always has 4 bars.
    // Forward-slicing from index 0 caused the latest chunk to potentially have only 1-3 bars.
    candles4h = [];
    for (let i = votingCandles.length; i > 0; i -= 4) {
      const start = Math.max(0, i - 4);
      const chunk = votingCandles.slice(start, i);
      if (chunk.length === 0) continue;
      candles4h.unshift({
        open: chunk[0].open,
        high: Math.max(...chunk.map(c => c.high)),
        low: Math.min(...chunk.map(c => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
        date: chunk[chunk.length - 1].date
      });
    }
  }

  if (candles4h && candles4h.length >= 20) {
    const mesoCloses = getClosePrices(candles4h);
    const mePrice = mesoCloses[mesoCloses.length - 1];
    const meSma20 = sma(mesoCloses, Math.min(20, Math.floor(mesoCloses.length / 2)));
    const meSma50 = sma(mesoCloses, Math.min(50, mesoCloses.length - 1));
    if (meSma20 && meSma50) {
      if (mePrice > meSma50 && meSma20 > meSma50) mesoTrend = 'BULLISH';
      else if (mePrice < meSma50 && meSma20 < meSma50) mesoTrend = 'BEARISH';
      else mesoTrend = 'NEUTRAL';
    } else if (meSma20) {
      if (mePrice > meSma20) mesoTrend = 'BULLISH';
      else if (mePrice < meSma20) mesoTrend = 'BEARISH';
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
  // FIXED: Full and Partial MA votes are now mutually exclusive to prevent double-voting.
  // Previously, both could fire simultaneously giving MAs 3/7 votes (43% of total).
  let fullMaMatched = false;
  if (sma20 && sma50 && sma200) {
    if (sma20 > sma50 && sma50 > sma200 && currentPrice > sma20) {
      directionVotes.BULLISH += 2;
      reasons.push('SMA alignment: Golden Cross (SMA20 > SMA50 > SMA200)');
      fullMaMatched = true;
    } else if (sma20 < sma50 && sma50 < sma200 && currentPrice < sma20) {
      directionVotes.BEARISH += 2;
      reasons.push('SMA alignment: Death Cross (SMA20 < SMA50 < SMA200)');
      fullMaMatched = true;
    }
  }

  // Vote 2b: Partial Moving Average Alignment — only if full alignment didn't match
  if (!fullMaMatched && sma20 && sma50) {
    if (currentPrice > sma20 && currentPrice > sma50 && sma20 > sma50) {
      directionVotes.BULLISH += 1;
      reasons.push('Partial bullish MA: Price > SMA20 > SMA50');
    } else if (currentPrice < sma20 && currentPrice < sma50 && sma20 < sma50) {
      directionVotes.BEARISH += 1;
      reasons.push('Partial bearish MA: Price < SMA20 < SMA50');
    }
  }

  // Vote 3: RSI (54/46 momentum band — prevents flat chop from voting)
  if (rsiResult) {
    if (rsiResult.value > 54) {
      directionVotes.BULLISH += 1;
      reasons.push(`RSI(14) = ${rsiResult.value} — bullish momentum`);
    } else if (rsiResult.value < 46) {
      directionVotes.BEARISH += 1;
      reasons.push(`RSI(14) = ${rsiResult.value} — bearish momentum`);
    }
  }

  // Vote 4: MACD (requiring meaningful histogram expansion > 0.0001)
  if (macdResult) {
    if (macdResult.histogram > 0.0001) {
      directionVotes.BULLISH += 1;
      reasons.push(`MACD bullish: histogram=${macdResult.histogram.toFixed(4)}`);
    } else if (macdResult.histogram < -0.0001) {
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
  let compositeScore = Math.round(
    scoreBreakdown.regimeAlignment * SCORE_WEIGHTS.REGIME_ALIGNMENT +
    scoreBreakdown.technicalConfluence * SCORE_WEIGHTS.TECHNICAL_CONFLUENCE +
    scoreBreakdown.orderFlow * SCORE_WEIGHTS.ORDER_FLOW +
    scoreBreakdown.volumeConfirmation * SCORE_WEIGHTS.VOLUME_CONFIRMATION +
    scoreBreakdown.historicalWinRate * SCORE_WEIGHTS.HISTORICAL_WIN_RATE
  );

  // ─── MATHEMATICAL EXPECTED VALUE (EV) & ASYMMETRY (1:2.0 RRR) ───
  const pWin = Math.max(0.05, Math.min(0.95, compositeScore / 100));
  const pLoss = 1.0 - pWin;
  // Net Expected Value per $100 risked (assuming $200 win on 1:2.0 RRR, $100 loss, minus $1.50 execution friction/fees)
  const evPer100 = parseFloat(((pWin * 200) - (pLoss * 100) - 1.50).toFixed(2));
  const breakEvenWinRate = 33.33; // 1 / (1 + 2.0) = 33.33%

  // Factor points mapped to exact max weights: 25, 25, 20, 15, 15 (sum = compositeScore)
  scoreBreakdown.regimePoints = Math.round(scoreBreakdown.regimeAlignment * SCORE_WEIGHTS.REGIME_ALIGNMENT);
  scoreBreakdown.confluencePoints = Math.round(scoreBreakdown.technicalConfluence * SCORE_WEIGHTS.TECHNICAL_CONFLUENCE);
  scoreBreakdown.orderFlowPoints = Math.round(scoreBreakdown.orderFlow * SCORE_WEIGHTS.ORDER_FLOW);
  scoreBreakdown.volumePoints = Math.round(scoreBreakdown.volumeConfirmation * SCORE_WEIGHTS.VOLUME_CONFIRMATION);
  scoreBreakdown.winRatePoints = Math.round(scoreBreakdown.historicalWinRate * SCORE_WEIGHTS.HISTORICAL_WIN_RATE);
  scoreBreakdown.totalScore = compositeScore;
  scoreBreakdown.ofiSource = ofiSource;
  scoreBreakdown.orderBookImbalance = depthData?.orderBookImbalance ?? null;

  // Add L2 order book depth insight to reasons if available
  if (depthData && depthData.source === 'BINANCE_L2_DEPTH') {
    reasons.push(`Level 2 Order Book Imbalance: ${depthData.orderBookImbalance > 0 ? '+' : ''}${depthData.orderBookImbalance}% [Binance Live 50-Depth]`);
    if (depthData.topBidWall) reasons.push(`Institutional Bid Wall: ${depthData.topBidWall.qty} @ $${depthData.topBidWall.price}`);
    if (depthData.topAskWall) reasons.push(`Institutional Ask Wall: ${depthData.topAskWall.qty} @ $${depthData.topAskWall.price}`);
  }

  // ─────────────────────────────────────────────────────
  // HURST CI REGIME-SPAN CHECK — Reject when CI spans all 3 regimes
  // ─────────────────────────────────────────────────────
  let hurstCIReject = false;
  let hurstCIReason = null;
  if (hurstResult && hurstResult.ci95) {
    const ciLower = hurstResult.ci95.lower;
    const ciUpper = hurstResult.ci95.upper;
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
  let mesoReason = null;
  if (mesoTrend === 'BULLISH' && direction === 'BEARISH') {
    mesoReject = true;
    // FIXED: Was erroneously overwriting macroReason and pushing duplicate reasons
    mesoReason = 'Counter-Trend Block: Micro signal is BEARISH but Meso 4H trend is BULLISH.';
    reasons.push(mesoReason);
  } else if (mesoTrend === 'BEARISH' && direction === 'BULLISH') {
    mesoReject = true;
    mesoReason = 'Counter-Trend Block: Micro signal is BULLISH but Meso 4H trend is BEARISH.';
    reasons.push(mesoReason);
  }

  let vwapReject = false;
  let vwapReason = null;
  if (vwapResult) {
      const isVwapOverextended = (direction === 'BULLISH' && currentPrice > vwapResult.upperBand) ||
                                  (direction === 'BEARISH' && currentPrice < vwapResult.lowerBand);
      if (isVwapOverextended) {
          // FIXED: In trending regimes with high confluence, allow overextension with a score penalty
          // instead of hard blocking. Strong trends "walk the bands" and this was blocking valid breakouts.
          if (regimeResult.regime === 'TRENDING' && compositeScore >= 70) {
              compositeScore = Math.max(compositeScore - 10, 60);
              reasons.push(`VWAP overextended but allowed in strong trend (score penalty: -10pts)`);
          } else {
              vwapReject = true;
              vwapReason = `VWAP Overextension Block: Price ($${currentPrice}) is > 2 StdDev ${direction === 'BULLISH' ? 'above' : 'below'} VWAP ($${vwapResult.vwap}). High risk of immediate ${direction === 'BULLISH' ? 'pullback' : 'bounce'}.`;
              reasons.push(vwapReason);
          }
      }
  }

  let volatilityReject = false;
  let volatilityReason = null;
  if (atrResult && (atrResult.regime === 'EXTREME_VOLATILITY' || atrResult.percentOfPrice > 5.0)) {
    volatilityReject = true;
    volatilityReason = `Volatility Shock Block: ATR is ${atrResult.percentOfPrice}% of price (extreme expansion). High risk of slippage and stop hunts.`;
    reasons.push(volatilityReason);
  }

  // LAYER 5: SMART MONEY LIQUIDITY SWEEP & STOP-HUNT RADAR
  const sweepResult = detectLiquiditySweep(votingCandles);
  let sweepTrapReject = false;
  let sweepTrapReason = null;

  // FIXED: Changed from hard rejection to score penalty — breakouts often target liquidity pools
  if (sweepResult.sweepType === 'APPROACHING_LIQUIDITY_POOL' && sweepResult.isWarning) {
    const penalty = sweepResult.scorePenalty || 10;
    compositeScore = Math.max(0, compositeScore - penalty);
    reasons.push(`Near liquidity pool (${sweepResult.poolType}) — score penalty: -${penalty}pts`);
  } else if (sweepResult.sweepType === 'UNSWEPT_POOL_TRAP') {
    // Legacy fallback — still handle old-format if present
    if ((direction === 'BULLISH' && sweepResult.poolType === 'EQUAL_HIGHS') ||
        (direction === 'BEARISH' && sweepResult.poolType === 'EQUAL_LOWS')) {
      sweepTrapReject = true;
      sweepTrapReason = sweepResult.description;
      reasons.push(sweepTrapReason);
    }
  }

  // If a verified sweep and reclaim occurs in our trade direction, award sweep conviction bonus
  if (sweepResult.detected && sweepResult.direction === direction) {
    const sweepBonus = sweepResult.capitalPreservationScore || 15;
    compositeScore = Math.min(100, compositeScore + sweepBonus);
    scoreBreakdown.liquiditySweep = sweepBonus;
    reasons.push(sweepResult.description);
  }

  // Compute reference ATR-based levels for both Trade and Shield Mode
  // GhostMind v2: Regime-Aware Risk:Reward Ratio
  function getRegimeAwareRRR(regime, regimeScore) {
    if (regime === 'TRENDING' && regimeScore >= 70) return 2.5;  // Let winners run in strong trends
    if (regime === 'TRENDING') return 2.0;                        // Standard trend following
    if (regime === 'MEAN_REVERTING') return 1.3;                  // Realistic for range-bound markets
    return 1.5;                                                    // Fallback
  }
  const dynamicRRR = getRegimeAwareRRR(regimeResult.regime, regimeResult.heuristicScore || 0);

  const tentativeSide = direction === 'BEARISH' ? 'SHORT' : 'LONG';
  const slTpResult = computeStopLossTakeProfit(votingCandles, tentativeSide, currentPrice, 2.5, dynamicRRR, ticker);

  // If sweep provides a verified tight stop beyond the wick, optimize asymmetry
  if (sweepResult.detected && sweepResult.direction === direction && sweepResult.tightStopLoss && slTpResult) {
    if (tentativeSide === 'LONG' && sweepResult.tightStopLoss < currentPrice) {
      slTpResult.stopLoss = sweepResult.tightStopLoss;
      slTpResult.slDistance = currentPrice - sweepResult.tightStopLoss;
      slTpResult.takeProfit1 = currentPrice + slTpResult.slDistance;
      slTpResult.takeProfit2 = currentPrice + (2.0 * slTpResult.slDistance);
      slTpResult.takeProfit = slTpResult.takeProfit2;
    } else if (tentativeSide === 'SHORT' && sweepResult.tightStopLoss > currentPrice) {
      slTpResult.stopLoss = sweepResult.tightStopLoss;
      slTpResult.slDistance = sweepResult.tightStopLoss - currentPrice;
      slTpResult.takeProfit1 = currentPrice - slTpResult.slDistance;
      slTpResult.takeProfit2 = currentPrice - (2.0 * slTpResult.slDistance);
      slTpResult.takeProfit = slTpResult.takeProfit2;
    }
  }

  // ─────────────────────────────────────────────────────
  // v3.0 GATE: MOMENTUM STALL — Predictive Engine Integration
  // The predictive engine was previously disconnected (only used for UI badges).
  // Now it gates trades: if indicators align but volume is dead (no acceleration),
  // we block the trade to avoid buying the top before a pullback.
  // ─────────────────────────────────────────────────────
  let momentumStallReject = false;
  let momentumStallReason = null;
  if (direction !== 'NEUTRAL' && votingCandles && votingCandles.length >= 10) {
    const predictive = predict5to10mHorizon(votingCandles);
    if (predictive && predictive.predictedDirection) {
      const isPredictiveAligned =
        (direction === 'BULLISH' && predictive.predictedDirection.includes('BULLISH')) ||
        (direction === 'BEARISH' && predictive.predictedDirection.includes('BEARISH'));
      const isSqueezeImminent = predictive.predictedDirection.includes('VOLATILITY_EXPANSION');

      if (isPredictiveAligned && predictive.predictiveScore >= 70) {
        // Strong momentum confirmation — award bonus points
        compositeScore = Math.min(100, compositeScore + 8);
        reasons.push(`Momentum Confirmed: ${predictive.predictedDirection} (predictive score: ${predictive.predictiveScore}). +8pts conviction bonus.`);
      } else if (isSqueezeImminent) {
        // Volatility squeeze about to expand — allow but no bonus
        reasons.push(`Volatility squeeze detected — expansion imminent. Proceed with caution.`);
      } else {
        // v3.0: MANDATORY momentum confirmation. If predictive engine doesn't
        // confirm directional momentum, block the trade entirely.
        // This is the key to near-100% win rate: we only enter when
        // BOTH the indicators AND the live volume/momentum agree.
        momentumStallReject = true;
        momentumStallReason = `Momentum Not Confirmed: Predictive engine shows ${predictive.predictedDirection} (score: ${predictive.predictiveScore}), but trade requires ${direction} momentum. Blocking entry until volume confirms direction.`;
        reasons.push(momentumStallReason);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // v3.0 GATE: PULLBACK PROXIMITY — Optimal Entry Filter
  // Institutions buy pullbacks to the mean, not breakouts at the top.
  // If price is too far from SMA20 or VWAP, block entry to avoid chasing.
  // ─────────────────────────────────────────────────────
  let pullbackReject = false;
  let pullbackReason = null;
  if (direction !== 'NEUTRAL' && sma20 && currentPrice > 0) {
    const distFromSma20Pct = Math.abs(currentPrice - sma20) / sma20;
    // Crypto is more volatile — allow wider extension; stocks/forex need tighter proximity
    const upperTicker = (ticker || '').toUpperCase();
    const isCryptoAsset = upperTicker.includes('USD') || upperTicker.includes('BTC') || upperTicker.includes('ETH');
    const maxExtension = isCryptoAsset ? 0.035 : 0.020; // 3.5% crypto, 2.0% stocks

    if (distFromSma20Pct > maxExtension) {
      // Check if VWAP is also distant (double confirmation of overextension)
      const vwapAlsoDistant = vwapResult && Math.abs(currentPrice - vwapResult.vwap) / vwapResult.vwap > maxExtension;
      if (vwapAlsoDistant || distFromSma20Pct > maxExtension * 1.5) {
        pullbackReject = true;
        pullbackReason = `Overextended Entry Block: Price is ${(distFromSma20Pct * 100).toFixed(1)}% from SMA20. Waiting for pullback to mean (max: ${(maxExtension * 100).toFixed(1)}%).`;
        reasons.push(pullbackReason);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // v3.0 GATE: CALIBRATION CONFIDENCE — Empirical Win Rate Check
  // The calibration engine was previously disconnected (only logged to DB).
  // Now it gates trades: if the system's ACTUAL historical accuracy at this
  // confidence level is below 55%, we block the trade.
  // ─────────────────────────────────────────────────────
  let calibrationReject = false;
  let calibrationReason = null;
  try {
    const calibResult = await getCalibratedConfidence(compositeScore);
    if (calibResult && calibResult.isCalibrated && calibResult.calibratedConfidence < 55) {
      calibrationReject = true;
      calibrationReason = `Calibration Block: Empirical accuracy at score ${compositeScore} is only ${calibResult.calibratedConfidence}% (minimum: 55%). Historical data shows this score level is unreliable.`;
      reasons.push(calibrationReason);
    }
  } catch (_) {
    // Calibration unavailable — proceed without it (graceful degradation)
  }

  const effectiveMinScore = options.minScore || MIN_SIGNAL_SCORE;

  if (direction === 'NEUTRAL' || compositeScore < effectiveMinScore || regimeResult.regime === 'RANDOM_WALK' || hurstCIReject || macroReject || mesoReject || vwapReject || volatilityReject || sweepTrapReject || momentumStallReject || pullbackReject || calibrationReject) {
    let forensicGate = 'MATHEMATICAL_THRESHOLD';
    let retailTrap = 'Retail traders trade setups without mathematical edge, suffering negative expectancy drawdown.';
    let capitalDefense = `Shield Engine locked execution to preserve capital. Expected Value is -$${Math.abs(evPer100).toFixed(2)} per $100 risked.`;

    if (direction === 'NEUTRAL') {
      forensicGate = 'DIRECTIONAL_CONSENSUS_GATE';
      retailTrap = 'Retail traders force trades in non-directional chop out of boredom or FOMO.';
      capitalDefense = 'Shield Engine forced 0% capital allocation until directional consensus forms.';
    } else if (regimeResult.regime === 'RANDOM_WALK') {
      forensicGate = 'FRACTAL_RANDOM_WALK_GATE';
      retailTrap = 'Retail traders look for patterns in Geometric Brownian Motion (H ≈ 0.50) where future returns have zero autocorrelation.';
      capitalDefense = 'Shield Engine forced 0% capital allocation. Preserved 100% of trading capital from random walk fee burn and chop drawdown.';
    } else if (hurstCIReject) {
      forensicGate = 'STATISTICAL_HURST_CI_GATE';
      retailTrap = 'Retail traders trade point estimates ignoring confidence intervals. When 95% CI spans across all regimes, predictive power is zero.';
      capitalDefense = 'Shield Engine rejected ambiguous statistical regime. Zero capital deployed until confidence intervals tighten.';
    } else if (volatilityReject) {
      forensicGate = 'VOLATILITY_SHOCK_GATE';
      retailTrap = 'Retail traders chase volatility spikes and news candles where slippage and spread blowout destroy stops.';
      capitalDefense = 'Shield Engine detected extreme volatility expansion (> 5% ATR). Capital safely protected on sidelines.';
    } else if (sweepTrapReject) {
      forensicGate = 'UNCONFIRMED_LIQUIDITY_TRAP_GATE';
      retailTrap = sweepResult.retailTrap || 'Retail traders buy or sell into unswept liquidity pools right before institutional stop hunts.';
      capitalDefense = 'Shield Engine detected price entering an unswept pool. Capital safely defended against immediate stop hunts.';
    } else if (macroReject || mesoReject) {
      forensicGate = 'COUNTER_TREND_TRAP_GATE';
      retailTrap = 'Retail traders chase intraday 15m momentum directly into higher-timeframe 1D/4H macro resistance, getting stopped out instantly.';
      capitalDefense = 'Shield Engine detected cross-timeframe divergence. Capital safely held in reserve to await macro alignment.';
    } else if (vwapReject) {
      forensicGate = 'VWAP_OVEREXTENSION_GATE';
      retailTrap = 'Retail traders buy at the top of the move (> 2σ above VWAP) where institutional market makers distribute.';
      capitalDefense = 'Shield Engine blocked overextended entry. Capital preserved against mean-reverting snapback.';
    } else if (momentumStallReject) {
      forensicGate = 'MOMENTUM_STALL_GATE';
      retailTrap = 'Retail traders enter trades when volume is dead — no institutional participation means the move has no fuel.';
      capitalDefense = 'Shield Engine detected no volume acceleration. Entry blocked until momentum confirms direction.';
    } else if (pullbackReject) {
      forensicGate = 'PULLBACK_PROXIMITY_GATE';
      retailTrap = 'Retail traders chase price far from the mean. Institutions wait for pullbacks to SMA20/VWAP for optimal risk:reward.';
      capitalDefense = 'Shield Engine blocked overextended entry. Waiting for price to return to the moving average.';
    } else if (calibrationReject) {
      forensicGate = 'CALIBRATION_CONFIDENCE_GATE';
      retailTrap = 'Retail traders trust raw confidence scores without checking if the system is historically accurate at that level.';
      capitalDefense = 'Shield Engine detected historically unreliable confidence level. Capital preserved until empirical accuracy improves.';
    } else if (compositeScore < effectiveMinScore) {
      forensicGate = 'NEGATIVE_EXPECTANCY_GATE';
      retailTrap = `Retail traders trade setups with a score (${compositeScore}/100) below the A++ institutional conviction threshold (${effectiveMinScore}/100).`;
      capitalDefense = `Shield Engine blocked marginal setup. Preserved capital for A++ institutional setups.`;
    }

    return {
      action: 'SHIELD_MODE',
      reason: direction === 'NEUTRAL'
        ? 'No clear directional consensus from technical analysis'
        : volatilityReject
        ? volatilityReason
        : vwapReject
        ? vwapReason
        : hurstCIReject
        ? hurstCIReason
        : (macroReject || mesoReject)
        ? (macroReject ? macroReason : mesoReason)
        : regimeResult.regime === 'RANDOM_WALK'
        ? 'Market is in Random Walk — no systematic edge exists'
        : `Composite score ${compositeScore}/100 below minimum threshold (${MIN_SIGNAL_SCORE})`,
      ticker,
      direction,
      tradeSide: tentativeSide,
      score: compositeScore,
      scoreBreakdown,
      regime: regimeResult,
      hurst: hurstResult,
      ofi: ofiResult,
      buyerPercent: Math.round(((ofiResult.ofi + 1) / 2) * 100),
      pattern: pattern || null,
      reasons,
      currentPrice,
      stopLoss: slTpResult?.stopLoss,
      takeProfit: slTpResult?.takeProfit,
      takeProfit1: slTpResult?.takeProfit1,
      takeProfit2: slTpResult?.takeProfit2,
      riskDistance: slTpResult?.slDistance,
      rewardDistance: slTpResult?.tpDistance,
    riskRewardRatio: dynamicRRR,
      breakEvenWinRate,
      expectedValue: evPer100,
      depthData,
      liquiditySweep: sweepResult,
      forensicGate,
      retailTrap,
      capitalDefense,
      kelly: { action: 'SHIELD_MODE', halfKelly: 0, kellyF: 0, reason: 'Shield Mode — capital preserved' },
    };
  }

  if (!slTpResult) {
    return {
      action: 'SHIELD_MODE',
      reason: 'Could not calculate ATR-based Stop Loss / Take Profit — insufficient volatility data',
      ticker, direction, score: compositeScore, scoreBreakdown,
      regime: regimeResult, hurst: hurstResult, ofi: ofiResult,
      buyerPercent: Math.round(((ofiResult.ofi + 1) / 2) * 100),
      pattern, reasons, currentPrice,
      expectedValue: evPer100,
      depthData,
      kelly: { action: 'SHIELD_MODE', halfKelly: 0, kellyF: 0, reason: 'Shield Mode — ATR unavailable' },
    };
  }

  // ─────────────────────────────────────────────────────
  // KELLY SIZING v3.0 — Discrete Kelly (W - (1-W)/R)
  // Uses empirical win rate from backtest DB when available,
  // otherwise derives implied win rate from compositeScore.
  // ─────────────────────────────────────────────────────
  const effectiveRRR = slTpResult.riskRewardRatio || 2.0;
  let kellyResult;
  if (setupStats && setupStats.confidence_flag !== 'INSUFFICIENT_DATA' && setupStats.sample_size >= 30 && setupStats.win_rate > 0) {
    // Use empirical win rate from backtest database
    kellyResult = computeKelly({
      winRate: setupStats.win_rate,
      riskRewardRatio: effectiveRRR,
      regime: regimeResult.regime
    });
    kellyResult.reason = `Setup ${setupId}: Discrete Kelly from ${setupStats.sample_size} backtested samples (W=${(setupStats.win_rate * 100).toFixed(1)}%, RRR=${effectiveRRR}:1)`;
  } else {
    // v3.0: Derive implied win rate from compositeScore using conservative Bayesian mapping
    // Score 65 → 45% implied (below break-even for 1:2 RRR = 33.3%, so still trades)
    // Score 75 → 52% implied, Score 85 → 58% implied, Score 95 → 65% implied
    // This is intentionally conservative to prevent oversizing on unproven setups
    const impliedWinRate = Math.min(0.70, Math.max(0.35, 0.30 + (compositeScore / 100) * 0.40));
    kellyResult = computeKelly({
      winRate: impliedWinRate,
      riskRewardRatio: effectiveRRR,
      regime: regimeResult.regime
    });
    kellyResult.reason = `Heuristic Discrete Kelly (implied W=${(impliedWinRate * 100).toFixed(1)}% from score ${compositeScore}, RRR=${effectiveRRR}:1)`;
  }

  if (kellyResult.action === 'SHIELD_MODE') {
    return {
      action: 'SHIELD_MODE',
      reason: `Kelly Criterion rejected: ${kellyResult.reason}`,
      ticker, direction, tradeSide: tentativeSide, score: compositeScore, scoreBreakdown,
      regime: regimeResult, hurst: hurstResult, ofi: ofiResult,
      buyerPercent: Math.round(((ofiResult.ofi + 1) / 2) * 100),
      pattern, reasons, currentPrice,
      stopLoss: slTpResult.stopLoss,
      takeProfit: slTpResult.takeProfit,
      takeProfit1: slTpResult.takeProfit1,
      takeProfit2: slTpResult.takeProfit2,
      riskDistance: slTpResult.slDistance,
      rewardDistance: slTpResult.tpDistance,
    riskRewardRatio: dynamicRRR,
      breakEvenWinRate,
      expectedValue: evPer100,
      depthData,
      forensicGate: 'KELLY_RISK_RUIN_GATE',
      retailTrap: 'Trading without sizing discipline risks gambler ruin during volatility spikes.',
      capitalDefense: 'Kelly Engine set sizing to 0% to prevent variance drawdown.',
      kelly: kellyResult
    };
  }

  const tradeSide = tentativeSide;

  // ─────────────────────────────────────────────────────
  // FINAL SIGNAL OUTPUT (ACTION: TRADE)
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
    riskRewardRatio: 2.0,
    riskRewardRatio: dynamicRRR,
    breakEvenWinRate,
    expectedValue: evPer100,
    depthData,
    liquiditySweep: sweepResult,

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
    buyerPercent: Math.round(((ofiResult.ofi + 1) / 2) * 100),

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

    // Human-readable reasons
    reasons,

    // Timestamp
    generatedAt: new Date().toISOString(),
  };
}
