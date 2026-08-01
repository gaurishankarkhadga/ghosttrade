// =====================================================
// REGIME CLASSIFIER — Heuristic Regime Confidence
// Converts Hurst output into a calibrated regime call.
// Requires ≥60% heuristic score to be "actionable."
// Threshold empirically derived from bucketed win-rate data.
// =====================================================

/**
 * Computes a Heuristic Confidence Score that the market
 * is in the regime implied by the Hurst value.
 *
 * Uses a weighted-penalty approach:
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
      heuristicScore: 0,
      isActionable: false,
      reason: hurstResult.message,
    };
  }

  const { meanH, ci95, isStable, regime, disagreement, warning } = hurstResult;

  // CI width is the primary uncertainty measure — tighter CI = more confident
  const ciWidth = ci95.upper - ci95.lower;

  // Base certainty: scale so that H >= 0.65 or H <= 0.35 gives max base certainty (1.0)
  // 0.55-0.65 is the scaling range for trending.
  let distanceFromNeutral;
  if (meanH > 0.55) {
    distanceFromNeutral = Math.min(1.0, (meanH - 0.55) / 0.10); 
  } else if (meanH < 0.45) {
    distanceFromNeutral = Math.min(1.0, (0.45 - meanH) / 0.10); 
  } else {
    distanceFromNeutral = 0; // In the random walk zone
  }

  // Heuristic Score = base certainty reduced by CI width uncertainty and instability penalty
  let heuristicScore = distanceFromNeutral;

  // Penalize for wide confidence interval (only if wider than a typical 0.35 bound)
  const ciPenalty = Math.max(0, (ciWidth - 0.35)) * 1.5; 
  heuristicScore -= Math.min(ciPenalty, 0.30); // Max 30% penalty

  // Penalize for R/S vs DFA disagreement
  if (!isStable) {
    const instabilityPenalty = Math.min(disagreement, 0.20); // Max 20% penalty
    heuristicScore -= instabilityPenalty;
  }

  // Clamp to [0, 1]
  heuristicScore = Math.max(0, Math.min(1, heuristicScore));

  // PRD Requirement: must be ≥60% heuristic score to be shown as actionable
  const ACTIONABLE_THRESHOLD = 0.60;
  const isActionable = heuristicScore >= ACTIONABLE_THRESHOLD && regime !== 'RANDOM_WALK';

  // Strategy guidance based on regime + actionability
  let strategyNote;
  if (!isActionable) {
    if (regime === 'RANDOM_WALK') {
      strategyNote = 'Market is in a random walk. No systematic edge. SHIELD MODE enforced.';
    } else {
      strategyNote = `Heuristic Score (${(heuristicScore * 100).toFixed(1)}%) below 60% threshold. Signal confidence insufficient for actionable output. SHIELD MODE enforced.`;
    }
  } else if (regime === 'TRENDING') {
    strategyNote = 'Market exhibits persistent momentum. Trend-continuation setups have a statistical edge.';
  } else if (regime === 'MEAN_REVERTING') {
    strategyNote = 'Market exhibits anti-persistence. Reversal setups at extremes have a statistical edge.';
  }

  const result = {
    regime,
    hurstMean: meanH,
    heuristicScore: parseFloat((heuristicScore * 100).toFixed(1)), // Express as percentage
    isActionable,
    ciWidth: parseFloat(ciWidth.toFixed(3)),
    isStable,
    strategyNote,
    warning: warning || null,
    // Summary string for injection into AI system prompt
    summaryForAI: isActionable
      ? `HURST ANALYSIS: Regime=${regime} | H=${meanH.toFixed(3)} | Heuristic Score=${(heuristicScore * 100).toFixed(1)}% (ACTIONABLE) | ${hurstResult.interpretation}`
      : `HURST ANALYSIS: NON-ACTIONABLE | Regime=${regime} | H=${meanH.toFixed(3)} | Heuristic Score=${(heuristicScore * 100).toFixed(1)}% — below 60% actionability threshold | ${strategyNote}`,
  };

  console.log(`[REGIME] ${regime} | Heuristic Score=${result.heuristicScore}% | Actionable=${isActionable}`);
  return result;
}
