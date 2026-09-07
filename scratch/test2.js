import { fetchMultiTimeframeOHLCV } from '../backend/dataFetcher.js';

async function main() {
    const btc = await fetchMultiTimeframeOHLCV('BTC-USD', 300);
    console.log("BTC-USD:", btc.error, btc.message, btc.status);
    if (btc.timeframes) {
       console.log("BTC lengths:", btc.timeframes['1d']?.length, btc.timeframes['1h']?.length, btc.timeframes['15m']?.length);
    }
    
    const rel = await fetchMultiTimeframeOHLCV('RELIANCE.NS', 300);
    console.log("RELIANCE.NS:", rel.error, rel.message, rel.status);
    
    const nifty = await fetchMultiTimeframeOHLCV('NIFTY', 300);
    console.log("NIFTY:", nifty.error, nifty.message, nifty.status);
}

main().catch(console.error);
