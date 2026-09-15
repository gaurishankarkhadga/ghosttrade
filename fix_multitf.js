const fs = require('fs');
const path = 'backend/dataFetcher.js';
let content = fs.readFileSync(path, 'utf8');

// Find the isIndian block
const findTarget = "    if (isIndian) {\n       const angel15m = await fetchAngelOneOHLCV(symbol, bars, 'FIFTEEN_MINUTE').catch(() => null);";
const replaceTarget = `    // 0.5 Try Local DB (for Nepal Stocks)
    if (ticker.toUpperCase().endsWith('.NP')) {
      const { fetchNepseOHLCV } = await import('./adapters/nepseAdapter.js').catch(() => ({ fetchNepseOHLCV: null }));
      if (fetchNepseOHLCV) {
        const nepseData = await fetchNepseOHLCV(symbol, bars);
        if (nepseData && nepseData.length >= 50) {
          // Nepal only supports EOD (1D) data for now, so we approximate lower TFs using 1D
          const finalData = { symbol: ticker, timeframes: { '15m': nepseData, '1h': nepseData, '1d': nepseData } };
          ohlcvCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
          return finalData;
        }
      }
      return { 
        error: 'UNSUPPORTED_REGION', 
        message: \`Local DB has no data for \${ticker}. Background worker needs to sync.\`,
        status: 'standby'
      };
    }

    if (isIndian) {
       const angel15m = await fetchAngelOneOHLCV(symbol, bars, 'FIFTEEN_MINUTE').catch(() => null);`;

content = content.replace(findTarget, replaceTarget);
fs.writeFileSync(path, content);
