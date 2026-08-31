// =====================================================
// PATTERN ENGINE — Algorithmic Candlestick Geometry
// Deterministic shape detection with Institutional Footprint (Volume/VWAP).
// =====================================================

import { volumeAnalysis, vwap } from './technicalEngine.js';

export function isHammer(prev, curr) {
  const body = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  const EPSILON = range * 0.001;

  if (body < EPSILON) return { detected: false, reason: 'near_doji_excluded' };

  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  return { detected: lowerWick >= 2 * body && upperWick <= body * 0.2 };
}

export function isShootingStar(prev, curr) {
  const body = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  const EPSILON = range * 0.001;

  if (body < EPSILON) return { detected: false, reason: 'near_doji_excluded' };

  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  return { detected: upperWick >= 2 * body && lowerWick <= body * 0.2 };
}

export function isBullishEngulfing(prev, curr) {
  return { detected: prev.close < prev.open && curr.close > curr.open && curr.open <= prev.close && curr.close >= prev.open };
}

export function isBearishEngulfing(prev, curr) {
  return { detected: prev.close > prev.open && curr.close < curr.open && curr.open >= prev.close && curr.close <= prev.open };
}

export function isDoji(curr) {
  const body = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  if (range === 0) return { detected: false, reason: 'flat_bar' };
  
  return { detected: body < range * 0.10 };
}

export function isMorningStar(candles) {
  if (candles.length < 3) return { detected: false };
  const first = candles[candles.length - 3];
  const middle = candles[candles.length - 2];
  const third = candles[candles.length - 1];

  const firstBearish = first.close < first.open;
  const firstBigBody = Math.abs(first.close - first.open) > (first.high - first.low) * 0.4;
  const middleSmallBody = Math.abs(middle.close - middle.open) < (middle.high - middle.low) * 0.3;
  const thirdBullish = third.close > third.open;
  const thirdClosesAboveFirstMidpoint = third.close > (first.open + first.close) / 2;
  
  // The gap requirement: The real body of the middle candle must gap below the real body of the first candle
  const middleGapsDown = Math.max(middle.open, middle.close) < first.close;

  return { detected: firstBearish && firstBigBody && middleSmallBody && thirdBullish && thirdClosesAboveFirstMidpoint && middleGapsDown };
}

export function isEveningStar(candles) {
  if (candles.length < 3) return { detected: false };
  const first = candles[candles.length - 3];
  const middle = candles[candles.length - 2];
  const third = candles[candles.length - 1];

  const firstBullish = first.close > first.open;
  const firstBigBody = Math.abs(first.close - first.open) > (first.high - first.low) * 0.4;
  const middleSmallBody = Math.abs(middle.close - middle.open) < (middle.high - middle.low) * 0.3;
  const thirdBearish = third.close < third.open;
  const thirdClosesBelowFirstMidpoint = third.close < (first.open + first.close) / 2;
  
  // The gap requirement: The real body of the middle candle must gap above the real body of the first candle
  const middleGapsUp = Math.min(middle.open, middle.close) > first.close;

  return { detected: firstBullish && firstBigBody && middleSmallBody && thirdBearish && thirdClosesBelowFirstMidpoint && middleGapsUp };
}

export function isThreeWhiteSoldiers(candles) {
  if (candles.length < 3) return { detected: false };
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];

  const allBullish = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
  const progressiveHigherCloses = c3.close > c2.close && c2.close > c1.close;
  // Each candle opens within the previous candle's body
  const c2OpensInC1Body = c2.open >= c1.open && c2.open <= c1.close;
  const c3OpensInC2Body = c3.open >= c2.open && c3.open <= c2.close;

  return { detected: allBullish && progressiveHigherCloses && c2OpensInC1Body && c3OpensInC2Body };
}

export function detectPatterns(candles) {
  if (!candles || candles.length < 20) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const volAnal = volumeAnalysis(candles, 20);
  const currentVwap = vwap(candles);
  const vwapVal = currentVwap ? currentVwap.vwap : null;
  
  const hasInstitutionalFootprintB = volAnal.isSpike || (vwapVal !== null && curr.low <= vwapVal && curr.close > vwapVal);
  const hasInstitutionalFootprintS = volAnal.isSpike || (vwapVal !== null && curr.high >= vwapVal && curr.close < vwapVal);
  const hasVolumeConfirmation = volAnal.relativeVolume > 1.2; // Above-average volume for multi-candle patterns

  // Single-candle patterns (require institutional footprint)
  if (isHammer(prev, curr).detected && hasInstitutionalFootprintB) return "hammer";
  if (isShootingStar(prev, curr).detected && hasInstitutionalFootprintS) return "shooting_star";
  if (isBullishEngulfing(prev, curr).detected && hasInstitutionalFootprintB) return "bullish_engulfing";
  if (isBearishEngulfing(prev, curr).detected && hasInstitutionalFootprintS) return "bearish_engulfing";

  // Multi-candle patterns (require volume confirmation instead of VWAP cross)
  if (isMorningStar(candles).detected && (hasInstitutionalFootprintB || hasVolumeConfirmation)) return "morning_star";
  if (isEveningStar(candles).detected && (hasInstitutionalFootprintS || hasVolumeConfirmation)) return "evening_star";
  if (isThreeWhiteSoldiers(candles).detected && hasVolumeConfirmation) return "three_white_soldiers";

  // Standalone indecision pattern (no footprint required — it's a warning signal)
  if (isDoji(curr).detected) return "doji";

  return null;
}

export async function gradePattern(pattern, regimeLabel, smaAlignment, db) {
  let setup_id = pattern;
  if (regimeLabel === 'TRENDING' && smaAlignment === 'BULLISH' && (pattern === 'hammer' || pattern === 'bullish_engulfing')) {
    setup_id += "_trend_bull";
  }
  else if (regimeLabel === 'TRENDING' && smaAlignment === 'BEARISH' && (pattern === 'shooting_star' || pattern === 'bearish_engulfing')) {
    setup_id += "_trend_bear";
  }
  else if (regimeLabel === 'MEAN_REVERTING') {
    setup_id += "_mean_rev";
  }
  else {
    setup_id += "_random";
  }
  
  if (db) {
    const stats = await db.collection('setup_stats').findOne({ setup_id });
    if (stats) return { setup_id, stats };
  }
  return { setup_id, stats: { confidence_flag: "INSUFFICIENT_DATA" } };
}
