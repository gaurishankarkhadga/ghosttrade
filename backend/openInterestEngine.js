// =====================================================
// FUTURES DATA ENGINE — Open Interest & Funding Rates
// Fetches leveraged positions data from Binance Futures.
// Essential for predicting liquidations and market maker
// stop hunts.
// =====================================================

import { isBinanceCrypto } from './orderFlowEngine.js';

const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

/**
 * Resolves ticker to Binance Futures symbol
 */
function resolveFuturesSymbol(ticker) {
  const normalized = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized === 'BTC' || normalized === 'BTCUSD') return 'BTCUSDT';
  if (normalized === 'ETH' || normalized === 'ETHUSD') return 'ETHUSDT';
  if (normalized.endsWith('USDT')) return normalized;
  return `${normalized}USDT`;
}

/**
 * Fetches Open Interest and Funding Rate for a crypto asset.
 * @param {string} ticker 
 * @returns {Promise<Object>}
 */
export async function fetchFuturesData(ticker) {
  if (!isBinanceCrypto(ticker)) {
    return { error: `Futures data not supported for ${ticker}`, available: false };
  }

  const symbol = resolveFuturesSymbol(ticker);
  
  try {
    // Run both requests in parallel
    const [oiResponse, fundingResponse, klinesResponse] = await Promise.all([
      fetch(`${BINANCE_FUTURES_API}/openInterest?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${BINANCE_FUTURES_API}/fundingRate?symbol=${symbol}&limit=1`, { signal: AbortSignal.timeout(5000) }),
      // Fetch 1h klines to compare OI change
      fetch(`${BINANCE_FUTURES_API}/klines?symbol=${symbol}&interval=1h&limit=24`, { signal: AbortSignal.timeout(5000) })
    ]);

    if (!oiResponse.ok || !fundingResponse.ok || !klinesResponse.ok) {
      return { error: 'Failed to fetch futures data', available: false };
    }

    const oiData = await oiResponse.json();
    const fundingData = await fundingResponse.json();
    const klinesData = await klinesResponse.json();

    return analyzeFuturesData(oiData, fundingData[0], klinesData, symbol);
  } catch (error) {
    console.warn(`[FUTURES] Fetch failed for ${ticker}:`, error.message);
    return { error: error.message, available: false };
  }
}

/**
 * Analyzes the raw futures data to find imbalances.
 */
function analyzeFuturesData(oiData, fundingData, klines, symbol) {
  const openInterest = parseFloat(oiData.openInterest);
  const fundingRate = parseFloat(fundingData.fundingRate);
  
  // Calculate annualized funding
  const annualizedFunding = fundingRate * 3 * 365 * 100; // 8h funding -> annualized %

  // Compare current price to 24h ago
  const currentPrice = parseFloat(klines[klines.length - 1][4]);
  const price24hAgo = parseFloat(klines[0][1]);
  const priceChange = ((currentPrice - price24hAgo) / price24hAgo) * 100;

  // Simple heuristic for OI analysis (requires historical OI ideally, but we approximate)
  let sentiment, interpretation;
  
  // Funding Rate Interpretation
  if (fundingRate > 0.001) { // Very positive funding
    sentiment = 'EXTREMELY_LONG_HEAVY';
    interpretation = `Funding rate is high (${(fundingRate*100).toFixed(4)}% per 8h / ${annualizedFunding.toFixed(1)}% APY). Longs are aggressively paying shorts. High risk of a long squeeze (liquidation cascade downwards).`;
  } else if (fundingRate > 0.0003) {
    sentiment = 'LONG_BIASED';
    interpretation = `Funding rate is positive (${(fundingRate*100).toFixed(4)}% per 8h). Market leans long.`;
  } else if (fundingRate < -0.001) {
    sentiment = 'EXTREMELY_SHORT_HEAVY';
    interpretation = `Funding rate is very negative (${(fundingRate*100).toFixed(4)}% per 8h / ${annualizedFunding.toFixed(1)}% APY). Shorts are aggressively paying longs. High risk of a short squeeze (price spikes up).`;
  } else if (fundingRate < 0) {
    sentiment = 'SHORT_BIASED';
    interpretation = `Funding rate is negative (${(fundingRate*100).toFixed(4)}% per 8h). Market leans short.`;
  } else {
    sentiment = 'NEUTRAL';
    interpretation = `Funding rate is baseline (${(fundingRate*100).toFixed(4)}% per 8h). No extreme leverage imbalance.`;
  }

  // Combine with price action
  if (sentiment.includes('LONG') && priceChange < -2) {
    interpretation += ' Price is falling while longs are trapped. Liquidation risk is ELEVATED.';
  } else if (sentiment.includes('SHORT') && priceChange > 2) {
    interpretation += ' Price is rising while shorts are trapped. Short squeeze risk is ELEVATED.';
  }

  return {
    available: true,
    symbol,
    openInterest,
    fundingRate,
    fundingRatePercent: parseFloat((fundingRate * 100).toFixed(4)),
    annualizedFunding: parseFloat(annualizedFunding.toFixed(2)),
    sentiment,
    interpretation
  };
}

/**
 * Formats futures data for the AI prompt
 */
export function formatFuturesContext(futuresData) {
  if (!futuresData || !futuresData.available) return '';

  let block = `\n=== FUTURES & LEVERAGE ANALYSIS ===\n`;
  block += `Symbol: ${futuresData.symbol}\n`;
  block += `Open Interest: ${futuresData.openInterest} contracts\n`;
  block += `Funding Rate (8h): ${futuresData.fundingRatePercent}% (Annualized: ${futuresData.annualizedFunding}%)\n`;
  block += `Leverage Sentiment: ${futuresData.sentiment}\n`;
  block += `Assessment: ${futuresData.interpretation}\n`;
  block += `IMPORTANT: Extreme funding rates often precede violent reversals (stop hunts/liquidations). Incorporate this into your risk invalidation levels.\n`;

  return block;
}
