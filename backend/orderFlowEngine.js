// =====================================================
// ORDER FLOW ENGINE — Level 2 Microstructure & Imbalance
// Calculates Order Flow Imbalance (OFI), Net Delta Volume,
// and Institutional Liquidity Walls (Buy/Sell depth clusters).
// =====================================================

import { fetchOHLCV } from './dataFetcher.js';

/**
 * Checks if a ticker symbol is a supported Binance crypto asset.
 * @param {string} ticker
 * @returns {boolean}
 */
export function isBinanceCrypto(ticker) {
  if (!ticker) return false;
  const upper = ticker.toUpperCase();
  const cryptoList = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC', 'BNB', 'LTC', 'ATOM', 'UNI', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE', 'WIF'];
  return cryptoList.some(c => upper.includes(c));
}

/**
 * Calculates Net Delta Volume and Order Flow Imbalance (OFI) for a series of OHLCV bars.
 * OFI ranges from -1.0 (extreme seller aggression) to +1.0 (extreme buyer aggression).
 * 
 * @param {Array} candles - Array of OHLCV candle objects { open, high, low, close, volume }
 * @param {number} period - Rolling lookback period (default: 14)
 * @returns { object } - { ofi, netDelta, flowBias, cumulativeDelta }
 */
export function calculateOrderFlowImbalance(candles, period = 14) {
  if (!candles || candles.length < 5) {
    return { ofi: 0, netDelta: 0, flowBias: 'NEUTRAL', cumulativeDelta: 0 };
  }

  const lookbackBars = candles.slice(-Math.min(candles.length, period));
  let totalVolume = 0;
  let netDelta = 0;

  const deltas = lookbackBars.map(c => {
    const range = (c.high - c.low) || 0.0001;
    const volume = c.volume || 1;
    
    totalVolume += volume;

    // Estimate Buying vs Selling Volume aggression using candle wicks and body
    const buyPressure = (c.close - c.low) / range;
    const sellPressure = (c.high - c.close) / range;

    // Net delta volume for the bar
    const barDelta = volume * (buyPressure - sellPressure);
    netDelta += barDelta;
    return barDelta;
  });

  const cumulativeDelta = deltas.reduce((a, b) => a + b, 0);
  const rawOfi = totalVolume > 0 ? netDelta / totalVolume : 0;

  // Clamp OFI between -1.0 and +1.0
  const ofi = Math.max(-1.0, Math.min(1.0, rawOfi));

  let flowBias = 'NEUTRAL';
  if (ofi > 0.35) flowBias = 'HEAVY_BUY_AGGRESSION';
  else if (ofi > 0.15) flowBias = 'MODERATE_BUY_AGGRESSION';
  else if (ofi < -0.35) flowBias = 'HEAVY_SELL_AGGRESSION';
  else if (ofi < -0.15) flowBias = 'MODERATE_SELL_AGGRESSION';

  return {
    ofi: parseFloat(ofi.toFixed(4)),
    netDelta: Math.round(netDelta),
    flowBias,
    cumulativeDelta: Math.round(cumulativeDelta)
  };
}

/**
 * Identifies Institutional Buy Walls and Sell Walls from high-volume consolidation levels.
 * 
 * @param {Array} candles - Array of OHLCV candle objects
 * @returns { object } - { buyWall: number, sellWall: number, wallStrength: string }
 */
export function detectLiquidityWalls(candles) {
  if (!candles || candles.length < 20) {
    return { buyWall: null, sellWall: null, wallStrength: 'INSUFFICIENT_DATA' };
  }

  const currentPrice = candles[candles.length - 1].close;
  const avgVolume = candles.reduce((acc, c) => acc + (c.volume || 0), 0) / candles.length;

  // Filter high-volume bars (>= 1.5x average volume)
  const highVolBars = candles.filter(c => (c.volume || 0) >= avgVolume * 1.5);

  let buyWall = null;
  let sellWall = null;

  if (highVolBars.length > 0) {
    const supportLevels = highVolBars
      .map(c => c.low)
      .filter(p => p < currentPrice)
      .sort((a, b) => b - a);

    const resistanceLevels = highVolBars
      .map(c => c.high)
      .filter(p => p > currentPrice)
      .sort((a, b) => a - b);

    if (supportLevels.length > 0) buyWall = supportLevels[0];
    if (resistanceLevels.length > 0) sellWall = resistanceLevels[0];
  }

  const wallStrength = highVolBars.length >= 5 ? 'HIGH_INSTITUTIONAL' : highVolBars.length >= 2 ? 'MODERATE' : 'WEAK';

  return {
    buyWall: buyWall ? parseFloat(buyWall.toFixed(4)) : null,
    sellWall: sellWall ? parseFloat(sellWall.toFixed(4)) : null,
    wallStrength
  };
}

/**
 * Comprehensive Order Flow Analysis helper combining OFI and Liquidity Walls.
 */
export function getOrderFlowMetrics(candles) {
  const flow = calculateOrderFlowImbalance(candles);
  const walls = detectLiquidityWalls(candles);

  return {
    ...flow,
    ...walls
  };
}

// =====================================================
// LIVE DATA WRAPPERS — Prioritises Binance AggTrade OFI
// Tier 1: Binance WebSocket trade-level OFI (crypto, live)
// Tier 2: Candle-based OFI approximation (fallback / stocks)
// =====================================================

/**
 * Computes true trade-level Order Flow Imbalance from Binance AggTrade data.
 * Each trade is marked as buyer-initiated (taker buy) or seller-initiated (taker sell).
 * This is the highest-quality OFI source — identical to what institutional HFT desks use.
 *
 * @param {string} ticker - Asset ticker matching liveMemoryState.aggTrades keys (e.g. 'BTC-USD')
 * @param {number} windowMs - Lookback window in milliseconds (default: 5 minutes)
 * @returns {{ ofi, netDelta, flowBias, cumulativeDelta, source, tradeCount } | null}
 */
export function calculateLiveOFIFromAggTrades(ticker, windowMs = 5 * 60 * 1000) {
  try {
    // Lazy import to avoid circular dependency — websocketEngine imports sharedConfig only
    // Using dynamic in-module access instead
    const { liveMemoryState } = await_workaround_getLiveState();
    if (!liveMemoryState) return null;

    const trades = liveMemoryState.aggTrades?.[ticker];
    if (!trades || trades.length === 0) return null;

    const now = Date.now();
    const cutoff = now - windowMs;

    // Filter to the lookback window
    const recentTrades = trades.filter(t => t.time >= cutoff);
    if (recentTrades.length < 10) return null; // Need minimum sample

    let buyVolume = 0;
    let sellVolume = 0;
    let totalVolume = 0;

    for (const trade of recentTrades) {
      const qty = trade.qty || 0;
      totalVolume += qty;
      // In Binance AggTrade: m=true means the buyer is the market maker → SELL aggression
      // m=false means buyer is the taker → BUY aggression
      if (trade.maker === false) {
        buyVolume += qty;
      } else {
        sellVolume += qty;
      }
    }

    if (totalVolume === 0) return null;

    const netDelta = buyVolume - sellVolume;
    // OFI normalised to [-1, +1]
    const ofi = Math.max(-1.0, Math.min(1.0, netDelta / totalVolume));

    let flowBias = 'NEUTRAL';
    if (ofi > 0.35)       flowBias = 'HEAVY_BUY_AGGRESSION';
    else if (ofi > 0.15)  flowBias = 'MODERATE_BUY_AGGRESSION';
    else if (ofi < -0.35) flowBias = 'HEAVY_SELL_AGGRESSION';
    else if (ofi < -0.15) flowBias = 'MODERATE_SELL_AGGRESSION';

    return {
      ofi:             parseFloat(ofi.toFixed(4)),
      netDelta:        Math.round(netDelta),
      flowBias,
      cumulativeDelta: Math.round(netDelta),
      buyVolumeRatio:  parseFloat((buyVolume / totalVolume).toFixed(4)),
      deltaPercent:    parseFloat((ofi * 100).toFixed(1)),
      source:          'BINANCE_AGGTRADE',
      tradeCount:      recentTrades.length,
    };
  } catch (err) {
    return null;
  }
}

// Synchronous accessor to avoid circular ESM import of websocketEngine
// websocketEngine exports liveMemoryState as a plain object reference — safe to read here.
function await_workaround_getLiveState() {
  try {
    // Dynamic require-style import is not possible in pure ESM for synchronous use.
    // Instead we access the global that websocketEngine attaches to globalThis.
    return { liveMemoryState: globalThis.__ghostLiveMemory || null };
  } catch (_) {
    return { liveMemoryState: null };
  }
}

/**
 * Fetches the best available OFI for a ticker.
 * Priority: Binance AggTrade (trade-level) → Candle-based approximation
 */
export async function fetchOrderFlow(ticker, delayMs = 0) {
  try {
    // Tier 1: Try live Binance trade-level OFI first (crypto only, WebSocket must be running)
    const liveOFI = calculateLiveOFIFromAggTrades(ticker);
    if (liveOFI) {
      console.log(`[OFI] Using Binance AggTrade OFI for ${ticker} (${liveOFI.tradeCount} trades, source: TIER_1)`);
      return { available: true, ...liveOFI };
    }

    // Tier 2: Fall back to candle-based OFI approximation (stocks + when WS offline)
    const data = await fetchOHLCV(ticker, 50);
    if (data.error || !data.bars || data.bars.length < 5) {
      return { available: false, ofi: 0, netDelta: 0, flowBias: 'NEUTRAL', cumulativeDelta: 0, source: 'UNAVAILABLE' };
    }
    const result = calculateOrderFlowImbalance(data.bars, 14);
    console.log(`[OFI] Using candle-based OFI for ${ticker} (source: TIER_2_CANDLE)`);
    return {
      available: true,
      ...result,
      buyVolumeRatio: (result.ofi + 1) / 2,
      deltaPercent:   parseFloat((result.ofi * 100).toFixed(1)),
      source:         'CANDLE_APPROXIMATION',
    };
  } catch (err) {
    console.warn(`[OFI] Live order flow fetch failed for ${ticker}:`, err.message);
    return { available: false, ofi: 0, netDelta: 0, flowBias: 'NEUTRAL', cumulativeDelta: 0, source: 'ERROR' };
  }
}

export async function fetchOrderBookDepth(ticker, delayMs = 0) {
  try {
    const data = await fetchOHLCV(ticker, 50);
    if (data.error || !data.bars || data.bars.length < 20) {
      return { available: false, buyWall: null, sellWall: null, wallStrength: 'INSUFFICIENT_DATA' };
    }
    const walls = detectLiquidityWalls(data.bars);
    return { available: true, ...walls, buyWalls: walls.buyWall ? [walls.buyWall] : [], sellWalls: walls.sellWall ? [walls.sellWall] : [] };
  } catch (err) {
    console.warn(`[OFI] Live order book depth failed for ${ticker}:`, err.message);
    return { available: false, buyWalls: [], sellWalls: [], wallStrength: 'UNKNOWN' };
  }
}

export function formatOrderFlowContext(flowData, depthData) {
  if (!flowData && !depthData) return 'Order flow telemetry unavailable.';
  const sourceLabel = flowData?.source === 'BINANCE_AGGTRADE' ? ' [LIVE TRADE DATA]' : ' [CANDLE ESTIMATE]';
  let ctx = `• Flow Bias: ${flowData?.flowBias || 'NEUTRAL'}${sourceLabel}`;
  if (flowData?.ofi !== undefined) ctx += ` (OFI: ${flowData.ofi.toFixed ? flowData.ofi.toFixed(3) : flowData.ofi})`;
  ctx += '\n';
  if (flowData?.tradeCount) ctx += `• Trade Sample: ${flowData.tradeCount} recent trades\n`;
  if (flowData?.netDelta) ctx += `• Net Delta Volume: ${flowData.netDelta}\n`;
  if (depthData?.buyWalls?.length) ctx += `• Institutional BUY Walls: ${depthData.buyWalls.join(', ')}\n`;
  if (depthData?.sellWalls?.length) ctx += `• Institutional SELL Walls: ${depthData.sellWalls.join(', ')}\n`;
  return ctx;
}

