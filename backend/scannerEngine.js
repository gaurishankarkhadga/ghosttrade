// =====================================================
// SCANNER ENGINE — Bulk Quantitative Screener
// Processes multiple tickers in parallel, running the
// full mathematical analysis to find the best setups.
// =====================================================

import { fetchOHLCV, getLogReturns } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { fetchOrderFlow } from './orderFlowEngine.js';

// Default watchlist if none provided
export const DEFAULT_CRYPTO_WATCHLIST = [
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX',
  'LINK', 'MATIC', 'LTC', 'DOT', 'UNI', 'ATOM', 'NEAR',
  'APT', 'ARB', 'OP', 'SUI', 'PEPE'
];

/**
 * Sleeps for ms milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scans a single ticker using the quant pipelines.
 */
async function scanTicker(ticker) {
  try {
    const dataResult = await fetchOHLCV(ticker, 300);
    if (dataResult.error) {
      return { ticker, status: 'error', reason: dataResult.error };
    }

    const returns = getLogReturns(dataResult.bars);
    const hurstData = calculateHurst(returns);
    const regimeData = classifyRegime(hurstData);

    const flowData = await fetchOrderFlow(ticker, 500); // lighter order flow for scan

    // Calculate a basic score to rank setups
    let score = 0;
    if (regimeData.isActionable) score += 50;
    if (regimeData.regime === 'TRENDING') score += 20;
    
    // Check if flow aligns with regime (trending up + strong buy flow)
    const isUptrend = dataResult.bars[dataResult.bars.length - 1].close > dataResult.bars[dataResult.bars.length - 20].close; // rough check
    if (regimeData.regime === 'TRENDING') {
      if (isUptrend && flowData.deltaPercent > 5) score += 30; // Strong buy pressure in uptrend
      if (!isUptrend && flowData.deltaPercent < -5) score += 30; // Strong sell pressure in downtrend
    } else if (regimeData.regime === 'MEAN_REVERTING') {
       if (flowData.flowReversal) score += 25; // Reversal flow in mean-reverting regime
    }

    return {
      ticker,
      status: 'success',
      regime: regimeData.regime,
      hurst: parseFloat((hurstData.meanH || 0).toFixed(3)),
      actionable: regimeData.isActionable,
      posterior: regimeData.posterior,
      flowBias: flowData.flowBias || 'UNKNOWN',
      deltaPercent: flowData.deltaPercent || 0,
      score: score,
      currentPrice: dataResult.bars[dataResult.bars.length-1].close
    };
  } catch (err) {
    return { ticker, status: 'error', reason: err.message };
  }
}

/**
 * Scans an array of tickers with controlled concurrency.
 * @param {string[]} tickers 
 * @param {function} onProgress callback
 * @returns {Promise<Array>}
 */
export async function runBulkScan(tickers = DEFAULT_CRYPTO_WATCHLIST, onProgress = null) {
  const results = [];
  const BATCH_SIZE = 5; // Scan 5 at a time to prevent rate limits
  const DELAY_BETWEEN_BATCHES = 1000;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (ticker) => {
      const result = await scanTicker(ticker);
      if (onProgress) {
         onProgress({ ticker, result, scanned: results.length + batch.length, total: tickers.length });
      }
      return result;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + BATCH_SIZE < tickers.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Filter and sort results
  const successfulScans = results.filter(r => r.status === 'success');
  
  // Sort by highest score first, then highest posterior confidence
  successfulScans.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.posterior - a.posterior;
  });

  return successfulScans;
}
