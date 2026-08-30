// =====================================================
// GEMINI BIDIRECTIONAL LIVE STREAM ENGINE
// Persistent WebSocket connection to Gemini BidiGenerateContent
// Replaces stateless REST SSE polling for sub-second latency
// =====================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import WebSocket from 'ws';

// Phase 3 Imports
import { fetchOHLCV, fetchMultiTimeframeOHLCV, getLogReturns, getClosePrices, fetchLivePrice } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { getCalibratedConfidence } from './calibrationEngine.js';
import { getDb } from './mongoConfig.js';
import { computeKelly } from './kellyEngine.js';
import { CURRENT_LOGIC_VERSION } from './sharedConfig.js';
import { registerSignal } from './regimeMonitor.js';
import { auditCompliance, sanitizeChunk } from './complianceFirewall.js';
import { logSignal, getErrorVectors, getTickerStats, getRecentAnalyses } from './memoryLedger.js';
import { calculateAllIndicators, sma, atr } from './technicalEngine.js';
import { fetchOrderFlow, fetchOrderBookDepth, formatOrderFlowContext } from './orderFlowEngine.js';
import { canOpenNewTrade } from './riskControlEngine.js';
import { fetchFuturesData, formatFuturesContext } from './openInterestEngine.js';
import { fetchFearAndGreed, fetchMacroCorrelations, formatMacroContext } from './macroEngine.js';
import { predict5to10mHorizon } from './predictiveEngine.js';
import { generateTradeLesson } from './educationalMentorEngine.js';
import { getWatchlistForRegions, listAvailableRegions } from './globalWatchlists.js';
import { generateSignal } from './signalGenerator.js';
import { runBulkScanPhase4 } from './scannerEngine.js';
import { getGlobalAssetAnalysis, getAllCachedAssets, formatCachedAnalysisAsChat, getCacheInfo } from './globalAnalysisCache.js';

// =====================================================
// SIGNAL COOLDOWN — Prevents duplicate signal spam
// Same ticker can only generate a new signal every 15 min
// =====================================================
const SIGNAL_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const lastSignalTime = new Map();

const MODELS = [
  'models/gemini-3.7-flash',
  'models/gemini-3.6-flash',
  'models/gemini-3.5-flash',
  'models/gemini-3.1-pro-preview',
  'models/gemini-flash-latest',
  'models/gemini-pro-latest'
];

function getApiKeys() {
  const rawKeys = process.env.GEMINI_API_KEY || '';
  return rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

const SYSTEM_PROMPT = `You are a quantitative institutional-grade analytical engine. Your output MUST be extremely concise, clean, and sharp. No fluff, no paragraphs, no emojis. 

If the image is NOT a trading chart, respond ONLY with: "INVALID INPUT — This is not a trading chart."

If it IS a trading chart, output exactly this structure:

PREDICTION VERDICT:
BASE CASE: [BULLISH/BEARISH/NEUTRAL] [XX]%
Timeframe: [Intraday / Swing]
Current Price: [price]
matched_setup_id: [hammer_trend_bull, doji_indecision, bullish_engulfing, bearish_engulfing, NONE]

TRADE LEVELS:
• Primary Target: [price]
• Stop Loss: [price]
• Invalidation Condition: [1 short sentence]

INSTITUTIONAL REASONING:
• [1 bullet point on Volume/Order Flow]
• [1 bullet point on Smart Money (Order Blocks/Liquidity)]
• [1 bullet point on Macro Regime]

GLOBAL ASSET RULES:
1. FOREX: Strictly respect pip boundaries and Central Bank volatility.
2. CRYPTO: Expect high volatility (10%+ sweeps) and liquidity hunting.
3. EQUITIES: Respect institutional tick sizes and distinct session volume.

CRITICAL MACRO RULE: You will be fed the current Macro Environment (RISK_ON / RISK_OFF). If the environment is RISK_OFF (DXY rising, VIX rising), you MUST severely penalize and suppress any BULLISH setups on Crypto and Equities. Never fight a strong macro trend.

CRITICAL FORMAT RULE: DO NOT write paragraphs. Output EXACTLY the structure above. Calculate logical Target and Stop Loss prices based on chart volatility if not obvious. Do not say "Unknown".`;

const SIMPLE_SYSTEM_PROMPT = `You are a friendly, easy-to-understand AI trading assistant. 
Explain the trade setup in simple English. Avoid overly complex technical jargon like MACD, RSI, or Hurst Exponent unless you explain what it means simply.

If the image is NOT a trading chart, respond ONLY with: "INVALID INPUT — This is not a trading chart."

If it IS a trading chart, output exactly this structure:

PREDICTION VERDICT:
BASE CASE: [BULLISH/BEARISH/NEUTRAL] [XX]%
Timeframe: [Intraday / Swing]
Current Price: [price]
matched_setup_id: [hammer_trend_bull, doji_indecision, bullish_engulfing, bearish_engulfing, NONE]

TRADE LEVELS:
• Primary Target: [price]
• Stop Loss: [price]
• Invalidation Condition: [1 short sentence]

SIMPLE REASONING:
• [1 bullet point explaining the trend simply]
• [1 bullet point explaining why buyers or sellers are in control]
• [1 bullet point on risk]

CRITICAL FORMAT RULE: Keep it friendly and simple. Output EXACTLY the structure above.`;

const USER_PROMPT = `Analyze this chart and output the strict summary format exactly as requested.`;

/**
 * Fast Phase 3 pass to extract ticker from image before main stream.
 */
async function extractTickerFromImage(base64Image) {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    console.warn('[GEMINI] No API keys found for ticker extraction.');
    return 'UNKNOWN';
  }

  for (const apiKey of apiKeys) {
    for (const model of MODELS) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Extract the primary financial asset ticker symbol (e.g., BTC, AAPL, EURUSD) from this chart. Reply with ONLY the ticker string. If none is found, reply UNKNOWN." },
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
              ]
            }]
          })
        });
        
        if (!response.ok) {
           console.warn(`[GEMINI Ticker Extraction] ${model} failed with ${response.status}. Switching...`);
           continue; // Try next model/key
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'UNKNOWN';
        return text.replace(/[^A-Z0-9-]/g, '').substring(0, 10) || 'UNKNOWN';
      } catch (e) {
        console.warn(`[GEMINI Ticker Extraction] Failed on ${model}: ${e.message.split('\n')[0]}. Switching...`);
      }
    }
  }
  
  console.warn('[GEMINI] Ticker extraction failed on ALL keys and models.');
  return 'UNKNOWN';
}

/**
 * Extracts ticker from a text prompt using pattern matching.
 * Handles: "analyze BTC", "what about RELIANCE?", "SOL prediction", etc.
 */
function extractTickerFromText(promptText) {
  if (!promptText) return 'UNKNOWN';
  const text = promptText.toUpperCase().trim();

  const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC', 'BNB', 'LTC', 'ATOM', 'UNI', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE', 'WIF', 'SHIB'];
  const NSE = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'WIPRO', 'TATAMOTORS', 'TATASTEEL', 'ADANIENT', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'HCLTECH', 'AXISBANK', 'ULTRACEMCO'];
  const US = ['AAPL', 'TSLA', 'GOOGL', 'GOOG', 'AMZN', 'MSFT', 'NVDA', 'META', 'NFLX', 'AMD', 'CRM', 'ORCL', 'INTC', 'QCOM', 'PYPL', 'DIS', 'BA', 'JPM', 'GS', 'V', 'MA'];

  // Check for ticker-suffix formats first: BTC-USD, ETH/USDT, RELIANCE.NS
  const suffixMatch = text.match(/\b([A-Z]{2,15})(?:\.(NS|BO)|[-\/](USD|USDT|INR))\b/);
  if (suffixMatch) return suffixMatch[0].replace(/\//g, '-');

  // Check known tickers (standalone word boundary match)
  for (const t of CRYPTO) { if (new RegExp(`\\b${t}\\b`).test(text)) return t; }
  for (const t of NSE) { if (new RegExp(`\\b${t}\\b`).test(text)) return `${t}.NS`; }
  for (const t of US) { if (new RegExp(`\\b${t}\\b`).test(text)) return t; }

  // Last resort: find any 2-6 letter uppercase word that looks like a ticker
  const genericMatch = text.match(/\b([A-Z]{2,6})\b/);
  if (genericMatch && !['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'HOW', 'CAN', 'WHAT', 'WILL', 'THIS', 'THAT', 'WITH', 'FROM', 'ABOUT', 'ANALYZE', 'ANALYSIS', 'TRADE', 'SCAN', 'DEEP', 'ALL'].includes(genericMatch[1])) {
    return genericMatch[1];
  }

  return 'UNKNOWN';
}

/**
 * Main analysis handler — supports both IMAGE and TEXT-ONLY modes.
 * Image mode: User uploads a chart screenshot.
 * Text mode: User types a ticker/question, system fetches all data via API.
 */
export async function handleGeminiConnection(clientWs, options = {}) {
  const { prompt = '', language = 'English', isSimpleMode = false, promptsUsed = 0 } = options;

  // === "1 = ALL" GLOBAL CACHE INTERCEPTOR ===
  // If the prompt is just a ticker name (not a custom question, not an image),
  // serve the pre-computed global analysis instantly from cache.
  // This is the core of the "1 = ALL" architecture — zero per-user recalculation.
  const imageBase64Raw = options.imageBase64 || null;
  const isImageRequest = !!imageBase64Raw;
  
  if (!isImageRequest && !prompt.includes('Execute Deep Scan')) {
    // Extract ticker from the prompt text
    const cleanPrompt = prompt.replace(/\[Context: Market Region = [^\]]+\]\n?/, '').trim();
    const extractedTicker = extractTickerFromText(cleanPrompt);
    
    // Check if this is a simple ticker lookup (not a complex question)
    // A simple lookup is when the user prompt IS essentially just a ticker name
    const isSimpleLookup = extractedTicker !== 'UNKNOWN' && (
      cleanPrompt.length <= 15 || // Short prompt = likely just a ticker
      cleanPrompt.toUpperCase().replace(/[^A-Z0-9]/g, '') === extractedTicker.replace(/[^A-Z0-9]/g, '') // Prompt IS the ticker
    );
    
    if (isSimpleLookup) {
      const cachedAsset = await getGlobalAssetAnalysis(extractedTicker);
      
      if (cachedAsset && cachedAsset.signalData) {
        console.log(`[GLOBAL CACHE HIT] ${extractedTicker} — serving pre-computed analysis (0ms recalculation)`);
        
        // Stream the cached analysis as formatted chat text
        const analysisText = formatCachedAnalysisAsChat(cachedAsset);
        const lines = analysisText.split('\n');
        for (const line of lines) {
          clientWs.send(JSON.stringify({ status: 'update', text: line + '\n' }));
          await new Promise(r => setTimeout(r, 30));
        }
        
        // Send trade card if signal is actionable
        if (cachedAsset.tradeCard && cachedAsset.signalData.action === 'TRADE') {
          clientWs.send(JSON.stringify({
            status: 'trade_card',
            tradeData: {
              ...cachedAsset.tradeCard,
              source: 'GLOBAL_CACHE'
            }
          }));
        }
        
        clientWs.send(JSON.stringify({ status: 'complete', priceAtTime: cachedAsset.currentPrice || null }));
        return; // Done — no Gemini API call, no data fetching, no CPU work
      }
      // If no cache hit, fall through to the full pipeline (first-time analysis)
      console.log(`[GLOBAL CACHE MISS] ${extractedTicker} — falling through to full analysis pipeline`);
    }
  }

  // === PHASE 4: DEEP SCAN INTERCEPTOR (Now reads from global cache) ===
  if (prompt.includes('Execute Deep Scan on the') && prompt.includes('market')) {
    const marketMatch = prompt.match(/Market Region = ([^\]]+)/);
    const market = marketMatch ? marketMatch[1] : 'Global';

    clientWs.send(JSON.stringify({ status: 'update', text: `\n\n **INSTANT ${market.toUpperCase()} DEEP SCAN** _(from Global Cache)_\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` }));

    // Read from global cache instead of running a fresh scan
    const allCached = await getAllCachedAssets();
    let relevantAssets = allCached;
    
    // Filter by market if not Global
    if (market !== 'Global') {
      if (market.toUpperCase() === 'CRYPTO') {
        // Use all cached crypto assets (Top 100 dynamic list) instead of static 20
        relevantAssets = allCached.filter(a => a.ticker && a.ticker.endsWith('-USD'));
      } else {
        const key = market.toUpperCase().replace(/\s+/g, '');
        const tickersForMarket = getWatchlistForRegions([key]);
        const tickerSet = new Set(tickersForMarket);
        relevantAssets = allCached.filter(a => tickerSet.has(a.ticker));
      }
    }

    if (relevantAssets.length === 0) {
      // Fallback: if cache is empty (scanner hasn't run yet), run a fresh scan
      clientWs.send(JSON.stringify({ status: 'update', text: `⏳ Cache warming up... Running fresh scan...\n\n` }));
      try {
        let tickersToScan = [];
        if (market === 'Global') {
          tickersToScan = getWatchlistForRegions(listAvailableRegions());
        } else {
          const key = market.toUpperCase().replace(/\s+/g, '');
          tickersToScan = getWatchlistForRegions([key]);
        }
        const results = await runBulkScanPhase4(tickersToScan);
        relevantAssets = results.filter(r => r.status === 'success');
      } catch (e) {
        clientWs.send(JSON.stringify({ status: 'update', text: `❌ Scanner Failed: ${e.message}\n` }));
        clientWs.send(JSON.stringify({ status: 'complete' }));
        return;
      }
    }

    const topSetups = relevantAssets
      .filter(r => r.status === 'success')
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);

    if (topSetups.length === 0) {
      clientWs.send(JSON.stringify({ status: 'update', text: `❌ **NO TRADES FOUND**\nThe scanner checked the ${market} market, but no valid data was returned. Please try again later.\n` }));
    } else {
      let report = `**SCAN COMPLETE: TOP ${topSetups.length} TRADES FOUND**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      if (topSetups[0].score < 50) {
          report += `⚠️ **WARNING: CAPITAL PRESERVATION MODE**\nAll assets in this market are currently scoring below the 50/100 threshold. Market may be flat, highly volatile, or fighting the macro trend. Exercise extreme caution.\n\n`;
      }
      topSetups.forEach((s, idx) => {
        const dirIcon = s.signalData?.direction === 'BULLISH' ? '🟢' : s.signalData?.direction === 'BEARISH' ? '🔴' : '⚪';
        report += `**#${idx + 1}. ${dirIcon} ${s.ticker}** (Score: ${s.score}/100)\n`;
        report += `• **Setup:** ${s.setup_id || s.signalData?.setupId || 'N/A'}\n`;
        report += `• **Direction:** ${s.signalData?.direction || 'N/A'} | **Regime:** ${s.macroRegime} (Macro) | ${s.microRegime} (Micro)\n`;
        report += `• **Entry:** $${s.currentPrice?.toFixed ? s.currentPrice.toFixed(4) : s.currentPrice}\n`;
        if (s.signalData?.takeProfit || s.takeProfit) report += `• **Take Profit:** $${(s.signalData?.takeProfit || s.takeProfit)?.toFixed ? (s.signalData?.takeProfit || s.takeProfit).toFixed(4) : (s.signalData?.takeProfit || s.takeProfit)}\n`;
        if (s.signalData?.stopLoss || s.stopLoss) report += `• **Stop Loss:** $${(s.signalData?.stopLoss || s.stopLoss)?.toFixed ? (s.signalData?.stopLoss || s.stopLoss).toFixed(4) : (s.signalData?.stopLoss || s.stopLoss)}\n`;
        if (s.signalData?.kelly?.halfKelly) report += `• **Kelly Size:** ${(s.signalData.kelly.halfKelly * 100).toFixed(1)}%\n`;
        report += `\n`;
      });

      const cacheInfo = await getCacheInfo();
      report += `_Data freshness: ${cacheInfo.ageMs ? Math.round(cacheInfo.ageMs / 1000) : '?'}s ago | Scan cycle #${cacheInfo.scanCycleCount}_\n`;

      const parts = report.split('\n');
      for (const p of parts) {
        clientWs.send(JSON.stringify({ status: 'update', text: p + '\n' }));
        await new Promise(r => setTimeout(r, 40));
      }
    }

    clientWs.send(JSON.stringify({ status: 'complete' }));
    return;
  }

  // === DEEP THINK PIPELINE (User-specific, secure, UNCHANGED) ===
  // Everything below this line is the original per-user analysis pipeline.
  // It only runs for custom questions, image uploads, and complex prompts.
  // This is NOT touched by the "1 = ALL" architecture.

  // Strip data URL prefix if present (frontend sends 'data:image/jpeg;base64,...')
  let imageBase64 = options.imageBase64 || null;
  if (imageBase64 && imageBase64.includes(',')) {
    imageBase64 = imageBase64.split(',')[1];
  }
  const isImageMode = !!imageBase64;
  const API_KEYS = getApiKeys();

  if (API_KEYS.length === 0) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'The system cannot connect because all AI API keys are missing. Please check the backend configuration.', rawError: 'Missing GEMINI_API_KEY in environment variables' }));
    return;
  }

  // === Phase 3: Pre-Stream Analysis (Extract Ticker -> Fetch OHLCV -> Hurst -> Regime) ===
  let ticker;
  if (isImageMode) {
    // extractTickerFromImage now handles its own keys
    ticker = await extractTickerFromImage(imageBase64);
  } else {
    ticker = extractTickerFromText(prompt);
  }
  console.log(`[PHASE 3] Extracted Ticker: ${ticker} (Mode: ${isImageMode ? 'IMAGE' : 'TEXT'})`);

  let phase3Context = '';
  let hurstData = null;
  let regimeData = null;
  let flowDataRef = null;
  let tf15mRef = null;
  let tf1hRef = null;
  let tf1dRef = null;
  let currentPriceRef = null;

  if (ticker !== 'UNKNOWN') {
    // Phase 2-4: Fetch all required market data in parallel
    const [dataResult, flowData, depthData, futuresData, fng, macro, tickerStats, recentAnalyses] = await Promise.all([
      fetchMultiTimeframeOHLCV(ticker, 300),
      fetchOrderFlow(ticker, 1000),
      fetchOrderBookDepth(ticker, 1000),
      fetchFuturesData(ticker),
      fetchFearAndGreed(),
      fetchMacroCorrelations(),
      getTickerStats(ticker),
      getRecentAnalyses(ticker, 2)
    ]);

    flowDataRef = flowData;

    if (!dataResult.error) {
      const tf15m = dataResult.timeframes['15m'];
      tf15mRef = tf15m;
      const tf1h = dataResult.timeframes['1h'];
      tf1hRef = tf1h;
      const tf1d = dataResult.timeframes['1d'];
      tf1dRef = tf1d;
      currentPriceRef = tf1d && tf1d.length > 0 ? tf1d[tf1d.length - 1].close : null;

      const returns15m = getLogReturns(tf15m);
      const returns1h = getLogReturns(tf1h);
      const returns1d = getLogReturns(tf1d);

      const hurst15m = calculateHurst(returns15m);
      const hurst1h = calculateHurst(returns1h);
      const hurst1d = calculateHurst(returns1d);

      const regime15m = classifyRegime(hurst15m);
      const regime1h = classifyRegime(hurst1h);
      const regime1d = classifyRegime(hurst1d);

      // Store 1D as primary for downstream compatibility
      hurstData = hurst1d;
      regimeData = regime1d;

      // Calculate technical indicators from daily data
      const techContext = calculateAllIndicators(tf1d);

      // Advanced Multi-Timeframe Shield Logic
      const closes15m = getClosePrices(tf15m);
      const closes1d = getClosePrices(tf1d);
      const price15m = closes15m[closes15m.length - 1];
      const price1d = closes1d[closes1d.length - 1];

      // Trend Confirmation (20/50 SMA)
      const sma20_15m = sma(closes15m, 20) || price15m;
      const sma50_15m = sma(closes15m, 50) || price15m;
      const sma20_1d = sma(closes1d, 20) || price1d;
      const sma50_1d = sma(closes1d, 50) || price1d;

      const is15mStrongUp = price15m > sma20_15m && sma20_15m > sma50_15m;
      const is15mStrongDown = price15m < sma20_15m && sma20_15m < sma50_15m;
      const dir15m = is15mStrongUp ? 'UP' : is15mStrongDown ? 'DOWN' : 'CHOP';

      const is1dStrongUp = price1d > sma20_1d && sma20_1d > sma50_1d;
      const is1dStrongDown = price1d < sma20_1d && sma20_1d < sma50_1d;
      const dir1d = is1dStrongUp ? 'UP' : is1dStrongDown ? 'DOWN' : 'CHOP';

      // Volatility Context
      const atr15m = atr(tf15m, 14);
      const atr1d = atr(tf1d, 14);

      let multiRegimeContext = `\n=== ADVANCED MULTI-TIMEFRAME MATRIX (THE SHIELD) ===\n`;
      multiRegimeContext += `15m Regime: ${regime15m.regime}${regime15m.regime === 'TRENDING' ? '-' + dir15m : ''} (Hurst: ${hurst15m?.meanH?.toFixed(2) ?? 'N/A'}, Vol: ${atr15m?.regime ?? 'N/A'})\n`;
      multiRegimeContext += `1H Regime:  ${regime1h.regime} (Hurst: ${hurst1h?.meanH?.toFixed(2) ?? 'N/A'})\n`;
      multiRegimeContext += `1D Regime:  ${regime1d.regime}${regime1d.regime === 'TRENDING' ? '-' + dir1d : ''} (Hurst: ${hurst1d?.meanH?.toFixed(2) ?? 'N/A'}, Vol: ${atr1d?.regime ?? 'N/A'})\n`;

      const is15mBullish = regime15m.regime === 'TRENDING' && dir15m === 'UP';
      const is15mBearish = regime15m.regime === 'TRENDING' && dir15m === 'DOWN';
      const is1dBullish = regime1d.regime === 'TRENDING' && dir1d === 'UP';
      const is1dBearish = regime1d.regime === 'TRENDING' && dir1d === 'DOWN';

      let shieldTriggered = false;

      // Rule 1: Macro Trend Fight
      if ((is15mBullish && is1dBearish) || (is15mBearish && is1dBullish)) {
        multiRegimeContext += `\n🚨 TIME FRAME SHIELD TRIGGERED: 15m short-term trend is explicitly fighting the 1D macro trend. DO NOT TAKE THIS TRADE. High probability of being a trap. 🚨\n`;
        shieldTriggered = true;
      }

      // Rule 2: Mean Reversion Trap (Macro chop, micro trend = liquidity grab)
      if (regime1d.regime === 'MEAN_REVERTING' && regime15m.regime === 'TRENDING') {
        multiRegimeContext += `\n⚠️ MEAN REVERSION TRAP DETECTED: The 1D macro regime is ranging/choppy, but the 15m is trending. This is likely a short-term liquidity grab that will reverse. Fade the 15m trend or DO NOT TRADE. ⚠️\n`;
        shieldTriggered = true;
      }

      // Rule 3: Volatility Expansion Warning
      if (atr15m && atr1d && atr15m.percentOfPrice > atr1d.percentOfPrice * 1.5) {
        multiRegimeContext += `\n⚠️ MICRO-VOLATILITY ANOMALY: 15m volatility is abnormally high compared to the 1D baseline. This indicates news-driven erratic movement or institutional stop-hunting. Reduce position size by 50%. ⚠️\n`;
      }

      if (!shieldTriggered) {
        multiRegimeContext += `\nTimeframes are aligned. No explicit timeframe conflict detected.\n`;
      }

      regimeData.summaryForAI = multiRegimeContext + "\n" + regimeData.summaryForAI;

      // Format institutional data layers
      const flowContext = formatOrderFlowContext(flowData, depthData);
      const futContext = formatFuturesContext(futuresData);
      const macroContext = formatMacroContext(fng, macro);

      // Format performance and session context
      let perfContext = '';
      if (tickerStats) {
        perfContext += `\n=== HISTORICAL PERFORMANCE ON ${ticker} ===\n`;
        perfContext += `Total Predictions: ${tickerStats.total} | Win Rate: ${tickerStats.winRate}%\n`;
        perfContext += `Average Confidence on Losses: ${tickerStats.avgConfidenceOnLosses}%\n`;
        perfContext += `(If your confidence is often high when wrong, you are overestimating your edge. recalibrate.)\n`;
      }
      if (recentAnalyses && recentAnalyses.length > 0) {
        perfContext += `\n=== RECENT ANALYSES (SESSION CONTINUITY) ===\n`;
        recentAnalyses.forEach(r => {
          perfContext += `- [${new Date(r.timestamp).toLocaleTimeString()}] Bias: ${r.direction} (${r.confidence}%) | Target: $${r.target || 'N/A'} | Outcome: ${r.outcome}\n`;
        });
      }

      phase3Context = `\n\n=== PHASE 3 STATISTICAL GUARDRAILS ===\n${regimeData.summaryForAI}\nUse this mathematical regime in your analysis.\n${techContext}${flowContext}${futContext}${macroContext}${perfContext}`;
    } else {
      console.warn(`[PHASE 3] Data fetch failed for ${ticker}: ${dataResult.error}`);
    }
  }

  // === §1.2 Context Reinjection: Fetch error vectors for this asset ===
  let memoryBlock = '';
  try {
    const errorVectors = await getErrorVectors(ticker !== 'UNKNOWN' ? ticker : null, 5);
    if (errorVectors && errorVectors.length > 0) {
      const vectorLines = errorVectors.map((ev, i) => `${i + 1}. "${ev.errorDescription}"`).join('\n');
      memoryBlock = `\n\n=== INSTITUTIONAL MEMORY (PAST ERROR CORRECTIONS) ===\nYou have made these analytical mistakes before on similar assets. Factor them into your current analysis to avoid repeating them:\n${vectorLines}\nDO NOT repeat these errors. Adjust your confidence levels and structural reads accordingly.\n`;
    }
  } catch (e) {
    console.warn('[MEMORY] Error vector fetch failed, proceeding without memory:', e.message);
  }

  let translationRule = '';
  if (language && language !== 'English') {
    translationRule = `\n\n=== TRANSLATION REQUIREMENT ===\nYou MUST output your entire reasoning, analysis, explanation, and educational modules in the following language: ${language}.\nCRITICAL: Do NOT translate the exact text labels in Module 1 (e.g., "BASE CASE:", "Primary Target:", "Current Price:", "Risk-to-Reward Ratio:"). Keep those labels exactly as requested in English so the backend parser does not break.`;
  }

  // Build final system prompt — adapt IMAGE GATE for text-only mode
  const basePromptTemplate = isSimpleMode ? SIMPLE_SYSTEM_PROMPT : SYSTEM_PROMPT;
  let finalSystemPrompt;
  if (isImageMode) {
    finalSystemPrompt = basePromptTemplate + phase3Context + memoryBlock + translationRule;
  } else {
    // Text-only: replace IMAGE GATE with data analysis instructions
    const textAdapted = basePromptTemplate.replace(
      /=== IMAGE GATE ===[\s\S]*?→ STOP\. Do not continue\./,
      `=== DATA ANALYSIS MODE ===\nYou are analyzing this asset from RAW PROGRAMMATIC DATA provided in the system context below. There is NO chart image. You have real-time OHLCV data, technical indicators (RSI, MACD, Bollinger, ATR, VWAP, Pivot Points), Hurst regime classification, order flow analysis, open interest/funding rates, and macro correlations — all injected below.\nAnalyze this numerical data with full institutional rigor as if reading a Bloomberg terminal.\nDo NOT say "I cannot see a chart" — you have ALL the data. Proceed directly to Module 1.`
    );
    finalSystemPrompt = textAdapted + phase3Context + memoryBlock + translationRule;
  }

  // Stream via REST SSE with Phase 3 integration
  await streamViaRestSSE(clientWs, API_KEYS, finalSystemPrompt, {
    ticker,
    hurstData,
    regimeData,
    isImageMode,
    imageBase64,
    userPrompt: prompt,
    flowData: flowDataRef,
    tf15m: tf15mRef,
    tf1h: tf1hRef,
    candles1d: tf1dRef,
    currentPrice: currentPriceRef,
    promptsUsed: promptsUsed,
    isSimpleMode: isSimpleMode
  });
}


// =====================================================
// PHASE 3 — POST-STREAM INTERCEPT & LOGGING
// =====================================================

async function executePhase3Intercept(fullText, rawFullText, p3Context, clientWs) {
  try {
    if (fullText.includes('INVALID INPUT')) {
      console.log('[PHASE 3] Invalid input detected (not a chart). Aborting intercept.');
      return;
    }

    const { ticker, hurstData, regimeData, flowData, tf15m, tf1h, userPrompt } = p3Context;

    // ═══════════════════════════════════════════════════════
    // DETERMINISTIC SIGNAL GENERATOR — Engine decides, not AI
    // ═══════════════════════════════════════════════════════
    let signal = null;
    let trueLivePrice = null;

    if (ticker && ticker !== 'UNKNOWN' && p3Context.candles1d && p3Context.candles1d.length >= 50) {
      console.log(`[SIGNAL GEN] Running deterministic engine for ${ticker}...`);
      
      // Institutional Circuit Breaker: Fetch True Live Price for math anchoring and desync detection
      trueLivePrice = await fetchLivePrice(ticker);
      
      // Data Desynchronization Guard
      const ohlcvClose = p3Context.candles1d[p3Context.candles1d.length - 1].close;
      const priceDrift = trueLivePrice ? Math.abs(trueLivePrice - ohlcvClose) / trueLivePrice : 0;
      
      if (priceDrift > 0.005) {
          console.warn(`[CIRCUIT BREAKER] Data desynchronization detected for ${ticker}. Drift: ${(priceDrift*100).toFixed(2)}%. Aborting signal.`);
          signal = {
              action: 'SHIELD_MODE',
              reason: `Data Desynchronization: Market data is stale compared to live price. Drift: ${(priceDrift*100).toFixed(2)}%. Signal aborted.`,
              direction: 'NEUTRAL',
              score: 0,
              currentPrice: trueLivePrice
          };
      } else {
          const ofiSource = flowData?.source || 'CANDLE_APPROXIMATION';
          signal = await generateSignal(ticker, p3Context.candles1d, { 
              candles15m: tf15m, 
              candles1h: tf1h, 
              ofiSource,
              livePrice: trueLivePrice 
          });
      }
      console.log(`[SIGNAL GEN] ${ticker}: action=${signal.action} direction=${signal.direction} score=${signal.score}`);
    }

    // Use engine output if available, otherwise fall back to basic text parsing
    const direction = signal?.direction || 'NEUTRAL';
    const rawConfidence = signal?.score || 50;
    const currentPrice = signal?.currentPrice || trueLivePrice || p3Context.currentPrice || 0;
    const primaryTarget = signal?.takeProfit || null;
    const stopLoss = signal?.stopLoss || null;
    const kellyResult = signal?.kelly || { action: 'TRADE', reason: 'Baseline heuristic', kellyF: 0.25, halfKelly: 0.125 };
    const setupId = signal?.setupId || null;
    const signalBlocked = signal ? signal.action === 'SHIELD_MODE' : true;
    const blockedReason = signalBlocked ? (signal?.reason || 'Insufficient market data to generate a deterministic signal') : null;

    const tradeTimeframe = '1h';
    const calibResult = await getCalibratedConfidence(rawConfidence);

    let verdictText = "";
    // Render engine verdict differently for Simple Mode
    if (p3Context.isSimpleMode) {
      let simpleVerdict = `\n\nMODULE 14 — AI VERDICT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      simpleVerdict += `• Signal Confidence: ${rawConfidence}/100\n`;
      simpleVerdict += `• Overall Trend: ${regimeData?.regime === 'TRENDING' ? 'Strong' : 'Chop/Sideways'}\n`;
      if (signalBlocked) {
        simpleVerdict += `• AI Status: PAUSED (${blockedReason})\n`;
      } else {
        simpleVerdict += `• AI Status: ACTIVE\n`;
      }

      const parts = sanitizeChunk(simpleVerdict).split(/(MODULE \d+ — [^\n]+)/);
      for (const p of parts) {
        if (!p) continue;
        clientWs.send(JSON.stringify({ text: p }));
        await new Promise(r => setTimeout(r, 40));
      }
      verdictText = simpleVerdict;
    } else {
      verdictText = `\n\nMODULE 14 — ENGINE VERDICT (Deterministic)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      verdictText += `• Engine Signal Score: ${rawConfidence}/100\n`;
      if (signal?.scoreBreakdown) {
        verdictText += `• Regime Alignment: ${signal.scoreBreakdown.regimeAlignment}/100\n`;
        verdictText += `• Technical Confluence: ${signal.scoreBreakdown.technicalConfluence}/100\n`;
        const ofiSrcLabel = signal.scoreBreakdown.ofiSource === 'BINANCE_AGGTRADE' ? 'LIVE TRADE DATA' : 'CANDLE ESTIMATE (0.6x penalty)';
        verdictText += `• Order Flow: ${signal.scoreBreakdown.orderFlow}/100 [${ofiSrcLabel}]\n`;
        verdictText += `• Volume Confirmation: ${signal.scoreBreakdown.volumeConfirmation}/100\n`;
        verdictText += `• Historical Win Rate: ${signal.scoreBreakdown.historicalWinRate}/100\n`;
      }
      // Hurst CI regime-span check
      if (hurstData?.ci95) {
        const ciLower = hurstData.ci95.lower;
        const ciUpper = hurstData.ci95.upper;
        const spansAll = ciLower < 0.40 && ciUpper > 0.60;
        verdictText += `• Hurst CI: [${ciLower?.toFixed(3)}, ${ciUpper?.toFixed(3)}] ${spansAll ? '— AMBIGUOUS (spans all regimes)' : '— Clean regime read'}\n`;
      }

      if (signalBlocked) {
        verdictText += `\n🚨 SHIELD MODE ACTIVATED: ${blockedReason}\n   (Signal rejected to protect capital)\n`;
      } else if (kellyResult?.action === 'TRADE') {
        verdictText += `\n✅ QUANTITATIVE EDGE CONFIRMED\n   Kelly Criterion: ${(kellyResult.kellyF * 100).toFixed(1)}% | Half-Kelly: ${(kellyResult.halfKelly * 100).toFixed(1)}%\n`;
      }

      const parts = sanitizeChunk(verdictText).split(/(MODULE \d+ — [^\n]+)/);
      for (const p of parts) {
        if (!p) continue;
        clientWs.send(JSON.stringify({ text: p }));
        await new Promise(r => setTimeout(r, 40));
      }
    }

    const sanitizedVerdict = sanitizeChunk(verdictText);
    clientWs.send(JSON.stringify({ status: 'update', text: sanitizedVerdict }));
    fullText += sanitizedVerdict;
    rawFullText += verdictText;

    // Compute 5-10m Predictive Horizon & Educational Lessons
    const predictiveHorizon = predict5to10mHorizon(tf15m, flowData);
    const educationalLesson = generateTradeLesson(
      { ticker: ticker || 'UNKNOWN', side: direction, rrr: 2.0 },
      regimeData, flowData, p3Context.promptsUsed || 0
    );

    // Use REAL order flow from signal generator (not fake hardcoded data)
    const dynamicBuyerPercent = signal?.buyerPercent ?? (direction === 'BULLISH' ? 68 : 32);
    const dynamicHurstScore = hurstData?.meanH ? Number(hurstData.meanH.toFixed(2)) : 0.50;

    // SEND TRADE CARD IF VALID
    if (!signalBlocked && ticker && ticker !== 'UNKNOWN') {
      const tradeSide = direction === 'BULLISH' ? 'LONG' : direction === 'BEARISH' ? 'SHORT' : 'BUY';

      let riskAllowed = true;
      let riskBlockReason = null;
      try {
        const riskCheck = await canOpenNewTrade(ticker, tradeSide);
        if (!riskCheck.allowed) {
          riskAllowed = false;
          riskBlockReason = riskCheck.reason === 'MAX_CONCURRENT_TRADES'
            ? `MAX CONCURRENT TRADES (${riskCheck.count}/3)`
            : riskCheck.reason === 'DAILY_LOSS_LIMIT_HIT'
              ? `DAILY LOSS LIMIT HIT (${riskCheck.todayPnlPct?.toFixed(2) || 'N/A'}%)`
              : riskCheck.reason === 'CORRELATION_LIMIT'
                ? `CORRELATION BLOCK with ${riskCheck.conflicting_asset} (r=${riskCheck.corr?.toFixed(2)})`
                : riskCheck.reason;
        }
      } catch (riskErr) {
        console.warn('[RISK CONTROL] Check failed, allowing trade:', riskErr.message);
      }

      if (riskAllowed) {
        clientWs.send(JSON.stringify({
          status: 'trade_card',
          tradeData: {
            asset: ticker, side: tradeSide,
            entryPrice: currentPrice,
            stopLoss, takeProfit: primaryTarget,
            riskPercentage: 2, kellySize: kellyResult.halfKelly,
            pattern: setupId || signal?.pattern || 'ENGINE_DETECTED',
            regime: regimeData?.regime || 'N/A',
            source: 'QUANT_ENGINE',
            predictiveHorizon, educationalLesson,
            buyerPercent: dynamicBuyerPercent,
            hurstScore: dynamicHurstScore
          }
        }));
      } else {
        const notice = `\n⚠️ RISK CONTROL: ${riskBlockReason}\n`;
        clientWs.send(JSON.stringify({ status: 'update', text: notice }));
        fullText += notice;
      }
    }

    const auditWindowMs = tradeTimeframe === 'SWING' ? 48 * 3600000 : tradeTimeframe === 'POSITION' ? 7 * 24 * 3600000 : 4 * 3600000;
    const auditDue = new Date(Date.now() + auditWindowMs);

    const signalData = {
      ticker: ticker || 'UNKNOWN', direction,
      rawConfidence, calibratedConfidence: calibResult.calibratedConfidence,
      auditDue,
      hurstMean: hurstData?.meanH ?? null, hurstRS: hurstData?.rsH ?? null,
      hurstDFA: hurstData?.dfaH ?? null, hurstCI: hurstData?.ci95 ?? null,
      hurstStable: hurstData?.isStable ?? null,
      regime: regimeData?.regime ?? null,
      regimeHeuristicScore: regimeData?.heuristicScore ?? null,
      regimeActionable: regimeData?.isActionable ?? null,
      primaryTarget, extendedTarget: null,
      invalidationLevel: stopLoss, currentPrice,
      evGross: null, evNet: null, evPer100: null,
      kellyF: kellyResult.kellyF, halfKelly: kellyResult.halfKelly,
      estimatedFee: null,
      signalBlocked, blockedReason,
      tradeTimeframe, predictiveHorizon, educationalLesson,
      engineScore: signal?.score ?? null,
      engineScoreBreakdown: signal?.scoreBreakdown ?? null,
      predictionSummary: fullText.substring(0, 2000),
      userPrompt: p3Context.userPrompt || "Chart Analysis"
    };

    // ═══════════════════════════════════════════════════════
    // SIGNAL LOGGING — Only log REAL predictions, not SHIELD_MODE
    // SHIELD_MODE = "don't trade" → cannot be judged correct/incorrect
    // ═══════════════════════════════════════════════════════
    let signalHash = null;
    if (!signalBlocked) {
      // Check cooldown — prevent duplicate signals for the same ticker within 15 min
      const tickerKey = (ticker || 'UNKNOWN').toUpperCase();
      const lastTime = lastSignalTime.get(tickerKey);
      const now = Date.now();
      if (lastTime && (now - lastTime < SIGNAL_COOLDOWN_MS)) {
        console.log(`[SIGNAL] ${tickerKey} cooldown active (${Math.round((SIGNAL_COOLDOWN_MS - (now - lastTime)) / 1000)}s remaining) — skipping duplicate signal`);
      } else {
        signalHash = await logSignal(signalData);
        lastSignalTime.set(tickerKey, now);
      }
    } else {
      // Log to separate shield collection for debugging (never audited, never affects win rate)
      try {
        const db = await getDb();
        await db.collection('shield_log').insertOne({
          ...signalData,
          timestamp: new Date(),
          _type: 'SHIELD_MODE'
        });
        console.log(`[SHIELD] ${ticker} blocked: ${blockedReason}`);
      } catch (shieldErr) {
        console.warn('[SHIELD] Failed to log shield event:', shieldErr.message);
      }
    }

    await auditCompliance(fullText, signalHash);
    if (signalHash && ticker && ticker !== 'UNKNOWN' && regimeData?.regime && !signalBlocked) {
      registerSignal(signalHash, ticker, regimeData.regime);
    }

    // ═══════════════════════════════════════════════════════
    // PROMPT AUDIT LOGGING — Track general conversational AI advice
    // ═══════════════════════════════════════════════════════
    try {
      const db = await getDb();
      await db.collection('prompt_logs').insertOne({
        prompt: p3Context.userPrompt || "Image Analysis / General Chat",
        aiOutput: fullText,
        resultType: 'CONVERSATIONAL',
        timestamp: new Date().toISOString(),
        auditDue: new Date(Date.now() + 4 * 3600000), // 4 hours later
        resolvedOutcome: null,
        resolvedReason: null
      });
      console.log(`[PROMPT AUDIT] Logged conversation to prompt_logs for future grading.`);
    } catch (err) {
      console.error('[PROMPT AUDIT] Failed to log prompt:', err.message);
    }

  } catch (err) {
    console.error('[PHASE 3] Post-stream intercept failed:', err.message);
  }
}

/**
 * Fallback: REST SSE streaming with Phase 3 integration
 */
async function streamViaRestSSE(clientWs, apiKeys, systemPrompt, p3Context = {}) {
  const { isImageMode, imageBase64, userPrompt } = p3Context;

  // Build content parts based on analysis mode
  let userParts;
  if (isImageMode && imageBase64) {
    userParts = [
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
      { text: USER_PROMPT }
    ];
  } else {
    // Text-only mode: combine user question with execution protocol
    const textPrompt = `The user asked: "${userPrompt || 'Analyze this asset'}"

${USER_PROMPT}

IMPORTANT: You are in DATA-ONLY mode. All market data (OHLCV candles, RSI, MACD, Bollinger Bands, ATR, VWAP, Hurst regime, order flow, open interest, macro correlations) has been injected into your system prompt above. Analyze the NUMBERS with full institutional rigor. Do NOT mention that there is no chart — you have all numerical data needed for a complete analysis.`;
    userParts = [{ text: textPrompt }];
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.85, topK: 40 },
    tools: [{ googleSearch: {} }],
    contents: [{ role: 'user', parts: userParts }]
  };

  let fullText = '';
  let rawFullText = '';
  try {
    let success = false;
    let streamReader = null;
    let successfulModel = null;

    // OUTER LOOP: Iterate over all available API keys
    keyLoop: for (const apiKey of apiKeys) {
      const maskedKey = apiKey.substring(0, 6) + '...';
      
      // INNER LOOP: Iterate over all models for the current key
      for (const model of MODELS) {
        console.log(`[GEMINI] Attempting REST SSE with ${model} on Key ${maskedKey}`);
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            console.warn(`[GEMINI] ${model} failed with status: ${response.status}. Switching...`);
            continue; // Move to next model
          }

          console.log(`[GEMINI] Connected successfully to ${model} via Key ${maskedKey}`);
          success = true;
          successfulModel = model;
          streamReader = response.body.getReader();
          break keyLoop; // Break out of ALL loops, we have a successful connection
        } catch (err) {
          console.warn(`[GEMINI] Network error on ${model}: ${err.message}. Switching...`);
          continue;
        }
      }
    }

    if (!success || !streamReader) {
      console.error('[GEMINI] ALL Keys and ALL Models failed (Rate Limit or Outage).');
      clientWs.send(JSON.stringify({ status: 'error', message: 'All AI models are currently overwhelmed or rate-limited. Please wait a few seconds and try again.', rawError: 'Total cascade failure' }));
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await streamReader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.trim().slice(6);
            if (dataStr === '[DONE]' || !dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.candidates?.[0]?.content?.parts) {
                for (const part of data.candidates[0].content.parts) {
                  if (part.text) {
                    let text = part.text;

                    // Google API Bug Fix: The experimental 2.5 API occasionally escapes its own 
                    // trailing JSON metadata and injects it into the final text chunk. 
                    // We must strip it out before it hits the UI.
                    const leakIndex = text.indexOf('"}],"role":"model"');
                    if (leakIndex !== -1) text = text.substring(0, leakIndex);

                    const usageIndex = text.indexOf('"usageMetadata"');
                    if (usageIndex !== -1) text = text.substring(0, usageIndex);

                    rawFullText += text;
                    const sanitized = sanitizeChunk(text);
                    fullText += sanitized;
                    clientWs.send(JSON.stringify({ status: 'update', text: sanitized }));
                  }
                }
              }
            } catch (e) {
              console.error('[REST-SSE] Parse error on chunk:', e.message);
            }
          }
        }
      }

      console.log('[GEMINI] Stream complete, executing Phase 3 Intercept...');
      try {
        await executePhase3Intercept(fullText, rawFullText, p3Context, clientWs);
      } catch (p3Err) {
        console.error('[PHASE 3] Intercept failed — client will still receive complete signal:', p3Err.message);
      }
      clientWs.send(JSON.stringify({ status: 'complete', priceAtTime: p3Context?.currentPrice || null }));

  } catch (error) {
    console.error('[REST-SSE] Stream connection error:', error);
    clientWs.send(JSON.stringify({ status: 'error', message: 'We lost connection to the AI. Retrying...', rawError: error.message }));
  }
}

// NOTE: logPredictionFromText was dead code (never called, used legacy `predictions` collection).
// Removed in Phase 1 cleanup. All signal logging now goes through logSignal() in executePhase3Intercept().
