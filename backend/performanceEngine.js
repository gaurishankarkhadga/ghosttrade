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

    closedTrades.forEach(trade => {
      const pnl = parseFloat(trade.pnl) || 0;
      netPnlPercent += pnl;

      if (pnl > 0 || trade.status === 'WIN' || trade.status === 'CLOSED_TP') {
        wins++;
        totalWinPnl += pnl;
      } else if (pnl < 0 || trade.status === 'LOSS' || trade.status === 'CLOSED_SL') {
        losses++;
        totalLossPnl += Math.abs(pnl); // store as positive magnitude for EV calc
      }
    });

    const winRate = wins / totalTrades;
    const lossRate = losses / totalTrades;
    
    const averageWinPercent = wins > 0 ? (totalWinPnl / wins) : 0;
    const averageLossPercent = losses > 0 ? (totalLossPnl / losses) : 0;

    // EV = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    const systemEV = (winRate * averageWinPercent) - (lossRate * averageLossPercent);

    return {
      totalTrades,
      wins,
      losses,
      winRate: parseFloat((winRate * 100).toFixed(1)),
      averageWinPercent: parseFloat(averageWinPercent.toFixed(2)),
      averageLossPercent: parseFloat(averageLossPercent.toFixed(2)),
      systemEV: parseFloat(systemEV.toFixed(2)),
      netPnlPercent: parseFloat(netPnlPercent.toFixed(2))
    };

  } catch (error) {
    console.error('[PERFORMANCE ENGINE] Error calculating system metrics:', error.message);
    return null;
  }
}
