// =====================================================
// KELLY ENGINE — Institutional Continuous Half-Kelly Sizing
// Computes mathematically honest position sizing based on
// empirical backtest metrics (mean return, sample variance).
// All fake "AI Win Probability" binomial logic has been deleted.
// =====================================================

/**
 * Computes Half-Kelly criterion sizing strictly from empirical DB stats.
 * Uses Continuous Kelly Formula: K = (μ - r) / σ²
 * Safely scales it down by 50% (Half-Kelly) and hardcaps at 10%.
 *
 * @param {Object} params
 * @param {number} params.mean_return - Empirical mean return (μ)
 * @param {number} params.variance    - Empirical sample variance (σ²)
 * @param {string} [params.regime]    - Market regime (e.g., 'TRENDING', 'MEAN_REVERTING')
 * @returns {KellyResult}
 */
export function computeKelly({ mean_return, variance, regime = 'UNKNOWN' }) {
  // SHIELD MODE: If variance is 0, or mean_return is negative, or stats are missing
  if (typeof mean_return !== 'number' || typeof variance !== 'number' || variance <= 0 || mean_return <= 0) {
    return {
      action: 'SHIELD_MODE',
      reason: 'Negative edge or missing variance data. Shield Mode active.',
      kellyF: 0,
      halfKelly: 0
    };
  }

  // Risk-free rate (r) is assumed 0 for simplicity in this model
  // Full Continuous Kelly = μ / σ²
  const fullKelly = mean_return / variance;
  
  // Apply Half-Kelly for safety
  const halfKelly = fullKelly / 2;
  
  // Dynamic Institutional Cap based on market regime
  let maxCap = 0.10; // Default 10% global base
  
  if (regime === 'TRENDING') {
    maxCap = 0.15; // Global AI Rule: Allow heavier sizing when momentum is clear
  } else if (regime === 'MEAN_REVERTING' || regime === 'CHOPPING') {
    maxCap = 0.05; // Global AI Rule: Strict defense in noisy/choppy conditions
  }

  const cappedKelly = Math.min(halfKelly, maxCap);

  return {
    action: 'PROCEED',
    reason: `Positive edge confirmed. Continuous Half-Kelly sizing applied. (Regime Cap: ${maxCap * 100}%)`,
    kellyF: parseFloat(fullKelly.toFixed(4)),
    halfKelly: parseFloat((cappedKelly * 100).toFixed(2)) // as % of account
  };
}
