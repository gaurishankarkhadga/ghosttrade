// =====================================================
// GHOST SCANNER ENGINE — Phase 4 Market-Wide Quant
// Scans the entire crypto market in parallel using the
// Multi-TF Shield and Level 2 Liquidity Engines.
// Runs as a Daemon.
// =====================================================

import { fetchMultiTimeframeOHLCV, getClosePrices, getLogReturns } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { fetchOrderFlow, fetchOrderBookDepth, formatOrderFlowContext } from './orderFlowEngine.js';
import { atr, sma } from './technicalEngine.js';
import { computeKelly } from './kellyEngine.js';
import { fetchAssetSentiment } from './sentimentEngine.js';
import { calculateRotationImpacts, SECTOR_MAP } from './correlationEngine.js';

import { detectPatterns } from './patternEngine.js';
import { constructSetupId, CURRENT_LOGIC_VERSION, DEFAULT_CRYPTO_WATCHLIST, DEFAULT_GLOBAL_STOCKS_WATCHLIST } from './sharedConfig.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { getDb } from './mongoConfig.js';
import { generateSignal } from './signalGenerator.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scans a single ticker using Phase 1, 2, and 6 logic
 */
async function scanTickerPhase4(ticker, rotationImpact = { multiplier: 1.0, alerts: [], bias: 'NEUTRAL' }) {
  try {
    // [PHASE 1] Multi-Dimensional Data
    const dataResult = await fetchMultiTimeframeOHLCV(ticker, 300);
    if (dataResult.error || !dataResult.timeframes) return { ticker, status: 'error', reason: 'TF Fetch Failed' };

    const tf15m = dataResult.timeframes['15m'];
    const tf1h = dataResult.timeframes['1h'];
    const tf1d = dataResult.timeframes['1d'];
    const hurst15m = calculateHurst(getLogReturns(tf15m));
    const hurst1d = calculateHurst(getLogReturns(tf1d));
    const regime15m = classifyRegime(hurst15m);
    const regime1d = classifyRegime(hurst1d);

    const closes15m = getClosePrices(tf15m);
    const closes1d = getClosePrices(tf1d);
    const price = closes15m[closes15m.length - 1];

    const sma20_1d = sma(closes1d, 20) || price;
    
    // Institutional Volatility Shield (ATR Keltner Bands)
    const sma20_15m = sma(closes15m, 20) || price;
    const atrResult15m = atr(tf15m, 14); // Pass OHLCV objects, not closes array
    const atr15mValue = atrResult15m ? atrResult15m.value : 0;
    const upperBand = sma20_15m + (1.5 * atr15mValue);
    const lowerBand = sma20_15m - (1.5 * atr15mValue);
    
    let shieldTriggered = false;
    // Trigger shield if price is breaking out aggressively against the macro regime trend
    if (regime1d.regime === 'DOWN' && price > upperBand) shieldTriggered = true;
    if (regime1d.regime === 'UP' && price < lowerBand) shieldTriggered = true;

    // [PHASE 2] Level 2 Liquidity
    const flowData = await fetchOrderFlow(ticker, 1000);
    const depthData = await fetchOrderBookDepth(ticker, 1000);
    
    // Graceful degradation for NSE or missing order flow
    let liquidityTrap = false;
    if (depthData && depthData.sellWalls && depthData.sellWalls.length > 0 && regime15m.regime === 'UP') liquidityTrap = true;
    if (depthData && depthData.buyWalls && depthData.buyWalls.length > 0 && regime15m.regime === 'DOWN') liquidityTrap = true;


    // [PHASE 4] QuantScore Calculation (0-100)
    let score = 0;
    if (flowData && flowData.available) {
        // Crypto (Full Telemetry)
        if (regime1d.isActionable) score += 30; 
        if (!shieldTriggered) score += 30; 
        if (!liquidityTrap) score += 20; 
        if (flowData.deltaPercent && Math.abs(flowData.deltaPercent) > 10) score += 20; 
    } else {
        // Traditional Finance (Regime + Shield Only)
        if (regime1d.isActionable) score += 50; 
        if (!shieldTriggered) score += 50; 
    }

    // [PHASE 6] Cross-Asset Liquidity Rotation Multiplier
    score = Math.floor(score * rotationImpact.multiplier); 
    // Cap at 100 max
    if (score > 100) score = 100;

    // [PHASE 4] Quantitative Scanner Rewire (Institutional Pattern + Regime gating)
    // detectPatterns() computes VWAP and volume analysis internally from candles
    const pattern = detectPatterns(tf15m);

    const setup_id = pattern ? constructSetupId(pattern, regime15m.regime, closes15m) : null;
    
    let dbKellyResult = { action: 'SHIELD_MODE', reason: 'No setup found', kellyF: 0, halfKelly: 0 };
    let sl = null, tp = null, finalSize = 0;
    
    const db = await getDb();
    if (setup_id) {
        const stats = await db.collection('setup_stats').findOne({
            setup_id,
            logic_version: CURRENT_LOGIC_VERSION
        });

        if (stats && stats.confidence_flag !== 'INSUFFICIENT_DATA') {
            dbKellyResult = computeKelly({ 
               mean_return: stats.mean_return, 
               variance: stats.variance,
               regime: regime15m.regime
            });
            if (dbKellyResult.action !== 'SHIELD_MODE') {
                 finalSize = dbKellyResult.halfKelly;
            }
        } else {
            dbKellyResult.reason = stats ? 'INSUFFICIENT_DATA flag blocks execution' : `Setup ${setup_id} not found in verified backtest database`;
        }
    } else {
        dbKellyResult.reason = 'No geometric pattern footprint detected';
    }

    // Force SHIELD MODE if system constraints are hit
    if (shieldTriggered || liquidityTrap || !regime1d.isActionable) finalSize = 0;

    // Calculate pure ATR exits using candles array (same as backtester)
    const tradeSide = (setup_id && setup_id.includes('bull')) ? 'LONG' : (setup_id && setup_id.includes('bear')) ? 'SHORT' : 'LONG';
    const exits = computeStopLossTakeProfit(tf15m, tradeSide);
    if (exits) { sl = exits.stopLoss; tp = exits.takeProfit; }

    const validUntil = new Date(Date.now() + 15 * 60000).toISOString();

    // ═══════════════════════════════════════════════════════
    // [GLOBAL ANALYSIS] Run full generateSignal() using already-fetched data.
    // This pre-computes the complete signal + trade card for ALL traders.
    // No per-user recalculation needed — "1 = ALL" architecture.
    // ═══════════════════════════════════════════════════════
    let signalData = null;
    let tradeCard = null;
    try {
      const ofiSource = (flowData && flowData.available) ? 'BINANCE_AGGTRADE' : 'CANDLE_APPROXIMATION';
      signalData = await generateSignal(ticker, tf1d, {
        candles15m: tf15m,
        candles1h: tf1h,
        ofiSource,
        livePrice: price
      });

      // Build trade card if signal is actionable
      if (signalData && signalData.action === 'TRADE') {
        tradeCard = {
          asset: ticker,
          side: signalData.tradeSide,
          entryPrice: signalData.currentPrice,
          stopLoss: signalData.stopLoss,
          takeProfit: signalData.takeProfit,
          kellySize: signalData.kelly?.halfKelly || 0,
          pattern: signalData.pattern || signalData.setupId || 'ENGINE_DETECTED',
          regime: regime1d.regime,
          source: 'GLOBAL_SCANNER',
          buyerPercent: signalData.buyerPercent || 50,
          hurstScore: hurst1d?.meanH ? Number(hurst1d.meanH.toFixed(2)) : 0.50
        };
      }
    } catch (sigErr) {
      console.warn(`[SCANNER] generateSignal failed for ${ticker}: ${sigErr.message}`);
    }

    return {
      ticker,
      status: 'success',
      setup_id,
      score,
      currentPrice: price,
      shieldTriggered: finalSize === 0,
      macroRegime: regime1d.regime,
      microRegime: regime15m.regime,
      recommendedSize: finalSize,
      sector: SECTOR_MAP[ticker] || 'UNKNOWN',
      validUntil,
      stopLoss: sl,
      takeProfit: tp,
      kellyReason: dbKellyResult.reason,
      // === Global Analysis Enrichment ("1 = ALL") ===
      signalData: signalData || null,
      tradeCard: tradeCard || null
    };
  } catch (err) {
    return { ticker, status: 'error', reason: err.message };
  }
}

export async function runBulkScanPhase4(marketOrWatchlist = 'Global') {
  let tickers = [];
  if (Array.isArray(marketOrWatchlist)) {
      tickers = marketOrWatchlist;
  } else {
      tickers = DEFAULT_CRYPTO_WATCHLIST; // Fallback if somehow called with a string
  }

  const results = [];
  const BATCH_SIZE = 10;
  const DELAY_MS = 500;
  const SENTIMENT_BATCH_SIZE = 10;

  const scanStartTime = Date.now();
  console.log(`[SCANNER] Initiating Phase 6 Market-Wide Scan for ${tickers.length} assets...`);
  
  // [PHASE 6] Pre-Fetch Sentiment for ALL assets — batched to avoid serial 34s bottleneck
  console.log(`[CORRELATION] Analyzing entire market sentiment to map Liquidity Rotation...`);
  const allSentiments = [];
  for (let i = 0; i < tickers.length; i += SENTIMENT_BATCH_SIZE) {
    const sentimentBatch = tickers.slice(i, i + SENTIMENT_BATCH_SIZE);
    const batchResults = await Promise.all(
      sentimentBatch.map(async (t) => {
        try {
          const s = await fetchAssetSentiment(t);
          return { ticker: t, sentimentBias: s.bias, multiplier: s.multiplier, alerts: s.alerts };
        } catch (e) {
          return { ticker: t, sentimentBias: 'NEUTRAL', multiplier: 1.0, alerts: [`Sentiment fetch failed: ${e.message}`] };
        }
      })
    );
    allSentiments.push(...batchResults);
  }
  
  // Calculate the cross-asset rotation impact matrix
  const rotationMatrix = calculateRotationImpacts(allSentiments);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (ticker) => {
      // Merge the Phase 5 alerts with the Phase 6 rotation alerts
      const baseSentiment = allSentiments.find(s => s.ticker === ticker);
      const impact = rotationMatrix[ticker];
      
      const mergedImpact = {
         multiplier: impact.multiplier,
         bias: baseSentiment.sentimentBias,
         alerts: [...baseSentiment.alerts, ...impact.alerts]
      };

      const result = await scanTickerPhase4(ticker, mergedImpact);
      return result;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + BATCH_SIZE < tickers.length) {
      await sleep(DELAY_MS);
    }
  }

  // Sort ALL scans (including errors so they still show up in the UI)
  results.sort((a, b) => {
    // Put successful scans first
    if (a.status !== 'success' && b.status === 'success') return 1;
    if (a.status === 'success' && b.status !== 'success') return -1;
    
    // Sort by score then EV
    if (b.score !== a.score) return (b.score || 0) - (a.score || 0);
    return (b.evNet || 0) - (a.evNet || 0);
  });

  // Data health metrics — log data quality per scan cycle
  const healthMetrics = {
    totalAssets: tickers.length,
    success: results.filter(r => r.status === 'success').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errored: results.filter(r => r.status === 'error').length,
    scanDurationMs: Date.now() - scanStartTime,
  };
  console.log(`[SCANNER HEALTH] ${healthMetrics.success}/${healthMetrics.totalAssets} success | ${healthMetrics.skipped} skipped | ${healthMetrics.errored} errors | ${healthMetrics.scanDurationMs}ms total`);

  // Attach health metrics to the results array for frontend consumption
  results._health = healthMetrics;

  return results;
}
