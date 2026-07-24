// =====================================================
// DATA FETCHER — Yahoo Finance OHLCV Ingestion
// Fetches raw price bars needed for Hurst + Regime calc.
// No API key required — uses yahoo-finance2 npm package.
// =====================================================

import yahooFinance from 'yahoo-finance2';

// How many bars to fetch by default (must be > 200 for Hurst)
const DEFAULT_BAR_COUNT = 300;

// Simple in-memory cache for bulk scanning
const ohlcvCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map of known crypto ticker aliases to Yahoo Finance symbols
const CRYPTO_ALIAS_MAP = {
  'BTC':    'BTC-USD',
  'BTCUSD': 'BTC-USD',
  'BTCUSDT':'BTC-USD',
  'ETH':    'ETH-USD',
  'ETHUSD': 'ETH-USD',
  'ETHUSDT':'ETH-USD',
  'SOL':    'SOL-USD',
  'SOLUSD': 'SOL-USD',
  'XRP':    'XRP-USD',
  'XRPUSD': 'XRP-USD',
  'BNB':    'BNB-USD',
  'DOGE':   'DOGE-USD',
  'ADA':    'ADA-USD',
  'AVAX':   'AVAX-USD',
  'LINK':   'LINK-USD',
  'MATIC':  'MATIC-USD',
  'LTC':    'LTC-USD',
  'DOT':    'DOT-USD',
  'UNI':    'UNI-USD',
  'ATOM':   'ATOM-USD',
  'NEAR':   'NEAR-USD',
  'APT':    'APT-USD',
  'ARB':    'ARB-USD',
  'OP':     'OP-USD',
  'SUI':    'SUI-USD',
  'PEPE':   'PEPE-USD',
};

/**
 * Resolves a ticker from the AI's output to a Yahoo Finance symbol.
 * Handles crypto aliases and standard stock symbols.
 */
function resolveYahooSymbol(rawTicker) {
  if (!rawTicker) return null;
  const clean = rawTicker.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
  // Check crypto alias map first
  if (CRYPTO_ALIAS_MAP[clean]) return CRYPTO_ALIAS_MAP[clean];
  // Already has Yahoo-style suffix (e.g., "BTC-USD")
  if (clean.includes('-')) return clean;
  // Assume it's a standard stock ticker (e.g., AAPL, TSLA)
  return clean;
}

/**
 * Fetches the last N daily bars for a given ticker from Yahoo Finance.
 * Returns a clean OHLCV array sorted oldest → newest.
 *
 * @param {string} ticker - Raw ticker from AI output (e.g., "BTC", "AAPL")
 * @param {number} bars   - Number of bars to fetch (default 300)
 * @returns {{ symbol, bars: Array<{date,open,high,low,close,volume}> } | { error }}
 */
export async function fetchOHLCV(ticker, bars = DEFAULT_BAR_COUNT) {
  const symbol = resolveYahooSymbol(ticker);

  if (!symbol) {
    return { error: 'UNKNOWN_TICKER', message: `Cannot resolve ticker: ${ticker}` };
  }

  // Check cache
  const cacheKey = `${symbol}_${bars}`;
  const cached = ohlcvCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[DATA] Cache hit for ${symbol}`);
    return cached.data;
  }

  try {
    // Calculate date range — fetch extra days to account for weekends/holidays
    const endDate   = new Date();
    const startDate = new Date();
    // Add 40% buffer to ensure we get at least `bars` trading days
    startDate.setDate(endDate.getDate() - Math.ceil(bars * 1.4));

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return { error: 'NO_DATA', message: `No price data returned for ${symbol}` };
    }

    // Clean and normalize the bar data
    const ohlcv = result.quotes
      .filter(q => q.close !== null && q.open !== null)
      .map(q => ({
        date:   new Date(q.date),
        open:   q.open,
        high:   q.high,
        low:    q.low,
        close:  q.close,
        volume: q.volume || 0,
      }))
      .sort((a, b) => a.date - b.date)
      .slice(-bars); // Take only the last N bars

    if (ohlcv.length < 200) {
      return {
        error:   'INSUFFICIENT_DATA',
        message: `Only ${ohlcv.length} bars available for ${symbol}. Minimum 200 required for Hurst calculation.`,
        count:   ohlcv.length,
      };
    }

    console.log(`[DATA] Fetched ${ohlcv.length} bars for ${symbol}`);
    const finalData = { symbol, bars: ohlcv };
    ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
    return finalData;

  } catch (err) {
    console.error(`[DATA] Yahoo Finance fetch failed for ${symbol}:`, err.message);
    return { error: 'FETCH_FAILED', message: err.message };
  }
}

/**
 * Extracts closing prices from an OHLCV array.
 */
export function getClosePrices(ohlcv) {
  return ohlcv.map(b => b.close);
}

/**
 * Extracts log returns from an OHLCV array (for DFA / Hurst calculation).
 * Log return = ln(close[i] / close[i-1])
 */
export function getLogReturns(ohlcv) {
  const closes = getClosePrices(ohlcv);
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  return returns;
}
