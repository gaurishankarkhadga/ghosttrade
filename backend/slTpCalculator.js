import { atr } from './technicalEngine.js';

export function computeStopLossTakeProfit(candles, side, livePrice, atrMultiplier = 1.5, rrr = 2.0) {
  if (!candles || candles.length < 15) return null;

  // Use Wilder's smoothed ATR from technicalEngine for consistency across all engines
  const atrResult = atr(candles, 14);
  if (!atrResult || !atrResult.value || atrResult.value <= 0) return null;
  const currentAtr = atrResult.value;

  const currentCandle = candles[candles.length - 1];
  const currentPrice = livePrice || currentCandle.close;

  // Find the structural swing low/high over the last 15 candles (approx 3.75 hours on 15m) for safer placement
  const recentCandles = candles.slice(-15);
  const localLow = Math.min(...recentCandles.map(c => c.low));
  const localHigh = Math.max(...recentCandles.map(c => c.high));

  // Enforce a minimum safety buffer so the stop loss is never placed immediately next to the entry price
  const minBuffer = currentPrice * 0.01; // 1.0% minimum distance (increased from 0.5% to prevent premature stop outs)
  const slDistance = Math.max(currentAtr * atrMultiplier, minBuffer);

  const normalizedSide = (side || '').toUpperCase() === 'BUY' ? 'LONG' : (side || '').toUpperCase() === 'SELL' ? 'SHORT' : (side || '').toUpperCase();

  // Anchor LONG stops below the structural low, SHORT stops above the structural high
  // FAILSAFE: Ensure the SL is strictly on the correct side of the TRUE live entry price
  let stopLoss = currentPrice;
  if (normalizedSide === 'LONG') {
      stopLoss = Math.min(localLow - slDistance, currentPrice - slDistance);
  } else if (normalizedSide === 'SHORT') {
      stopLoss = Math.max(localHigh + slDistance, currentPrice + slDistance);
  }

  // Enforce zero bound
  if (stopLoss <= 0) stopLoss = 0.0001;

  // Take Profit is anchored to Entry Price (Close) with actual risk distance to enforce RRR
  const actualRisk = Math.abs(currentPrice - stopLoss);
  
  // TP1: Highly probable first target (1:1 RRR)
  let takeProfit1 = normalizedSide === 'LONG' ? currentPrice + (actualRisk * 1.0)
                   : normalizedSide === 'SHORT' ? currentPrice - (actualRisk * 1.0)
                   : currentPrice;
                   
  // TP2: Max trend target (e.g. 1:2 RRR)
  let takeProfit2 = normalizedSide === 'LONG' ? currentPrice + (actualRisk * rrr)
                   : normalizedSide === 'SHORT' ? currentPrice - (actualRisk * rrr)
                   : currentPrice;

  // Enforce zero bound
  if (takeProfit1 <= 0) takeProfit1 = 0.0001;
  if (takeProfit2 <= 0) takeProfit2 = 0.0001;

  // Preserve 'takeProfit' field mapped to TP2 for legacy compatibility, but expose tp1 and tp2.
  return {
    stopLoss,
    takeProfit: takeProfit2, // default fallback
    takeProfit1,
    takeProfit2,
    slDistance: actualRisk,
    tp1Distance: actualRisk * 1.0,
    tp2Distance: actualRisk * rrr,
    tpDistance: actualRisk * rrr,
    atr: currentAtr,
    atrTrailingOffset: currentAtr * atrMultiplier
  };
}

