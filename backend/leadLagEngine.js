// =====================================================
// LEAD-LAG ENGINE — Cross-Asset Cointegration & Arbitrage
// Calculates lead-follower cross-correlations and detects
// price divergence opportunities where lag assets follow leader trends.
// =====================================================

import { getLogReturns } from './dataFetcher.js';

// Pre-configured Lead-Follower Asset Mappings
const LEAD_FOLLOWER_MAP = {
  'BTC-USD': ['ETH-USD', 'SOL-USD', 'AVAX-USD', 'DOGE-USD', 'LINK-USD'],
  'ETH-USD': ['SOL-USD', 'AVAX-USD', 'UNI-USD', 'ARB-USD', 'OP-USD'],
  'SPY': ['QQQ', 'IWM', 'DIA'],
  'QQQ': ['SMH', 'XLK']
};

/**
 * Calculates Pearson correlation coefficient between two arrays.
 */
function calculatePearson(x, y) {
  if (!x || !y || x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
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
 * Finds the optimal time-lag offset k (bars) between leader and follower returns.
 * 
 * @param {Array} leaderReturns 
 * @param {Array} followerReturns 
 * @param {number} maxLag - Max bars offset to test (default: 5)
 * @returns { object } - { maxCorr, optimalLag }
 */
export function calculateCrossCorrelation(leaderReturns, followerReturns, maxLag = 5) {
  if (leaderReturns.length < 30 || followerReturns.length < 30) {
    return { maxCorr: 0, optimalLag: 0 };
  }

  const len = Math.min(leaderReturns.length, followerReturns.length);
  let bestCorr = -1;
  let bestLag = 0;

  for (let lag = 0; lag <= maxLag; lag++) {
    const rLeader = leaderReturns.slice(0, len - lag);
    const rFollower = followerReturns.slice(lag, len);
    const corr = calculatePearson(rLeader, rFollower);

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return {
    maxCorr: parseFloat(bestCorr.toFixed(4)),
    optimalLag: bestLag
  };
}

/**
 * Detects Lead-Lag price divergence between a Leader asset and a Follower asset.
 * 
 * @param {Array} leaderCandles - OHLCV bars of leader
 * @param {Array} followerCandles - OHLCV bars of follower
 * @returns { object } - { divergenceSignal, leaderReturnPct, followerReturnPct, catchupEdgePct }
 */
export function detectLeadLagDivergence(leaderCandles, followerCandles) {
  if (!leaderCandles || !followerCandles || leaderCandles.length < 5 || followerCandles.length < 5) {
    return { divergenceSignal: 'NONE', leaderReturnPct: 0, followerReturnPct: 0, catchupEdgePct: 0 };
  }

  // Look at cumulative return over last 3 bars
  const leaderRecent = leaderCandles.slice(-4);
  const followerRecent = followerCandles.slice(-4);

  const leaderStart = leaderRecent[0].close;
  const leaderEnd = leaderRecent[leaderRecent.length - 1].close;
  const leaderReturnPct = ((leaderEnd - leaderStart) / leaderStart) * 100;

  const followerStart = followerRecent[0].close;
  const followerEnd = followerRecent[followerRecent.length - 1].close;
  const followerReturnPct = ((followerEnd - followerStart) / followerStart) * 100;

  const spread = leaderReturnPct - followerReturnPct;

  let divergenceSignal = 'NONE';
  let catchupEdgePct = 0;

  // Leader pumped > +1.2%, Follower lagging behind (< +0.4%)
  if (leaderReturnPct > 1.2 && followerReturnPct < 0.4) {
    divergenceSignal = 'BULLISH_LAG_CATCHUP';
    catchupEdgePct = parseFloat(spread.toFixed(2));
  } 
  // Leader dumped < -1.2%, Follower lagging behind (> -0.4%)
  else if (leaderReturnPct < -1.2 && followerReturnPct > -0.4) {
    divergenceSignal = 'BEARISH_LAG_CATCHUP';
    catchupEdgePct = parseFloat(Math.abs(spread).toFixed(2));
  }

  return {
    divergenceSignal,
    leaderReturnPct: parseFloat(leaderReturnPct.toFixed(2)),
    followerReturnPct: parseFloat(followerReturnPct.toFixed(2)),
    catchupEdgePct
  };
}

/**
 * Returns followers for a given leader asset.
 */
export function getFollowerAssets(leaderTicker) {
  const norm = (leaderTicker || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return LEAD_FOLLOWER_MAP[norm] || [];
}
