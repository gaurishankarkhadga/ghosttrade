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
  UNKNOWN:          'Could not determine specific failure category'
};

/**
 * Classifies the loss category based on the resolved signal's data.
 * Uses the signal's metadata, resolved reason, and error vectors.
 *
 * @param {Object} signal - The resolved signal document from MongoDB
 * @returns {string} - One of the LOSS_CATEGORIES keys
 */
function classifyLossCategory(signal) {
  const reason = (signal.resolvedReason || '').toLowerCase();
  const errorVector = (signal.errorVector || '').toLowerCase();
  const combinedText = `${reason} ${errorVector}`;

  // Priority-ordered classification rules
  
  // 1. Counter-trend detection
  if (
    combinedText.includes('counter-trend') ||
    combinedText.includes('macro') ||
    combinedText.includes('higher-timeframe') ||
    combinedText.includes('1d trend') ||
    combinedText.includes('4h trend') ||
    combinedText.includes('meso') ||
    combinedText.includes('directional bias') && combinedText.includes('against')
  ) {
    return 'COUNTER_TREND';
  }

  // 2. Liquidity trap / stop hunt
  if (
    combinedText.includes('liquidity') ||
    combinedText.includes('sweep') ||
    combinedText.includes('stop hunt') ||
    combinedText.includes('wall') ||
    combinedText.includes('institutional') ||
    combinedText.includes('depth')
  ) {
    return 'LIQUIDITY_TRAP';
  }

  // 3. Overextension
  if (
    combinedText.includes('overextend') ||
    combinedText.includes('vwap') ||
    combinedText.includes('mean revert') ||
    combinedText.includes('pullback') ||
    combinedText.includes('far from')
  ) {
    return 'OVEREXTENSION';
  }

  // 4. Volume fade
  if (
    combinedText.includes('volume') ||
    combinedText.includes('momentum') ||
    combinedText.includes('no follow') ||
    combinedText.includes('dried') ||
    combinedText.includes('stall')
  ) {
    return 'VOLUME_FADE';
  }

  // 5. Expiration flat (expired without hitting TP or SL)
  if (
    combinedText.includes('expir') ||
    combinedText.includes('failed to hold') ||
    combinedText.includes('flat') ||
    combinedText.includes('chop')
  ) {
    return 'EXPIRATION_FLAT';
  }

  // 6. Regime shift
  if (
    combinedText.includes('regime') ||
    combinedText.includes('hurst') ||
    combinedText.includes('random walk') ||
    combinedText.includes('structure')
  ) {
    return 'REGIME_SHIFT';
  }

  // 7. Check for duplicate pattern
  if (
    combinedText.includes('duplicate') ||
    combinedText.includes('repeated')
  ) {
    return 'DUPLICATE_LOSS';
  }

  return 'UNKNOWN';
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
    const category = classifyLossCategory(signal);
    const description = LOSS_CATEGORIES[category] || LOSS_CATEGORIES.UNKNOWN;
    const db = await getDb();

    const autopsyDoc = {
      signalId: signal._id || signal.signalHash,
      ticker: signal.ticker || 'UNKNOWN',
      direction: signal.direction || 'UNKNOWN',
      regime: signal.regime?.regime || signal.regime || 'UNKNOWN',
      category,
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

    console.log(`[AUTOPSY] 🔍 ${autopsyDoc.ticker} ${autopsyDoc.direction} loss categorized as: ${category} — "${description}"`);

    return { category, description, ticker: autopsyDoc.ticker };
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
