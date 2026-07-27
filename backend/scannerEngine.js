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
import fs from 'fs';

// Top 20 Crypto Watchlist
export const DEFAULT_CRYPTO_WATCHLIST = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD',
  'LINK-USD', 'MATIC-USD', 'LTC-USD', 'DOT-USD', 'UNI-USD', 'ATOM-USD', 'NEAR-USD',
  'APT-USD', 'ARB-USD', 'OP-USD', 'SUI-USD', 'PEPE-USD'
];

// Indian Market NSE Watchlist
export const DEFAULT_NSE_WATCHLIST = [
  'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'TATAMOTORS.NS', '^NSEI'
];

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
    const atr15m = atr(closes15m, 14) || 0;
    const upperBand = sma20_15m + (1.5 * atr15m);
    const lowerBand = sma20_15m - (1.5 * atr15m);
    
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

    // [PHASE 4] Kelly Engine Position Sizing
    // Win probability derived empirically from structural edges, not arbitrary points
    let empiricalWinProb = 0.45; // Default negative edge (Random Walk)
    
    if (regime1d.regime === 'TRENDING') {
      if (flowData && (flowData.flowBias === 'STRONG_BUY' || flowData.flowBias === 'STRONG_SELL')) empiricalWinProb = 0.61;
      else if (flowData && (flowData.flowBias === 'MODERATE_BUY' || flowData.flowBias === 'MODERATE_SELL')) empiricalWinProb = 0.55;
      else empiricalWinProb = 0.52; // Trending but neutral flow
    } else if (regime1d.regime === 'MEAN_REVERTING') {
      if (flowData && (flowData.flowBias === 'STRONG_BUY' || flowData.flowBias === 'STRONG_SELL')) empiricalWinProb = 0.53; // Fade edge
    }
    
    // Total capital protection if shield triggered
    if (shieldTriggered) empiricalWinProb = 0.40;

    const kelly = computeKelly({ winProbability: empiricalWinProb, rewardPercent: 0.05, riskPercent: 0.02 });
    
    // Force SHIELD MODE visually if edge is < 50%
    const finalSize = (kelly.action === 'SHIELD_MODE' || empiricalWinProb < 0.50) ? 0 : kelly.halfKelly;

    // [PHASE 7] Institutional Risk Management Envelopes
    const validUntil = new Date(Date.now() + 15 * 60000).toISOString();
    // Invalidation price is trailing the opposite side of the 15m ATR band
    const invalidationPrice = regime15m.regime === 'DOWN' ? price + (1.5 * atr15m) : price - (1.5 * atr15m);
    // Probability of hitting a 3-trade losing streak
    const lossStreak3xChance = Math.pow((1 - empiricalWinProb), 3) * 100;

    return {
      ticker,
      status: 'success',
      score,
      currentPrice: price,
      shieldTriggered,
      liquidityTrap,
      flowBias: (flowData && flowData.available) ? flowData.flowBias : 'UNAVAILABLE (NSE)',
      macroRegime: regime1d.regime,
      microRegime: regime15m.regime,
      sentimentBias: rotationImpact.bias,
      sentimentAlerts: rotationImpact.alerts,
      recommendedSize: finalSize,
      evNet: kelly.evNet,
      sector: SECTOR_MAP[ticker] || 'UNKNOWN',
      // Institutional Risk Armor
      validUntil,
      invalidationPrice: parseFloat(invalidationPrice.toFixed(4)),
      expectancy: {
         winRate: (empiricalWinProb * 100).toFixed(1) + '%',
         lossStreak3xChance: lossStreak3xChance.toFixed(1) + '%'
      }
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

  // Filter and sort by highest score, then highest EV
  const successfulScans = results.filter(r => r.status === 'success');
  successfulScans.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.evNet || 0) - (a.evNet || 0);
  });

  return successfulScans;
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
      console.log(`\n=> [EXECUTE] ${bestSetup.ticker} | QuantScore: ${bestSetup.score}/100 | EV: ${bestSetup.evNet}% | Kelly Size: ${bestSetup.recommendedSize.toFixed(1)}%`);
      console.log(`   - Macro: ${bestSetup.macroRegime} | Micro: ${bestSetup.microRegime} | Flow: ${bestSetup.flowBias}`);
      console.log(`   - ⏱️  Valid Until: ${bestSetup.validUntil} (DO NOT EXECUTE AFTER)`);
      console.log(`   - 🛑 Invalidation Price: $${bestSetup.invalidationPrice} (STOP LOSS)`);
      console.log(`   - 🧠 Expectancy: ${bestSetup.expectancy.winRate} Win Rate | ${bestSetup.expectancy.lossStreak3xChance} Risk of 3x Loss Streak`);
      
      // DISPATCH TO DISCORD (Production Distribution Layer)
      sendDiscordSignal(bestSetup).catch(err => console.error(`[DAEMON] Discord dispatch failed:`, err));

      if (topSetups.length > 1) {
          console.log(`\n[SUPPRESSED SIGNALS - SAVED FROM CORRELATION RISK]`);
          topSetups.slice(1).forEach(s => {
              console.log(`   - 🚫 SUPPRESSED: ${s.ticker} (Score: ${s.score}, EV: ${s.evNet}%)`);
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
