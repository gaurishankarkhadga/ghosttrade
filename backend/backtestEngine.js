import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { preTradeGate } from './ghostMindEngine.js';

// Dynamic slippage + commission model per asset class
export const EXECUTION_COSTS = {
  CRYPTO: { slippagePct: 0.05, commissionPct: 0.10 }, // 0.05% slippage + 0.10% commission per side
  EQUITY: { slippagePct: 0.02, commissionPct: 0.05 },
  FOREX:  { slippagePct: 0.01, commissionPct: 0.03 },
};

export function getAssetClass(ticker) {
  const upper = (ticker || '').toUpperCase();
  if (upper.includes('USD') || upper.includes('BTC') || upper.includes('ETH')) return 'CRYPTO';
  if (upper.includes('.NS') || upper.includes('.BO')) return 'EQUITY';
  if (upper.match(/^[A-Z]{6}$/)) return 'FOREX';
  return 'EQUITY';
}

// Conservative intra-candle resolution:
// If BOTH TP and SL could be hit in the same candle, always assume SL was hit first
// This eliminates look-ahead bias and produces realistic (slightly pessimistic) results
function resolveIntraCandle(candle, stopLoss, takeProfit, side) {
  const hitsSL = side === 'LONG' 
    ? candle.low <= stopLoss 
    : candle.high >= stopLoss;
  const hitsTP = side === 'LONG' 
    ? candle.high >= takeProfit 
    : candle.low <= takeProfit;
  
  if (hitsSL && hitsTP) {
    // Both levels hit in same candle — conservatively assume LOSS
    return 'STOP_LOSS';
  }
  if (hitsSL) return 'STOP_LOSS';
  if (hitsTP) return 'TAKE_PROFIT';
  return 'OPEN';
}

/**
  * Simulates sequential trading over a provided sequence of OHLCV bars.
  * 
  * @param {Array} candles - Array of OHLCV bars
  * @param {string} asset - Asset ticker
  * @param {number} startIndex - Starting bar index (lookback offset)
  * @returns {Promise<Object>} simulationResults
  */
async function simulateCandleSequence(candles, asset, startIndex = 100) {
  let baselineWins = 0, baselineLosses = 0;
  let improvedFullWins = 0, improvedLosses = 0, improvedPartialWins = 0;
  let tradesTaken = 0;
  const tradeLog = [];

  const assetClass = getAssetClass(asset);
  const cost = EXECUTION_COSTS[assetClass] || EXECUTION_COSTS.EQUITY;
  const roundTripCostPct = (cost.slippagePct + cost.commissionPct) * 2; // Entry + exit

  for (let i = startIndex; i < candles.length - 5; i++) {
    const history = candles.slice(0, i + 1);
    const currentDate = candles[i].date;
    
    // Generate signal on historical slice
    const signal = await generateSignal(asset, history, { useCache: false });
    
    // GhostMind Pre-Trade Gate
    const gateResult = await preTradeGate(signal, asset);
    if (gateResult.blocked) {
      signal.action = 'SHIELD_MODE';
      signal.reason = gateResult.reason;
    }

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

      // Look forward to resolve the trade
      let exitDate = null;
      for (let j = i + 1; j < candles.length; j++) {
        const futureHigh = candles[j].high;
        const futureLow = candles[j].low;
        const futureDate = candles[j].date;

        // BASELINE (Fixed TP2, No Trailing Stop)
        if (baselineResult === 'PENDING') {
          const res = resolveIntraCandle(candles[j], stopLossOriginal, target2, side);
          if (res === 'STOP_LOSS') {
            baselineResult = 'LOSS';
            exitPriceBaseline = stopLossOriginal;
          } else if (res === 'TAKE_PROFIT') {
            baselineResult = 'WIN';
            exitPriceBaseline = target2;
          }
        }

        // IMPROVED (With TP1 Partial Scaling & Trailing Stop)
        if (improvedResult === 'PENDING') {
           const trailingDistance = Math.abs(target1 - entry) * 1.5;

           if (!tp1Hit) {
             const res = resolveIntraCandle(candles[j], stopLossActive, target1, side);
             if (res === 'STOP_LOSS') {
                 improvedResult = 'LOSS';
                 exitPriceImproved = stopLossActive;
                 if (!exitDate) exitDate = futureDate;
             } else if (res === 'TAKE_PROFIT') {
                 tp1Hit = true;
                 stopLossActive = side === 'LONG' 
                   ? Math.max(entry, futureHigh - trailingDistance)
                   : Math.min(entry, futureLow + trailingDistance);
                 
                 const hitsNewSL = side === 'LONG' 
                   ? futureLow <= stopLossActive 
                   : futureHigh >= stopLossActive;
                 if (hitsNewSL) {
                     improvedResult = 'WIN';
                     exitPriceImproved = stopLossActive;
                     if (!exitDate) exitDate = futureDate;
                 }
             }
           } else {
             const hitsSL = side === 'LONG' ? futureLow <= stopLossActive : futureHigh >= stopLossActive;
             if (hitsSL) {
                 improvedResult = 'WIN';
                 exitPriceImproved = stopLossActive;
                 if (!exitDate) exitDate = futureDate;
             } else {
                 stopLossActive = side === 'LONG'
                   ? Math.max(stopLossActive, futureHigh - trailingDistance)
                   : Math.min(stopLossActive, futureLow + trailingDistance);
             }
           }
        }
        
        if (baselineResult !== 'PENDING' && improvedResult !== 'PENDING') break;
      }

      // If we run out of data, mark at last available close
      if (baselineResult === 'PENDING') exitPriceBaseline = candles[candles.length - 1].close;
      if (improvedResult === 'PENDING') exitPriceImproved = candles[candles.length - 1].close;

      if (baselineResult === 'WIN') baselineWins++;
      else if (baselineResult === 'LOSS') baselineLosses++;

      if (improvedResult === 'WIN') {
          if (tp1Hit) improvedPartialWins++;
          else improvedFullWins++; 
      }
      else if (improvedResult === 'LOSS') improvedLosses++;

      tradeLog.push({
        date: currentDate,
        exitDate,
        side,
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
          const riskPct = (risk / t.entryPrice) * 100;
          const costInRR = (roundTripCostPct / (riskPct || 1));

          const grossBaselineRR = mult * (t.exitPriceBaseline - t.entryPrice) / risk;
          baselineTotalRR += (grossBaselineRR - costInRR);
          
          if (t.tp1Hit) {
              const profit1 = mult * ((t.target1 - t.entryPrice) / risk) * 0.5; // 50% at TP1
              const profit2 = mult * ((t.exitPriceImproved - t.entryPrice) / risk) * 0.5; // 50% trailed
              improvedTotalRR += (profit1 + profit2 - costInRR);
          } else {
              const grossImprovedRR = mult * (t.exitPriceImproved - t.entryPrice) / risk;
              improvedTotalRR += (grossImprovedRR - costInRR);
          }
      }
  });

  return {
    tradesTaken,
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

/**
  * Standard backtest over historical days.
  */
export async function runBacktest(asset, days = 730) {
  console.log(`[BACKTEST ENGINE] Starting historical simulation for ${asset} over past ${days} days.`);
  
  const dataResponse = await fetchOHLCV(asset, days);
  if (dataResponse.error) {
    return { error: dataResponse.message };
  }
  
  const allCandles = dataResponse.bars;
  if (!allCandles || allCandles.length < 150) {
    return { error: `Insufficient data: only ${allCandles?.length || 0} bars available (need 150+).` };
  }

  const lookback = 100;
  const sim = await simulateCandleSequence(allCandles, asset, lookback);

  return {
    asset,
    daysSimulated: allCandles.length - lookback,
    totalSignalsTaken: sim.tradesTaken,
    baseline: sim.baseline,
    improved: sim.improved,
    tradeLog: sim.tradeLog
  };
}

/**
  * Walk-forward analysis: trains on first 70% of data (In-Sample),
  * tests on last 30% (Out-Of-Sample) with historical lookback warmup.
  */
export async function walkForwardBacktest(assetOrCandles, days = 730, options = {}) {
  let ticker = typeof assetOrCandles === 'string' ? assetOrCandles : (options.ticker || 'ASSET');
  let candles = [];

  if (typeof assetOrCandles === 'string') {
    const dataResponse = await fetchOHLCV(assetOrCandles, days);
    if (dataResponse.error) return { error: dataResponse.message };
    candles = dataResponse.bars || [];
  } else if (Array.isArray(assetOrCandles)) {
    candles = assetOrCandles;
  }

  if (!candles || candles.length < 150) {
    return { error: `Insufficient candles for walk-forward: got ${candles.length}, need at least 150.` };
  }

  const splitRatio = options.splitRatio || 0.7;
  const splitPoint = Math.floor(candles.length * splitRatio);
  const lookback = options.lookback || Math.min(100, Math.max(50, Math.floor(splitPoint * 0.6)));

  if (splitPoint < lookback + 10) {
    return { error: `Train window too small (${splitPoint} bars). Need at least ${lookback + 10} bars.` };
  }

  const trainCandles = candles.slice(0, splitPoint);
  // Give out-of-sample candles a lookback warmup from the end of trainCandles
  const testCandlesWithWarmup = candles.slice(splitPoint - lookback);

  console.log(`[WALK-FORWARD] ${ticker} | In-Sample: ${trainCandles.length} bars | Out-Of-Sample: ${candles.length - splitPoint} bars`);

  const [inSample, outOfSample] = await Promise.all([
    simulateCandleSequence(trainCandles, ticker, lookback),
    simulateCandleSequence(testCandlesWithWarmup, ticker, lookback)
  ]);

  const trainWinRate = inSample.improved.winRate;
  const testWinRate = outOfSample.improved.winRate;
  const trainProfitRR = inSample.improved.totalProfitRR;
  const testProfitRR = outOfSample.improved.totalProfitRR;

  // Walk-Forward Efficiency: ratio of out-of-sample annualized/bar return to in-sample
  const sampleRatio = (candles.length - splitPoint) / (trainCandles.length || 1);
  const normalizedTestRR = sampleRatio > 0 ? (testProfitRR / sampleRatio) : testProfitRR;
  const wfe = trainProfitRR > 0 ? (normalizedTestRR / trainProfitRR) * 100 : 0;

  const winRateStability = trainWinRate > 0 ? (testWinRate / trainWinRate) : 0;
  let overfitRisk = 'LOW';
  if (winRateStability < 0.65 || (trainProfitRR > 0 && testProfitRR < 0)) {
    overfitRisk = 'HIGH';
  } else if (winRateStability < 0.85) {
    overfitRisk = 'MODERATE';
  }

  return {
    asset: ticker,
    mode: 'WALK_FORWARD',
    totalBars: candles.length,
    trainSize: trainCandles.length,
    testSize: candles.length - splitPoint,
    inSample: inSample.improved,
    outOfSample: outOfSample.improved,
    baselineOutOfSample: outOfSample.baseline,
    robustness: {
      wfe: parseFloat(wfe.toFixed(2)),
      winRateStability: parseFloat(winRateStability.toFixed(2)),
      overfitRisk
    },
    tradeLog: outOfSample.tradeLog
  };
}
