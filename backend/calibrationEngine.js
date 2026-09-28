// =====================================================
// CALIBRATION ENGINE — Rolling Confidence Calibration
// Groups resolved signals by confidence bucket and measures
// whether the AI's stated confidence matches actual accuracy.
// This is the "shows its receipts" differentiator.
// =====================================================

import { getDb } from './mongoConfig.js';

const EARLY_DATA_THRESHOLD = 50; // Below this, label calibration as "early data"

/**
 * Defines confidence buckets for grouping signals.
 * Each bucket: { label, min, max } (inclusive)
 */
const CONFIDENCE_BUCKETS = [
  { label: '50-54%', min: 50, max: 54 },
  { label: '55-59%', min: 55, max: 59 },
  { label: '60-64%', min: 60, max: 64 },
  { label: '65-69%', min: 65, max: 69 },
  { label: '70-74%', min: 70, max: 74 },
  { label: '75-79%', min: 75, max: 79 },
  { label: '80-84%', min: 80, max: 84 },
  { label: '85-89%', min: 85, max: 89 },
  { label: '90-94%', min: 90, max: 94 },
  { label: '95-99%', min: 95, max: 99 },
];

// Isotonic Regression via Pool Adjacent Violators Algorithm
// Ensures calibration curve is monotonically non-decreasing
function isotonicRegression(points) {
  // points = [{rawConf, actualWinRate, count}] sorted by rawConf
  if (!points || points.length < 2) return points;
  
  const result = points.map(p => ({ ...p }));
  let i = 0;
  while (i < result.length - 1) {
    if (result[i].actualWinRate > result[i + 1].actualWinRate) {
      // Pool adjacent violators
      const totalCount = result[i].count + result[i + 1].count;
      const pooledRate = (result[i].actualWinRate * result[i].count + result[i + 1].actualWinRate * result[i + 1].count) / totalCount;
      result[i] = { rawConf: result[i].rawConf, actualWinRate: pooledRate, count: totalCount };
      result.splice(i + 1, 1);
      if (i > 0) i--; // Step back to check previous pair
    } else {
      i++;
    }
  }
  return result;
}

function getCalibratedFromIsotonic(rawConfidence, isotonicCurve) {
  if (!isotonicCurve || isotonicCurve.length === 0) return rawConfidence;
  
  if (rawConfidence <= isotonicCurve[0].rawConf) return isotonicCurve[0].actualWinRate;
  if (rawConfidence >= isotonicCurve[isotonicCurve.length - 1].rawConf) return isotonicCurve[isotonicCurve.length - 1].actualWinRate;
  
  for (let i = 0; i < isotonicCurve.length - 1; i++) {
    const p1 = isotonicCurve[i];
    const p2 = isotonicCurve[i + 1];
    if (rawConfidence >= p1.rawConf && rawConfidence <= p2.rawConf) {
      const t = (rawConfidence - p1.rawConf) / (p2.rawConf - p1.rawConf);
      return p1.actualWinRate + t * (p2.actualWinRate - p1.actualWinRate);
    }
  }
  return rawConfidence;
}

/**
 * Fetches all resolved signals from MongoDB within a given day range.
 * "Resolved" means the auditDaemon has marked them with CORRECT or INCORRECT.
 *
 * @param {number} days - Look back window (30 | 90 | 365)
 * @returns {Array}
 */
async function fetchResolvedSignals(days = 365) {
  const db  = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return db.collection('signals')
    .find({
      resolvedOutcome: { $in: ['CORRECT', 'INCORRECT'] },
      timestamp: { $gte: cutoff },
    })
    .sort({ timestamp: -1 })
    .toArray();
}

/**
 * Builds the calibration curve for a given set of resolved signals.
 * Groups signals by confidence bucket and computes actual hit rate per bucket.
 *
 * @param {Array} signals
 * @returns {Array<CalibrationBucket>}
 */
function buildCalibrationCurve(signals) {
  return CONFIDENCE_BUCKETS.map(bucket => {
    const inBucket = signals.filter(s => {
      const conf = s.calibratedConfidence ?? s.rawConfidence ?? 0;
      return conf >= bucket.min && conf <= bucket.max;
    });

    const n = inBucket.length;
    if (n === 0) {
      return {
        bucket:      bucket.label,
        predicted:   (bucket.min + bucket.max) / 2,
        actual:      null,
        n:           0,
        error:       null,
        isEarlyData: true,
        note:        'No signals in this bucket yet.',
      };
    }

    const hits       = inBucket.filter(s => s.resolvedOutcome === 'CORRECT').length;
    const actualRate = (hits / n) * 100;
    const predicted  = (bucket.min + bucket.max) / 2;
    const calibErr   = Math.abs(predicted - actualRate);

    return {
      bucket:      bucket.label,
      predicted,
      actual:      parseFloat(actualRate.toFixed(1)),
      n,
      error:       parseFloat(calibErr.toFixed(1)),  // Calibration error in percentage points
      isEarlyData: n < EARLY_DATA_THRESHOLD,
      note:        n < EARLY_DATA_THRESHOLD
        ? `Early data — only ${n} signals. Accuracy of this bucket is statistically noisy.`
        : `${n} signals — calibration is statistically reliable.`,
    };
  });
}

/**
 * Computes the overall calibration score (Brier Score equivalent).
 * Lower = better. 0 = perfect calibration.
 */
function computeOverallCalibrationError(curve) {
  const validBuckets = curve.filter(b => b.actual !== null);
  if (validBuckets.length === 0) return null;
  const totalError = validBuckets.reduce((s, b) => s + b.error, 0);
  return parseFloat((totalError / validBuckets.length).toFixed(1));
}

/**
 * Adjusts raw AI confidence using the calibration curve.
 * If the AI says "80%" but our calibration shows 80-89% signals
 * actually hit at 65%, the adjusted output is 65%.
 *
 * @param {number} rawConfidence - Raw model confidence (0-100)
 * @param {Array}  curve          - Calibration curve from buildCalibrationCurve
 * @returns {{ calibratedConfidence: number, bucket: string, isCalibrated: boolean }}
 */
export function adjustConfidence(rawConfidence, curve) {
  const bucket = CONFIDENCE_BUCKETS.find(
    b => rawConfidence >= b.min && rawConfidence <= b.max
  );

  if (!bucket) {
    return { calibratedConfidence: rawConfidence, bucket: null, isCalibrated: false };
  }

  const bucketData = curve.find(b => b.bucket === bucket.label);

  // Only use calibrated value if we have enough data
  if (!bucketData || bucketData.actual === null || bucketData.isEarlyData) {
    return {
      calibratedConfidence: rawConfidence,
      bucket:               bucket.label,
      isCalibrated:         false,
      note:                 'Using raw confidence — insufficient calibration data for this bucket.',
    };
  }

  return {
    calibratedConfidence: bucketData.actual,
    bucket:               bucket.label,
    isCalibrated:         true,
    note:                 `Adjusted from ${rawConfidence}% to ${bucketData.actual}% based on ${bucketData.n} historical signals.`,
  };
}

/**
 * Main function: generates the full calibration report for a given time window.
 * Called by the /api/calibration endpoint and by Kelly sizing (to get adjusted p).
 *
 * @param {number} days - 30, 90, or 365
 * @returns {CalibrationReport}
 */
export async function generateCalibrationReport(days = 90) {
  try {
    const signals = await fetchResolvedSignals(days);
    const curve   = buildCalibrationCurve(signals);
    const overallError = computeOverallCalibrationError(curve);
    const totalSignals = signals.length;

    console.log(`[CALIBRATION] ${days}-day report: ${totalSignals} resolved signals | Mean error: ${overallError}pp`);

    return {
      generatedAt:      new Date().toISOString(),
      windowDays:       days,
      totalSignals,
      overallCalibrationError: overallError, // in percentage points
      isReliable:       totalSignals >= 200,
      earlyDataWarning: totalSignals < EARLY_DATA_THRESHOLD
        ? `Only ${totalSignals} resolved signals. Calibration curve is statistically noisy — treat as indicative only.`
        : null,
      curve,
    };
  } catch (err) {
    console.error('[CALIBRATION] Failed to generate report:', err.message);
    return { error: 'CALIBRATION_FAILED', message: err.message };
  }
}

let cachedCurve = null;
let cachedIsotonicCurve = null;
let curveCacheTimestamp = 0;
let cachedSignalCount = 0;
const CURVE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Gets calibration-adjusted confidence for use in Kelly sizing.
 * This is the function called by geminiEngine.js before each analysis.
 *
 * @param {number} rawConfidence - Raw model confidence (0-100)
 * @returns {{ calibratedConfidence, isCalibrated, note }}
 */
export async function getCalibratedConfidence(rawConfidence) {
  try {
    const now = Date.now();
    let signals;
    if (!cachedCurve || now - curveCacheTimestamp > CURVE_CACHE_TTL_MS) {
      signals = await fetchResolvedSignals(365);
      cachedCurve = buildCalibrationCurve(signals);
      
      const points = [];
      for (const b of cachedCurve) {
        if (b.n > 0 && b.actual !== null) {
          points.push({ rawConf: b.predicted, actualWinRate: b.actual, count: b.n });
        }
      }
      cachedIsotonicCurve = isotonicRegression(points);
      
      cachedSignalCount = signals.length;
      curveCacheTimestamp = now;
    }
    
    const totalResolvedSignals = cachedSignalCount || 0;
    
    // GhostMind v2: Early Stage Penalty
    // If the system hasn't seen enough live trades to be confident in itself, penalize confidence.
    if (totalResolvedSignals < 30) {
      return {
        calibratedConfidence: Math.max(50, rawConfidence - 10),
        isCalibrated: false,
        note: `Early stage penalty: -10% until ${30 - totalResolvedSignals} more signals are verified (Total: ${totalResolvedSignals})`
      };
    }

    // Use isotonic regression if we have sufficient data
    if (totalResolvedSignals >= 100 && cachedIsotonicCurve && cachedIsotonicCurve.length >= 2) {
      const smoothed = getCalibratedFromIsotonic(rawConfidence, cachedIsotonicCurve);
      return {
        calibratedConfidence: parseFloat(smoothed.toFixed(1)),
        isCalibrated: true,
        note: `Isotonic smoothed calibration based on ${totalResolvedSignals} total signals.`
      };
    }

    return adjustConfidence(rawConfidence, cachedCurve);
  } catch (err) {
    console.error('[CALIBRATION] getCalibratedConfidence failed:', err.message);
    return { calibratedConfidence: rawConfidence, isCalibrated: false, note: 'Calibration lookup failed — using raw confidence.' };
  }
}
