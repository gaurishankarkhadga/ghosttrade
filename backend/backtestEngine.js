import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';

export async function runBacktest(asset, days = 730) {
  console.log(`[BACKTEST ENGINE] Starting historical simulation for ${asset} over past ${days} days.`);
  
  const dataResponse = await fetchOHLCV(asset, days);
  if (dataResponse.error) {
    return { error: dataResponse.message };
  }
  
  const allCandles = dataResponse.bars;
  if (!allCandles || allCandles.length < 300) {
    return { error: `Insufficient data: only ${allCandles?.length || 0} bars available.` };
  }

  const lookback = 200; // Need 200 days for Hurst Exponent
  let baselineWins = 0, baselineLosses = 0;
  let improvedFullWins = 0, improvedLosses = 0, improvedPartialWins = 0;
  let tradesTaken = 0;
  const tradeLog = [];

  // Simulate time moving forward day by day
  for (let i = lookback; i < allCandles.length - 5; i++) {
    const history = allCandles.slice(0, i + 1);
    const currentDate = allCandles[i].date;
    
    // Generate signal on historical slice
    const signal = await generateSignal(asset, history, { useCache: false });

    if (signal.action === 'TRADE' || signal.action === 'BUY' || signal.action === 'LONG') {
      tradesTaken++;
      const side = signal.side ? signal.side.toUpperCase() : 'LONG';
      const entry = signal.currentPrice;
      const target2 = signal.takeProfit2 || signal.takeProfit;
      const target1 = signal.takeProfit1 || (entry + ((target2 - entry) * 0.5));
      const stopLossOriginal = signal.stopLoss;
      
      if (!entry || !target2 || !stopLossOriginal) continue;

      let baselineResult = 'PENDING';
      let improvedResult = 'PENDING';
      let tp1Hit = false;
      let stopLossActive = stopLossOriginal;
      let exitPriceBaseline = 0;
      let exitPriceImproved = 0;

      // Look into the future to see what hit first
      let exitDate = null;
      for (let j = i + 1; j < allCandles.length; j++) {
        const futureHigh = allCandles[j].high;
        const futureLow = allCandles[j].low;
        const futureClose = allCandles[j].close;
        const futureDate = allCandles[j].date;

        // BASELINE (Fixed TP2, No Trailing Stop)
        if (baselineResult === 'PENDING') {
          if (side === 'LONG') {
            if (futureLow <= stopLossOriginal) {
              baselineResult = 'LOSS';
              exitPriceBaseline = stopLossOriginal;
            } else if (futureHigh >= target2) {
              baselineResult = 'WIN';
              exitPriceBaseline = target2;
            }
          } else { // SHORT
            if (futureHigh >= stopLossOriginal) {
              baselineResult = 'LOSS';
              exitPriceBaseline = stopLossOriginal;
            } else if (futureLow <= target2) {
              baselineResult = 'WIN';
              exitPriceBaseline = target2;
            }
          }
        }

        // IMPROVED (With TP1 Partial Scaling & ATR Trailing Stop Infinite Runner)
        if (improvedResult === 'PENDING') {
           const trailingDistance = Math.abs(target1 - entry) * 1.5;

           if (side === 'LONG') {
             if (futureHigh >= target1 && !tp1Hit) {
                 tp1Hit = true;
                 stopLossActive = Math.max(entry, futureHigh - trailingDistance);
             } else if (tp1Hit) {
                 stopLossActive = Math.max(stopLossActive, futureHigh - trailingDistance);
             }

             if (futureLow <= stopLossActive) {
                 improvedResult = tp1Hit ? 'WIN' : 'LOSS';
                 exitPriceImproved = stopLossActive;
                 if (!exitDate) exitDate = futureDate;
             }
           } else { // SHORT
             if (futureLow <= target1 && !tp1Hit) {
                 tp1Hit = true;
                 stopLossActive = Math.min(entry, futureLow + trailingDistance);
             } else if (tp1Hit) {
                 stopLossActive = Math.min(stopLossActive, futureLow + trailingDistance);
             }

             if (futureHigh >= stopLossActive) {
                 improvedResult = tp1Hit ? 'WIN' : 'LOSS';
                 exitPriceImproved = stopLossActive;
                 if (!exitDate) exitDate = futureDate;
             }
           }
        }
        
        if (baselineResult !== 'PENDING' && improvedResult !== 'PENDING') break;
      }

      // If we run out of data, just mark whatever price it's at
      if (baselineResult === 'PENDING') exitPriceBaseline = allCandles[allCandles.length - 1].close;
      if (improvedResult === 'PENDING') exitPriceImproved = allCandles[allCandles.length - 1].close;

      if (baselineResult === 'WIN') baselineWins++;
      else if (baselineResult === 'LOSS') baselineLosses++;

      if (improvedResult === 'WIN') {
          if (tp1Hit) improvedPartialWins++; // Using partial wins bucket to denote trailing stop wins
          else improvedFullWins++; 
      }
      else if (improvedResult === 'LOSS') improvedLosses++;

      tradeLog.push({
        date: currentDate,
        exitDate,
        entryPrice: entry,
        target1,
        target2,
        stopLossOriginal,
        baselineOutcome: baselineResult,
        improvedOutcome: improvedResult,
        tp1Hit,
        exitPriceBaseline,
        exitPriceImproved
      });
    }
  }

  // Calculate Metrics
  const baselineTotal = baselineWins + baselineLosses;
  const baselineWinRate = baselineTotal > 0 ? (baselineWins / baselineTotal) * 100 : 0;
  
  const totalImprovedWins = improvedFullWins + improvedPartialWins;
  const improvedTotal = totalImprovedWins + improvedLosses;
  const improvedWinRate = improvedTotal > 0 ? (totalImprovedWins / improvedTotal) * 100 : 0; 
  const lossesPrevented = baselineLosses - improvedLosses;

  let baselineTotalRR = 0;
  let improvedTotalRR = 0;

  tradeLog.forEach(t => {
      const risk = Math.abs(t.entryPrice - t.stopLossOriginal);
      if (risk > 0) {
          const mult = (t.side === 'LONG' || t.target1 > t.entryPrice) ? 1 : -1;
          baselineTotalRR += mult * (t.exitPriceBaseline - t.entryPrice) / risk;
          
          if (t.tp1Hit) {
              const profit1 = mult * ((t.target1 - t.entryPrice) / risk) * 0.5; // 50% at TP1
              const profit2 = mult * ((t.exitPriceImproved - t.entryPrice) / risk) * 0.5; // 50% trailed
              improvedTotalRR += (profit1 + profit2);
          } else {
              improvedTotalRR += mult * (t.exitPriceImproved - t.entryPrice) / risk;
          }
      }
  });

  return {
    asset,
    daysSimulated: allCandles.length - lookback,
    totalSignalsTaken: tradesTaken,
    baseline: {
      wins: baselineWins,
      losses: baselineLosses,
      winRate: parseFloat(baselineWinRate.toFixed(2)),
      totalProfitRR: parseFloat(baselineTotalRR.toFixed(2))
    },
    improved: {
      fullWins: improvedFullWins,
      partialWins: improvedPartialWins,
      losses: improvedLosses,
      winRate: parseFloat(improvedWinRate.toFixed(2)),
      lossesPrevented,
      totalProfitRR: parseFloat(improvedTotalRR.toFixed(2))
    },
    tradeLog
  };
}
