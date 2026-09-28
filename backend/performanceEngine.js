// =====================================================
// PERFORMANCE ENGINE — Real PnL & System Metrics
// Aggregates mathematical edges from actual closed trades.
// =====================================================

import { getDb } from './mongoConfig.js';

export async function getSystemPerformance() {
  try {
    const db = await getDb();
    
    // We only care about closed, resolved trades (Wins/Losses)
    // CANCELLED trades do not factor into win rate or EV math.
    const closedTrades = await db.collection('paper_trades').find({
      status: { $in: ['WIN', 'LOSS', 'CLOSED_TP', 'CLOSED_SL'] }
    }).toArray();

    const totalTrades = closedTrades.length;
    
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averageWinPercent: 0,
        averageLossPercent: 0,
        systemEV: 0,
        netPnlPercent: 0
      };
    }

    let wins = 0;
    let losses = 0;
    let totalWinPnl = 0;
    let totalLossPnl = 0;
    let netPnlPercent = 0;

    const returns = [];
    let currentEquity = 100;
    const equityCurve = [currentEquity];

    closedTrades.forEach(trade => {
      const pnlPercent = parseFloat(trade.pnlPercent) || 0;
      netPnlPercent += pnlPercent;
      returns.push(pnlPercent);
      currentEquity += pnlPercent;
      equityCurve.push(currentEquity);

      if (pnlPercent > 0) {
        wins++;
        totalWinPnl += pnlPercent;
      } else if (pnlPercent < 0) {
        losses++;
        totalLossPnl += Math.abs(pnlPercent);
      }
    });

    const winRate = wins / totalTrades;
    const lossRate = losses / totalTrades;
    
    const averageWinPercent = wins > 0 ? (totalWinPnl / wins) : 0;
    const averageLossPercent = losses > 0 ? (totalLossPnl / losses) : 0;

    // EV = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    const systemEV = (winRate * averageWinPercent) - (lossRate * averageLossPercent);

    const mddMetrics = calculateMaxDrawdown(equityCurve);
    const sharpeRatio = calculateSharpeRatio(returns);
    const sortinoRatio = calculateSortinoRatio(returns);
    const valueAtRisk = calculateVaR(returns);

    return {
      totalTrades,
      wins,
      losses,
      winRate: parseFloat((winRate * 100).toFixed(1)),
      averageWinPercent: parseFloat(averageWinPercent.toFixed(2)),
      averageLossPercent: parseFloat(averageLossPercent.toFixed(2)),
      systemEV: parseFloat(systemEV.toFixed(2)),
      netPnlPercent: parseFloat(netPnlPercent.toFixed(2)),
      maxDrawdown: mddMetrics.mdd,
      maxDrawdownPercent: mddMetrics.mddPercent,
      sharpeRatio,
      sortinoRatio,
      valueAtRisk
    };

  } catch (error) {
    console.error('[PERFORMANCE ENGINE] Error calculating system metrics:', error.message);
    return null;
  }
}

// Maximum Drawdown (MDD) — worst peak-to-trough decline
export function calculateMaxDrawdown(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return { mdd: 0, mddPercent: 0 };
  let peak = equityCurve[0];
  let maxDD = 0;
  let maxDDPct = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDDPct) {
      maxDD = dd;
      maxDDPct = ddPct;
    }
  }
  return { mdd: parseFloat(maxDD.toFixed(2)), mddPercent: parseFloat(maxDDPct.toFixed(2)) };
}

// Sharpe Ratio (risk-adjusted return) — annualized
export function calculateSharpeRatio(returns, riskFreeRate = 0) {
  if (!returns || returns.length < 5) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  // Annualize assuming ~252 trading days
  return parseFloat(((mean - riskFreeRate) / stdDev * Math.sqrt(252)).toFixed(2));
}

// Sortino Ratio (penalizes only downside volatility)
export function calculateSortinoRatio(returns, riskFreeRate = 0) {
  if (!returns || returns.length < 5) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < riskFreeRate);
  if (downsideReturns.length === 0) return mean > 0 ? 99 : 0;
  const downsideVariance = downsideReturns.reduce((s, r) => s + Math.pow(r - riskFreeRate, 2), 0) / downsideReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  if (downsideDeviation === 0) return 0;
  return parseFloat(((mean - riskFreeRate) / downsideDeviation * Math.sqrt(252)).toFixed(2));
}

// Historical VaR (95th percentile worst loss)
export function calculateVaR(returns, confidenceLevel = 0.95) {
  if (!returns || returns.length < 20) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sorted.length);
  return parseFloat((sorted[index] * 100).toFixed(2)); // As percentage
}
