// =====================================================
// DATA FETCHER — Yahoo Finance OHLCV Ingestion
// Fetches raw price bars needed for Hurst + Regime calc.
// No API key required — uses yahoo-finance2 npm package.
// =====================================================

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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
  'MATIC':  'POL-USD',
  'LTC':    'LTC-USD',
  'DOT':    'DOT-USD',
  'UNI':    'UNI7083-USD',
  'ATOM':   'ATOM-USD',
  'NEAR':   'NEAR-USD',
  'APT':    'APT21794-USD',
  'ARB':    'ARB-USD',
  'OP':     'OP-USD',
  'SUI':    'SUI-USD',
  'PEPE':   'PEPE24478-USD',
};

/**
 * Resolves a ticker from the AI's output to a Yahoo Finance symbol.
 * Handles crypto aliases, Indian stock symbols (.NS), and standard stock symbols.
 */
export function resolveYahooSymbol(rawTicker) {
  if (!rawTicker) return null;
  const upper = rawTicker.trim().toUpperCase();
  
  // Handle Indian NSE tickers directly
  if (upper.endsWith('.NS') || upper.endsWith('.BO') || upper.startsWith('^') || upper.startsWith('NSE:')) {
    return upper.replace('NSE:', '');
  }

  const clean = upper.replace(/[^A-Z0-9/-]/g, '');
  // Check crypto alias map first
  if (CRYPTO_ALIAS_MAP[clean]) return CRYPTO_ALIAS_MAP[clean];
  // Already has Yahoo-style suffix (e.g., "BTC-USD")
  if (clean.includes('-')) return clean;
  // Assume it's a standard stock ticker
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
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
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
 * Fetches multiple timeframes concurrently for the Multi-Dimensional Matrix.
 * Returns 15m, 1h, and 1d OHLCV data arrays.
 */
export async function fetchMultiTimeframeOHLCV(ticker, bars = DEFAULT_BAR_COUNT) {
  const symbol = resolveYahooSymbol(ticker);
  if (!symbol) return { error: 'UNKNOWN_TICKER', message: `Cannot resolve ticker: ${ticker}` };

  const cacheKey = `${symbol}_multi_${bars}`;
  const cached = ohlcvCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[DATA] Multi-TF Cache hit for ${symbol}`);
    return cached.data;
  }

  try {
    const endDate = new Date();
    
    // Dates for 1d (needs ~1.4x bars in days)
    const startDate1d = new Date();
    startDate1d.setDate(endDate.getDate() - Math.ceil(bars * 1.4));
    
    // Dates for 1h (needs ~1.4x bars in hours -> / 24 days)
    // Add extra buffer for weekends (crypto trades 24/7, stocks don't)
    const startDate1h = new Date();
    const days1h = Math.min(720, Math.ceil((bars * 1.4) / 24) + 2);
    startDate1h.setDate(endDate.getDate() - days1h); 
    
    // Dates for 15m (needs ~1.4x bars in 15m chunks -> / 96 days)
    const startDate15m = new Date();
    const days15m = Math.min(58, Math.ceil((bars * 1.4) / 96) + 2);
    startDate15m.setDate(endDate.getDate() - days15m);

    const [res15m, res1h, res1d] = await Promise.all([
      yahooFinance.chart(symbol, { period1: startDate15m.toISOString().split('T')[0], period2: endDate.toISOString().split('T')[0], interval: '15m' }).catch(() => null),
      yahooFinance.chart(symbol, { period1: startDate1h.toISOString().split('T')[0], period2: endDate.toISOString().split('T')[0], interval: '1h' }).catch(() => null),
      yahooFinance.chart(symbol, { period1: startDate1d.toISOString().split('T')[0], period2: endDate.toISOString().split('T')[0], interval: '1d' }).catch(() => null)
    ]);

    const formatData = (res) => {
      if (!res || !res.quotes || res.quotes.length === 0) return null;
      return res.quotes
        .filter(q => q.close !== null && q.open !== null)
        .map(q => ({
          date:   new Date(q.date),
          open:   q.open, high: q.high, low: q.low, close: q.close, volume: q.volume || 0,
        }))
        .sort((a, b) => a.date - b.date)
        .slice(-bars);
    };

    const tf15m = formatData(res15m);
    const tf1h = formatData(res1h);
    const tf1d = formatData(res1d);

    if (!tf15m || !tf1h || !tf1d) {
      return { error: 'NO_DATA', message: `Missing timeframe data for ${symbol}. (15m: ${!!tf15m}, 1h: ${!!tf1h}, 1d: ${!!tf1d})` };
    }

    if (tf1d.length < 200) {
      return { error: 'INSUFFICIENT_DATA', message: `Only ${tf1d.length} 1d bars available. Minimum 200 required.` };
    }

    console.log(`[DATA] Fetched Multi-TF for ${symbol} (15m: ${tf15m.length}, 1h: ${tf1h.length}, 1d: ${tf1d.length})`);
    
    const finalData = { 
      symbol, 
      timeframes: { '15m': tf15m, '1h': tf1h, '1d': tf1d } 
    };
    
    ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
    return finalData;

  } catch (err) {
    console.error(`[DATA] Yahoo Finance Multi-TF fetch failed for ${symbol}:`, err.message);
    return { error: 'FETCH_FAILED', message: err.message };
  }
}

/**
 * Extracts closing prices from an OHLCV array.
 */
export function getClosePrices(ohlcv) {
  return ohlcv.map(b => b.close);
}

export function getLogReturns(ohlcv) {
  const closes = getClosePrices(ohlcv);
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    const current = closes[i];
    const prev = closes[i - 1];
    
    // Failsafe against exchange data gaps (0 or NaN) preventing NaN poisoning in regression models
    if (!current || !prev || prev === 0 || isNaN(current) || isNaN(prev)) {
      returns.push(0);
    } else {
      returns.push(Math.log(current / prev));
    }
  }
  return returns;
}

/**
 * Fetches the current live price using Yahoo Finance.
 */
export async function fetchLivePrice(ticker) {
  try {
    const symbol = resolveYahooSymbol(ticker);
    if (!symbol) return null;
    const quote = await yahooFinance.quote(symbol);
    return quote?.regularMarketPrice || null;
  } catch (error) {
    console.error(`[DATA] Live price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

