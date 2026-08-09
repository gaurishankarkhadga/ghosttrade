// =====================================================
// SHARED CONFIG — Centralized Logic
// Prevents drift between backtester, scanner, and interceptor.
// =====================================================

export const CURRENT_LOGIC_VERSION = 'v2.0.1-core';

// Top 20 Crypto Watchlist
export const DEFAULT_CRYPTO_WATCHLIST = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD',
  'LINK-USD', 'MATIC-USD', 'LTC-USD', 'DOT-USD', 'UNI-USD', 'ATOM-USD', 'NEAR-USD',
  'APT-USD', 'ARB-USD', 'OP-USD', 'SUI-USD', 'PEPE-USD'
];

// Global Tech Stocks Watchlist (Replaces NSE for Global SaaS)
export const DEFAULT_GLOBAL_STOCKS_WATCHLIST = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META'
];

export function constructSetupId(pattern, regime, closes) {
  if (!pattern) return null;
  
  let setup_id = pattern;
  
  // Doji is always a neutral/indecision signal — never actionable on its own
  if (pattern === 'doji') return 'doji_indecision';
  
  // Need to compute SMAs for alignment if regime is trending
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  
  let smaAlignment = 'NEUTRAL';
  if (sma20 !== null && sma50 !== null && sma200 !== null) {
    if (sma20 > sma50 && sma50 > sma200) smaAlignment = 'BULLISH';
    if (sma20 < sma50 && sma50 < sma200) smaAlignment = 'BEARISH';
  }

  // Bullish patterns
  const isBullishPattern = ['hammer', 'bullish_engulfing', 'morning_star', 'three_white_soldiers'].includes(pattern);
  // Bearish patterns
  const isBearishPattern = ['shooting_star', 'bearish_engulfing', 'evening_star'].includes(pattern);

  // Morning/Evening Star and Three White Soldiers with trend alignment
  if (regime === 'TRENDING' && smaAlignment === 'BULLISH' && pattern === 'morning_star') {
    return 'morning_star_trend_bull';
  }
  if (regime === 'TRENDING' && smaAlignment === 'BULLISH' && pattern === 'three_white_soldiers') {
    return 'three_white_soldiers_trend_bull';
  }
  if (regime === 'TRENDING' && smaAlignment === 'BEARISH' && pattern === 'evening_star') {
    return 'evening_star_trend_bear';
  }

  if (regime === 'TRENDING' && smaAlignment === 'BULLISH' && isBullishPattern) {
    setup_id += "_trend_bull";
  }
  else if (regime === 'TRENDING' && smaAlignment === 'BEARISH' && isBearishPattern) {
    setup_id += "_trend_bear";
  }
  else if (regime === 'MEAN_REVERTING') {
    setup_id += "_mean_rev";
  }
  else {
    setup_id += "_random";
  }

  return setup_id;
}

// Minimal SMA helper for the shared logic
function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}
