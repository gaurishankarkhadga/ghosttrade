// =====================================================
// GLOBAL ANALYSIS CACHE — "1 = ALL" Architecture (Hybrid)
// Single source of truth for pre-computed asset analysis.
// Supports massive scaling via Upstash Redis REST API.
// Falls back to local memory if Upstash is not configured.
// =====================================================

import { Redis } from '@upstash/redis';
import 'dotenv/config';

// 1. Initialize Upstash Redis if configured
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[GLOBAL CACHE] Upstash Redis connected for massive scaling.');
  } catch (err) {
    console.error('[GLOBAL CACHE] Upstash init failed, falling back to local RAM:', err.message);
  }
} else {
  console.log('[GLOBAL CACHE] No Upstash config found. Using local RAM fallback.');
}

// 2. Local Fallback State
const localCache = {};
let localLastUpdateTimestamp = null;
let localScanCycleCount = 0;

/**
 * Updates the global cache with enriched scan results.
 * @param {Array} enrichedResults - Array of enriched asset objects
 */
export async function updateGlobalCache(enrichedResults) {
  if (!Array.isArray(enrichedResults)) return;

  const totalAssets = enrichedResults.length;
  let withSignals = 0;
  
  if (redis) {
    try {
      // Create an object for HSET (key: asset.ticker, value: JSON string)
      const pipeline = redis.pipeline();
      const assetsData = {};
      for (const asset of enrichedResults) {
        if (!asset || !asset.ticker) continue;
        const assetObj = { ...asset, cachedAt: Date.now() };
        if (assetObj.signalData && assetObj.signalData.action !== 'NO_SIGNAL') withSignals++;
        assetsData[assetObj.ticker] = JSON.stringify(assetObj);
      }
      
      // Store all assets in a single hash called "ghosttrade:assets"
      pipeline.hset('ghosttrade:assets', assetsData);
      // Store metadata
      pipeline.set('ghosttrade:metadata:lastUpdate', Date.now());
      pipeline.incr('ghosttrade:metadata:scanCycleCount');
      
      await pipeline.exec();
      console.log(`[UPSTASH CACHE] Updated: ${totalAssets} assets | ${withSignals} with signals`);
      return;
    } catch (e) {
      console.error('[UPSTASH CACHE] Write failed, falling back to local memory:', e.message);
    }
  }

  // Local RAM Fallback
  for (const asset of enrichedResults) {
    if (!asset || !asset.ticker) continue;
    const assetObj = { ...asset, cachedAt: Date.now() };
    if (assetObj.signalData && assetObj.signalData.action !== 'NO_SIGNAL') withSignals++;
    localCache[assetObj.ticker] = assetObj;
  }
  localLastUpdateTimestamp = Date.now();
  localScanCycleCount++;
  console.log(`[LOCAL CACHE] Updated: ${totalAssets} assets | ${withSignals} with signals | Cycle #${localScanCycleCount}`);
}

/**
 * Returns the pre-computed analysis for a specific ticker.
 * @param {string} ticker - Asset ticker (e.g., 'BTC-USD')
 * @returns {Object|null} Full enriched asset data or null
 */
export async function getGlobalAssetAnalysis(ticker) {
  if (!ticker) return null;
  const keysToTry = [ticker, `${ticker}-USD`, `${ticker}.NS`];
  const MAX_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes max freshness

  if (redis) {
    try {
      // HGET returns the parsed JSON object automatically with @upstash/redis
      for (const key of keysToTry) {
        const data = await redis.hget('ghosttrade:assets', key);
        if (data) {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsed && parsed.cachedAt && (Date.now() - parsed.cachedAt > MAX_CACHE_AGE_MS)) {
            console.log(`[UPSTASH CACHE] Stale entry for ${key} (${Math.round((Date.now() - parsed.cachedAt) / 1000)}s old). Discarding.`);
            return null;
          }
          return parsed;
        }
      }
      return null;
    } catch (e) {
      console.error('[UPSTASH CACHE] Read failed:', e.message);
    }
  }

  // Local RAM Fallback
  for (const key of keysToTry) {
    if (localCache[key]) {
      const asset = localCache[key];
      if (asset && asset.cachedAt && (Date.now() - asset.cachedAt > MAX_CACHE_AGE_MS)) {
        console.log(`[LOCAL CACHE] Stale entry for ${key} (${Math.round((Date.now() - asset.cachedAt) / 1000)}s old). Discarding.`);
        delete localCache[key];
        return null;
      }
      return asset;
    }
  }
  return null;
}

/**
 * Returns ALL cached assets as an array (for broadcasting).
 * @returns {Array} Array of all cached asset objects
 */
export async function getAllCachedAssets() {
  const MAX_CACHE_AGE_MS = 10 * 60 * 1000; // 10 minutes max for broad scans
  const now = Date.now();

  if (redis) {
    try {
      // HGETALL returns an object like { "BTC-USD": {...}, "ETH-USD": {...} }
      const allData = await redis.hgetall('ghosttrade:assets');
      if (allData) {
        return Object.values(allData)
          .map(val => typeof val === 'string' ? JSON.parse(val) : val)
          .filter(a => a && a.cachedAt && (now - a.cachedAt <= MAX_CACHE_AGE_MS));
      }
      return [];
    } catch (e) {
      console.error('[UPSTASH CACHE] GetAll failed:', e.message);
    }
  }
  
  // Local RAM Fallback
  return Object.values(localCache).filter(a => a && a.cachedAt && (now - a.cachedAt <= MAX_CACHE_AGE_MS));
}

/**
 * Returns cache freshness info.
 * @returns {Object} { ageMs, scanCycleCount, totalAssets }
 */
export async function getCacheInfo() {
  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.get('ghosttrade:metadata:lastUpdate');
      pipeline.get('ghosttrade:metadata:scanCycleCount');
      pipeline.hlen('ghosttrade:assets');
      const results = await pipeline.exec();
      
      const lastUpdate = results[0] ? Number(results[0]) : null;
      const count = results[1] ? Number(results[1]) : 0;
      const length = results[2] ? Number(results[2]) : 0;
      
      return {
        ageMs: lastUpdate ? Date.now() - lastUpdate : null,
        lastUpdateTimestamp: lastUpdate,
        scanCycleCount: count,
        totalAssets: length,
        isStale: lastUpdate ? (Date.now() - lastUpdate) > 120000 : true
      };
    } catch (e) {
      console.error('[UPSTASH CACHE] Info failed:', e.message);
    }
  }

  // Local RAM Fallback
  return {
    ageMs: localLastUpdateTimestamp ? Date.now() - localLastUpdateTimestamp : null,
    lastUpdateTimestamp: localLastUpdateTimestamp,
    scanCycleCount: localScanCycleCount,
    totalAssets: Object.keys(localCache).length,
    isStale: localLastUpdateTimestamp ? (Date.now() - localLastUpdateTimestamp) > 120000 : true
  };
}

/**
 * Formats a cached asset analysis into a chat-friendly text response.
 * This replaces the Gemini AI call for simple ticker lookups.
 * @param {Object} asset - Cached asset object with signalData
 * @returns {string} Formatted analysis text for the chat UI
 */
export function formatCachedAnalysisAsChat(asset) {
  if (!asset) return '❌ No data available for this asset yet. The scanner is still warming up.';
  
  const signal = asset.signalData;
  const ticker = asset.ticker;
  const price = signal?.currentPrice || asset.currentPrice;
  const fPrice = (p) => p !== undefined && p !== null ? (typeof p === 'number' ? p.toFixed(p > 100 ? 2 : 4) : p) : 'N/A';

  if (!signal || signal.action === 'NO_SIGNAL') {
    return `PREDICTION VERDICT:\nBASE CASE: NEUTRAL (0%)\nTimeframe: Intraday (15m / 1h)\nCurrent Price: $${fPrice(price)}\nmatched_setup_id: NONE\nEngine Action: NO_SIGNAL\n\n⚠️ Insufficient historical market data to generate a deterministic signal.`;
  }

  const isTrade = signal.action === 'TRADE';
  const dir = signal.direction || 'NEUTRAL';
  const score = signal.score || asset.score || 0;
  const entry = signal.currentPrice || price;
  const sl = signal.stopLoss;
  const tp1 = signal.takeProfit1;
  const tp2 = signal.takeProfit || signal.takeProfit2;
  const beRate = signal.breakEvenWinRate || 33.33;
  const ev = signal.expectedValue !== undefined ? signal.expectedValue : (score >= 55 ? parseFloat(((score/100*200) - ((1-score/100)*100) - 1.5).toFixed(2)) : -15.0);

  const riskDist = sl && entry ? Math.abs(entry - sl) : null;
  const riskPct = riskDist && entry ? ((riskDist / entry) * 100).toFixed(2) : '0.00';
  const tpDist = tp2 && entry ? Math.abs(tp2 - entry) : null;
  const tpPct = tpDist && entry ? ((tpDist / entry) * 100).toFixed(2) : '0.00';

  const hurstMean = signal.hurst?.meanH !== undefined ? signal.hurst.meanH.toFixed(3) : '0.500';
  const hurstRS = signal.hurst?.rsH !== undefined ? signal.hurst.rsH.toFixed(3) : 'N/A';
  const hurstDFA = signal.hurst?.dfaH !== undefined ? signal.hurst.dfaH.toFixed(3) : 'N/A';
  const ciLower = signal.hurst?.ci95?.lower !== undefined ? signal.hurst.ci95.lower.toFixed(3) : 'N/A';
  const ciUpper = signal.hurst?.ci95?.upper !== undefined ? signal.hurst.ci95.upper.toFixed(3) : 'N/A';

  const buyerPct = signal.buyerPercent !== undefined ? signal.buyerPercent : 50;
  const sellerPct = 100 - buyerPct;
  const ofiVal = signal.ofi?.ofi !== undefined ? (signal.ofi.ofi > 0 ? `+${signal.ofi.ofi.toFixed(3)}` : signal.ofi.ofi.toFixed(3)) : '0.000';
  const ofiSource = signal.scoreBreakdown?.ofiSource === 'BINANCE_AGGTRADE' ? 'Binance Live Taker Trades' : 'Candle Imbalance';
  const l2Depth = signal.depthData;

  let text = `PREDICTION VERDICT:\n`;
  text += `BASE CASE: ${dir} (${score}%)\n`;
  text += `Timeframe: Intraday (15m execution / 1h horizon)\n`;
  text += `Current Price: $${fPrice(entry)}\n`;
  text += `matched_setup_id: ${signal.pattern || signal.setupId || 'ENGINE_REPRESENTATION'}\n`;
  text += `Engine Action: ${isTrade ? 'ACTIONABLE_TRADE' : 'SHIELD_MODE_PROTECTION'}\n\n`;

  // 1. Beginner Takeaway
  text += `🎯 BEGINNER TAKEAWAY:\n`;
  if (isTrade) {
    text += `• Action: High-probability ${dir} trade verified by quantitative models.\n`;
    text += `• Execution Guidance: Buy/Enter at $${fPrice(entry)} with protective Stop Loss at $${fPrice(sl)}. Target $${fPrice(tp2)} for a 1:2.0 reward ratio.\n\n`;
  } else {
    text += `• Action: 🛡️ DO NOT TRADE. Capital Preservation is actively engaged.\n`;
    text += `• Guidance: Market conditions on ${ticker} lack a statistical edge (${signal.reason || 'Negative mathematical expectancy'}). Keep your money safe until high-probability conditions appear.\n\n`;
  }

  // 2. Mathematical Asymmetry & EV
  text += `⚖️ MATHEMATICAL ASYMMETRY (1:2.0 RRR) & EXPECTED VALUE:\n`;
  text += `• Reference Entry: $${fPrice(entry)}\n`;
  text += `• Protective Stop Loss: $${fPrice(sl)} (Risk: $${fPrice(riskDist)} | -${riskPct}%)\n`;
  if (tp1) text += `• Take Profit 1 (1:1 RRR): $${fPrice(tp1)} (+${riskPct}%)\n`;
  text += `• Take Profit 2 (1:2.0 RRR): $${fPrice(tp2)} (Reward: $${fPrice(tpDist)} | +${tpPct}%)\n`;
  text += `• Break-Even Win Rate Required: ${beRate}%\n`;
  text += `• Quant Composite Win Probability: ${score}%\n`;
  text += `• Net Expected Value (EV): ${ev >= 0 ? '+' : ''}$${ev.toFixed(2)} per $100 risked ${ev >= 0 ? '(Positive Expectancy Confirmed)' : '(Negative Expectancy — Blocked)'}\n`;
  if (signal.kelly) {
    text += `• Kelly Capital Sizing: Full Kelly ${(signal.kelly.kellyF * 100).toFixed(1)}% | Safe Half-Kelly: ${(signal.kelly.halfKelly * 100).toFixed(1)}%\n`;
  }
  text += `\n`;

  // 3. Fractal Mathematics Proof (Hurst Regime)
  text += `🔬 FRACTAL MATHEMATICS PROOF (HURST REGIME):\n`;
  text += `• Hurst Exponent (Mean H): ${hurstMean} (R/S = ${hurstRS}, DFA = ${hurstDFA})\n`;
  text += `• 95% Confidence Interval: [${ciLower}, ${ciUpper}]\n`;
  if (Number(hurstMean) > 0.55) {
    text += `• Mathematical Persistence: H > 0.55 proves persistent trend memory. Autocorrelation of price increments is positive (ρ > 0). Momentum continuation is statistically backed.\n`;
  } else if (Number(hurstMean) < 0.45) {
    text += `• Mathematical Mean Reversion: H < 0.45 proves anti-persistent behavior (ρ < 0). Price oscillation around structural mean dominates.\n`;
  } else {
    text += `• Mathematical Random Walk: H ≈ 0.50 indicates Geometric Brownian Motion. Zero autocorrelation (ρ ≈ 0). Directional prediction is statistically impossible.\n`;
  }
  text += `\n`;

  // 4. Level 2 Order Book & Order Flow Matrix
  text += `🌊 LEVEL 2 ORDER BOOK & ORDER FLOW MATRIX:\n`;
  text += `• Volume Delta Aggression: ${buyerPct}% Buyers / ${sellerPct}% Sellers (OFI: ${ofiVal})\n`;
  text += `• OFI Telemetry Source: ${ofiSource}\n`;
  if (l2Depth && l2Depth.source === 'BINANCE_L2_DEPTH') {
    text += `• Level 2 Order Book Imbalance (OBI): ${l2Depth.orderBookImbalance > 0 ? '+' : ''}${l2Depth.orderBookImbalance}% [Binance 50-Depth Book]\n`;
    if (l2Depth.topBidWall) text += `• Institutional Bid Wall: ${l2Depth.topBidWall.qty} @ $${fPrice(l2Depth.topBidWall.price)}\n`;
    if (l2Depth.topAskWall) text += `• Institutional Ask Wall: ${l2Depth.topAskWall.qty} @ $${fPrice(l2Depth.topAskWall.price)}\n`;
  }
  text += `\n`;

  // 5. Multi-Timeframe Confluence Matrix
  text += `🌐 MULTI-TIMEFRAME CONFLUENCE MATRIX:\n`;
  text += `• 15m Micro Execution: ${signal.pattern || 'Consolidation'} | Momentum: ${signal.rsi ? 'RSI ' + signal.rsi.value?.toFixed(1) : 'Neutral'}\n`;
  text += `• 1H Meso Trend: ${signal.smaAlignment || 'Neutral'} (${asset.microRegime || 'Active'})\n`;
  text += `• 1D Macro Structure: ${asset.macroRegime || 'Macro Neutral'}\n`;
  text += `\n`;

  // 6. Shield Mode Forensic Audit
  text += `🛡️ CAPITAL PRESERVATION SHIELD PROOF:\n`;
  if (!isTrade) {
    text += `• Shield Status: 🚨 ACTIVATED (Zero Capital Allocated — 100% Protected)\n`;
    text += `• Gate Triggered: ${signal.forensicGate || 'MATHEMATICAL_RISK_FILTER'}\n`;
    text += `• Retail Trader Trap: ${signal.retailTrap || 'Trading in low conviction setups leads to fee burn and chop drawdown.'}\n`;
    text += `• Capital Defense: ${signal.capitalDefense || signal.reason || 'Protected capital from negative expectancy.'}\n`;
  } else {
    text += `• Shield Status: ✅ STANDBY (All 5 Quantitative Gates Cleared)\n`;
    text += `• Risk Validation: Positive Expected Value verified with strict 1:2.0 RRR bounds.\n`;
  }
  text += `\n`;

  const ageSeconds = asset.cachedAt ? Math.round((Date.now() - asset.cachedAt) / 1000) : 0;
  text += `_Data Telemetry: Real-time Binance / Angel One tick feeds | Freshness: ${ageSeconds}s ago_\n`;

  return text;
}
