const fs = require('fs');
const file = 'dataFetcher.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove CRYPTO_ALIAS_MAP completely
content = content.replace(
/const CRYPTO_ALIAS_MAP = {[\s\S]*?};\n/,
`// CRYPTO_ALIAS_MAP removed for 100% dynamic Binance API\n`
);

// 2. Remove CRYPTO_ALIAS_MAP check from resolveYahooSymbol
content = content.replace(
/  \/\/ Check crypto alias map first\n  if \(CRYPTO_ALIAS_MAP\[clean\]\) return CRYPTO_ALIAS_MAP\[clean\];\n/,
``
);

// 3. Add fetchBinanceOHLCV helper
const binanceHelper = `
/**
 * Helper: Try fetching OHLCV from Binance API first.
 */
async function fetchBinanceOHLCV(ticker, interval, limit) {
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
  else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';

  try {
    const url = \`https://api.binance.com/api/v3/klines?symbol=\${cleanTicker}&interval=\${interval}&limit=\${limit}\`;
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
`;

content = content.replace(
/export async function fetchOHLCV/,
binanceHelper + '\nexport async function fetchOHLCV'
);

// 4. Update fetchOHLCV to try Binance first
content = content.replace(
/    \/\/ Calculate date range — fetch extra days to account for weekends\/holidays/,
`    // 1. Try Binance API First (for crypto)
    const binanceData = await fetchBinanceOHLCV(ticker, '1d', bars);
    if (binanceData && binanceData.length > 0) {
      if (binanceData.length < 200) {
        return { error: 'INSUFFICIENT_DATA', message: \`Only \${binanceData.length} bars available on Binance.\`, count: binanceData.length };
      }
      const finalData = { symbol: ticker, bars: binanceData };
      ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
      console.log(\`[DATA] Fetched \${binanceData.length} bars for \${ticker} from Binance API\`);
      return finalData;
    }

    // 2. Fallback to Yahoo Finance
    // Calculate date range — fetch extra days to account for weekends/holidays`
);

// 5. Update fetchMultiTimeframeOHLCV to try Binance first
content = content.replace(
/    const endDate = new Date\(\);/,
`    // 1. Try Binance API First
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
      console.log(\`[DATA] Multi-TF Fetched from Binance for \${ticker}\`);
      return finalData;
    }

    // 2. Fallback to Yahoo Finance
    const endDate = new Date();`
);

// 6. Update fetchLivePrice to try Binance first
content = content.replace(
/export async function fetchLivePrice\(ticker\) {\n  try {\n    const symbol = resolveYahooSymbol\(ticker\);/,
`export async function fetchLivePrice(ticker) {
  try {
    // 1. Try Binance First
    let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
    else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';
    
    const binanceRes = await fetch(\`https://api.binance.com/api/v3/ticker/price?symbol=\${cleanTicker}\`).catch(()=>null);
    if (binanceRes && binanceRes.ok) {
      const bData = await binanceRes.json();
      if (bData && bData.price) return parseFloat(bData.price);
    }
    
    // 2. Fallback to Yahoo
    const symbol = resolveYahooSymbol(ticker);`
);

fs.writeFileSync(file, content);
console.log("Updated dataFetcher.js successfully");
