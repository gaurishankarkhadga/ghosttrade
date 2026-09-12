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
  max_depth_depletion_pct: 75.0,// Order book depth depletion threshold (%)
  max_consecutive_losses: 3,    // Hard stop on 3 consecutive losses
  consecutive_loss_cooldown_hours: 4, // Mandatory 4-hour cooldown to kill tilt and chop
  asset_post_loss_cooldown_hours: 2,  // FIXED: Reduced from 8h to 2h to allow re-entry on liquidity sweep reclaims
  btc_flash_crash_threshold_pct: -2.5 // Block altcoin longs if BTC drops >2.5% in 1h
};

export const STREAK_RESPONSES = {
  2: { action: 'REDUCE_SIZE', sizeMultiplier: 0.5, minScore: 75, cooldownMs: 0 },
  3: { action: 'COOLDOWN_2H', sizeMultiplier: 0.25, minScore: 80, cooldownMs: 2 * 60 * 60 * 1000 },
  4: { action: 'COOLDOWN_8H', sizeMultiplier: 0, minScore: 999, cooldownMs: 8 * 60 * 60 * 1000 },
  5: { action: 'COOLDOWN_24H', sizeMultiplier: 0, minScore: 999, cooldownMs: 24 * 60 * 60 * 1000 },
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
  if (spreadPct > RISK_CONFIG.max_allowed_spread_pct && depthDepletionPct > RISK_CONFIG.max_depth_depletion_pct) {
    return {
      triggered: true,
      reason: 'BLACK_SWAN_LIQUIDITY_COLLAPSE',
      detail: `Bid-Ask spread (${spreadPct.toFixed(2)}%) and depth depletion (${depthDepletionPct.toFixed(1)}%) both exceed safety thresholds. Execution frozen.`
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

    // CHECK 2b — Graduated Streak Response System & Anti-Martingale Boost
    const recentClosedTrades = await tradesColl.find({
      status: { $in: ['CLOSED_TP', 'CLOSED_SL', 'WIN', 'LOSS'] },
      userId
    }).sort({ closedAt: -1 }).limit(10).toArray();

    let consecutiveLosses = 0;
    let consecutiveWins = 0;
    let streakMultiplier = 1.0;
    let streakMinScore = 0;

    if (recentClosedTrades.length > 0) {
      const isLoss = (t) => t.status === 'CLOSED_SL' || t.status === 'LOSS' || (t.pnl !== undefined && t.pnl < 0);
      const isWin = (t) => t.status === 'CLOSED_TP' || t.status === 'WIN' || (t.pnl !== undefined && t.pnl > 0);

      const firstIsLoss = isLoss(recentClosedTrades[0]);
      const firstIsWin = isWin(recentClosedTrades[0]);

      if (firstIsLoss) {
        for (const t of recentClosedTrades) {
          if (isLoss(t)) consecutiveLosses++;
          else break;
        }
      } else if (firstIsWin) {
        for (const t of recentClosedTrades) {
          if (isWin(t)) consecutiveWins++;
          else break;
        }
      }

      // Feature 1: Graduated Streak Response
      if (consecutiveLosses >= 2) {
        const streakLevel = Math.min(consecutiveLosses, 5);
        const response = STREAK_RESPONSES[streakLevel];
        
        if (response) {
          streakMultiplier = response.sizeMultiplier;
          streakMinScore = response.minScore;
          
          if (response.cooldownMs > 0) {
            const lastClosedTime = new Date(recentClosedTrades[0].closedAt).getTime();
            const timeSinceLastLoss = Date.now() - lastClosedTime;
            
            if (timeSinceLastLoss < response.cooldownMs) {
              const remainingMinutes = Math.ceil((response.cooldownMs - timeSinceLastLoss) / 60000);
              console.warn(`[GHOSTMIND] 🚨 GRADUATED STREAK COOLDOWN: ${consecutiveLosses} consecutive losses. Cooldown active for ${remainingMinutes}m.`);
              return {
                allowed: false,
                reason: 'STREAK_COOLDOWN_ACTIVE',
                detail: `${consecutiveLosses} consecutive losses detected. ${response.action} active (${remainingMinutes}m remaining).`,
                streakInfo: { consecutiveLosses, consecutiveWins, sizeMultiplier: streakMultiplier, minScoreOverride: streakMinScore }
              };
            }
          }
        }
      }

      // Feature 2: Win Streak Anti-Martingale Boost
      if (consecutiveWins >= 5) {
        streakMultiplier = 1.5;
      } else if (consecutiveWins >= 3) {
        streakMultiplier = 1.25;
      }
    }

    // CHECK 2c — Asset-Specific Post-Loss Cooldown (Anti-Revenge Trading & Anti-Falling Knife)
    const recentAssetLoss = await tradesColl.findOne({
      asset: newTradeAsset,
      userId,
      status: { $in: ['CLOSED_SL', 'LOSS'] }
    }, { sort: { closedAt: -1 } });

    if (recentAssetLoss && recentAssetLoss.closedAt) {
      const assetLossTime = new Date(recentAssetLoss.closedAt).getTime();
      const assetCooldownMs = RISK_CONFIG.asset_post_loss_cooldown_hours * 3600 * 1000;
      const timeSinceAssetLoss = Date.now() - assetLossTime;

      if (timeSinceAssetLoss < assetCooldownMs) {
        const remainingMinutes = Math.ceil((assetCooldownMs - timeSinceAssetLoss) / 60000);
        console.warn(`[RISK CONTROL] 🛡️ ASSET COOLDOWN: ${newTradeAsset} suffered a Stop Loss recently. Frozen for ${remainingMinutes}m to avoid falling knife.`);
        return {
          allowed: false,
          reason: 'ASSET_POST_LOSS_COOLDOWN',
          detail: `${newTradeAsset} stopped out recently. 2-hour post-loss isolation active (${remainingMinutes}m remaining) to protect against knife-catching.`,
          remainingMinutes
        };
      }
    }

    // CHECK 2d — BTC Flash-Crash Circuit Breaker (Altcoin Portfolio Shield)
    const isAltcoinLong = (newTradeSide === 'LONG' || newTradeSide === 'BUY') && 
                          !newTradeAsset.startsWith('BTC') && 
                          (newTradeAsset.endsWith('USDT') || newTradeAsset.endsWith('USD'));

    if (isAltcoinLong) {
      try {
        const btcData = await fetchOHLCV('BTCUSDT', 5, '1h'); // FIXED: Use 1h bars instead of daily to detect flash crashes, not normal daily volatility
        if (btcData && btcData.bars && btcData.bars.length >= 2) {
          const latestBar = btcData.bars[btcData.bars.length - 1];
          const prevBar = btcData.bars[btcData.bars.length - 2];
          const btcChange1h = ((latestBar.close - prevBar.close) / prevBar.close) * 100;

          if (btcChange1h <= RISK_CONFIG.btc_flash_crash_threshold_pct) {
            console.warn(`[RISK CONTROL] 🚨 BTC FLASH CRASH DETECTED: BTC moved ${btcChange1h.toFixed(2)}% in 1h. Freezing altcoin longs.`);
            return {
              allowed: false,
              reason: 'BTC_FLASH_CRASH_SHIELD',
              detail: `Bitcoin dropped ${btcChange1h.toFixed(2)}% in the last hour. All new Altcoin Longs blocked to prevent liquidation cascade.`,
              btcChange1h
            };
          }
        }
      } catch (e) {}
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

    return { 
      allowed: true,
      streakInfo: {
        consecutiveLosses,
        consecutiveWins,
        sizeMultiplier: streakMultiplier,
        minScoreOverride: streakMinScore
      }
    };
  } catch (err) {
    console.error('[RISK CONTROL] Error checking portfolio risk:', err);
    return { allowed: false, reason: 'RISK_CHECK_ERROR', detail: err.message }; // Fail CLOSED — never allow unguarded trades
  }
}
