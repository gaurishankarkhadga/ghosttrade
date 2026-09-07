import fs from 'fs';

let code = fs.readFileSync('backend/dataFetcher.js', 'utf8');

code = code.replace(
`  const tokenMap = {
    'NIFTY': '26000',
    'BANKNIFTY': '26009',
    'NIFTY50': '26000',
    'NSEBANK': '26009',
    '^NSEBANK': '26009',
    '^NSEI': '26000'
  };`,
`  const tokenMap = {
    'NIFTY': '26000',
    'BANKNIFTY': '26009',
    'NIFTY50': '26000',
    'NSEBANK': '26009',
    '^NSEBANK': '26009',
    '^NSEI': '26000',
    'RELIANCE.NS': '2885',
    'TCS.NS': '11536',
    'HDFCBANK.NS': '1333',
    'INFY.NS': '1594',
    'ICICIBANK.NS': '4963',
    'SBIN.NS': '3045'
  };`
);

fs.writeFileSync('backend/dataFetcher.js', code);
