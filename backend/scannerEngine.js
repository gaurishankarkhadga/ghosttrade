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
import { sendDiscordSignal } from './discordEngine.js';
import { detectPatterns } from './patternEngine.js';
import { constructSetupId, CURRENT_LOGIC_VERSION, DEFAULT_CRYPTO_WATCHLIST, DEFAULT_NSE_WATCHLIST } from './sharedConfig.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { getDb } from './mongoConfig.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import fs from 'fs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let daemonInterval = null;

/**
 * Scans a single ticker using Phase 1, 2, and 6 logic
 */
async function scanTickerPhase4(ticker, rotationImpact = { multiplier: 1.0, alerts: [], bias: 'NEUTRAL' }) {
  try {
    // [PHASE 1] Multi-Dimensional Data
    const dataResult = await fetchMultiTimeframeOHLCV(ticker, 300);
    if (dataResult.error || !dataResult.timeframes) return { ticker, status: 'error', reason: 'TF Fetch Failed' };

    const { tf15m, tf1d } = { tf15m: dataResult.timeframes['15m'], tf1d: dataResult.timeframes['1d'] };
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
    if (!pattern) return { ticker, status: 'skipped', reason: 'No geometric pattern footprint' };

    const setup_id = constructSetupId(pattern, regime15m.regime, closes15m);
    
    let dbKellyResult = { action: 'SHIELD_MODE', reason: 'No setup found', kellyF: 0, halfKelly: 0 };
    let sl = null, tp = null, finalSize = 0;
    
    const db = await getDb();
    const stats = await db.collection('setup_stats').findOne({
        setup_id,
        logic_version: CURRENT_LOGIC_VERSION
    });

    if (stats && stats.confidence_flag !== 'INSUFFICIENT_DATA') {
        dbKellyResult = computeKelly({ 
           mean_return: stats.mean_return, 
           variance: stats.variance,
           regime: regime
        });
        if (dbKellyResult.action !== 'SHIELD_MODE') {
             finalSize = dbKellyResult.halfKelly;
        }
    } else {
        dbKellyResult.reason = stats ? 'INSUFFICIENT_DATA flag blocks execution' : `Setup ${setup_id} not found in verified backtest database`;
    }

    // Force SHIELD MODE if system constraints are hit
    if (shieldTriggered || liquidityTrap || !regime1d.isActionable) finalSize = 0;

    // Calculate pure ATR exits using candles array (same as backtester)
    const tradeSide = (setup_id.includes('bull')) ? 'LONG' : 'SHORT';
    const exits = computeStopLossTakeProfit(tf15m, tradeSide);
    if (exits) { sl = exits.stopLoss; tp = exits.takeProfit; }

    const validUntil = new Date(Date.now() + 15 * 60000).toISOString();

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
      kellyReason: dbKellyResult.reason
    };
  } catch (err) {
    return { ticker, status: 'error', reason: err.message };
  }
}

export async function runBulkScanPhase4(tickers = DEFAULT_CRYPTO_WATCHLIST) {
  const results = [];
  const BATCH_SIZE = 4; // Lower batch size for massive Phase 1+2 requests
  const DELAY_MS = 2000; // 2 seconds to respect Binance Limits

  console.log(`[SCANNER] Initiating Phase 6 Market-Wide Scan for ${tickers.length} assets...`);
  
  // [PHASE 6] Pre-Fetch Sentiment for ALL assets to map the Rotation Impact
  console.log(`[CORRELATION] Analyzing entire market sentiment to map Liquidity Rotation...`);
  const allSentiments = [];
  for (const t of tickers) {
     const s = await fetchAssetSentiment(t);
     allSentiments.push({ ticker: t, sentimentBias: s.bias, multiplier: s.multiplier, alerts: s.alerts });
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
         multiplier: impact.multiplier, // Override with rotation multiplier (which crushes toxic to 0.0 and boosts competitors to 1.25)
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

  return results;
}

/**
 * DAEMON MODE: Runs in the background 24/7
 */
export function startScannerDaemon(intervalMinutes = 15) {
  if (daemonInterval) clearInterval(daemonInterval);
  
  console.log(`[DAEMON] Ghost Scanner Daemon Started (Interval: ${intervalMinutes}m)`);
  
  const tick = async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] DAEMON TICK: Scanning Top 20 Market Assets...`);
    const results = await runBulkScanPhase4();
    
    const topSetups = results.filter(r => r.score >= 80);
    
    if (topSetups.length > 0) {
      console.log(`\n🚨 HIGH PROBABILITY SETUPS FOUND 🚨`);
      
      // OPTION A: Portfolio Correlation Limiter. 
      // If multiple setups fire at once, only take the absolute best EV one to prevent crypto correlation blow-up.
      const bestSetup = topSetups[0]; // Already sorted by EV descending
      
      console.log(`[CORRELATION SHIELD] Detected ${topSetups.length} signals. Executing Option A (Top 1 Only) to prevent over-leverage.`);
      console.log(`\n=> [EXECUTE] ${bestSetup.ticker} | QuantScore: ${bestSetup.score}/100 | Setup: ${bestSetup.setup_id} | Kelly Size: ${bestSetup.recommendedSize.toFixed(1)}%`);
      console.log(`   - Macro: ${bestSetup.macroRegime} | Micro: ${bestSetup.microRegime} | Shield: ${bestSetup.shieldTriggered}`);
      console.log(`   - Valid Until: ${bestSetup.validUntil} (DO NOT EXECUTE AFTER)`);
      console.log(`   - Stop Loss: $${bestSetup.stopLoss?.toFixed(2) || 'N/A'} | Take Profit: $${bestSetup.takeProfit?.toFixed(2) || 'N/A'}`);
      console.log(`   - Kelly Reason: ${bestSetup.kellyReason}`);
      
      // PORTFOLIO RISK GATE — Enforce daily loss limits, concurrent caps, correlation blocking
      let riskOk = true;
      try {
        const tradeSide = bestSetup.microRegime === 'UP' ? 'LONG' : 'SHORT';
        const riskCheck = await canOpenNewTrade(bestSetup.ticker, tradeSide);
        if (!riskCheck.allowed) {
          riskOk = false;
          console.warn(`[RISK CONTROL] 🛑 BLOCKED: ${bestSetup.ticker} — Reason: ${riskCheck.reason}${riskCheck.conflicting_asset ? ` (conflicts with ${riskCheck.conflicting_asset})` : ''}`);
        }
      } catch (riskErr) {
        console.warn('[RISK CONTROL] Check failed, allowing trade:', riskErr.message);
      }

      // DISPATCH TO DISCORD (Production Distribution Layer) — only if risk allows
      if (riskOk) {
        sendDiscordSignal(bestSetup).catch(err => console.error(`[DAEMON] Discord dispatch failed:`, err));
      } else {
        console.log(`[DAEMON] Signal suppressed by Risk Control Engine. No dispatch.`);
      }

      if (topSetups.length > 1) {
          console.log(`\n[SUPPRESSED SIGNALS - SAVED FROM CORRELATION RISK]`);
          topSetups.slice(1).forEach(s => {
              console.log(`   - SUPPRESSED: ${s.ticker} (Score: ${s.score}, Setup: ${s.setup_id})`);
          });
      }
    } else {
      console.log(`[DAEMON] No setups met the >= 80 Score threshold. Market is choppy. Shield protecting capital.`);
    }
  };

  tick(); // Run immediately
  daemonInterval = setInterval(tick, intervalMinutes * 60 * 1000);
}

export function stopScannerDaemon() {
  if (daemonInterval) {
    clearInterval(daemonInterval);
    console.log(`[DAEMON] Scanner Stopped.`);
  }
}
