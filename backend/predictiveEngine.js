// =====================================================
// PREDICTIVE ENGINE — 5 to 10 Minute Early Warning Lookahead
// Forecasts impending breakouts 5-10 minutes ahead of candle close
// by detecting micro volume acceleration, order flow delta velocity,
// and volatility squeeze compressions.
// =====================================================

import { calculateOrderFlowImbalance } from './orderFlowEngine.js';

/**
 * Evaluates 5-to-10 minute predictive lookahead horizon for a given asset's candle history.
 * 
 * @param {Array} candles - Array of 15m or 5m OHLCV bars
 * @param {object} ofiMetrics - Optional pre-computed OFI metrics
 * @returns { object } - { predictedDirection, predictiveScore, timeHorizonMinutes, confidencePct, rationale }
 */
export function predict5to10mHorizon(candles, ofiMetrics = null) {
  if (!candles || candles.length < 10) {
    return {
      predictedDirection: 'NEUTRAL_WAIT',
      predictiveScore: 50,
      timeHorizonMinutes: 5,
      confidencePct: 50,
      rationale: 'Insufficient price history for 5-10m predictive lookahead.'
    };
  }

  const recentBars = candles.slice(-5);
  const latestBar = recentBars[recentBars.length - 1];
  const previousBars = recentBars.slice(0, 4);

  // 1. Calculate Volume Acceleration Velocity
  const avgPrevVolume = previousBars.reduce((sum, b) => sum + (b.volume || 0), 0) / previousBars.length || 1;
  const currentVolumeRatio = (latestBar.volume || 1) / avgPrevVolume;

  // 2. Compute Volatility Compression (Squeeze Ratio)
  const highs = recentBars.map(b => b.high);
  const lows = recentBars.map(b => b.low);
  const range = Math.max(...highs) - Math.min(...lows);
  const avgPrice = latestBar.close || 1;
  const volatilityCompression = (range / avgPrice) * 100;

  // 3. Compute Order Flow Imbalance Velocity if not passed
  const flow = ofiMetrics || calculateOrderFlowImbalance(candles);
  const ofi = flow.ofi || 0;

  // 4. Predictive Lookahead Decision Logic (5-10 minutes ahead)
  let predictedDirection = 'CONSOLIDATION_SIDEWAYS';
  let predictiveScore = 50;
  let timeHorizonMinutes = 5;
  let confidencePct = 55;
  let rationale = 'Market consolidating. Micro-volume steady.';

  // High Volume Velocity + High OFI Buyer Aggression -> Bullish Breakout in 5-10m
  if (currentVolumeRatio >= 1.8 && ofi >= 0.20) {
    predictedDirection = 'BULLISH_BREAKOUT_5-10M';
    predictiveScore = Math.min(95, Math.round(70 + (currentVolumeRatio * 5) + (ofi * 20)));
    timeHorizonMinutes = currentVolumeRatio > 2.5 ? 5 : 10;
    confidencePct = Math.min(92, Math.round(65 + ofi * 30));
    rationale = `Institutional volume acceleration (${currentVolumeRatio.toFixed(1)}x normal) and positive Order Flow Delta (+${(ofi*100).toFixed(0)}%) predict upward momentum expansion within ${timeHorizonMinutes} minutes.`;
  }
  // High Volume Velocity + Negative OFI Seller Aggression -> Bearish Breakdown in 5-10m
  else if (currentVolumeRatio >= 1.8 && ofi <= -0.20) {
    predictedDirection = 'BEARISH_BREAKDOWN_5-10M';
    predictiveScore = Math.min(95, Math.round(70 + (currentVolumeRatio * 5) + (Math.abs(ofi) * 20)));
    timeHorizonMinutes = currentVolumeRatio > 2.5 ? 5 : 10;
    confidencePct = Math.min(92, Math.round(65 + Math.abs(ofi) * 30));
    rationale = `Institutional distribution volume (${currentVolumeRatio.toFixed(1)}x normal) and negative Order Flow Delta (${(ofi*100).toFixed(0)}%) predict downward breakdown within ${timeHorizonMinutes} minutes.`;
  }
  // Low Volatility Compression -> Imminent Squeeze Explosion
  else if (volatilityCompression < 0.5) {
    predictedDirection = 'VOLATILITY_EXPANSION_IMMINENT';
    predictiveScore = 75;
    timeHorizonMinutes = 8;
    confidencePct = 70;
    rationale = `Volatility compression detected (${volatilityCompression.toFixed(2)}% range). Energy coiling for an explosive 5-10m breakout.`;
  }

  return {
    predictedDirection,
    predictiveScore,
    timeHorizonMinutes,
    confidencePct,
    rationale
  };
}
