import fs from 'fs';

let code = fs.readFileSync('backend/dataFetcher.js', 'utf8');

// 1. Fix fetchBinanceOHLCV to throw on error instead of returning null
code = code.replace(
`    const url = \`https://api.binance.com/api/v3/klines?symbol=\${cleanTicker}&interval=\${interval}&limit=\${limit}\`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;`,
`    const url = \`https://api.binance.com/api/v3/klines?symbol=\${cleanTicker}&interval=\${interval}&limit=\${limit}\`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
       if (res.status === 429 || res.status === 418) {
           throw new Error('Binance API Rate Limit Exceeded (HTTP 429). IP Temporarily Banned.');
       }
       throw new Error(\`Binance API Error: \${res.statusText} (\${res.status})\`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error(\`No data returned from Binance for \${cleanTicker}\`);`
);

// 2. Fix isIndian to correctly identify all Indian stocks
code = code.replace(
`    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\\s+/g, ''));`,
`    const upperTicker = ticker.toUpperCase().replace(/\\s+/g, '');
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(upperTicker) || upperTicker.endsWith('.NS') || upperTicker.endsWith('.BO');`
);

fs.writeFileSync('backend/dataFetcher.js', code);
