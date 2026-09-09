// =====================================================
// LIQUIDITY SWEEP ENGINE — Smart Money Stop-Hunt Radar
// Detects Equal Highs (EQH), Equal Lows (EQL), and
// Institutional "Turtle Soup" Liquidity Sweeps / Reclaims.
// =====================================================

/**
 * Finds local swing highs and swing lows across candle series.
 * @param {Array} candles - OHLCV candle array
 * @param {number} window - Neighboring bars to confirm local extremum (default: 3)
 */
export function findSwingPoints(candles, window = 3) {
  const swingHighs = [];
  const swingLows = [];

  if (!candles || candles.length < window * 2 + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = window; i < candles.length - window; i++) {
    const curr = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= curr.high) isHigh = false;
      if (candles[j].low <= curr.low) isLow = false;
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        price: curr.high,
        date: curr.date,
        candle: curr
      });
    }
    if (isLow) {
      swingLows.push({
        index: i,
        price: curr.low,
        date: curr.date,
        candle: curr
      });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Identifies Equal Highs (EQH) and Equal Lows (EQL) liquidity pools.
 * Tolerance threshold is 0.20% price delta.
 */
export function findLiquidityPools(swingHighs, swingLows, currentPrice, tolerancePct = 0.20, candles = []) {
  const pools = [];

  // 1. Equal Highs (Buy-Stop Liquidity Pool)
  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const h1 = swingHighs[i].price;
      const h2 = swingHighs[j].price;
      const deltaPct = (Math.abs(h1 - h2) / ((h1 + h2) / 2)) * 100;

      if (deltaPct <= tolerancePct) {
        pools.push({
          type: 'EQUAL_HIGHS',
          side: 'BUY_STOP_LIQUIDITY',
          price: Math.max(h1, h2),
          barsAgo: swingHighs.length - 1 - j,
          formationIndex: swingHighs[j].index,
          description: `Dense retail short stop-loss cluster @ $${Math.max(h1, h2).toFixed(2)}`
        });
      }
    }
  }

  // 2. Equal Lows (Sell-Stop Liquidity Pool)
  for (let i = 0; i < swingLows.length - 1; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const l1 = swingLows[i].price;
      const l2 = swingLows[j].price;
      const deltaPct = (Math.abs(l1 - l2) / ((l1 + l2) / 2)) * 100;

      if (deltaPct <= tolerancePct) {
        pools.push({
          type: 'EQUAL_LOWS',
          side: 'SELL_STOP_LIQUIDITY',
          price: Math.min(l1, l2),
          barsAgo: swingLows.length - 1 - j,
          formationIndex: swingLows[j].index,
          description: `Dense retail long stop-loss cluster @ $${Math.min(l1, l2).toFixed(2)}`
        });
      }
    }
  }

  const validPools = [];
  for (const pool of pools) {
    let consumed = false;
    if (candles && candles.length > 0 && pool.formationIndex !== undefined) {
      for (let k = pool.formationIndex + 1; k < candles.length; k++) {
        if (pool.type === 'EQUAL_HIGHS' && candles[k].close > pool.price * 1.005) {
          consumed = true; break;
        }
        if (pool.type === 'EQUAL_LOWS' && candles[k].close < pool.price * 0.995) {
          consumed = true; break;
        }
      }
    }
    if (!consumed) validPools.push(pool);
  }
  // FIXED: Invalidate pools that have been traded through (liquidity consumed)

  return validPools;
}

/**
 * Detects whether the recent candle wicks swept a major liquidity level
 * and closed back inside (Turtle Soup Reclaim / Fakeout Trap).
 *
 * @param {Array} candles - Array of recent candles (e.g. 50-100 bars)
 * @returns {Object} Liquidity Sweep Diagnostic Result
 */
export function detectLiquiditySweep(candles) {
  if (!candles || candles.length < 20) {
    return { detected: false, sweepType: null, reason: 'Insufficient candle depth' };
  }

  const recentCandles = candles.slice(-50);
  const { swingHighs, swingLows } = findSwingPoints(recentCandles, 2);
  const currentPrice = recentCandles[recentCandles.length - 1].close;
  const pools = findLiquidityPools(swingHighs, swingLows, currentPrice, 0.20, recentCandles);

  const currentBar = recentCandles[recentCandles.length - 1];
  const prevBar = recentCandles[recentCandles.length - 2];

  // Check 1: BULLISH SWEEP (Spring / Stop-Hunt of Lows)
  // Price swept below recent swing low or Equal Lows, but closed back above the level
  const majorLows = swingLows.slice(-5).map(s => s.price);
  for (const pool of pools.filter(p => p.type === 'EQUAL_LOWS')) {
    majorLows.push(pool.price);
  }

  for (const lowLevel of majorLows) {
    const sweptInCurrent = currentBar.low < lowLevel && currentBar.close > lowLevel;
    const sweptInPrev = prevBar && prevBar.low < lowLevel && prevBar.close > lowLevel && currentBar.close > lowLevel;

    if (sweptInCurrent || sweptInPrev) {
      const activeBar = sweptInCurrent ? currentBar : prevBar;
      const lowerWick = Math.min(activeBar.open, activeBar.close) - activeBar.low;
      const wickRatio = lowerWick / (activeBar.high - activeBar.low || 1);

      if (wickRatio >= 0.35) {
        let tightStopLoss = activeBar.low * 0.998;
        if ((currentPrice - tightStopLoss) / currentPrice < 0.005) { tightStopLoss = currentPrice * 0.995; } // FIXED: Enforce minimum 0.5% stop distance to avoid spread-induced stop-outs
        return {
          detected: true,
          sweepType: 'BULLISH_SWEEP',
          direction: 'BULLISH',
          poolLevel: lowLevel,
          sweepPrice: activeBar.low,
          wickRatio: Number(wickRatio.toFixed(2)),
          tightStopLoss, // Anchor SL just under sweep wick
          description: `Bullish Liquidity Sweep: Retail sell-stops @ $${lowLevel.toFixed(2)} swept & reclaimed. Lower wick ${Math.round(wickRatio * 100)}% confirms smart money absorption.`,
          gateRisk: 'LOW_RISK_RECLAIM',
          retailTrap: 'Retail traders sold the breakdown or had stops triggered right at the low.',
          capitalPreservationScore: 15
        };
      }
    }
  }

  // Check 2: BEARISH SWEEP (Upthrust / Stop-Hunt of Highs)
  // Price swept above recent swing high or Equal Highs, but closed back below the level
  const majorHighs = swingHighs.slice(-5).map(s => s.price);
  for (const pool of pools.filter(p => p.type === 'EQUAL_HIGHS')) {
    majorHighs.push(pool.price);
  }

  for (const highLevel of majorHighs) {
    const sweptInCurrent = currentBar.high > highLevel && currentBar.close < highLevel;
    const sweptInPrev = prevBar && prevBar.high > highLevel && prevBar.close < highLevel && currentBar.close < highLevel;

    if (sweptInCurrent || sweptInPrev) {
      const activeBar = sweptInCurrent ? currentBar : prevBar;
      const upperWick = activeBar.high - Math.max(activeBar.open, activeBar.close);
      const wickRatio = upperWick / (activeBar.high - activeBar.low || 1);

      if (wickRatio >= 0.35) {
        let tightStopLoss = activeBar.high * 1.002;
        if ((tightStopLoss - currentPrice) / currentPrice < 0.005) { tightStopLoss = currentPrice * 1.005; } // FIXED: Enforce minimum 0.5% stop distance to avoid spread-induced stop-outs
        return {
          detected: true,
          sweepType: 'BEARISH_SWEEP',
          direction: 'BEARISH',
          poolLevel: highLevel,
          sweepPrice: activeBar.high,
          wickRatio: Number(wickRatio.toFixed(2)),
          tightStopLoss, // Anchor SL just above sweep wick
          description: `Bearish Liquidity Sweep: Retail buy-stops @ $${highLevel.toFixed(2)} swept & rejected. Upper wick ${Math.round(wickRatio * 100)}% confirms institutional distribution.`,
          gateRisk: 'LOW_RISK_RECLAIM',
          retailTrap: 'Retail traders bought the breakout or had short stops triggered at the top of the range.',
          capitalPreservationScore: 15
        };
      }
    }
  }

  // Check 3: UNSWEPT POOL PROXIMITY (Trap warning if price is within 0.35% of an unswept pool)
  for (const pool of pools) {
    const distPct = (Math.abs(currentPrice - pool.price) / currentPrice) * 100;
    if (distPct < 0.35) {
      return {
        detected: false,
        sweepType: 'APPROACHING_LIQUIDITY_POOL', // FIXED: Changed from hard block to score penalty — breakouts often target these pools
        isWarning: true,
        scorePenalty: 10,
        poolLevel: pool.price,
        poolType: pool.type,
        distancePct: Number(distPct.toFixed(2)),
        description: `Unswept ${pool.type} liquidity pool @ $${pool.price.toFixed(2)} (${distPct.toFixed(2)}% away). High risk of immediate stop-hunt wick.`,
        gateRisk: 'HIGH_RISK_FAKE_BREAKOUT',
        retailTrap: 'Retail traders buy or sell right in front of major liquidity pools before the sweep occurs.'
      };
    }
  }

  return {
    detected: false,
    sweepType: 'NONE',
    poolsCount: pools.length,
    description: 'No active liquidity sweeps detected in the immediate lookback window.'
  };
}

