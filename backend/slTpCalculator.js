import { atr } from './technicalEngine.js';

export function computeStopLossTakeProfit(candles, side, livePrice, atrMultiplier = 1.5, rrr = 2.0) {
  if (!candles || candles.length < 15) return null;

  // Use Wilder's smoothed ATR from technicalEngine for consistency across all engines
  const atrResult = atr(candles, 14);
  if (!atrResult || !atrResult.value || atrResult.value <= 0) return null;
  const currentAtr = atrResult.value;

  const currentCandle = candles[candles.length - 1];
  const currentPrice = livePrice || currentCandle.close;
  if (!currentPrice || currentPrice <= 0) return null;

  // Find the structural swing low/high over the last 15 candles
  const recentCandles = candles.slice(-15);
  const localLow = Math.min(...recentCandles.map(c => c.low));
  const localHigh = Math.max(...recentCandles.map(c => c.high));

  const normalizedSide = (side || '').toUpperCase() === 'BUY' ? 'LONG' : (side || '').toUpperCase() === 'SELL' ? 'SHORT' : (side || '').toUpperCase();

  // Institutional Risk Bounding:
  // - Minimum risk buffer: 0.8% (prevents immediate noise stop-outs)
  // - Maximum risk ceiling: 3.8% (prevents absurd, unachievable multi-day targets on intraday signals)
  const minRiskDist = currentPrice * 0.008;
  const maxRiskDist = currentPrice * 0.038;

  let rawRisk = currentAtr * atrMultiplier;

  // Include structural swing distance if meaningful
  if (normalizedSide === 'LONG') {
    const swingDist = currentPrice - localLow;
    if (swingDist > 0 && swingDist < maxRiskDist) {
      rawRisk = Math.max(rawRisk, swingDist + (currentAtr * 0.3));
    }
  } else if (normalizedSide === 'SHORT') {
    const swingDist = localHigh - currentPrice;
    if (swingDist > 0 && swingDist < maxRiskDist) {
      rawRisk = Math.max(rawRisk, swingDist + (currentAtr * 0.3));
    }
  }

  // Clamped Risk Distance: Guarantees realistic, institutional stop distances
  const actualRisk = Math.min(Math.max(rawRisk, minRiskDist), maxRiskDist);

  // Exact 1:2 Risk-to-Reward Ratio:
  // Stop Loss = Entry ± Risk
  // Take Profit 1 = Entry ± (1.0 * Risk) [1:1 RRR]
  // Take Profit 2 = Entry ± (rrr * Risk) [1:2 RRR]
  let stopLoss = currentPrice;
  let takeProfit1 = currentPrice;
  let takeProfit2 = currentPrice;

  if (normalizedSide === 'LONG') {
    stopLoss = currentPrice - actualRisk;
    takeProfit1 = currentPrice + (actualRisk * 1.0);
    takeProfit2 = currentPrice + (actualRisk * rrr);
  } else if (normalizedSide === 'SHORT') {
    stopLoss = currentPrice + actualRisk;
    takeProfit1 = currentPrice - (actualRisk * 1.0);
    takeProfit2 = currentPrice - (actualRisk * rrr);
  }

  // Enforce zero floor for ultra-low price assets
  if (stopLoss <= 0) stopLoss = currentPrice * 0.5;
  if (takeProfit1 <= 0) takeProfit1 = currentPrice * 0.1;
  if (takeProfit2 <= 0) takeProfit2 = currentPrice * 0.05;

  return {
    stopLoss,
    takeProfit: takeProfit2, // default 1:2 RRR target
    takeProfit1,
    takeProfit2,
    slDistance: actualRisk,
    tp1Distance: actualRisk * 1.0,
    tp2Distance: actualRisk * rrr,
    tpDistance: actualRisk * rrr,
    riskRewardRatio: rrr,
    atr: currentAtr,
    atrTrailingOffset: currentAtr * atrMultiplier
  };
}

