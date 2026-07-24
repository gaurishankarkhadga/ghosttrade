// =====================================================
// ORDER FLOW ENGINE — Real-Time Buy/Sell Volume Analysis
// Connects to Binance WebSocket for trade-level data.
// Provides aggressor-side volume delta, whale detection,
// and trade velocity metrics to the AI.
// =====================================================

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

// Simple in-memory cache for bulk scanning
const orderFlowCache = new Map();
const FLOW_CACHE_TTL_MS = 60 * 1000; // 1 minute

// Ticker → Binance symbol mapping
const TICKER_TO_BINANCE = {
  'BTC': 'btcusdt', 'BTCUSD': 'btcusdt', 'BTCUSDT': 'btcusdt', 'BTC/USD': 'btcusdt', 'BTC/USDT': 'btcusdt', 'BTC-USD': 'btcusdt',
  'ETH': 'ethusdt', 'ETHUSD': 'ethusdt', 'ETHUSDT': 'ethusdt', 'ETH/USD': 'ethusdt', 'ETH/USDT': 'ethusdt', 'ETH-USD': 'ethusdt',
  'SOL': 'solusdt', 'SOLUSD': 'solusdt', 'SOL/USDT': 'solusdt', 'SOL-USD': 'solusdt',
  'XRP': 'xrpusdt', 'XRPUSD': 'xrpusdt', 'XRP-USD': 'xrpusdt',
  'DOGE': 'dogeusdt', 'DOGE-USD': 'dogeusdt',
  'ADA': 'adausdt', 'ADA-USD': 'adausdt',
  'AVAX': 'avaxusdt', 'AVAX-USD': 'avaxusdt',
  'DOT': 'dotusdt', 'DOT-USD': 'dotusdt',
  'LINK': 'linkusdt', 'LINK-USD': 'linkusdt',
  'MATIC': 'maticusdt', 'MATIC-USD': 'maticusdt',
  'BNB': 'bnbusdt', 'BNB-USD': 'bnbusdt',
  'LTC': 'ltcusdt', 'LTC-USD': 'ltcusdt',
  'ATOM': 'atomusdt', 'UNI': 'uniusdt', 'NEAR': 'nearusdt',
  'APT': 'aptusdt', 'ARB': 'arbusdt', 'OP': 'opusdt',
  'SUI': 'suiusdt', 'PEPE': 'pepeusdt', 'WIF': 'wifusdt',
};

/**
 * Resolves a generic ticker to a Binance trading symbol.
 */
function resolveBinanceSymbol(ticker) {
  const normalized = ticker.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
  return TICKER_TO_BINANCE[normalized] || null;
}

/**
 * Checks if the ticker is a Binance-supported crypto asset.
 */
export function isBinanceCrypto(ticker) {
  return !!resolveBinanceSymbol(ticker);
}

/**
 * Fetches recent aggregated trades from Binance REST API.
 * Aggregated trades reduce noise vs individual trades.
 * @param {string} ticker - Ticker symbol
 * @param {number} limit - Number of recent trades (max 1000)
 * @returns {Promise<Object>} Aggregated flow analysis
 */
export async function fetchOrderFlow(ticker, limit = 1000) {
  const symbol = resolveBinanceSymbol(ticker);
  if (!symbol) {
    return { error: `No Binance mapping for ${ticker}`, available: false };
  }

  const cacheKey = `${symbol}_${limit}`;
  const cached = orderFlowCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < FLOW_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const url = `https://api.binance.com/api/v3/aggTrades?symbol=${symbol.toUpperCase()}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `Binance API ${response.status}`, available: false };
    }

    const trades = await response.json();
    const finalData = analyzeOrderFlow(trades, symbol);
    orderFlowCache.set(cacheKey, { timestamp: Date.now(), data: finalData });
    return finalData;
  } catch (error) {
    console.warn(`[ORDER FLOW] Fetch failed for ${ticker}:`, error.message);
    return { error: error.message, available: false };
  }
}

/**
 * Analyzes aggregated trade data to extract order flow metrics.
 * @param {Array} trades - Binance aggTrades response
 * @param {string} symbol - Trading pair
 * @returns {Object} Order flow analysis
 */
function analyzeOrderFlow(trades, symbol) {
  if (!trades || trades.length === 0) {
    return { error: 'No trade data', available: false };
  }

  let buyVolume = 0, sellVolume = 0;
  let buyCount = 0, sellCount = 0;
  let buyValueUSD = 0, sellValueUSD = 0;
  let largeOrders = []; // Whale detection
  const LARGE_ORDER_MULTIPLIER = 10; // 10x average = whale

  // Calculate average trade size first
  const totalQty = trades.reduce((s, t) => s + parseFloat(t.q), 0);
  const avgQty = totalQty / trades.length;
  const whaleThreshold = avgQty * LARGE_ORDER_MULTIPLIER;

  for (const trade of trades) {
    const qty = parseFloat(trade.q);
    const price = parseFloat(trade.p);
    const value = qty * price;
    const isBuyerMaker = trade.m; // true = seller is aggressor (sell), false = buyer is aggressor (buy)

    if (isBuyerMaker) {
      // Seller aggressor = sell pressure
      sellVolume += qty;
      sellCount++;
      sellValueUSD += value;
    } else {
      // Buyer aggressor = buy pressure
      buyVolume += qty;
      buyCount++;
      buyValueUSD += value;
    }

    // Whale detection
    if (qty >= whaleThreshold) {
      largeOrders.push({
        side: isBuyerMaker ? 'SELL' : 'BUY',
        qty: qty,
        price: price,
        valueUSD: value,
        timestamp: trade.T,
      });
    }
  }

  const totalVolume = buyVolume + sellVolume;
  const totalValue = buyValueUSD + sellValueUSD;
  const delta = buyVolume - sellVolume;
  const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;
  const buyRatio = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // Time-weighted analysis: recent trades matter more
  const recentCutoff = Math.floor(trades.length * 0.2); // Last 20%
  const recentTrades = trades.slice(-recentCutoff);
  let recentBuyVol = 0, recentSellVol = 0;
  for (const t of recentTrades) {
    const qty = parseFloat(t.q);
    if (t.m) recentSellVol += qty;
    else recentBuyVol += qty;
  }
  const recentDelta = recentBuyVol - recentSellVol;
  const recentTotal = recentBuyVol + recentSellVol;
  const recentBuyRatio = recentTotal > 0 ? (recentBuyVol / recentTotal) * 100 : 50;

  // Trade velocity (trades per second)
  const timeSpan = trades.length > 1
    ? (trades[trades.length - 1].T - trades[0].T) / 1000
    : 1;
  const tradesPerSecond = trades.length / Math.max(timeSpan, 1);

  // Determine flow bias
  let flowBias, interpretation;
  if (deltaPercent > 15) {
    flowBias = 'STRONG_BUY';
    interpretation = `Aggressive buying dominance — ${buyRatio.toFixed(1)}% buy-side aggression. ${largeOrders.filter(o => o.side === 'BUY').length} whale buy orders detected.`;
  } else if (deltaPercent > 5) {
    flowBias = 'MODERATE_BUY';
    interpretation = `Moderate buy pressure — ${buyRatio.toFixed(1)}% buy-side. Buyers are more aggressive than sellers.`;
  } else if (deltaPercent > -5) {
    flowBias = 'NEUTRAL';
    interpretation = `Balanced order flow — ${buyRatio.toFixed(1)}% buy / ${(100 - buyRatio).toFixed(1)}% sell. No clear aggressor dominance.`;
  } else if (deltaPercent > -15) {
    flowBias = 'MODERATE_SELL';
    interpretation = `Moderate sell pressure — ${(100 - buyRatio).toFixed(1)}% sell-side aggression. Sellers are more aggressive.`;
  } else {
    flowBias = 'STRONG_SELL';
    interpretation = `Aggressive selling dominance — ${(100 - buyRatio).toFixed(1)}% sell-side. ${largeOrders.filter(o => o.side === 'SELL').length} whale sell orders detected.`;
  }

  // Check for flow reversal (recent vs overall)
  const flowReversal = (deltaPercent > 5 && recentBuyRatio < 45) || (deltaPercent < -5 && recentBuyRatio > 55);
  if (flowReversal) {
    interpretation += ' [WARNING] FLOW REVERSAL: Recent trades show opposing direction vs overall — momentum may be shifting.';
  }

  return {
    available: true,
    symbol: symbol.toUpperCase(),
    buyVolume: parseFloat(buyVolume.toFixed(4)),
    sellVolume: parseFloat(sellVolume.toFixed(4)),
    delta: parseFloat(delta.toFixed(4)),
    deltaPercent: parseFloat(deltaPercent.toFixed(2)),
    buyRatio: parseFloat(buyRatio.toFixed(1)),
    buyValueUSD: Math.round(buyValueUSD),
    sellValueUSD: Math.round(sellValueUSD),
    totalValueUSD: Math.round(totalValue),
    recentBuyRatio: parseFloat(recentBuyRatio.toFixed(1)),
    flowReversal,
    tradesPerSecond: parseFloat(tradesPerSecond.toFixed(2)),
    whaleOrders: largeOrders.length,
    whaleBuys: largeOrders.filter(o => o.side === 'BUY').length,
    whaleSells: largeOrders.filter(o => o.side === 'SELL').length,
    flowBias,
    interpretation,
    tradeCount: trades.length,
  };
}

/**
 * Formats order flow data into a text block for AI injection.
 */
export function formatOrderFlowContext(flowData) {
  if (!flowData || !flowData.available) {
    return '';
  }

  let block = `\n=== ORDER FLOW ANALYSIS (LIVE BINANCE DATA) ===\n`;
  block += `Symbol: ${flowData.symbol}\n`;
  block += `Buy Volume: ${flowData.buyVolume} | Sell Volume: ${flowData.sellVolume}\n`;
  block += `Volume Delta: ${flowData.delta > 0 ? '+' : ''}${flowData.delta} (${flowData.deltaPercent > 0 ? '+' : ''}${flowData.deltaPercent}%)\n`;
  block += `Buy/Sell Ratio: ${flowData.buyRatio}% buy / ${(100 - flowData.buyRatio).toFixed(1)}% sell\n`;
  block += `Recent Flow (last 20%): ${flowData.recentBuyRatio}% buy${flowData.flowReversal ? ' [WARNING] REVERSAL SIGNAL' : ''}\n`;
  block += `Trade Velocity: ${flowData.tradesPerSecond} trades/sec\n`;
  block += `Whale Orders: ${flowData.whaleOrders} total (${flowData.whaleBuys} buys, ${flowData.whaleSells} sells)\n`;
  block += `Total Value: $${flowData.totalValueUSD.toLocaleString()}\n`;
  block += `Flow Bias: ${flowData.flowBias}\n`;
  block += `Assessment: ${flowData.interpretation}\n`;
  block += `IMPORTANT: Use this order flow data to confirm or contradict your chart-based thesis. Divergence between price action and order flow is a HIGH-PROBABILITY reversal signal.\n`;

  return block;
}
