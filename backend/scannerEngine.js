// =====================================================
// GHOST SCANNER ENGINE — Phase 4 Market-Wide Quant
// Scans the entire crypto market in parallel using the
// Multi-TF Shield and Level 2 Liquidity Engines.
// Runs as a Daemon.
// =====================================================

import { fetchMultiTimeframeOHLCV, getClosePrices } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { fetchOrderFlow, fetchOrderBookDepth, formatOrderFlowContext } from './orderFlowEngine.js';
import { atr, sma } from './technicalEngine.js';
import { computeKelly } from './kellyEngine.js';
import { fetchAssetSentiment } from './sentimentEngine.js';
import { calculateRotationImpacts, SECTOR_MAP } from './correlationEngine.js';
import fs from 'fs';

// Top 20 as requested for safety against Binance Rate Limits
export const DEFAULT_CRYPTO_WATCHLIST = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD',
  'LINK-USD', 'MATIC-USD', 'LTC-USD', 'DOT-USD', 'UNI-USD', 'ATOM-USD', 'NEAR-USD',
  'APT-USD', 'ARB-USD', 'OP-USD', 'SUI-USD', 'PEPE-USD'
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
    const hurst15m = calculateHurst(getClosePrices(tf15m));
    const hurst1d = calculateHurst(getClosePrices(tf1d));
    const regime15m = classifyRegime(hurst15m);
    const regime1d = classifyRegime(hurst1d);

    const closes15m = getClosePrices(tf15m);
    const closes1d = getClosePrices(tf1d);
    const price = closes15m[closes15m.length - 1];

    const sma20_15m = sma(closes15m, 20) || price;
    const sma50_15m = sma(closes15m, 50) || price;
    const dir15m = (price > sma20_15m && sma20_15m > sma50_15m) ? 'UP' : (price < sma20_15m && sma20_15m < sma50_15m) ? 'DOWN' : 'CHOP';

    const sma20_1d = sma(closes1d, 20) || price;
    const sma50_1d = sma(closes1d, 50) || price;
    const dir1d = (price > sma20_1d && sma20_1d > sma50_1d) ? 'UP' : (price < sma20_1d && sma20_1d < sma50_1d) ? 'DOWN' : 'CHOP';

    let shieldTriggered = false;
    if ((dir15m === 'UP' && dir1d === 'DOWN') || (dir15m === 'DOWN' && dir1d === 'UP')) {
      shieldTriggered = true; // Macro conflict
    }

    // [PHASE 2] Level 2 Liquidity
    const flowData = await fetchOrderFlow(ticker, 1000);
    const depthData = await fetchOrderBookDepth(ticker, 1000);
    if (depthData.error) return { ticker, status: 'error', reason: 'Level 2 Fetch Failed' };

    let liquidityTrap = false;
    if (depthData.sellWalls.length > 0 && dir15m === 'UP') liquidityTrap = true; // Wall blocking up move
    if (depthData.buyWalls.length > 0 && dir15m === 'DOWN') liquidityTrap = true; // Wall blocking down move

    // [PHASE 4] QuantScore Calculation (0-100)
    let score = 0;
    if (regime1d.isActionable) score += 30; // Macro clarity
    if (!shieldTriggered) score += 30; // Timeframe alignment
    if (!liquidityTrap) score += 20; // Clear runway
    if (flowData.deltaPercent && Math.abs(flowData.deltaPercent) > 10) score += 20; // High institutional aggression

    // [PHASE 6] Cross-Asset Liquidity Rotation Multiplier
    score = Math.floor(score * rotationImpact.multiplier); 
    // Cap at 100 max
    if (score > 100) score = 100;

    // [PHASE 4] Kelly Engine Position Sizing
    // Win probability derived dynamically from QuantScore
    const winProbability = Math.max(0.3, score / 100);
    const kelly = computeKelly({ winProbability, rewardPercent: 0.05, riskPercent: 0.02 });

    return {
      ticker,
      status: 'success',
      score,
      currentPrice: price,
      shieldTriggered,
      liquidityTrap,
      flowBias: flowData.flowBias,
      macroRegime: regime1d.regime,
      microRegime: regime15m.regime,
      sentimentBias: rotationImpact.bias,
      sentimentAlerts: rotationImpact.alerts,
      recommendedSize: (kelly.action === 'SHIELD_MODE' || score === 0) ? 0 : kelly.halfKelly,
      evNet: kelly.evNet,
      sector: SECTOR_MAP[ticker] || 'UNKNOWN'
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
      topSetups.forEach(setup => {
        console.log(`- ${setup.ticker} | QuantScore: ${setup.score}/100 | EV: ${setup.evNet}% | Kelly Size: ${setup.recommendedSize.toFixed(1)}%`);
        console.log(`  Details: Shield Clear (${!setup.shieldTriggered}), Trap Clear (${!setup.liquidityTrap}), Flow: ${setup.flowBias}`);
      });
      // In production, this would trigger a Push Notification / Email / WebSocket event to UI
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
