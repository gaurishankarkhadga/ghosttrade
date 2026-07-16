// =====================================================
// HURST ENGINE — Rescaled Range (R/S) + DFA Calculator
// Computes the Hurst exponent to classify market memory.
// H > 0.55 → Trending (persistent)
// H < 0.45 → Mean-Reverting (anti-persistent)
// 0.45–0.55 → Random Walk (no edge)
// Requires minimum 200 data points.
// =====================================================

const MIN_BARS = 200;
const INSTABILITY_THRESHOLD = 0.10; // Flag if R/S and DFA disagree by more than this

/**
 * Calculates the mean of an array.
 */
function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Calculates standard deviation of an array.
 */
function stdDev(arr) {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// =====================================================
// METHOD 1: Rescaled Range (R/S) Analysis
// Classic Hurst estimator. Simple and well-understood.
// =====================================================

/**
 * Computes the R/S statistic for a sub-series.
 */
function computeRS(series) {
  const m = mean(series);
  // Cumulative deviation from mean
  const cumDev = series.map((_, i) =>
    series.slice(0, i + 1).reduce((s, v) => s + (v - m), 0)
  );
  const range = Math.max(...cumDev) - Math.min(...cumDev);
  const sd = stdDev(series);
  if (sd === 0) return null;
  return range / sd;
}

/**
 * Estimates Hurst exponent via Rescaled Range (R/S) analysis.
 * Uses multiple sub-period lengths and fits a log-log regression.
 *
 * @param {number[]} logReturns - Array of log returns (min 200 elements)
 * @returns {{ h: number, r2: number } | null}
 */
function hurstRS(logReturns) {
  const n = logReturns.length;
  if (n < MIN_BARS) return null;

  // Generate sub-period sizes as powers of 2, capped at n/4
  const minWindow = 10;
  const maxWindow = Math.floor(n / 4);
  const windowSizes = [];
  for (let w = minWindow; w <= maxWindow; w = Math.ceil(w * 1.5)) {
    windowSizes.push(w);
  }

  const logN = [];
  const logRS = [];

  for (const w of windowSizes) {
    const rsValues = [];
    for (let start = 0; start + w <= n; start += w) {
      const sub = logReturns.slice(start, start + w);
      const rs = computeRS(sub);
      if (rs !== null && rs > 0) rsValues.push(rs);
    }
    if (rsValues.length > 0) {
      const avgRS = mean(rsValues);
      logN.push(Math.log(w));
      logRS.push(Math.log(avgRS));
    }
  }

  if (logN.length < 4) return null;

  // Ordinary Least Squares regression: logRS = H * logN + c
  const { slope, r2 } = olsRegression(logN, logRS);
  return { h: Math.max(0, Math.min(1, slope)), r2 };
}

// =====================================================
// METHOD 2: Detrended Fluctuation Analysis (DFA)
// More robust against non-stationarity than R/S.
// =====================================================

/**
 * Estimates Hurst exponent via Detrended Fluctuation Analysis (DFA).
 *
 * @param {number[]} logReturns - Array of log returns (min 200 elements)
 * @returns {{ h: number, r2: number } | null}
 */
function hurstDFA(logReturns) {
  const n = logReturns.length;
  if (n < MIN_BARS) return null;

  // Build cumulative sum (integrated series)
  const integrated = [];
  const m = mean(logReturns);
  let cumSum = 0;
  for (const r of logReturns) {
    cumSum += (r - m);
    integrated.push(cumSum);
  }

  const minWindow = 10;
  const maxWindow = Math.floor(n / 4);
  const windowSizes = [];
  for (let w = minWindow; w <= maxWindow; w = Math.ceil(w * 1.5)) {
    windowSizes.push(w);
  }

  const logN = [];
  const logF = [];

  for (const w of windowSizes) {
    const fluctuations = [];
    const numSegments = Math.floor(n / w);

    for (let seg = 0; seg < numSegments; seg++) {
      const segment = integrated.slice(seg * w, (seg + 1) * w);
      // Fit a local linear trend and compute residual variance
      const xs = segment.map((_, i) => i);
      const { slope: trendSlope, intercept } = olsRegression(xs, segment);
      const detrended = segment.map((v, i) => v - (trendSlope * i + intercept));
      const variance = mean(detrended.map(v => v ** 2));
      fluctuations.push(Math.sqrt(variance));
    }

    if (fluctuations.length > 0) {
      const avgF = mean(fluctuations);
      if (avgF > 0) {
        logN.push(Math.log(w));
        logF.push(Math.log(avgF));
      }
    }
  }

  if (logN.length < 4) return null;

  const { slope, r2 } = olsRegression(logN, logF);
  return { h: Math.max(0, Math.min(1, slope)), r2 };
}

// =====================================================
// OLS Regression Helper
// =====================================================

function olsRegression(x, y) {
  const n = x.length;
  const sumX  = x.reduce((s, v) => s + v, 0);
  const sumY  = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);

  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean  = sumY / n;
  const ssTot  = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes  = y.reduce((s, v, i) => s + (v - (slope * x[i] + intercept)) ** 2, 0);
  const r2     = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// =====================================================
// 95% Confidence Interval Estimation for Hurst
// Based on bootstrapped standard error approximation.
// =====================================================

function computeHurstCI(h, n) {
  // Asymptotic standard error approximation for Hurst from regression
  // SE ≈ 0.5 / sqrt(log(n))  (conservative estimate)
  const se = 0.5 / Math.sqrt(Math.log(n));
  const z95 = 1.96;
  return {
    lower: Math.max(0, h - z95 * se),
    upper: Math.min(1, h + z95 * se),
  };
}

// =====================================================
// MAIN EXPORT
// =====================================================

/**
 * Runs both R/S and DFA Hurst estimators and cross-checks results.
 * Returns full analytical context for the regime classifier.
 *
 * @param {number[]} logReturns - Log returns array (from dataFetcher.getLogReturns)
 * @returns {HurstResult}
 */
export function calculateHurst(logReturns) {
  if (!logReturns || logReturns.length < MIN_BARS) {
    return {
      error: 'INSUFFICIENT_DATA',
      message: `Need ≥${MIN_BARS} bars. Got ${logReturns?.length ?? 0}.`,
      count: logReturns?.length ?? 0,
    };
  }

  const rsResult  = hurstRS(logReturns);
  const dfaResult = hurstDFA(logReturns);

  if (!rsResult || !dfaResult) {
    return { error: 'CALCULATION_FAILED', message: 'Regression failed — insufficient variation in data.' };
  }

  const mean_h    = (rsResult.h + dfaResult.h) / 2;
  const disagreement = Math.abs(rsResult.h - dfaResult.h);
  const isStable  = disagreement <= INSTABILITY_THRESHOLD;
  const ci        = computeHurstCI(mean_h, logReturns.length);

  // Regime classification from mean Hurst
  let regime, interpretation;
  if (mean_h > 0.55) {
    regime = 'TRENDING';
    interpretation = `H=${mean_h.toFixed(3)} — Market exhibits momentum persistence. Trend-following strategies have a statistical edge.`;
  } else if (mean_h < 0.45) {
    regime = 'MEAN_REVERTING';
    interpretation = `H=${mean_h.toFixed(3)} — Market exhibits mean-reversion. Counter-trend strategies have a statistical edge.`;
  } else {
    regime = 'RANDOM_WALK';
    interpretation = `H=${mean_h.toFixed(3)} — Market is near-random. No statistical edge detected. SHIELD MODE recommended.`;
  }

  const result = {
    rsH:           rsResult.h,
    rsR2:          rsResult.r2,
    dfaH:          dfaResult.h,
    dfaR2:         dfaResult.r2,
    meanH:         mean_h,
    disagreement:  disagreement,
    isStable:      isStable,
    ci95:          ci,
    regime,
    interpretation,
    barsUsed:      logReturns.length,
    warning:       isStable ? null : `R/S (${rsResult.h.toFixed(3)}) and DFA (${dfaResult.h.toFixed(3)}) disagree by ${disagreement.toFixed(3)} — read is UNSTABLE. Treat with caution.`,
  };

  console.log(`[HURST] ${regime} | R/S=${rsResult.h.toFixed(3)} DFA=${dfaResult.h.toFixed(3)} Mean=${mean_h.toFixed(3)} Stable=${isStable}`);
  return result;
}
