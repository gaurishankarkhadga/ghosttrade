// =====================================================
// KELLY ENGINE v3.0 — Discrete Half-Kelly Sizing
// Uses the correct Discrete Kelly Formula for trading:
//   K = W - (1-W)/R
// where W = empirical win rate, R = reward-to-risk ratio.
//
// This replaces the Continuous Gaussian Kelly (μ/σ²) which
// always saturated the regime cap due to ATR-derived inputs.
// =====================================================

/**
 * Computes Half-Kelly criterion sizing from empirical win rate and risk-reward ratio.
 * Uses Discrete Kelly Formula: K = W - (1 - W) / R
 * Scales down by 50% (Half-Kelly) and applies regime-aware dynamic caps.
 *
 * @param {Object} params
 * @param {number} params.winRate         - Empirical win rate (0.0 to 1.0), e.g., 0.58 = 58%
 * @param {number} params.riskRewardRatio - Reward-to-Risk ratio, e.g., 2.0 for 1:2 RRR
 * @param {string} [params.regime]        - Market regime ('TRENDING', 'MEAN_REVERTING', etc.)
 * @returns {KellyResult}
 */
export function computeKelly({ winRate, riskRewardRatio, regime = 'UNKNOWN' }) {
  // Validate inputs — shield if missing or clearly unprofitable
  if (typeof winRate !== 'number' || typeof riskRewardRatio !== 'number' ||
      winRate <= 0 || winRate >= 1 || riskRewardRatio <= 0) {
    return {
      action: 'SHIELD_MODE',
      reason: `Invalid Kelly inputs: winRate=${winRate}, RRR=${riskRewardRatio}. Shield Mode active.`,
      kellyF: 0,
      halfKelly: 0
    };
  }

  // Break-even win rate for this RRR: BE = 1 / (1 + R)
  const breakEvenWinRate = 1 / (1 + riskRewardRatio);

  // SHIELD MODE if win rate is below break-even (negative edge)
  if (winRate <= breakEvenWinRate) {
    return {
      action: 'SHIELD_MODE',
      reason: `Negative edge: Win rate ${(winRate * 100).toFixed(1)}% is below break-even ${(breakEvenWinRate * 100).toFixed(1)}% for ${riskRewardRatio}:1 RRR. Shield Mode active.`,
      kellyF: 0,
      halfKelly: 0,
      breakEvenWinRate: parseFloat((breakEvenWinRate * 100).toFixed(1))
    };
  }

  // Discrete Kelly Formula: K = W - (1 - W) / R
  const fullKelly = winRate - ((1 - winRate) / riskRewardRatio);

  // Apply Half-Kelly for safety (industry standard for estimation error)
  const halfKelly = fullKelly / 2;

  // Dynamic Institutional Cap based on market regime
  let maxCap;
  if (regime === 'TRENDING') {
    maxCap = 0.15; // Strong trend = allow heavier conviction sizing (15% max)
  } else if (regime === 'MEAN_REVERTING' || regime === 'CHOPPING') {
    maxCap = 0.05; // Choppy/noisy = strict defense (5% max)
  } else {
    maxCap = 0.10; // Default regime cap (10% max)
  }

  // Clamp: Never exceed regime cap, never go below 1%
  const cappedKelly = Math.max(0.01, Math.min(halfKelly, maxCap));

  return {
    action: 'PROCEED',
    reason: `Positive edge: W=${(winRate * 100).toFixed(1)}%, RRR=${riskRewardRatio}:1, BE=${(breakEvenWinRate * 100).toFixed(1)}%. Discrete Half-Kelly = ${(halfKelly * 100).toFixed(2)}%, capped at ${(cappedKelly * 100).toFixed(2)}%. (Regime: ${regime}, Cap: ${maxCap * 100}%)`,
    kellyF: parseFloat(fullKelly.toFixed(4)),
    halfKelly: parseFloat((cappedKelly * 100).toFixed(2)), // as % of account
    breakEvenWinRate: parseFloat((breakEvenWinRate * 100).toFixed(1)),
    edge: parseFloat(((winRate - breakEvenWinRate) * 100).toFixed(1)) // Edge over break-even in %
  };
}
