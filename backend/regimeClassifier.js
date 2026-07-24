// =====================================================
// REGIME CLASSIFIER — Bayesian Regime Probability
// Converts Hurst output into a calibrated regime call.
// Requires ≥85% posterior probability to be "actionable."
// =====================================================

/**
 * Computes the Bayesian posterior probability that the market
 * is in the regime implied by the Hurst value.
 *
 * Uses a Beta-distribution-inspired approach:
 * - Center H values carry low certainty (near 0.5 = noisy)
 * - Extreme H values (near 0 or 1) carry high certainty
 * - The 95% CI width from the Hurst engine is used as the uncertainty measure
 *
 * @param {Object} hurstResult - Full result from hurstEngine.calculateHurst()
 * @returns {RegimeResult}
 */
export function classifyRegime(hurstResult) {
  if (hurstResult.error) {
    return {
      regime: 'UNKNOWN',
      posterior: 0,
      isActionable: false,
      reason: hurstResult.message,
    };
  }

  const { meanH, ci95, isStable, regime, disagreement, warning } = hurstResult;

  // CI width is the primary uncertainty measure — tighter CI = more confident
  const ciWidth = ci95.upper - ci95.lower;

  // Base certainty: scale so that H >= 0.75 or H <= 0.25 gives max base certainty (1.0)
  // 0.55-0.75 is the scaling range for trending.
  let distanceFromNeutral;
  if (meanH > 0.55) {
    distanceFromNeutral = Math.min(1.0, (meanH - 0.55) / 0.20); 
  } else if (meanH < 0.45) {
    distanceFromNeutral = Math.min(1.0, (0.45 - meanH) / 0.20); 
  } else {
    distanceFromNeutral = 0; // In the random walk zone
  }

  // Posterior = base certainty reduced by CI width uncertainty and instability penalty
  let posterior = distanceFromNeutral;

  // Penalize for wide confidence interval (only if wider than a tight 0.15 bound)
  const ciPenalty = Math.max(0, (ciWidth - 0.15)) * 1.5; 
  posterior -= Math.min(ciPenalty, 0.30); // Max 30% penalty

  // Penalize for R/S vs DFA disagreement
  if (!isStable) {
    const instabilityPenalty = Math.min(disagreement, 0.20); // Max 20% penalty
    posterior -= instabilityPenalty;
  }

  // Clamp to [0, 1]
  posterior = Math.max(0, Math.min(1, posterior));

  // PRD Requirement: must be ≥85% posterior to be shown as actionable
  const ACTIONABLE_THRESHOLD = 0.85;
  const isActionable = posterior >= ACTIONABLE_THRESHOLD && regime !== 'RANDOM_WALK';

  // Strategy guidance based on regime + actionability
  let strategyNote;
  if (!isActionable) {
    if (regime === 'RANDOM_WALK') {
      strategyNote = 'Market is in a random walk. No systematic edge. SHIELD MODE enforced.';
    } else {
      strategyNote = `Posterior (${(posterior * 100).toFixed(1)}%) below 85% threshold. Signal confidence insufficient for actionable output. SHIELD MODE enforced.`;
    }
  } else if (regime === 'TRENDING') {
    strategyNote = 'Market exhibits persistent momentum. Trend-continuation setups have a statistical edge.';
  } else if (regime === 'MEAN_REVERTING') {
    strategyNote = 'Market exhibits anti-persistence. Reversal setups at extremes have a statistical edge.';
  }

  const result = {
    regime,
    hurstMean: meanH,
    posterior: parseFloat((posterior * 100).toFixed(1)), // Express as percentage
    isActionable,
    ciWidth: parseFloat(ciWidth.toFixed(3)),
    isStable,
    strategyNote,
    warning: warning || null,
    // Summary string for injection into AI system prompt
    summaryForAI: isActionable
      ? `HURST ANALYSIS: Regime=${regime} | H=${meanH.toFixed(3)} | Posterior=${(posterior * 100).toFixed(1)}% (ACTIONABLE) | ${hurstResult.interpretation}`
      : `HURST ANALYSIS: SHIELD MODE ENFORCED | Regime=${regime} | H=${meanH.toFixed(3)} | Posterior=${(posterior * 100).toFixed(1)}% — below 85% actionability threshold | ${strategyNote}`,
  };

  console.log(`[REGIME] ${regime} | Posterior=${result.posterior}% | Actionable=${isActionable}`);
  return result;
}
