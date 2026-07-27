// =====================================================
// WEBSOCKET ENGINE — Phase 7 Live Data Pipeline
// Connects to Binance Combined TCP Streams for 0-latency.
// Maintains a central Memory Cache that the Scanner reads.
// Non-blocking: Handles Cloud Server (Render/AWS) 451 Legal Blocks gracefully.
// =====================================================

import WebSocket from 'ws';
import { DEFAULT_CRYPTO_WATCHLIST } from './scannerEngine.js';

// Centralized Memory Cache (0-latency access)
export const liveMemoryState = {
    depth: {},      // { 'BTC-USD': { bids: [], asks: [], timestamp: 12345 } }
    aggTrades: {},  // { 'BTC-USD': [{ price, qty, maker, time }] }
    status: 'DISCONNECTED'
};

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

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
 * Initializes the WebSocket connection. Non-blocking Promise to ensure server daemon never hangs.
 */
export function startWebSocketPipeline(tickers = DEFAULT_CRYPTO_WATCHLIST) {
    return new Promise((resolve) => {
        if (ws) {
            console.log(`[WEBSOCKET] Pipeline already running.`);
            return resolve();
        }

        console.log(`[WEBSOCKET] Booting Sub-Millisecond Data Pipeline...`);
        
        // Safety resolve after 2.5 seconds so daemon execution loop NEVER gets blocked on cloud hosts
        const safetyTimer = setTimeout(() => {
            console.warn(`[WEBSOCKET] Pipeline initialization timed out (Cloud IP restriction). Continuing in Fallback Mode.`);
            resolve();
        }, 2500);

        try {
            const streams = tickers.flatMap(t => [
                `${normalizeToStream(t)}@depth20@100ms`,
                `${normalizeToStream(t)}@aggTrade`
            ]);
            const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
            
            ws = new WebSocket(streamUrl);

            ws.on('open', () => {
                clearTimeout(safetyTimer);
                liveMemoryState.status = 'CONNECTED';
                reconnectAttempts = 0;
                console.log(`[WEBSOCKET] Connected directly to Binance TCP Combined Stream.`);
                console.log(`[WEBSOCKET] Streaming ${streams.length} assets at 100ms intervals.`);
                resolve();
            });

            ws.on('message', (data) => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.stream && parsed.data) {
                        const ticker = normalizeFromStream(parsed.stream);
                        
                        // Handle Depth payloads
                        if (parsed.stream.includes('@depth')) {
                            liveMemoryState.depth[ticker] = {
                                bids: parsed.data.bids || [],
                                asks: parsed.data.asks || [],
                                timestamp: Date.now()
                            };
                        }
                        
                        // Handle AggTrade payloads
                        if (parsed.stream.includes('@aggTrade')) {
                            if (!liveMemoryState.aggTrades[ticker]) {
                                liveMemoryState.aggTrades[ticker] = [];
                            }
                            liveMemoryState.aggTrades[ticker].push({
                                price: parseFloat(parsed.data.p),
                                qty: parseFloat(parsed.data.q),
                                maker: parsed.data.m, // true if maker (sell), false if taker (buy)
                                time: parsed.data.T
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[WEBSOCKET] Parse error:`, err.message);
                }
            });
            
            // V8 Garbage Collector - Ring Buffer for AggTrades
            // Runs every 10 seconds to forcefully evict trades older than 15 minutes, preventing RAM overflow
            setInterval(() => {
                const cutoff = Date.now() - (15 * 60 * 1000); // 15 mins
                for (const ticker of Object.keys(liveMemoryState.aggTrades)) {
                    const trades = liveMemoryState.aggTrades[ticker];
                    if (!trades || trades.length === 0) continue;
                    
                    let sliceIdx = 0;
                    while (sliceIdx < trades.length && trades[sliceIdx].time < cutoff) { 
                        sliceIdx++; 
                    }
                    if (sliceIdx > 0) {
                        liveMemoryState.aggTrades[ticker] = trades.slice(sliceIdx);
                    }
                }
            }, 10000);

            ws.on('close', () => {
                liveMemoryState.status = 'DISCONNECTED';
                ws = null;
                
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`[WEBSOCKET] Connection dropped. Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in 5s...`);
                    setTimeout(() => startWebSocketPipeline(tickers), 5000);
                } else {
                    console.warn(`[WEBSOCKET] Reached max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}). Remaining in REST/Yahoo Fallback Mode.`);
                }
            });

            ws.on('error', (err) => {
                clearTimeout(safetyTimer);
                console.error(`[WEBSOCKET] Cloud Connection Warning: ${err.message}. (Cloud host IPs like Render/AWS use Yahoo REST Fallback).`);
                resolve();
            });
        } catch (e) {
            clearTimeout(safetyTimer);
            console.error(`[WEBSOCKET] Failed to initialize WebSocket:`, e.message);
            resolve();
        }
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
