import fs from 'fs';

let code = fs.readFileSync('backend/dataFetcher.js', 'utf8');

code = code.replace(
`    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\\s+/g, ''));
    if (isIndian) {`,
`    const upperTicker = ticker.toUpperCase().replace(/\\s+/g, '');
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(upperTicker) || upperTicker.endsWith('.NS') || upperTicker.endsWith('.BO');
    if (isIndian) {`
);

fs.writeFileSync('backend/dataFetcher.js', code);
