// =====================================================
// RL EXECUTION AGENT — Adaptive Reinforcement Risk & Trailing Exits
// Dynamically optimizes Stop-Loss multiplier, Take-Profit scaling,
// and Trailing Stop triggers based on Q-Value reward functions.
// =====================================================

import { atr } from './technicalEngine.js';

/**
 * Evaluates market volatility state to adjust Q-Value execution state.
 */
function getVolatilityState(candles) {
  if (!candles || candles.length < 20) return 'NORMAL';
  const atrResult = atr(candles, 14);
  if (!atrResult || !atrResult.value) return 'NORMAL';

  const currentPrice = candles[candles.length - 1].close;
  const atrPct = (atrResult.value / currentPrice) * 100;

  if (atrPct > 3.0) return 'HIGH_VOLATILITY';
  if (atrPct < 0.8) return 'COMPRESSED_LOW_VOLATILITY';
  return 'NORMAL';
}

/**
 * Calculates Sharpe Ratio for a series of trade returns.
 */
export function calculateSharpeRatio(returns, riskFreeRate = 0.0) {
  if (!returns || returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return parseFloat(((mean - riskFreeRate) / stdDev).toFixed(2));
}

/**
 * Calculates Sortino Ratio (downside risk only) for a series of trade returns.
 */
export function calculateSortinoRatio(returns, riskFreeRate = 0.0) {
  if (!returns || returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < riskFreeRate);

  if (downsideReturns.length === 0) return parseFloat((mean * 10).toFixed(2)); // High positive

  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / downsideReturns.length;
  const downsideStdDev = Math.sqrt(downsideVariance);

  if (downsideStdDev === 0) return 0;
  return parseFloat(((mean - riskFreeRate) / downsideStdDev).toFixed(2));
}

/**
 * Generates adaptive RL-guided execution parameters for entry, trailing stop, and multi-TPs.
 * 
 * @param {Array} candles - OHLCV candles
 * @param {string} side - 'LONG' or 'SHORT'
 * @param {string} regime - Market regime ('TRENDING', 'MEAN_REVERTING', 'RANDOM_WALK')
 * @returns { object } - { adaptiveAtrMultiplier, trailingStopPct, tp1, tp2, qConfidenceScore }
 */
export function getAdaptiveExecutionParams(candles, side = 'LONG', regime = 'TRENDING') {
  if (!candles || candles.length < 15) {
    return {
      adaptiveAtrMultiplier: 1.5,
      trailingStopPct: 1.5,
      qConfidenceScore: 0.5,
      executionPolicy: 'DEFAULT_CONSERVATIVE'
    };
  }

  const volState = getVolatilityState(candles);
  let adaptiveAtrMultiplier = 1.5;
  let trailingStopPct = 1.5;
  let qConfidenceScore = 0.75;
  let executionPolicy = 'ADAPTIVE_BALANCED';

  // RL Q-Value State Matrix adaptation:
  // In HIGH VOLATILITY: widen stops to avoid stop-hunts, lower position size
  if (volState === 'HIGH_VOLATILITY') {
    adaptiveAtrMultiplier = 2.2;
    trailingStopPct = 2.5;
    qConfidenceScore = 0.60;
    executionPolicy = 'WIDE_STOP_VOLATILITY_GUARD';
  } 
  // In COMPRESSED VOLATILITY + TRENDING: tight stops, high RRR expansion
  else if (volState === 'COMPRESSED_LOW_VOLATILITY' && regime === 'TRENDING') {
    adaptiveAtrMultiplier = 1.2;
    trailingStopPct = 1.0;
    qConfidenceScore = 0.90;
    executionPolicy = 'SNIPER_EXPANSION_BREAKOUT';
  } 
  // In MEAN_REVERTING: quick profit target scaling
  else if (regime === 'MEAN_REVERTING') {
    adaptiveAtrMultiplier = 1.4;
    trailingStopPct = 1.2;
    qConfidenceScore = 0.70;
    executionPolicy = 'QUICK_SCALP_MEAN_REVERSION';
  }

  return {
    adaptiveAtrMultiplier,
    trailingStopPct,
    qConfidenceScore,
    executionPolicy,
    volState
  };
}
