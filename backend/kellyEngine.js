// =====================================================
// KELLY ENGINE — Half-Kelly Sizing with Fee-Adjusted EV
// Computes mathematically honest position sizing.
// Uses calibration-adjusted win probability, not raw AI confidence.
// If f* ≤ 0 or EV net of fees ≤ 0 → SHIELD MODE enforced.
// =====================================================

// Estimated round-trip cost assumptions (conservative defaults)
const DEFAULT_FEE_PERCENT  = 0.001; // 0.1% maker/taker fee per side
const DEFAULT_SPREAD_PERCENT = 0.0005; // 0.05% typical spread on liquid assets

/**
 * Computes Kelly criterion sizing with calibration-adjusted probabilities.
 * Always outputs half-Kelly for safety.
 *
 * @param {Object} params
 * @param {number} params.winProbability     - Calibration-adjusted win probability (0–1). Falls back to raw if no calibration data.
 * @param {number} params.rewardPercent      - Expected reward as % of position (e.g., 0.05 = 5%)
 * @param {number} params.riskPercent        - Expected risk as % of position (e.g., 0.02 = 2%)
 * @param {number} [params.feePercent]       - Override fee per trade (default 0.1%)
 * @param {number} [params.spreadPercent]    - Override spread (default 0.05%)
 * @param {boolean} [params.isCalibrated]    - Whether winProbability comes from the calibration engine
 *
 * @returns {KellyResult}
 */
export function computeKelly({
  winProbability,
  rewardPercent,
  riskPercent,
  feePercent    = DEFAULT_FEE_PERCENT,
  spreadPercent = DEFAULT_SPREAD_PERCENT,
  isCalibrated  = false,
}) {
  // Validate inputs
  if (
    typeof winProbability !== 'number' ||
    typeof rewardPercent  !== 'number' ||
    typeof riskPercent    !== 'number' ||
    winProbability < 0 || winProbability > 1 ||
    rewardPercent  <= 0 ||
    riskPercent    <= 0
  ) {
    return {
      action:   'SHIELD_MODE',
      reason:   'Invalid inputs — cannot compute position sizing.',
      kellyF:   null,
      halfKelly: null,
      evGross:  null,
      evNet:    null,
      evPer100: null,
      totalCostPercent: null,
      isCalibrated,
    };
  }

  const lossProbability  = 1 - winProbability;

  // Total round-trip cost (enter + exit, both sides)
  const totalCostPercent = (feePercent * 2) + spreadPercent;

  // Net Reward/Risk (after fees subtracted from gross profit/loss)
  const netRewardPercent = rewardPercent - totalCostPercent;
  const netRiskPercent = riskPercent + totalCostPercent;

  // Gross EV (before fees)
  const evGross = (winProbability * rewardPercent) - (lossProbability * riskPercent);

  // Net EV (after fees)
  const evNet = (winProbability * netRewardPercent) - (lossProbability * netRiskPercent);

  // Full Kelly fraction: f* = (p*b - q) / b
  // where b = netReward/netRisk ratio, p = win prob, q = loss prob
  const b = netRewardPercent / netRiskPercent;
  const kellyF = b > 0 ? (winProbability * b - lossProbability) / b : 0;

  // Half-Kelly (safer, accounts for model uncertainty)
  const halfKelly = kellyF / 2;

  // EV per $100 risked (for display)
  const evPer100 = (evNet / riskPercent) * 100;

  // --- SHIELD MODE CONDITIONS (PRD §4.4) ---
  if (kellyF <= 0) {
    return {
      action:    'SHIELD_MODE',
      reason:    `Kelly fraction is ${kellyF.toFixed(3)} ≤ 0 — negative edge. No trade.`,
      kellyF:    parseFloat(kellyF.toFixed(4)),
      halfKelly: 0,
      evGross:   parseFloat((evGross * 100).toFixed(2)),
      evNet:     parseFloat((evNet * 100).toFixed(2)),
      evPer100:  parseFloat(evPer100.toFixed(2)),
      totalCostPercent: parseFloat((totalCostPercent * 100).toFixed(3)),
      isCalibrated,
    };
  }

  if (evNet <= 0) {
    return {
      action:    'SHIELD_MODE',
      reason:    `Net EV after fees is ${(evNet * 100).toFixed(2)}% — fees consume the edge. No trade.`,
      kellyF:    parseFloat(kellyF.toFixed(4)),
      halfKelly: parseFloat((halfKelly * 100).toFixed(2)),
      evGross:   parseFloat((evGross * 100).toFixed(2)),
      evNet:     parseFloat((evNet * 100).toFixed(2)),
      evPer100:  parseFloat(evPer100.toFixed(2)),
      isCalibrated,
    };
  }

  // PRD warning: if EV per $100 is under $5, it's not worth the trade
  const isMarginally_positive = evPer100 < 5;

  return {
    action:    isMarginally_positive ? 'CAUTION' : 'PROCEED',
    reason:    isMarginally_positive
      ? `Edge is positive but thin ($${evPer100.toFixed(2)} per $100 risked). Consider SHIELD MODE.`
      : `Positive edge confirmed — $${evPer100.toFixed(2)} EV per $100 risked (after fees).`,
    kellyF:    parseFloat(kellyF.toFixed(4)),
    halfKelly: parseFloat((halfKelly * 100).toFixed(2)), // as % of account
    evGross:   parseFloat((evGross * 100).toFixed(2)),
    evNet:     parseFloat((evNet * 100).toFixed(2)),
    evPer100:  parseFloat(evPer100.toFixed(2)),
    totalCostPercent: parseFloat((totalCostPercent * 100).toFixed(3)),
    isCalibrated,
    // Summary for injection into AI system prompt
    summaryForAI: `KELLY SIZING: Half-Kelly=${(halfKelly * 100).toFixed(1)}% of account | EV (gross)=${(evGross * 100).toFixed(2)}% | EV (net of fees)=${(evNet * 100).toFixed(2)}% | $${evPer100.toFixed(2)} edge per $100 risked | ${isCalibrated ? 'Using calibration-adjusted probability' : 'Using raw model confidence — calibration data pending'}`,
  };
}
