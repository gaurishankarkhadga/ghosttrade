// =====================================================
// RISK CONTROL ENGINE — Portfolio Level Risk Guardrails
// Implements Daily Loss Limits, Concurrent Trade Caps, Correlation Blocking,
// and Black Swan Spread & Liquidity Circuit-Breakers.
// =====================================================

import { getDb } from './mongoConfig.js';
import { fetchOHLCV, getLogReturns } from './dataFetcher.js';

import { toStandardSymbol } from './marketRouter.js';
import { getLiveDepthFromMemory } from './websocketEngine.js';

const RISK_CONFIG = {
  daily_max_loss_pct: 5,        // block ALL new trades once today's realized+unrealized PnL <= -5%
  max_concurrent_trades: 3,     // hard ceiling regardless of correlation result
  correlation_threshold: 0.75,  // KEEP existing Phase 1 logic
  correlation_lookback_bars: 200, 
  max_allowed_spread_pct: 0.35, // Black swan spread expansion threshold (%)
  max_depth_depletion_pct: 50.0 // Order book depth depletion threshold (%)
};

/**
 * Calculates Pearson correlation coefficient between two equal-length arrays of returns.
 */
function calculatePearson(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Checks for Black Swan Liquidity Collapse or Sudden Spread Spikes.
 * 
 * @param {number} spreadPct - Current bid-ask spread percentage
 * @param {number} depthDepletionPct - Order book liquidity depth depletion (%)
 * @returns { object } - { triggered: boolean, reason?: string }
 */
export function checkBlackSwanLiquidityCircuitBreaker(spreadPct = 0.05, depthDepletionPct = 0) {
  if (spreadPct > RISK_CONFIG.max_allowed_spread_pct) {
    return {
      triggered: true,
      reason: 'BLACK_SWAN_SPREAD_EXPANSION',
      detail: `Bid-Ask spread (${spreadPct.toFixed(2)}%) exceeds safety threshold (${RISK_CONFIG.max_allowed_spread_pct}%). Shield Mode active.`
    };
  }

  if (depthDepletionPct > RISK_CONFIG.max_depth_depletion_pct) {
    return {
      triggered: true,
      reason: 'BLACK_SWAN_LIQUIDITY_COLLAPSE',
      detail: `Order book depth collapsed by ${depthDepletionPct.toFixed(1)}%. Execution frozen.`
    };
  }

  return { triggered: false };
}

/**
 * Derives real-time Black Swan metrics from the Binance WebSocket memory cache.
 * Computes bid-ask spread % and top-5 depth depletion % from live order book data.
 *
 * @param {string} ticker - Asset ticker (e.g. 'BTC-USD')
 * @returns {{ spreadPct: number, depthDepletionPct: number, hasLiveData: boolean }}
 */
function computeBlackSwanMetrics(ticker) {
  try {
    const depth = getLiveDepthFromMemory(ticker);
    if (depth.error || !depth.bids || !depth.asks || depth.bids.length === 0 || depth.asks.length === 0) {
      return { spreadPct: 0, depthDepletionPct: 0, hasLiveData: false };
    }

    // Best bid = highest bid, best ask = lowest ask
    // Binance sends bids sorted descending, asks sorted ascending
    const bestBid = parseFloat(depth.bids[0][0]);
    const bestAsk = parseFloat(depth.asks[0][0]);
    const midPrice = (bestBid + bestAsk) / 2;

    if (midPrice === 0) return { spreadPct: 0, depthDepletionPct: 0, hasLiveData: false };

    // Spread as % of mid price
    const spreadPct = ((bestAsk - bestBid) / midPrice) * 100;

    // Depth depletion: compare top-5 bid liquidity vs top-5 ask liquidity
    // High imbalance (>50% ask depletion relative to bids) = sell-side collapse
    const topBidQty = depth.bids.slice(0, 5).reduce((s, b) => s + parseFloat(b[1]), 0);
    const topAskQty = depth.asks.slice(0, 5).reduce((s, a) => s + parseFloat(a[1]), 0);
    const totalQty = topBidQty + topAskQty;
    const depthDepletionPct = totalQty > 0
      ? (Math.abs(topBidQty - topAskQty) / totalQty) * 100
      : 0;

    return { spreadPct, depthDepletionPct, hasLiveData: true };
  } catch (err) {
    // WebSocket not connected (e.g. stocks, or cloud IP block) — safe fallback
    return { spreadPct: 0, depthDepletionPct: 0, hasLiveData: false };
  }
}

/**
 * Checks portfolio-level risk constraints before allowing a new trade.
 * @returns { allowed: boolean, reason?: string, ... }
 */
export async function canOpenNewTrade(newTradeAsset, newTradeSide, userId) {
  try {
    if (!userId) {
      return { allowed: false, reason: "MISSING_USER_ID", detail: "Tenant isolation failed" };
    }

    const db = await getDb();
    const tradesColl = db.collection('paper_trades');

    // CHECK 0 — Black Swan Liquidity Circuit Breaker (live Binance depth)
    // Only meaningful for crypto assets with live WebSocket data
    const blackSwanMetrics = computeBlackSwanMetrics(newTradeAsset);
    if (blackSwanMetrics.hasLiveData) {
      const blackSwanCheck = checkBlackSwanLiquidityCircuitBreaker(
        blackSwanMetrics.spreadPct,
        blackSwanMetrics.depthDepletionPct
      );
      if (blackSwanCheck.triggered) {
        console.warn(`[RISK CONTROL] 🚨 BLACK SWAN TRIGGERED for ${newTradeAsset}: ${blackSwanCheck.detail}`);
        return {
          allowed: false,
          reason: blackSwanCheck.reason,
          detail: blackSwanCheck.detail
        };
      }
    }

    // CHECK 1 — Max Concurrent Trades Limit (Per User)
    const openTrades = await tradesColl.find({ status: 'OPEN', userId }).toArray();
    if (openTrades.length >= RISK_CONFIG.max_concurrent_trades) {
      return { 
        allowed: false, 
        reason: "MAX_CONCURRENT_TRADES",
        count: openTrades.length
      };
    }

    // CHECK 2 — Daily Loss Limit
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const closedTradesToday = await tradesColl.find({ 
      status: { $in: ['CLOSED_TP', 'CLOSED_SL', 'WIN', 'LOSS'] },
      closedAt: { $gte: todayISO },
      userId
    }).toArray();

    // Calculate PNL impact in raw decimals (e.g. 0.05 = 5%)
    let dailyPnLRaw = 0;
    
    for (const t of closedTradesToday) {
      if (t.entryPrice && t.pnl !== undefined && t.kellySize) {
        const tradeReturnRaw = t.pnl / 100; // 2.5% -> 0.025
        const kellyRaw = t.kellySize / 100; // 5.23% -> 0.0523
        const portfolioImpactRaw = tradeReturnRaw * kellyRaw; // 0.025 * 0.0523 = 0.0013075 (0.13%)
        dailyPnLRaw += portfolioImpactRaw; 
      }
    }

    if (dailyPnLRaw <= -(RISK_CONFIG.daily_max_loss_pct / 100)) {
      return { 
        allowed: false, 
        reason: "DAILY_LOSS_LIMIT_HIT",
        todayPnlPct: dailyPnLRaw * 100
      };
    }

    // CHECK 3 — Dynamic Covariance Matrix (Correlation Blocking)
    if (openTrades.length > 0) {
      const newAssetData = await fetchOHLCV(toStandardSymbol(newTradeAsset), RISK_CONFIG.correlation_lookback_bars);
      if (!newAssetData.error && newAssetData.bars) {
         const newReturns = getLogReturns(newAssetData.bars);
         
         for (const openTrade of openTrades) {
            const openAssetData = await fetchOHLCV(toStandardSymbol(openTrade.asset), RISK_CONFIG.correlation_lookback_bars);
            if (!openAssetData.error && openAssetData.bars) {
               const openReturns = getLogReturns(openAssetData.bars);
               
               const minLen = Math.min(newReturns.length, openReturns.length, RISK_CONFIG.correlation_lookback_bars);
               
               if (minLen < 30) continue; // Minimum data floor

               const rX = newReturns.slice(-minLen);
               const rY = openReturns.slice(-minLen);
               
               const correlation = calculatePearson(rX, rY);
               
               if (correlation > RISK_CONFIG.correlation_threshold && openTrade.side === newTradeSide) {
                  return {
                    allowed: false,
                    reason: "CORRELATION_LIMIT",
                    conflicting_asset: openTrade.asset, 
                    corr: correlation
                  };
               }
               if (correlation < -RISK_CONFIG.correlation_threshold && openTrade.side !== newTradeSide) {
                  return {
                    allowed: false,
                    reason: "CORRELATION_LIMIT",
                    conflicting_asset: openTrade.asset, 
                    corr: correlation
                  };
               }
            }
         }
      }
    }

    return { allowed: true };
  } catch (err) {
    console.error('[RISK CONTROL] Error checking portfolio risk:', err);
    return { allowed: false, reason: 'RISK_CHECK_ERROR', detail: err.message }; // Fail CLOSED — never allow unguarded trades
  }
}
