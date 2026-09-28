// =====================================================
// LOSS AUTOPSY ENGINE — Categorize Every Loss
// When a signal resolves as INCORRECT, this engine
// analyzes WHY it failed and stores the error category
// for the GhostMind instant learning loop.
//
// Categories:
//   COUNTER_TREND    — Signal went against dominant market trend
//   REGIME_SHIFT     — Market regime changed after generation
//   LIQUIDITY_TRAP   — Stopped out by institutional sweep
//   OVEREXTENSION    — Entered too far from mean
//   VOLUME_FADE      — Volume dried up, no follow-through
//   EXPIRATION_FLAT  — Market barely moved, expired worthless
//   DUPLICATE_LOSS   — Same asset already failed recently
//   UNKNOWN          — Could not categorize
// =====================================================

import { getDb } from './mongoConfig.js';

const LOSS_CATEGORIES = {
  COUNTER_TREND:    'Signal went against the dominant market trend',
  REGIME_SHIFT:     'Market regime changed after signal was generated',
  LIQUIDITY_TRAP:   'Stopped out by institutional liquidity sweep',
  OVEREXTENSION:    'Entered too far from mean, got mean-reverted',
  VOLUME_FADE:      'Volume dried up after entry, no follow-through',
  EXPIRATION_FLAT:  'Market barely moved, signal expired worthless',
  DUPLICATE_LOSS:   'Same asset already failed recently',
  REGIME_RANDOM_WALK: 'Regime was completely random walk',
  REGIME_AMBIGUOUS: 'Regime was ambiguous based on Hurst exponent',
  WEAK_REGIME:      'Score breakdown showed weak regime alignment',
  NO_ORDER_FLOW:    'Score breakdown showed no order flow',
  LOW_VOLUME:       'Score breakdown showed low volume confirmation',
  WEAK_CONFLUENCE:  'Score breakdown showed weak technical confluence',
  UNKNOWN:          'Could not determine specific failure category'
};

// Tier 1: Deterministic categorization from signal metadata (NOT text)
export function categorizeFromMetadata(signal) {
  // Use actual quantitative data instead of text matching
  const regimeType = typeof signal.regime === 'string' ? signal.regime : signal.regime?.regime;
  if (regimeType === 'RANDOM_WALK') return 'REGIME_RANDOM_WALK';
  if (signal.hurst?.ci95 && signal.hurst.ci95.lower < 0.40 && signal.hurst.ci95.upper > 0.60) return 'REGIME_AMBIGUOUS';
  
  // Counter-trend: signal direction vs higher-TF trend  
  if (signal.macroTrend && signal.macroTrend !== 'NEUTRAL' && signal.macroTrend !== signal.direction) return 'COUNTER_TREND';
  
  // Overextension: price was too far from SMA20
  if (signal.scoreBreakdown?.regimeAlignment < 30) return 'WEAK_REGIME';
  if (signal.scoreBreakdown?.orderFlow < 30) return 'NO_ORDER_FLOW';
  if (signal.scoreBreakdown?.volumeConfirmation < 30) return 'LOW_VOLUME';
  if (signal.scoreBreakdown?.technicalConfluence < 40) return 'WEAK_CONFLUENCE';
  
  // Liquidity trap: if sweep data shows entry near pool
  if (signal.liquiditySweep?.sweepType === 'APPROACHING_LIQUIDITY_POOL') return 'LIQUIDITY_TRAP';
  
  return 'UNCATEGORIZED';
}

function hasPositiveKeyword(text, keywords) {
  const negations = ['no', 'not', 'without', 'denied', 'lacks'];
  for (const kw of keywords) {
    let idx = text.indexOf(kw);
    while (idx !== -1) {
      const beforeText = text.substring(0, idx);
      const beforeWords = beforeText.split(/[\s,.-]+/).filter(Boolean).slice(-3);
      if (!beforeWords.some(w => negations.includes(w))) {
        return true;
      }
      idx = text.indexOf(kw, idx + 1);
    }
  }
  return false;
}

/**
 * Classifies the loss category based on the resolved signal's data.
 * Tier 2: Text-based approach as fallback with negation handling.
 *
 * @param {Object} signal - The resolved signal document from MongoDB
 * @returns {string} - One of the LOSS_CATEGORIES keys
 */
function classifyLossCategoryText(signal) {
  const reason = (signal.resolvedReason || '').toLowerCase();
  const errorVector = (signal.errorVector || '').toLowerCase();
  const combinedText = `${reason} ${errorVector}`;

  // Priority-ordered classification rules
  
  // 1. Counter-trend detection
  if (hasPositiveKeyword(combinedText, ['counter-trend', 'macro', 'higher-timeframe', '1d trend', '4h trend', 'meso']) ||
      (hasPositiveKeyword(combinedText, ['directional bias']) && hasPositiveKeyword(combinedText, ['against']))) {
    return 'COUNTER_TREND';
  }

  // 2. Liquidity trap / stop hunt
  if (hasPositiveKeyword(combinedText, ['liquidity', 'sweep', 'stop hunt', 'wall', 'institutional', 'depth'])) {
    return 'LIQUIDITY_TRAP';
  }

  // 3. Overextension
  if (hasPositiveKeyword(combinedText, ['overextend', 'vwap', 'mean revert', 'pullback', 'far from'])) {
    return 'OVEREXTENSION';
  }

  // 4. Volume fade
  if (hasPositiveKeyword(combinedText, ['volume', 'momentum', 'no follow', 'dried', 'stall'])) {
    return 'VOLUME_FADE';
  }

  // 5. Expiration flat (expired without hitting TP or SL)
  if (hasPositiveKeyword(combinedText, ['expir', 'failed to hold', 'flat', 'chop'])) {
    return 'EXPIRATION_FLAT';
  }

  // 6. Regime shift
  if (hasPositiveKeyword(combinedText, ['regime', 'hurst', 'random walk', 'structure'])) {
    return 'REGIME_SHIFT';
  }

  // 7. Check for duplicate pattern
  if (hasPositiveKeyword(combinedText, ['duplicate', 'repeated'])) {
    return 'DUPLICATE_LOSS';
  }

  return 'UNKNOWN';
}

/**
 * Main categorization function combining Tier 1 and Tier 2
 */
function classifyLossCategory(signal) {
  const tier1Category = categorizeFromMetadata(signal);
  if (tier1Category !== 'UNCATEGORIZED') {
    return { category: tier1Category, source: 'METADATA' };
  }
  return { category: classifyLossCategoryText(signal), source: 'TEXT_FALLBACK' };
}

/**
 * Performs a full autopsy on a failed signal.
 * Stores the categorized loss in the loss_autopsy collection
 * and updates rolling loss pattern counts.
 *
 * @param {Object} signal - The full signal document from MongoDB
 * @returns {Object} - The autopsy result { category, description }
 */
export async function performAutopsy(signal) {
  if (!signal) {
    console.warn('[AUTOPSY] No signal provided for autopsy');
    return null;
  }

  try {
    const { category, source: categorySource } = classifyLossCategory(signal);
    const description = LOSS_CATEGORIES[category] || LOSS_CATEGORIES.UNKNOWN;
    const db = await getDb();

    const quantitativeFactors = {
      maxAdverseExcursion: signal.maxAdverseExcursion || null,
      entryToStopDistance: signal.riskDistance || null,
      scoreAtEntry: signal.score || null,
      regimeAtEntry: signal.regime?.regime || null,
      winRateAtScore: signal.scoreBreakdown?.historicalWinRate || null
    };

    const autopsyDoc = {
      signalId: signal._id || signal.signalHash,
      ticker: signal.ticker || 'UNKNOWN',
      direction: signal.direction || 'UNKNOWN',
      regime: signal.regime?.regime || signal.regime || 'UNKNOWN',
      category,
      categorySource,
      quantitativeFactors,
      description,
      score: signal.calibratedConfidence || signal.rawConfidence || signal.score || 0,
      resolvedReason: signal.resolvedReason || null,
      errorVector: signal.errorVector || null,
      entryPrice: signal.currentPrice || null,
      exitPrice: signal.resolvedPrice || null,
      timestamp: new Date(),
      signalTimestamp: signal.timestamp ? new Date(signal.timestamp) : null
    };

    // Store the autopsy
    await db.collection('loss_autopsy').insertOne(autopsyDoc);

    // Update rolling pattern counts (upsert per category+regime+direction)
    const patternKey = {
      category,
      regime: autopsyDoc.regime,
      direction: autopsyDoc.direction
    };

    await db.collection('loss_patterns').updateOne(
      patternKey,
      {
        $inc: { count: 1 },
        $set: {
          lastOccurred: new Date(),
          lastTicker: autopsyDoc.ticker,
          description
        }
      },
      { upsert: true }
    );

    console.log(`[AUTOPSY] 🔍 ${autopsyDoc.ticker} ${autopsyDoc.direction} loss categorized as: ${category} (${categorySource}) — "${description}"`);

    return { category, categorySource, description, ticker: autopsyDoc.ticker, quantitativeFactors };
  } catch (err) {
    console.error('[AUTOPSY] Failed to perform autopsy:', err.message);
    return null;
  }
}

/**
 * Retrieves the loss autopsy summary for the last N days.
 * Useful for the performance dashboard and calibration engine.
 *
 * @param {number} days - Lookback window (default 30)
 * @returns {Object} - { categories: { [category]: count }, total, topCategory }
 */
export async function getAutopsySummary(days = 30) {
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];

    const results = await db.collection('loss_autopsy').aggregate(pipeline).toArray();

    const categories = {};
    let total = 0;
    for (const r of results) {
      categories[r._id] = r.count;
      total += r.count;
    }

    const topCategory = results.length > 0 ? results[0]._id : null;

    return { categories, total, topCategory, days };
  } catch (err) {
    console.error('[AUTOPSY] Summary failed:', err.message);
    return { categories: {}, total: 0, topCategory: null, days };
  }
}

export { LOSS_CATEGORIES };
