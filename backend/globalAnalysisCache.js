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
  const price = asset.currentPrice;

  let text = `\n\n**${ticker} — INSTANT ANALYSIS** _(from Global Scanner)_\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Price & Regime
  text += `**Current Price:** $${price?.toFixed ? price.toFixed(price > 100 ? 2 : 4) : price || 'N/A'}\n`;
  text += `**Macro Regime:** ${asset.macroRegime || 'N/A'} | **Micro Regime:** ${asset.microRegime || 'N/A'}\n`;
  text += `**QuantScore:** ${asset.score || 0}/100\n\n`;

  if (!signal || signal.action === 'NO_SIGNAL') {
    text += `⚠️ **Insufficient data** — Scanner could not generate a signal for this asset. This usually means not enough historical candle data is available yet.\n`;
    return text;
  }

  // Signal Verdict
  if (signal.action === 'SHIELD_MODE') {
    text += `🛡️ **SHIELD MODE — NO TRADE**\n`;
    text += `• Reason: ${signal.reason || 'No clear edge detected'}\n`;
    text += `• Direction Lean: ${signal.direction || 'NEUTRAL'}\n`;
    text += `• Composite Score: ${signal.score || 0}/100\n\n`;
  } else if (signal.action === 'TRADE') {
    const dirIcon = signal.direction === 'BULLISH' ? '🟢' : signal.direction === 'BEARISH' ? '🔴' : '⚪';
    text += `${dirIcon} **SIGNAL: ${signal.direction}** (${signal.tradeSide})\n`;
    text += `• Composite Score: ${signal.score}/100\n`;
    text += `• Pattern: ${signal.pattern || 'No pattern'}\n\n`;

    text += `**TRADE LEVELS:**\n`;
    text += `• Entry: $${signal.currentPrice?.toFixed ? signal.currentPrice.toFixed(price > 100 ? 2 : 4) : 'N/A'}\n`;
    if (signal.takeProfit) text += `• Take Profit: $${signal.takeProfit?.toFixed ? signal.takeProfit.toFixed(price > 100 ? 2 : 4) : signal.takeProfit}\n`;
    if (signal.stopLoss) text += `• Stop Loss: $${signal.stopLoss?.toFixed ? signal.stopLoss.toFixed(price > 100 ? 2 : 4) : signal.stopLoss}\n\n`;
  }

  // Score Breakdown
  if (signal.scoreBreakdown) {
    text += `**ENGINE SCORE BREAKDOWN:**\n`;
    text += `• Regime Alignment: ${signal.scoreBreakdown.regimeAlignment}/100\n`;
    text += `• Technical Confluence: ${signal.scoreBreakdown.technicalConfluence}/100\n`;
    const ofiLabel = signal.scoreBreakdown.ofiSource === 'BINANCE_AGGTRADE' ? 'LIVE TRADE DATA' : 'CANDLE ESTIMATE';
    text += `• Order Flow: ${signal.scoreBreakdown.orderFlow}/100 [${ofiLabel}]\n`;
    text += `• Volume Confirmation: ${signal.scoreBreakdown.volumeConfirmation}/100\n`;
    text += `• Historical Win Rate: ${signal.scoreBreakdown.historicalWinRate}/100\n\n`;
  }

  // Kelly Sizing
  if (signal.kelly && signal.kelly.action === 'TRADE') {
    text += `✅ **QUANTITATIVE EDGE CONFIRMED**\n`;
    text += `• Kelly Criterion: ${(signal.kelly.kellyF * 100).toFixed(1)}% | Half-Kelly: ${(signal.kelly.halfKelly * 100).toFixed(1)}%\n\n`;
  }

  // Reasons
  if (signal.reasons && signal.reasons.length > 0) {
    text += `**INSTITUTIONAL REASONING:**\n`;
    signal.reasons.slice(0, 5).forEach(r => {
      text += `• ${r}\n`;
    });
    text += `\n`;
  }

  // Cache freshness
  const ageSeconds = asset.cachedAt ? Math.round((Date.now() - asset.cachedAt) / 1000) : 'N/A';
  text += `_Data freshness: ${ageSeconds}s ago | Next update in ~${Math.max(0, 60 - ageSeconds)}s_\n`;

  return text;
}
