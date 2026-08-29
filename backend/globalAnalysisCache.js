// =====================================================
// GLOBAL ANALYSIS CACHE — "1 = ALL" Architecture
// Single source of truth for pre-computed asset analysis.
// The scanner worker computes enriched signals for ALL
// assets continuously. This cache stores the latest results
// so ANY trader gets instant data — zero per-user recalculation.
// =====================================================

const globalCache = {};
let lastUpdateTimestamp = null;
let scanCycleCount = 0;

/**
 * Updates the global cache with enriched scan results.
 * Called by the server when the scanner worker broadcasts GHOST_BRAIN_UPDATE.
 * @param {Array} enrichedResults - Array of enriched asset objects from scanner
 */
export function updateGlobalCache(enrichedResults) {
  if (!Array.isArray(enrichedResults)) return;

  for (const asset of enrichedResults) {
    if (!asset || !asset.ticker) continue;
    globalCache[asset.ticker] = {
      ...asset,
      cachedAt: Date.now()
    };
  }
  lastUpdateTimestamp = Date.now();
  scanCycleCount++;
  
  const totalAssets = Object.keys(globalCache).length;
  const withSignals = Object.values(globalCache).filter(a => a.signalData && a.signalData.action !== 'NO_SIGNAL').length;
  console.log(`[GLOBAL CACHE] Updated: ${totalAssets} assets cached | ${withSignals} with signals | Cycle #${scanCycleCount}`);
}

/**
 * Returns the pre-computed analysis for a specific ticker.
 * @param {string} ticker - Asset ticker (e.g., 'BTC-USD')
 * @returns {Object|null} Full enriched asset data or null if not cached
 */
export function getGlobalAssetAnalysis(ticker) {
  if (!ticker) return null;
  
  // Try exact match first
  if (globalCache[ticker]) return globalCache[ticker];
  
  // Try common suffix variations (user might type BTC, cache has BTC-USD)
  const cryptoKey = `${ticker}-USD`;
  if (globalCache[cryptoKey]) return globalCache[cryptoKey];
  
  const nseKey = `${ticker}.NS`;
  if (globalCache[nseKey]) return globalCache[nseKey];
  
  return null;
}

/**
 * Returns ALL cached assets as an array (for broadcasting to new clients).
 * @returns {Array} Array of all cached asset objects
 */
export function getAllCachedAssets() {
  return Object.values(globalCache);
}

/**
 * Returns cache freshness info.
 * @returns {Object} { ageMs, scanCycleCount, totalAssets }
 */
export function getCacheInfo() {
  return {
    ageMs: lastUpdateTimestamp ? Date.now() - lastUpdateTimestamp : null,
    lastUpdateTimestamp,
    scanCycleCount,
    totalAssets: Object.keys(globalCache).length,
    isStale: lastUpdateTimestamp ? (Date.now() - lastUpdateTimestamp) > 120000 : true // Stale if > 2 minutes
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
