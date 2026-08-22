import { fetchMultiTimeframeOHLCV, fetchOHLCV, fetchLivePrice } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { getClosePrices } from './dataFetcher.js';

async function test() {
    console.log("Fetching Multi-TF Data...");
    const data = await fetchMultiTimeframeOHLCV('BTC');
    if (data.error) {
        console.error("Error:", data);
        return;
    }
    
    const tf15m = data.timeframes['15m'];
    const tf1h = data.timeframes['1h'];
    const tf1d = data.timeframes['1d'];
    
    console.log(`Fetched 15m: ${tf15m.length}, 1h: ${tf1h.length}, 1d: ${tf1d.length}`);
    const last1h = tf1h[tf1h.length - 1];
    console.log("Last 1H candle:", last1h.date, "Close:", last1h.close);
    
    console.log("Fetching Live Price...");
    const livePrice = await fetchLivePrice('BTC');
    console.log("True Live Price:", livePrice);
    
    console.log("Generating Signal...");
    const signal = await generateSignal('BTC', tf1d, {
        candles15m: tf15m,
        candles1h: tf1h,
        livePrice: livePrice
    });
    
    console.log("Signal Action:", signal.action);
    console.log("Signal Direction:", signal.direction);
    console.log("Current Price inside Signal:", signal.currentPrice);
    if (signal.action !== 'SHIELD_MODE') {
        console.log("Stop Loss:", signal.stopLoss);
        console.log("Take Profit:", signal.takeProfit);
    } else {
        console.log("Reason:", signal.reason);
    }
}

test();
