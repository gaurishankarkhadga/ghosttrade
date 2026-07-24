// =====================================================
// TECHNICAL ENGINE — Server-Side Indicator Calculations
// Provides RSI, MACD, Bollinger Bands, ATR, SMA/EMA
// so the AI doesn't have to guess from screenshot pixels.
// =====================================================

/**
 * Calculates Simple Moving Average for the last `period` values.
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - SMA period (e.g., 20, 50, 200)
 * @returns {number|null}
 */
export function sma(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/**
 * Calculates Exponential Moving Average.
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - EMA period
 * @returns {number|null}
 */
export function ema(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = sma(closes.slice(0, period), period);
  for (let i = period; i < closes.length; i++) {
    emaVal = closes[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

/**
 * Calculates RSI (Relative Strength Index).
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {{ value: number, interpretation: string }|null}
 */
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
  }

  if (avgLoss === 0) return { value: 100, interpretation: 'Extremely overbought — reversal likely' };

  const rs = avgGain / avgLoss;
  const rsiVal = 100 - (100 / (1 + rs));

  let interpretation;
  if (rsiVal > 80) interpretation = 'Extremely overbought — high reversal probability';
  else if (rsiVal > 70) interpretation = 'Overbought — momentum exhaustion warning';
  else if (rsiVal > 55) interpretation = 'Bullish momentum — trend continuation likely';
  else if (rsiVal > 45) interpretation = 'Neutral — no directional bias from RSI';
  else if (rsiVal > 30) interpretation = 'Bearish momentum — trend continuation likely';
  else if (rsiVal > 20) interpretation = 'Oversold — reversal potential building';
  else interpretation = 'Extremely oversold — reversal likely';

  return { value: parseFloat(rsiVal.toFixed(2)), interpretation };
}

/**
 * Calculates MACD (Moving Average Convergence Divergence).
 * @param {number[]} closes
 * @param {number} fastPeriod - Fast EMA (default 12)
 * @param {number} slowPeriod - Slow EMA (default 26)
 * @param {number} signalPeriod - Signal EMA (default 9)
 * @returns {{ macd: number, signal: number, histogram: number, interpretation: string }|null}
 */
export function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) return null;

  // Calculate MACD line values for signal EMA
  const macdLine = [];
  for (let i = slowPeriod; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const fastEma = ema(slice, fastPeriod);
    const slowEma = ema(slice, slowPeriod);
    if (fastEma !== null && slowEma !== null) {
      macdLine.push(fastEma - slowEma);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = ema(macdLine, signalPeriod);
  if (signalVal === null) return null;

  const histogram = macdVal - signalVal;

  let interpretation;
  if (macdVal > 0 && histogram > 0) interpretation = 'Bullish — MACD above zero with rising histogram';
  else if (macdVal > 0 && histogram < 0) interpretation = 'Bullish weakening — MACD above zero but histogram declining';
  else if (macdVal < 0 && histogram < 0) interpretation = 'Bearish — MACD below zero with falling histogram';
  else if (macdVal < 0 && histogram > 0) interpretation = 'Bearish weakening — MACD below zero but histogram rising (potential crossover)';
  else interpretation = 'Neutral — MACD near zero line';

  return {
    macd: parseFloat(macdVal.toFixed(4)),
    signal: parseFloat(signalVal.toFixed(4)),
    histogram: parseFloat(histogram.toFixed(4)),
    interpretation,
  };
}

/**
 * Calculates Bollinger Bands.
 * @param {number[]} closes
 * @param {number} period - SMA period (default 20)
 * @param {number} multiplier - StdDev multiplier (default 2)
 * @returns {{ upper, middle, lower, bandwidth, percentB, squeeze, interpretation }|null}
 */
export function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;
  const bandwidth = ((upper - lower) / middle) * 100;
  const currentPrice = closes[closes.length - 1];
  const percentB = (currentPrice - lower) / (upper - lower);

  // Squeeze detection: bandwidth < 4% suggests compression
  const squeeze = bandwidth < 4;

  let interpretation;
  if (squeeze) interpretation = 'Bollinger Squeeze detected — low volatility compression, breakout imminent';
  else if (percentB > 1) interpretation = `Price above upper band (%B=${percentB.toFixed(2)}) — extended, potential reversal`;
  else if (percentB > 0.8) interpretation = `Price near upper band (%B=${percentB.toFixed(2)}) — bullish momentum but approaching resistance`;
  else if (percentB > 0.5) interpretation = `Price in upper half (%B=${percentB.toFixed(2)}) — bullish bias`;
  else if (percentB > 0.2) interpretation = `Price in lower half (%B=${percentB.toFixed(2)}) — bearish bias`;
  else if (percentB > 0) interpretation = `Price near lower band (%B=${percentB.toFixed(2)}) — potential support bounce`;
  else interpretation = `Price below lower band (%B=${percentB.toFixed(2)}) — extended, potential reversal`;

  return {
    upper: parseFloat(upper.toFixed(2)),
    middle: parseFloat(middle.toFixed(2)),
    lower: parseFloat(lower.toFixed(2)),
    bandwidth: parseFloat(bandwidth.toFixed(2)),
    percentB: parseFloat(percentB.toFixed(3)),
    squeeze,
    interpretation,
  };
}

/**
 * Calculates ATR (Average True Range) for volatility measurement.
 * @param {Array<{high, low, close}>} bars - OHLCV bars
 * @param {number} period - ATR period (default 14)
 * @returns {{ value, percentOfPrice, regime, interpretation }|null}
 */
export function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trueRanges.push(tr);
  }

  // Initial ATR = simple average
  let atrVal = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Smoothed ATR
  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
  }

  const currentPrice = bars[bars.length - 1].close;
  const percentOfPrice = (atrVal / currentPrice) * 100;

  let regime, interpretation;
  if (percentOfPrice > 5) {
    regime = 'EXTREME_VOLATILITY';
    interpretation = `ATR=${percentOfPrice.toFixed(1)}% of price — extreme volatility. Widen stops or reduce position size.`;
  } else if (percentOfPrice > 3) {
    regime = 'HIGH_VOLATILITY';
    interpretation = `ATR=${percentOfPrice.toFixed(1)}% of price — high volatility. Normal stop-loss distances may be too tight.`;
  } else if (percentOfPrice > 1.5) {
    regime = 'NORMAL_VOLATILITY';
    interpretation = `ATR=${percentOfPrice.toFixed(1)}% of price — normal market conditions.`;
  } else {
    regime = 'LOW_VOLATILITY';
    interpretation = `ATR=${percentOfPrice.toFixed(1)}% of price — low volatility (compression). Potential breakout setup.`;
  }

  return {
    value: parseFloat(atrVal.toFixed(4)),
    percentOfPrice: parseFloat(percentOfPrice.toFixed(2)),
    regime,
    interpretation,
  };
}

/**
 * Calculates volume analysis metrics.
 * @param {Array<{close, volume}>} bars - OHLCV bars
 * @param {number} lookback - Period for volume average (default 20)
 * @returns {{ avgVolume, currentVolume, relativeVolume, trend, interpretation }|null}
 */
export function volumeAnalysis(bars, lookback = 20) {
  if (bars.length < lookback) return null;

  const recentBars = bars.slice(-lookback);
  const avgVolume = recentBars.reduce((s, b) => s + b.volume, 0) / lookback;
  const currentVolume = bars[bars.length - 1].volume;
  const relativeVolume = avgVolume > 0 ? currentVolume / avgVolume : 0;

  // Check volume trend (last 5 bars vs previous 5)
  const last5 = bars.slice(-5).reduce((s, b) => s + b.volume, 0) / 5;
  const prev5 = bars.slice(-10, -5).reduce((s, b) => s + b.volume, 0) / 5;
  const trend = last5 > prev5 * 1.1 ? 'INCREASING' : last5 < prev5 * 0.9 ? 'DECREASING' : 'STABLE';

  // Check for volume-price divergence
  const priceUp = bars[bars.length - 1].close > bars[bars.length - 5].close;
  const volumeDown = trend === 'DECREASING';
  const divergence = priceUp && volumeDown ? 'BEARISH_DIVERGENCE'
    : !priceUp && volumeDown ? 'BULLISH_DIVERGENCE'
    : 'NONE';

  let interpretation;
  if (divergence === 'BEARISH_DIVERGENCE') {
    interpretation = 'Price rising on declining volume — bearish divergence. Rally may be exhausting.';
  } else if (divergence === 'BULLISH_DIVERGENCE') {
    interpretation = 'Price falling on declining volume — bullish divergence. Selling pressure weakening.';
  } else if (relativeVolume > 2) {
    interpretation = `Volume ${relativeVolume.toFixed(1)}x above average — significant institutional activity.`;
  } else if (relativeVolume > 1.3) {
    interpretation = `Volume ${relativeVolume.toFixed(1)}x above average — above-normal interest.`;
  } else if (relativeVolume < 0.5) {
    interpretation = `Volume ${relativeVolume.toFixed(1)}x below average — thin liquidity, moves may be unreliable.`;
  } else {
    interpretation = `Volume at ${relativeVolume.toFixed(1)}x average — normal market conditions.`;
  }

  return {
    avgVolume: Math.round(avgVolume),
    currentVolume: Math.round(currentVolume),
    relativeVolume: parseFloat(relativeVolume.toFixed(2)),
    trend,
    divergence,
    interpretation,
  };
}

/**
 * Calculates Standard Pivot Points and Support/Resistance Levels.
 * Uses the most recent completed period (e.g., previous day if daily).
 * @param {Array<{high, low, close}>} bars - OHLCV bars
 * @returns {Object|null}
 */
export function calculatePivotPoints(bars) {
  if (bars.length < 2) return null;
  
  // Use the previous completed bar for calculation
  const prevBar = bars[bars.length - 2];
  const { high, low, close } = prevBar;
  
  const pivot = (high + low + close) / 3;
  const r1 = (2 * pivot) - low;
  const s1 = (2 * pivot) - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);

  return {
    pivot: parseFloat(pivot.toFixed(2)),
    r1: parseFloat(r1.toFixed(2)),
    r2: parseFloat(r2.toFixed(2)),
    r3: parseFloat(r3.toFixed(2)),
    s1: parseFloat(s1.toFixed(2)),
    s2: parseFloat(s2.toFixed(2)),
    s3: parseFloat(s3.toFixed(2)),
  };
}

/**
 * Master function: Runs all technical analysis and returns a formatted context block
 * for injection into the AI system prompt.
 *
 * @param {Array<{date, open, high, low, close, volume}>} bars - OHLCV data
 * @returns {string} - Formatted technical analysis context block
 */
export function calculateAllIndicators(bars) {
  if (!bars || bars.length < 30) {
    return '\n=== TECHNICAL INDICATORS: INSUFFICIENT DATA ===\n';
  }

  const closes = bars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];

  const rsiResult = rsi(closes);
  const macdResult = macd(closes);
  const bbResult = bollingerBands(closes);
  const atrResult = atr(bars);
  const volResult = volumeAnalysis(bars);
  const pivotResult = calculatePivotPoints(bars);

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);

  let block = `\n=== PHASE 4 TECHNICAL INDICATORS (COMPUTED FROM LIVE DATA) ===\n`;
  block += `Current Price: $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;

  // Moving Averages
  block += `\nMOVING AVERAGES:\n`;
  if (sma20) block += `  SMA(20): $${sma20.toFixed(2)} | Price ${currentPrice > sma20 ? 'ABOVE' : 'BELOW'}\n`;
  if (sma50) block += `  SMA(50): $${sma50.toFixed(2)} | Price ${currentPrice > sma50 ? 'ABOVE' : 'BELOW'}\n`;
  if (sma200) block += `  SMA(200): $${sma200.toFixed(2)} | Price ${currentPrice > sma200 ? 'ABOVE' : 'BELOW'}\n`;
  if (ema20) block += `  EMA(20): $${ema20.toFixed(2)} | EMA(50): ${ema50 ? '$' + ema50.toFixed(2) : 'N/A'}\n`;
  if (sma20 && sma50) {
    block += `  MA Cross: ${sma20 > sma50 ? 'GOLDEN (bullish — SMA20 > SMA50)' : 'DEATH (bearish — SMA20 < SMA50)'}\n`;
  }

  // Pivot Points (Support/Resistance)
  if (pivotResult) {
    block += `\nSUPPORT & RESISTANCE (PIVOT POINTS):\n`;
    block += `  R3: $${pivotResult.r3}\n`;
    block += `  R2: $${pivotResult.r2}\n`;
    block += `  R1: $${pivotResult.r1}\n`;
    block += `  PIVOT: $${pivotResult.pivot}\n`;
    block += `  S1: $${pivotResult.s1}\n`;
    block += `  S2: $${pivotResult.s2}\n`;
    block += `  S3: $${pivotResult.s3}\n`;
  }

  // RSI
  if (rsiResult) {
    block += `\nRSI(14): ${rsiResult.value} | ${rsiResult.interpretation}\n`;
  }

  // MACD
  if (macdResult) {
    block += `MACD: Line=${macdResult.macd} Signal=${macdResult.signal} Histogram=${macdResult.histogram} | ${macdResult.interpretation}\n`;
  }

  // Bollinger Bands
  if (bbResult) {
    block += `BOLLINGER BANDS(20,2): Upper=$${bbResult.upper} Mid=$${bbResult.middle} Lower=$${bbResult.lower} | BW=${bbResult.bandwidth}% | %B=${bbResult.percentB} | ${bbResult.interpretation}\n`;
  }

  // ATR
  if (atrResult) {
    block += `ATR(14): $${atrResult.value} (${atrResult.percentOfPrice}% of price) | Regime=${atrResult.regime} | ${atrResult.interpretation}\n`;
  }

  // Volume
  if (volResult) {
    block += `VOLUME: Relative=${volResult.relativeVolume}x avg | Trend=${volResult.trend} | Divergence=${volResult.divergence} | ${volResult.interpretation}\n`;
  }

  block += `\nUse these computed values in your analysis. DO NOT guess indicator values — use the numbers above.\n`;

  return block;
}
