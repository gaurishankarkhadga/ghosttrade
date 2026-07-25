// =====================================================
// WEBSOCKET ENGINE — Phase 7 Live Data Pipeline
// Connects to Binance Combined TCP Streams for 0-latency.
// Maintains a central Memory Cache that the Scanner reads.
// =====================================================

import WebSocket from 'ws';

// Centralized Memory Cache (0-latency access)
export const liveMemoryState = {
    depth: {},  // { 'BTC-USD': { bids: [], asks: [], timestamp: 12345 } }
    status: 'DISCONNECTED'
};

let ws = null;

const TICKER_TO_BINANCE = {
    'BTC-USD': 'btcusdt',
    'ETH-USD': 'ethusdt',
    'SOL-USD': 'solusdt',
    'XRP-USD': 'xrpusdt',
    'DOGE-USD': 'dogeusdt'
};

const BINANCE_TO_TICKER = {
    'btcusdt': 'BTC-USD',
    'ethusdt': 'ETH-USD',
    'solusdt': 'SOL-USD',
    'xrpusdt': 'XRP-USD',
    'dogeusdt': 'DOGE-USD'
};

function normalizeToStream(ticker) {
    return TICKER_TO_BINANCE[ticker] || ticker.replace('-', '').toLowerCase(); 
}

function normalizeFromStream(streamStr) {
    const rawSymbol = streamStr.split('@')[0];
    return BINANCE_TO_TICKER[rawSymbol] || `${rawSymbol.toUpperCase()}-USD`;
}

/**
 * Initializes the WebSocket connection and subscribes to streams.
 */
export function startWebSocketPipeline(tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD']) {
    return new Promise((resolve, reject) => {
        if (ws) {
            console.log(`[WEBSOCKET] Pipeline already running.`);
            return resolve();
        }

        console.log(`[WEBSOCKET] Booting Sub-Millisecond Data Pipeline...`);
        
        // Build combined stream URL
        const streams = tickers.map(t => `${normalizeToStream(t)}@depth20@100ms`);
        const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
        
        ws = new WebSocket(streamUrl);

        ws.on('open', () => {
            liveMemoryState.status = 'CONNECTED';
            console.log(`[WEBSOCKET] Connected directly to Binance TCP Combined Stream.`);
            console.log(`[WEBSOCKET] Streaming ${streams.length} assets at 100ms intervals.`);
            resolve();
        });

        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data);
                
                // Route Level 2 Depth data into the Central Memory Cache
                if (parsed.stream && parsed.data && parsed.data.bids) {
                    const ticker = normalizeFromStream(parsed.stream);
                    
                    // Update cache instantly
                    liveMemoryState.depth[ticker] = {
                        bids: parsed.data.bids,
                        asks: parsed.data.asks,
                        timestamp: Date.now()
                    };
                }
            } catch (err) {
                console.error(`[WEBSOCKET] Parse error:`, err.message);
            }
        });

        ws.on('close', () => {
            console.log(`[WEBSOCKET] Connection dropped. Auto-reconnecting in 2s...`);
            liveMemoryState.status = 'DISCONNECTED';
            ws = null;
            setTimeout(() => startWebSocketPipeline(tickers), 2000);
        });

        ws.on('error', (err) => {
            console.error(`[WEBSOCKET] Fatal Error:`, err.message);
            ws.close();
        });
    });
}

/**
 * Instantly retrieves the Level 2 depth from memory.
 * Zero HTTP latency.
 */
export function getLiveDepthFromMemory(ticker) {
    if (!liveMemoryState.depth[ticker]) {
         return { error: 'DATA_NOT_IN_CACHE', message: `No live WebSocket data for ${ticker} yet.` };
    }
    return liveMemoryState.depth[ticker];
}

