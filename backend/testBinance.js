import { fetchBinanceOHLCV } from './dataFetcher.js';
fetchBinanceOHLCV("BNB-USD", "1d", 1000).then(res => console.log(res ? res.length : "null")).catch(e => console.log(e));
