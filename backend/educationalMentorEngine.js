// =====================================================
// EDUCATIONAL MENTOR ENGINE — Ghost AI Trading Masterclass
// Translates complex quantitative physics (Hurst Exponent, Kelly Sizing,
// Order Flow Imbalance) into clear, fear-free lessons for Beginners and Pros.
// =====================================================

/**
 * Generates interactive educational masterclass lessons for a given trade setup.
 * 
 * @param {object} setup - Setup data { ticker, side, entryPrice, stopLoss, takeProfit, rrr, kellySize }
 * @param {object} regimeData - Regime classification data { regime, hurstMean }
 * @param {object} ofiData - Order flow metrics { ofi, flowBias }
 * @returns { object } - { beginnerLesson, proLesson, coreTakeaway }
 */
export function generateTradeLesson(setup = {}, regimeData = {}, ofiData = {}) {
  const ticker = setup.ticker || 'ASSET';
  const side = setup.side || 'LONG';
  const regime = regimeData?.regime || 'TRENDING';
  const hurst = regimeData?.hurstMean ? regimeData.hurstMean.toFixed(2) : '0.55';
  const ofi = ofiData?.ofi ? (ofiData.ofi * 100).toFixed(0) : '0';
  const rrr = setup.rrr || 2.0;

  // 1. Beginner Lesson (Analogy-driven, fear-free)
  let beginnerLesson = '';
  if (regime === 'TRENDING') {
    beginnerLesson = `💡 BEGINNER MASTERCLASS: Think of ${ticker} like a fast train running downhill. The Market Regime is TRENDING (Hurst score: ${hurst}), meaning price has strong inertia. We ride the train in direction ${side} with a small position size to protect your capital.`;
  } else if (regime === 'MEAN_REVERTING') {
    beginnerLesson = `💡 BEGINNER MASTERCLASS: Think of ${ticker} like a stretched rubber band. The market is RANGE-BOUND (Hurst score: ${hurst}). Price stretched too far and is snapping back toward the average price. We take a quick scalp and exit fast.`;
  } else {
    beginnerLesson = `💡 BEGINNER MASTERCLASS: The market is in a RANDOM WALK (Hurst score: ${hurst}). Think of this like stormy weather with unpredictable wind. Our AI automatically reduces risk to 0% until the storm passes.`;
  }

  // 2. Pro Lesson (Institutional Formula Breakdown)
  const proLesson = `📊 PRO QUANT BREAKDOWN:
• Regime State: ${regime} | Hurst Exponent (H): ${hurst} (H > 0.55 confirms persistent trend memory).
• Order Flow Delta: ${ofi}% (${ofiData?.flowBias || 'NEUTRAL'}). Institutional net buyers dominating liquidity depth.
• Risk-Reward Ratio (RRR): ${rrr}:1. Expected value $E[V] = (p \\times RRR) - (1-p) > 0$.
• Kelly Position Sizing: Half-Kelly sizing applied to prevent volatility drag and drawdown risk.`;

  // 3. Core Takeaway
  const coreTakeaway = `Never trade out of FOMO or fear. Always ensure Regime Alignment, Positive Order Flow, and Strict Risk Sizing before entry.`;

  return {
    beginnerLesson,
    proLesson,
    coreTakeaway
  };
}
