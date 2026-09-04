const fs = require('fs');
const file = 'auditDaemon.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/const TICKER_TO_COINGECKO = {[\s\S]*?};/,
`// TICKER_TO_COINGECKO removed for 100% dynamic Binance API`
);

content = content.replace(
/\/\*\*[\s\S]*?function isCryptoTicker\(ticker\) {[\s\S]*?return !!TICKER_TO_COINGECKO\[normalized\];\n}/,
``
);

content = content.replace(
/\/\*\*[\s\S]*?async function fetchCryptoPrice\(ticker\) {[\s\S]*?return null;\n  }\n}/,
`/**
 * Fetches current price directly from Binance API (100% dynamic, zero hardcoded mapping).
 */
async function fetchBinancePrice(ticker) {
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) {
    cleanTicker = cleanTicker.replace('USD', 'USDT');
  } else if (!cleanTicker.endsWith('USDT')) {
    cleanTicker += 'USDT';
  }

  try {
    const url = \`https://api.binance.com/api/v3/ticker/price?symbol=\${cleanTicker}\`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && data.price) {
      return parseFloat(data.price);
    }
    return null;
  } catch (error) {
    console.warn(\`[AUDIT] Binance fetch failed for \${cleanTicker}:\`, error.message);
    return null;
  }
}`
);

content = content.replace(
`    if (isCryptoTicker(ticker)) {
      price = await fetchCryptoPrice(ticker);
    }`,
`    // 1. Always try Binance API first (fast, covers all crypto)
    price = await fetchBinancePrice(ticker);`
);

fs.writeFileSync(file, content);
console.log("Updated auditDaemon.js successfully");
