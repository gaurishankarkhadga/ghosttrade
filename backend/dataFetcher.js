// =====================================================
// DATA FETCHER — 100% Native Market Data Ingestion
// Direct Binance API (Crypto) & Angel One SmartAPI (NSE/NFO).
// Zero third-party scraping / Zero Yahoo Finance.
// =====================================================

// How many bars to fetch by default (must be > 200 for Hurst)
const DEFAULT_BAR_COUNT = 300;

// Simple in-memory cache for bulk scanning
const ohlcvCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalizes a raw ticker to clean standard format.
 * Exported as resolveYahooSymbol and resolveSymbol for backward compatibility.
 */
export function resolveYahooSymbol(rawTicker) {
  if (!rawTicker) return null;
  let upper = rawTicker.trim().toUpperCase();

  // Handle Indian Indices
  if (upper === 'BANKNIFTY' || upper === 'NSEBANK' || upper === '^NSEBANK') return 'BANKNIFTY';
  if (upper === 'NIFTY' || upper === 'NIFTY50' || upper === '^NSEI') return 'NIFTY';

  // Handle Indian NSE tickers directly
  if (upper.startsWith('NSE:')) upper = upper.replace('NSE:', '');
  if (upper.endsWith('.NS') || upper.endsWith('.BO')) upper = upper.replace(/\.(NS|BO)$/, '');

  // Handle Crypto formatting
  if (upper.endsWith('-USD')) upper = upper.replace('-USD', 'USDT');
  if (upper.endsWith('/USDT')) upper = upper.replace('/USDT', 'USDT');
  if (upper.endsWith('/USD')) upper = upper.replace('/USD', 'USDT');

  return upper.replace(/[^A-Z0-9]/g, '');
}

export const resolveSymbol = resolveYahooSymbol;

/**
 * Helper: Try fetching OHLCV from Binance API first.
 */
export async function fetchBinanceOHLCV(ticker, interval, limit) {
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
  else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${cleanTicker}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
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
export async function fetchAngelOneOHLCV(ticker, bars, interval = 'ONE_DAY') {
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
    
    console.warn(`[DATA] Angel One returned 0 bars for ${upper}. No fallback allowed.`);
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
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\s+/g, ''));
    if (isIndian) {
      const angelData = await fetchAngelOneOHLCV(ticker, bars);
      if (angelData && angelData.length > 0) {
        if (angelData.length < 200) {
          return { error: 'INSUFFICIENT_DATA', message: `Only ${angelData.length} bars available on Angel One.`, count: angelData.length };
        }
        const finalData = { symbol: ticker, bars: angelData };
        ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
        return finalData;
      }
      return { error: 'NO_DATA', message: `Angel One failed to return data for ${ticker}. Yahoo fallback disabled.` };
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

    return { error: 'NO_DATA', message: `No valid native API data found for ${ticker}. Supported: Binance (Crypto) & Angel One (Indian Markets).` };
  } catch (err) {
    console.error(`[DATA] Native data fetch failed for ${symbol}:`, err.message);
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

    return { error: 'NO_DATA', message: `No complete multi-TF data found for ${ticker}. Supported: Binance (Crypto) & Angel One (Indian Markets).` };
  } catch (err) {
    console.error(`[DATA] Native Multi-TF fetch failed for ${symbol}:`, err.message);
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

    if (!current || !prev || prev === 0 || isNaN(current) || isNaN(prev)) {
      returns.push(0);
    } else {
      returns.push(Math.log(current / prev));
    }
  }
  return returns;
}

/**
 * Fetches the current live price using 100% native APIs (Binance for Crypto, Angel One for Indian assets).
 */
export async function fetchLivePrice(ticker) {
  try {
    // 1. Try Binance First (Crypto)
    let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
    else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';
    
    const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanTicker}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (binanceRes && binanceRes.ok) {
      const bData = await binanceRes.json();
      if (bData && bData.price) return parseFloat(bData.price);
    }
    
    // 2. Try Angel One for Indian Assets
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\s+/g, ''));
    if (isIndian) {
      const bars = await fetchAngelOneOHLCV(ticker, 1, 'ONE_DAY');
      if (bars && bars.length > 0) {
        return bars[bars.length - 1].close;
      }
    }

    return null;
  } catch (error) {
    console.error(`[DATA] Live price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}
