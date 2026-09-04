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
// CRYPTO_ALIAS_MAP removed for 100% dynamic Binance API

/**
 * Resolves a ticker from the AI's output to a Yahoo Finance symbol.
 * Handles crypto aliases, Indian stock symbols (.NS), global exchanges,
 * forex pairs, and standard US stock symbols.
 *
 * GLOBAL EXCHANGE SUFFIXES (Yahoo Finance format):
 * .NS (India NSE), .BO (India BSE), .L (London), .T (Tokyo),
 * .HK (Hong Kong), .DE (Germany), .AX (Australia), .KS (Korea),
 * .TO (Toronto), .SA (Brazil), .PA (Paris), .AS (Amsterdam),
 * .SI (Singapore), .MI (Milan), .SW (Swiss), .ST (Stockholm),
 * =X (Forex pairs)
 */
export function resolveYahooSymbol(rawTicker) {
  if (!rawTicker) return null;
  const upper = rawTicker.trim().toUpperCase();

  // Handle Indian Indices Fallbacks to Yahoo format
  if (upper === 'BANKNIFTY' || upper === 'NSEBANK') return '^NSEBANK';
  if (upper === 'NIFTY' || upper === 'NIFTY50') return '^NSEI';

  // Handle Indian NSE tickers directly
  if (upper.endsWith('.NS') || upper.endsWith('.BO') || upper.startsWith('^') || upper.startsWith('NSE:')) {
    return upper.replace('NSE:', '');
  }

  // [GLOBAL] Handle all international exchange suffixes — pass through directly
  // These are already in Yahoo Finance format and need no transformation
  const GLOBAL_SUFFIXES = ['.L', '.T', '.HK', '.DE', '.AX', '.KS', '.TO', '.SA', '.PA', '.AS', '.SI', '.MI', '.SW', '.ST', '.OL', '.CO', '.HE'];
  for (const suffix of GLOBAL_SUFFIXES) {
    if (upper.endsWith(suffix)) return upper;
  }

  // [GLOBAL] Handle Forex pairs (e.g., "EURUSD=X")
  if (upper.endsWith('=X')) return upper;

  const clean = upper.replace(/[^A-Z0-9/-]/g, '');
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

/**
 * Helper: Try fetching OHLCV from Binance API first.
 */
async function fetchBinanceOHLCV(ticker, interval, limit) {
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
  else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${cleanTicker}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    
    return data.map(k => ({
      date: new Date(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (err) {
    return null;
  }
}

let _angelAdapterInstance = null;

/**
 * Helper: Try fetching OHLCV from Angel One API for Indian Markets.
 */
async function fetchAngelOneOHLCV(ticker, bars, interval = 'ONE_DAY') {
  const upper = ticker.toUpperCase().replace(/\s+/g, '');
  
  const tokenMap = {
    'NIFTY': '26000',
    'BANKNIFTY': '26009',
    'NIFTY50': '26000',
    'NSEBANK': '26009',
    '^NSEBANK': '26009',
    '^NSEI': '26000'
  };

  const symbolToken = tokenMap[upper];
  if (!symbolToken) return null;

  try {
    if (!_angelAdapterInstance) {
        const { AngelOneAdapter } = await import('./adapters/angelOneAdapter.js');
        _angelAdapterInstance = new AngelOneAdapter({
            apiKey: process.env.ANGEL_API_KEY,
            clientCode: process.env.ANGEL_CLIENT_CODE,
            password: process.env.ANGEL_PASSWORD,
            totpSecret: process.env.ANGEL_TOTP_SECRET
        });
    }

    const adapter = _angelAdapterInstance;
    const authSuccess = await adapter.authenticate();
    if (!authSuccess) {
        console.error('[DATA] Angel One Authentication failed for F&O Data fetch.');
        return null;
    }

    const toDate = new Date();
    const fromDate = new Date();
    
    // Adjust days backwards based on interval
    if (interval === 'ONE_DAY') {
        fromDate.setDate(toDate.getDate() - Math.ceil(bars * 1.5));
    } else if (interval === 'ONE_HOUR') {
        fromDate.setDate(toDate.getDate() - Math.ceil(bars / 6)); // ~6 trading hours in a day
    } else if (interval === 'FIFTEEN_MINUTE') {
        fromDate.setDate(toDate.getDate() - Math.ceil(bars / 25)); // ~25 15m candles in a day
    }

    const formatDate = (date) => {
      return date.getFullYear() + '-' + 
             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
             String(date.getDate()).padStart(2, '0') + ' 09:15';
    };

    const payload = {
        exchange: "NSE",
        symboltoken: symbolToken,
        interval: interval,
        fromdate: formatDate(fromDate),
        todate: formatDate(toDate)
    };

    const res = await adapter.smartApi.getCandleData(payload);
    
    if (res && res.status && Array.isArray(res.data) && res.data.length > 0) {
        console.log(`[DATA] Successfully fetched ${res.data.length} Native Angel One bars (${interval}) for ${upper}`);
        return res.data.map(k => ({
            date: new Date(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    }
    
    // If Angel One returns empty array for Spot Index, fail gracefully
    // We intentionally DO NOT fallback to Yahoo for Indian indices anymore per user directive
    console.warn(`[DATA] Angel One returned 0 bars for ${upper}. No fallback allowed.`);
    return null;
    
    return null;
  } catch (err) {
    console.error(`[DATA] Angel One Data Fetch Error for ${ticker}:`, err.message);
    return null;
  }
}

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
    // 0. Try Angel One API First (for Indian Indices)
    const angelData = await fetchAngelOneOHLCV(ticker, bars);
    if (angelData && angelData.length > 0) {
      if (angelData.length < 200) {
        return { error: 'INSUFFICIENT_DATA', message: `Only ${angelData.length} bars available on Angel One.`, count: angelData.length };
      }
      const finalData = { symbol: ticker, bars: angelData };
      ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
      return finalData;
    }

    // 1. Try Binance API Next (for crypto)
    const binanceData = await fetchBinanceOHLCV(ticker, '1d', bars);
    if (binanceData && binanceData.length > 0) {
      if (binanceData.length < 200) {
        return { error: 'INSUFFICIENT_DATA', message: `Only ${binanceData.length} bars available on Binance.`, count: binanceData.length };
      }
      const finalData = { symbol: ticker, bars: binanceData };
      ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
      console.log(`[DATA] Fetched ${binanceData.length} bars for ${ticker} from Binance API`);
      return finalData;
    }

    // 2. Fallback to Yahoo Finance (ONLY for US/Global Stocks)
    const isCrypto = ticker.toUpperCase().includes('USD') || ticker.toUpperCase().includes('USDT');
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\s+/g, ''));
    
    if (isCrypto || isIndian) {
      // User Directive: Remove Yahoo Finance fallback for Crypto and AngelOne completely
      return { error: 'NO_DATA', message: `No valid native API data found for ${ticker}. Yahoo fallback disabled for this asset class.` };
    }

    const endDate = new Date();
    const startDate = new Date();
    // Add 40% buffer to ensure we get at least `bars` trading days
    startDate.setDate(endDate.getDate() - Math.ceil(bars * 1.4));

    const result = await yahooFinance.chart(symbol, {
      period1: startDate.toISOString().split('T')[0],
      interval: '1d',
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return { error: 'NO_DATA', message: `No price data returned for ${symbol}` };
    }

    // Clean and normalize the bar data
    const ohlcv = result.quotes
      .filter(q => q.close !== null && q.open !== null)
      .map(q => ({
        date: new Date(q.date),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume || 0,
      }))
      .sort((a, b) => a.date - b.date)
      .slice(-bars); // Take only the last N bars

    if (ohlcv.length < 200) {
      return {
        error: 'INSUFFICIENT_DATA',
        message: `Only ${ohlcv.length} bars available for ${symbol}. Minimum 200 required for Hurst calculation.`,
        count: ohlcv.length,
      };
    }

    console.log(`[DATA] Fetched ${ohlcv.length} bars for ${symbol}`);
    const finalData = { symbol, bars: ohlcv };
    ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
    return finalData;

  } catch (err) {
    console.error(`[DATA] Data fetch failed for ${symbol}:`, err.message);
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
    // 0. Try Angel One (Indian Indices)
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\s+/g, ''));
    if (isIndian) {
       const [angel15m, angel1h, angel1d] = await Promise.all([
          fetchAngelOneOHLCV(ticker, bars, 'FIFTEEN_MINUTE').catch(() => null),
          fetchAngelOneOHLCV(ticker, bars, 'ONE_HOUR').catch(() => null),
          fetchAngelOneOHLCV(ticker, bars, 'ONE_DAY').catch(() => null)
       ]);

       if (angel15m && angel1h && angel1d && angel1d.length >= 200) {
          const finalData = { symbol: ticker, timeframes: { '15m': angel15m, '1h': angel1h, '1d': angel1d } };
          ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
          console.log(`[DATA] Multi-TF Fetched natively from Angel One for ${ticker}`);
          return finalData;
       } else {
          return { error: 'NO_DATA', message: `Angel One failed to return complete multi-TF data for ${ticker}. Yahoo fallback strictly disabled.` };
       }
    }

    // 1. Try Binance (Crypto)
    const [binance15m, binance1h, binance1d] = await Promise.all([
      fetchBinanceOHLCV(ticker, '15m', bars),
      fetchBinanceOHLCV(ticker, '1h', bars),
      fetchBinanceOHLCV(ticker, '1d', bars)
    ]);
    
    if (binance15m && binance1h && binance1d && binance1d.length >= 200) {
      const finalData = {
        symbol: ticker,
        timeframes: { '15m': binance15m, '1h': binance1h, '1d': binance1d }
      };
      ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
      console.log(`[DATA] Multi-TF Fetched from Binance for ${ticker}`);
      return finalData;
    }

    const isCrypto = ticker.toUpperCase().includes('USD') || ticker.toUpperCase().includes('USDT');
    if (isCrypto) {
      return { error: 'NO_DATA', message: `Binance failed to return data for ${ticker}. Yahoo fallback strictly disabled.` };
    }

    // 2. Fallback to Yahoo Finance (ONLY US/Global Stocks)
    const endDate = new Date();
    const startDate1d = new Date();
    startDate1d.setDate(endDate.getDate() - Math.ceil(bars * 1.4));

    const startDate1h = new Date();
    const days1h = Math.min(720, Math.ceil((bars * 1.4) / 24) + 2);
    startDate1h.setDate(endDate.getDate() - days1h);

    const startDate15m = new Date();
    const days15m = Math.min(58, Math.ceil((bars * 1.4) / 96) + 2);
    startDate15m.setDate(endDate.getDate() - days15m);

    const [res15m, res1h, res1d] = await Promise.all([
      yahooFinance.chart(symbol, { period1: startDate15m.toISOString().split('T')[0], interval: '15m' }).catch(() => null),
      yahooFinance.chart(symbol, { period1: startDate1h.toISOString().split('T')[0], interval: '1h' }).catch(() => null),
      yahooFinance.chart(symbol, { period1: startDate1d.toISOString().split('T')[0], interval: '1d' }).catch(() => null)
    ]);

    const formatData = (res) => {
      if (!res || !res.quotes || res.quotes.length === 0) return null;
      return res.quotes
        .filter(q => q.close !== null && q.open !== null)
        .map(q => ({
          date: new Date(q.date),
          open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume || 0,
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

    console.log(`[DATA] Fetched Multi-TF for ${symbol} via Yahoo (15m: ${tf15m.length}, 1h: ${tf1h.length}, 1d: ${tf1d.length})`);

    const finalData = {
      symbol,
      timeframes: { '15m': tf15m, '1h': tf1h, '1d': tf1d }
    };

    ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
    return finalData;

  } catch (err) {
    console.error(`[DATA] Multi-TF fetch failed for ${symbol}:`, err.message);
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
    // 1. Try Binance First
    let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
    else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';
    
    const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanTicker}`).catch(()=>null);
    if (binanceRes && binanceRes.ok) {
      const bData = await binanceRes.json();
      if (bData && bData.price) return parseFloat(bData.price);
    }
    
    // 2. Fallback to Yahoo
    const symbol = resolveYahooSymbol(ticker);
    if (!symbol) return null;
    const quote = await yahooFinance.quote(symbol);
    return quote?.regularMarketPrice || null;
  } catch (error) {
    console.error(`[DATA] Live price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

