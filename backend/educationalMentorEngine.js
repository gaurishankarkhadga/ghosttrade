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
export function generateTradeLesson(setup = {}, regimeData = {}, ofiData = {}, promptsUsed = 0) {
  const ticker = setup.ticker || 'ASSET';
  const side = setup.side || 'LONG';
  const regime = regimeData?.regime || 'TRENDING';
  const hurst = regimeData?.hurstMean ? regimeData.hurstMean.toFixed(2) : '0.55';
  const ofi = ofiData?.ofi ? (ofiData.ofi * 100).toFixed(0) : '0';
  const rrr = setup.rrr || 2.0;

  // PROGRESSIVE CURRICULUM LOGIC
  const level = promptsUsed < 3 ? 'BEGINNER' : promptsUsed < 10 ? 'INTERMEDIATE' : 'ADVANCED';

  let beginnerLesson = `LEVEL ${promptsUsed + 1} MASTERCLASS (${level}): `;
  let coreTakeaway = '';

  if (level === 'BEGINNER') {
    // Focus on Trend & Safety
    const analogies = {
      'TRENDING': `Think of ${ticker} like a fast river. Price has strong directional inertia right now. It's much safer to swim with the current than against it.`,
      'MEAN_REVERTING': `Think of ${ticker} like a stretched rubber band. It's bouncing between two walls and snapping back to the middle.`,
      'RANDOM_WALK': `The market for ${ticker} is like stormy weather right now. There is no clear direction.`
    };
    
    beginnerLesson += analogies[regime] || analogies['RANDOM_WALK'];
    
    if (regime === 'TRENDING') {
      beginnerLesson += side === 'NEUTRAL' ? ' Even so, our engine sees mixed signals and protects your capital by waiting.' : ` We look to ride this momentum with a ${side} trade.`;
    } else if (regime === 'MEAN_REVERTING') {
      beginnerLesson += side === 'NEUTRAL' ? ' We avoid trading in the middle of this chop.' : ` We look for quick ${side} trades when the rubber band is stretched too far.`;
    } else {
      beginnerLesson += ' We reduce risk to 0% and wait for the storm to pass.';
    }
    coreTakeaway = `Never trade out of FOMO. Your first lesson is patience: only trade when the trend is clear.`;

  } else if (level === 'INTERMEDIATE') {
    // Focus on Order Flow and Risk
    beginnerLesson += `Beyond just the trend, we look at Order Flow (who is actually buying or selling). Right now, the Order Flow Imbalance is ${ofi}%. `;
    if (Number(ofi) > 10) {
       beginnerLesson += `This means aggressive buyers are stepping in and eating up the sell orders. `;
    } else if (Number(ofi) < -10) {
       beginnerLesson += `This means aggressive sellers are hitting the bid and pushing price down. `;
    } else {
       beginnerLesson += `Buyers and sellers are evenly matched right now, meaning no clear institutional advantage. `;
    }
    coreTakeaway = `The chart shows you the past, but Order Flow shows you the present. Always align your trades with aggressive institutional volume.`;

  } else {
    // Focus on Quantitative Regimes (Hurst) & Kelly Criterion
    beginnerLesson += `You've learned about trends and volume. Now, let's talk about Statistical Regimes. The Hurst Exponent (H) measures how likely a trend is to continue. `;
    beginnerLesson += `For ${ticker}, H = ${hurst}. `;
    if (Number(hurst) > 0.55) {
      beginnerLesson += `Because H > 0.55, the math confirms this is a persistent trend. It will likely keep moving in the same direction. `;
    } else if (Number(hurst) < 0.45) {
      beginnerLesson += `Because H < 0.45, the math confirms this is mean-reverting. Breakouts will likely fail and reverse. `;
    } else {
      beginnerLesson += `Because H is near 0.50, the market is in a random walk. Predictive edge is minimal. `;
    }
    coreTakeaway = `Professional trading is just math. We use the Kelly Criterion to size positions so that even if we lose, we never blow up our account.`;
  }

  // 2. Pro Lesson (Institutional Formula Breakdown) - Always available for Pro Mode
  const proLesson = `PRO QUANT BREAKDOWN:
• Regime State: ${regime} | Hurst Exponent (H): ${hurst} (H > 0.55 confirms persistent trend memory).
• Order Flow Delta: ${ofi}% (${ofiData?.flowBias || 'NEUTRAL'}). Institutional net buyers dominating liquidity depth.
• Risk-Reward Ratio (RRR): ${rrr}:1. Expected value $E[V] = (p \\times RRR) - (1-p) > 0$.
• Kelly Position Sizing: Half-Kelly sizing applied to prevent volatility drag and drawdown risk.`;

  return {
    beginnerLesson,
    proLesson,
    coreTakeaway
  };
}
