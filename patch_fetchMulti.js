import fs from 'fs';

let code = fs.readFileSync('backend/dataFetcher.js', 'utf8');

code = code.replace(
`    const upperTicker = ticker.toUpperCase().replace(/\\s+/g, '');
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(upperTicker) || upperTicker.endsWith('.NS') || upperTicker.endsWith('.BO');
    if (isIndian) {
       const angel15m = await fetchAngelOneOHLCV(ticker, bars, 'FIFTEEN_MINUTE').catch(() => null);
       const angel1h  = await fetchAngelOneOHLCV(ticker, bars, 'ONE_HOUR').catch(() => null);
       const angel1d  = await fetchAngelOneOHLCV(ticker, bars, 'ONE_DAY').catch(() => null);

       if (angel15m && angel1h && angel1d && angel1d.length >= 200) {
          const finalData = { symbol: ticker, timeframes: { '15m': angel15m, '1h': angel1h, '1d': angel1d } };
          ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
          console.log(\`[DATA] Multi-TF Fetched natively from Angel One for \${ticker}\`);
          return finalData;
       } else {
          return { error: 'NO_DATA', message: \`Angel One failed to return complete multi-TF data for \${ticker}.\` };
       }
    }`,
`    const originalUpper = symbol.toUpperCase().replace(/\\s+/g, '');
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(originalUpper) || originalUpper.endsWith('.NS') || originalUpper.endsWith('.BO');
    if (isIndian) {
       const angel15m = await fetchAngelOneOHLCV(symbol, bars, 'FIFTEEN_MINUTE').catch(() => null);
       const angel1h  = await fetchAngelOneOHLCV(symbol, bars, 'ONE_HOUR').catch(() => null);
       const angel1d  = await fetchAngelOneOHLCV(symbol, bars, 'ONE_DAY').catch(() => null);

       if (angel15m && angel1h && angel1d && angel1d.length >= 200) {
          const finalData = { symbol: ticker, timeframes: { '15m': angel15m, '1h': angel1h, '1d': angel1d } };
          ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
          console.log(\`[DATA] Multi-TF Fetched natively from Angel One for \${symbol}\`);
          return finalData;
       } else {
          return { error: 'NO_DATA', message: \`Angel One failed to return complete multi-TF data for \${symbol}.\` };
       }
    }`
);

fs.writeFileSync('backend/dataFetcher.js', code);
