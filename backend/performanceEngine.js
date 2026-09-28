// =====================================================
// PERFORMANCE ENGINE — Real PnL & System Metrics
// Aggregates mathematical edges from actual closed trades.
// =====================================================

import { getDb } from './mongoConfig.js';
import { calculatePortfolioVaR } from './riskControlEngine.js';

export async function getSystemPerformance(userId = null) {
  try {
    const db = await getDb();
    
    // We only care about closed, resolved trades (Wins/Losses)
    // CANCELLED trades do not factor into win rate or EV math.
    const query = { status: { $in: ['WIN', 'LOSS', 'CLOSED', 'CLOSED_TP', 'CLOSED_SL'] } };
    if (userId) query.userId = userId;
    const closedTrades = await db.collection('paper_trades').find(query).toArray();

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
      valueAtRisk,
      portfolioVaR: await calculatePortfolioVaR(userId).catch(() => null)
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

/**
 * Generates a structured performance report with all metrics and analysis.
 * @param {string|null} userId - Optional user scope
 * @returns {Object} Formatted performance report with summary, metrics, and analysis
 */
export async function generatePerformanceReport(userId = null) {
  try {
    const perf = await getSystemPerformance(userId);
    if (!perf || perf.totalTrades === 0) {
      return {
        generatedAt: new Date().toISOString(),
        status: 'INSUFFICIENT_DATA',
        summary: 'Not enough closed trades to generate a performance report.',
        metrics: null
      };
    }

    // Classify system health
    let systemHealth = 'HEALTHY';
    const warnings = [];
    
    if (perf.winRate < 40) { systemHealth = 'CRITICAL'; warnings.push('Win rate below 40% — system is underperforming.'); }
    else if (perf.winRate < 50) { systemHealth = 'DEGRADED'; warnings.push('Win rate below 50% — monitor closely.'); }
    
    if (perf.systemEV < 0) { systemHealth = 'CRITICAL'; warnings.push('Negative expected value — system is net unprofitable.'); }
    if (perf.maxDrawdownPercent > 20) { warnings.push(`Max drawdown ${perf.maxDrawdownPercent}% exceeds 20% threshold.`); }
    if (perf.sharpeRatio < 0.5) { warnings.push('Sharpe ratio below 0.5 — poor risk-adjusted returns.'); }
    if (perf.sortinoRatio < 0.5) { warnings.push('Sortino ratio below 0.5 — high downside volatility.'); }

    // Win/loss streak analysis
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let streakType = null;

    const profitFactor = perf.averageLossPercent > 0 
      ? parseFloat(((perf.winRate / 100 * perf.averageWinPercent) / ((1 - perf.winRate / 100) * perf.averageLossPercent)).toFixed(2))
      : perf.wins > 0 ? 99 : 0;

    return {
      generatedAt: new Date().toISOString(),
      status: systemHealth,
      userId: userId || 'GLOBAL',
      summary: `${perf.totalTrades} trades | ${perf.winRate}% win rate | EV: ${perf.systemEV > 0 ? "+" : ""}${perf.systemEV}% | Sharpe: ${perf.sharpeRatio}`,
      metrics: {
        totalTrades: perf.totalTrades,
        wins: perf.wins,
        losses: perf.losses,
        winRate: perf.winRate,
        averageWinPercent: perf.averageWinPercent,
        averageLossPercent: perf.averageLossPercent,
        profitFactor,
        systemEV: perf.systemEV,
        netPnlPercent: perf.netPnlPercent,
        maxDrawdown: perf.maxDrawdown,
        maxDrawdownPercent: perf.maxDrawdownPercent,
        sharpeRatio: perf.sharpeRatio,
        sortinoRatio: perf.sortinoRatio,
        valueAtRisk: perf.valueAtRisk,
        portfolioVaR: perf.portfolioVaR
      },
      analysis: {
        riskRewardRatio: perf.averageLossPercent > 0 
          ? parseFloat((perf.averageWinPercent / perf.averageLossPercent).toFixed(2))
          : null,
        kellyOptimalSize: perf.winRate > 0 && perf.averageWinPercent > 0 && perf.averageLossPercent > 0
          ? parseFloat((((perf.winRate / 100) - ((1 - perf.winRate / 100) / (perf.averageWinPercent / perf.averageLossPercent))) * 100).toFixed(1))
          : 0,
        isPositiveEV: perf.systemEV > 0,
        tradingEdge: perf.systemEV > 1 ? 'STRONG' : perf.systemEV > 0 ? 'MARGINAL' : 'NONE',
      },
      warnings,
    };
  } catch (e) {
    console.error('[PERFORMANCE] Report generation failed:', e.message);
    return { generatedAt: new Date().toISOString(), status: 'ERROR', summary: e.message, metrics: null, warnings: [] };
  }
}
