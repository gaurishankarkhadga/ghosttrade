// =====================================================
// RISK CONTROL ENGINE — Portfolio Level Risk Guardrails
// Implements Daily Loss Limits, Concurrent Trade Caps, and Correlation Blocking.
// =====================================================

import { getDb } from './mongoConfig.js';
import { fetchOHLCV, getLogReturns } from './dataFetcher.js';

const RISK_CONFIG = {
  daily_max_loss_pct: 5,        // block ALL new trades once today's realized+unrealized PnL <= -5%
  max_concurrent_trades: 3,     // hard ceiling regardless of correlation result
  correlation_threshold: 0.75,  // KEEP existing Phase 1 logic
  correlation_lookback_bars: 200, 
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
 * Checks portfolio-level risk constraints before allowing a new trade.
 * @returns { allowed: boolean, reason?: string, ... }
 */
export async function canOpenNewTrade(newTradeAsset, newTradeSide) {
  try {
    const db = await getDb();
    const tradesColl = db.collection('paper_trades');

    // CHECK 1 — Max Concurrent Trades Limit
    const openTrades = await tradesColl.find({ status: 'OPEN' }).toArray();
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
      closedAt: { $gte: todayISO } 
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
      const newAssetData = await fetchOHLCV(newTradeAsset, RISK_CONFIG.correlation_lookback_bars);
      if (!newAssetData.error && newAssetData.bars) {
         const newReturns = getLogReturns(newAssetData.bars);
         
         for (const openTrade of openTrades) {
            const openAssetData = await fetchOHLCV(openTrade.asset, RISK_CONFIG.correlation_lookback_bars);
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
