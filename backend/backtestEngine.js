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
      const entry = signal.currentPrice;
      const target2 = signal.takeProfit2 || signal.takeProfit;
      const target1 = signal.takeProfit1 || (entry + ((target2 - entry) * 0.5));
      const stopLossOriginal = signal.stopLoss;
      
      if (!entry || !target2 || !stopLossOriginal) continue;

      let baselineResult = 'PENDING';
      let improvedResult = 'PENDING';
      let tp1Hit = false;
      let stopLossActive = stopLossOriginal;

      // Look into the future to see what hit first
      let exitDate = null;
      for (let j = i + 1; j < allCandles.length; j++) {
        const futureHigh = allCandles[j].high;
        const futureLow = allCandles[j].low;
        const futureDate = allCandles[j].date;

        // BASELINE (No Trailing Stop)
        if (baselineResult === 'PENDING') {
          if (futureLow <= stopLossOriginal) {
            baselineResult = 'LOSS';
          } else if (futureHigh >= target2) {
            baselineResult = 'WIN';
          }
        }

        // IMPROVED (With TP1 Partial Scaling)
        if (improvedResult === 'PENDING') {
           if (futureHigh >= target1 && !tp1Hit) {
               tp1Hit = true;
               stopLossActive = entry; // Move stop to break-even for remaining 50%
           }

           if (futureLow <= stopLossActive) {
               improvedResult = tp1Hit ? 'PARTIAL_WIN' : 'LOSS';
               if (!exitDate) exitDate = futureDate;
           } else if (futureHigh >= target2) {
               improvedResult = 'FULL_WIN';
               if (!exitDate) exitDate = futureDate;
           }
        }
        
        if (baselineResult !== 'PENDING' && improvedResult !== 'PENDING') break;
      }

      if (baselineResult === 'WIN') baselineWins++;
      else if (baselineResult === 'LOSS') baselineLosses++;

      if (improvedResult === 'FULL_WIN') improvedFullWins++;
      else if (improvedResult === 'LOSS') improvedLosses++;
      else if (improvedResult === 'PARTIAL_WIN') improvedPartialWins++;

      tradeLog.push({
        date: currentDate,
        exitDate,
        entryPrice: entry,
        target1,
        target2,
        stopLossOriginal,
        baselineOutcome: baselineResult,
        improvedOutcome: improvedResult,
        tp1Hit
      });
    }
  }

  // Calculate Metrics
  const baselineTotal = baselineWins + baselineLosses;
  const baselineWinRate = baselineTotal > 0 ? (baselineWins / baselineTotal) * 100 : 0;
  
  // A Partial Win is still a win (50% profit secured)
  const totalImprovedWins = improvedFullWins + improvedPartialWins;
  const improvedTotal = totalImprovedWins + improvedLosses;
  const improvedWinRate = improvedTotal > 0 ? (totalImprovedWins / improvedTotal) * 100 : 0; 
  const lossesPrevented = baselineLosses - improvedLosses;

  return {
    asset,
    daysSimulated: allCandles.length - lookback,
    totalSignalsTaken: tradesTaken,
    baseline: {
      wins: baselineWins,
      losses: baselineLosses,
      winRate: parseFloat(baselineWinRate.toFixed(2))
    },
    improved: {
      fullWins: improvedFullWins,
      partialWins: improvedPartialWins,
      losses: improvedLosses,
      winRate: parseFloat(improvedWinRate.toFixed(2)),
      lossesPrevented
    },
    tradeLog
  };
}
