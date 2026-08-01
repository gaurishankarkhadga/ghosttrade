import { atr } from './technicalEngine.js';

export function computeStopLossTakeProfit(candles, side, atrMultiplier = 1.5, rrr = 2.0) {
  if (!candles || candles.length < 15) return null;

  // Use Wilder's smoothed ATR from technicalEngine for consistency across all engines
  const atrResult = atr(candles, 14);
  if (!atrResult || !atrResult.value || atrResult.value <= 0) return null;
  const currentAtr = atrResult.value;

  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;

  // Find the structural swing low/high over the last 3 candles for safer placement
  const recentCandles = candles.slice(-3);
  const localLow = Math.min(...recentCandles.map(c => c.low));
  const localHigh = Math.max(...recentCandles.map(c => c.high));

  const slDistance = currentAtr * atrMultiplier;

  // Anchor LONG stops below the structural low, SHORT stops above the structural high
  const stopLoss = side === 'LONG' ? localLow - slDistance
                 : side === 'SHORT' ? localHigh + slDistance
                 : currentPrice;

  // Take Profit is anchored to Entry Price (Close) with actual risk distance to enforce RRR
  const actualRisk = Math.abs(currentPrice - stopLoss);
  const takeProfit = side === 'LONG' ? currentPrice + (actualRisk * rrr)
                   : side === 'SHORT' ? currentPrice - (actualRisk * rrr)
                   : currentPrice;

  return {
    stopLoss,
    takeProfit,
    slDistance: actualRisk,
    tpDistance: actualRisk * rrr,
    atr: currentAtr
  };
}

