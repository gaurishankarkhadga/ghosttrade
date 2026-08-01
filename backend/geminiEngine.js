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
import { fetchOHLCV, fetchMultiTimeframeOHLCV, getLogReturns, getClosePrices } from './dataFetcher.js';
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

const MODELS = [
  'models/gemini-2.5-pro',
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash'
];

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

const USER_PROMPT = `Analyze this chart and output the strict institutional summary format exactly as requested. Keep it extremely sharp.`;

/**
 * Fast Phase 3 pass to extract ticker from image before main stream.
 */
async function extractTickerFromImage(base64Image, apiKey, model = MODELS[1]) { // Defaulting to the flash model from array
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
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'UNKNOWN';
    return text.replace(/[^A-Z0-9-]/g, '').substring(0, 10) || 'UNKNOWN';
  } catch (e) {
    console.warn('[GEMINI] Ticker extraction failed:', e.message);
    return 'UNKNOWN';
  }
}

/**
 * Extracts ticker from a text prompt using pattern matching.
 * Handles: "analyze BTC", "what about RELIANCE?", "SOL prediction", etc.
 */
function extractTickerFromText(promptText) {
  if (!promptText) return 'UNKNOWN';
  const text = promptText.toUpperCase().trim();

  const CRYPTO = ['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','DOT','LINK','MATIC','BNB','LTC','ATOM','UNI','NEAR','APT','ARB','OP','SUI','PEPE','WIF','SHIB'];
  const NSE = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','BHARTIARTL','ITC','KOTAKBANK','LT','WIPRO','TATAMOTORS','TATASTEEL','ADANIENT','BAJFINANCE','MARUTI','SUNPHARMA','HCLTECH','AXISBANK','ULTRACEMCO'];
  const US = ['AAPL','TSLA','GOOGL','GOOG','AMZN','MSFT','NVDA','META','NFLX','AMD','CRM','ORCL','INTC','QCOM','PYPL','DIS','BA','JPM','GS','V','MA'];

  // Check for ticker-suffix formats first: BTC-USD, ETH/USDT, RELIANCE.NS
  const suffixMatch = text.match(/\b([A-Z]{2,15})(?:\.(NS|BO)|[-\/](USD|USDT|INR))\b/);
  if (suffixMatch) return suffixMatch[0].replace(/\//g, '-');

  // Check known tickers (standalone word boundary match)
  for (const t of CRYPTO) { if (new RegExp(`\\b${t}\\b`).test(text)) return t; }
  for (const t of NSE) { if (new RegExp(`\\b${t}\\b`).test(text)) return `${t}.NS`; }
  for (const t of US) { if (new RegExp(`\\b${t}\\b`).test(text)) return t; }

  // Last resort: find any 2-6 letter uppercase word that looks like a ticker
  const genericMatch = text.match(/\b([A-Z]{2,6})\b/);
  if (genericMatch && !['THE','AND','FOR','NOT','ARE','BUT','HOW','CAN','WHAT','WILL','THIS','THAT','WITH','FROM','ABOUT','ANALYZE','ANALYSIS','TRADE','SCAN','DEEP','ALL'].includes(genericMatch[1])) {
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
  const { prompt = '', language = 'English' } = options;
  // Strip data URL prefix if present (frontend sends 'data:image/jpeg;base64,...')
  let imageBase64 = options.imageBase64 || null;
  if (imageBase64 && imageBase64.includes(',')) {
    imageBase64 = imageBase64.split(',')[1];
  }
  const isImageMode = !!imageBase64;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'The system cannot connect because the AI API key is missing. Please check the backend configuration.', rawError: 'Missing GEMINI_API_KEY in environment variables' }));
    return;
  }

  // === Phase 3: Pre-Stream Analysis (Extract Ticker -> Fetch OHLCV -> Hurst -> Regime) ===
  let ticker;
  if (isImageMode) {
    ticker = await extractTickerFromImage(imageBase64, API_KEY);
  } else {
    ticker = extractTickerFromText(prompt);
  }
  console.log(`[PHASE 3] Extracted Ticker: ${ticker} (Mode: ${isImageMode ? 'IMAGE' : 'TEXT'})`);
  
  let phase3Context = '';
  let hurstData = null;
  let regimeData = null;

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

    if (!dataResult.error) {
      const tf15m = dataResult.timeframes['15m'];
      const tf1h = dataResult.timeframes['1h'];
      const tf1d = dataResult.timeframes['1d'];

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
  let finalSystemPrompt;
  if (isImageMode) {
    finalSystemPrompt = SYSTEM_PROMPT + phase3Context + memoryBlock + translationRule;
  } else {
    // Text-only: replace IMAGE GATE with data analysis instructions
    const textAdapted = SYSTEM_PROMPT.replace(
      /=== IMAGE GATE ===[\s\S]*?→ STOP\. Do not continue\./,
      `=== DATA ANALYSIS MODE ===\nYou are analyzing this asset from RAW PROGRAMMATIC DATA provided in the system context below. There is NO chart image. You have real-time OHLCV data, technical indicators (RSI, MACD, Bollinger, ATR, VWAP, Pivot Points), Hurst regime classification, order flow analysis, open interest/funding rates, and macro correlations — all injected below.\nAnalyze this numerical data with full institutional rigor as if reading a Bloomberg terminal.\nDo NOT say "I cannot see a chart" — you have ALL the data. Proceed directly to Module 1.`
    );
    finalSystemPrompt = textAdapted + phase3Context + memoryBlock + translationRule;
  }

  // Stream via REST SSE with Phase 3 integration
  await streamViaRestSSE(clientWs, API_KEY, finalSystemPrompt, { ticker, hurstData, regimeData, isImageMode, imageBase64, userPrompt: prompt });
}


// =====================================================
// PHASE 3 — POST-STREAM INTERCEPT & LOGGING
// =====================================================

async function executePhase3Intercept(fullText, rawFullText, p3Context, clientWs) {
  try {
    // If the AI flagged this as a non-chart, abort the pipeline immediately.
    // There are no price levels or confidence metrics to analyze.
    if (fullText.includes('INVALID INPUT')) {
      console.log('[PHASE 3] Invalid input detected (not a chart). Aborting intercept.');
      return;
    }

    const { ticker, hurstData, regimeData } = p3Context;

    // === FIXED: Robust confidence extraction ===
    // Priority: BASE CASE format > Probability: format > confidence fallback
    const baseCaseMatch = fullText.match(/BASE\s*CASE[:\s]*(?:BULLISH|BEARISH)\s*(\d{1,3})%/i);
    const probMatch = fullText.match(/Probability[:\s]*(\d{1,3})%/i);
    const confMatch = fullText.match(/(?:confidence|conf\.?)\s*(?:of|at|:)?\s*(\d{1,3})%/i);
    const rawConfidence = baseCaseMatch ? parseInt(baseCaseMatch[1])
      : probMatch ? parseInt(probMatch[1])
      : confMatch ? parseInt(confMatch[1])
      : 50;

    // === FIXED: Direction extraction scoped to Module 1 only ===
    // Only scan the first ~2000 chars (Module 1 verdict area) to avoid
    // counter-thesis (Module 11) contaminating direction classification
    let direction = 'NEUTRAL';
    const module1Text = fullText.substring(0, Math.min(fullText.length, 2000)).toLowerCase();
    const baseCaseDirMatch = fullText.match(/BASE\s*CASE[:\s]*(BULLISH|BEARISH)/i);
    if (baseCaseDirMatch) {
      direction = baseCaseDirMatch[1].toUpperCase();
    } else if (module1Text.includes('bullish') && !module1Text.includes('bearish')) {
      direction = 'BULLISH';
    } else if (module1Text.includes('bearish') && !module1Text.includes('bullish')) {
      direction = 'BEARISH';
    } else {
      // Both mentioned in Module 1 — use probability comparison
      const bullProbMatch = module1Text.match(/bullish\s*(\d{1,3})%/i);
      const bearProbMatch = module1Text.match(/bearish\s*(\d{1,3})%/i);
      const bp = bullProbMatch ? parseInt(bullProbMatch[1]) : 0;
      const brp = bearProbMatch ? parseInt(bearProbMatch[1]) : 0;
      direction = bp >= brp ? 'BULLISH' : 'BEARISH';
    }

    // === FIXED: Extract matched_setup_id and reject hallucinations ===
    const setupMatch = fullText.match(/matched_setup_id[:\s]*([a-z_]+)/i);
    const matched_setup_id = setupMatch ? setupMatch[1] : null;

    let kellyResult = { action: 'SHIELD_MODE', reason: 'No setup ID found. Blocking trade.', kellyF: 0, halfKelly: 0 };
    let primaryTarget = null, currentPrice = p3Context.currentPrice || null, stopLoss = null;

    // Extract prices
    const targetMatch = fullText.match(/Primary Target:\s*\$?(?:[0-9,]*\.?[0-9]+)/i);
    if (targetMatch) {
      primaryTarget = parseFloat(targetMatch[0].replace(/[^0-9.]/g, ''));
    }
    const stopMatch = fullText.match(/Stop Loss:\s*\$?(?:[0-9,]*\.?[0-9]+)/i);
    if (stopMatch) {
      stopLoss = parseFloat(stopMatch[0].replace(/[^0-9.]/g, ''));
    }
    const priceMatch = fullText.match(/Current Price:\s*\$?(?:[0-9,]*\.?[0-9]+)/i);
    if (priceMatch) {
      currentPrice = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ''));
    }

    if (matched_setup_id && matched_setup_id !== 'NONE') {
      const db = await getDb();
      const stats = await db.collection('setup_stats').findOne({ 
        setup_id: matched_setup_id, 
        logic_version: CURRENT_LOGIC_VERSION 
      });

         kellyResult = computeKelly({
           mean_return: 0.02, // 2% heuristic edge
           variance: 0.005,
           regime: regimeData?.regime
         });
         kellyResult.reason = `Setup ${matched_setup_id} found. Heuristic sizing applied.`;
      } else if (stats.confidence_flag === 'INSUFFICIENT_DATA') {
         kellyResult.reason = `Setup ${matched_setup_id} has insufficient data (sample size < 30). Shield Mode.`;
         kellyResult = computeKelly({
           mean_return: stats.mean_return,
           variance: stats.variance,
           regime: regimeData?.regime
         });
      }
    }

    const tradeTimeframe = '1h'; // Default

    // === Wire up the calibration engine to adjust raw AI confidence ===
    const calibResult = await getCalibratedConfidence(rawConfidence);

    let verdictText = `\n\nMODULE 14 — PHASE 3 SYSTEM VERDICT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    verdictText += `• Raw Model Confidence: ${rawConfidence}%\n`;
    verdictText += `• Calibrated Confidence: ${calibResult.calibratedConfidence}%${calibResult.isCalibrated ? ' (adjusted from historical accuracy)' : ' (using raw — insufficient calibration data)'}\n`;
    verdictText += `• Matched Setup: ${matched_setup_id || 'NONE'}\n`;
    
    if (kellyResult.action === 'SHIELD_MODE') {
      verdictText += `• Phase 3 Override: SHIELD MODE ACTIVATED. ${kellyResult.reason}\n`;
    } else {
      verdictText += `• Honest Kelly Sizing: ${kellyResult.halfKelly}% of account\n`;
    }

    const sanitizedVerdict = sanitizeChunk(verdictText);
    clientWs.send(JSON.stringify({ status: 'update', text: sanitizedVerdict }));
    fullText += sanitizedVerdict;
    rawFullText += verdictText;
    
    // SEND TRADE CARD IF VALID — with Portfolio Risk Gate
    if (kellyResult.action !== 'SHIELD_MODE' && ticker && ticker !== 'UNKNOWN') {
      const tradeSide = direction === 'BULLISH' ? 'LONG' : direction === 'BEARISH' ? 'SHORT' : 'BUY';
      
      // Portfolio-level risk check (daily loss limit, concurrent cap, correlation blocking)
      let riskAllowed = true;
      let riskBlockReason = null;
      try {
        const riskCheck = await canOpenNewTrade(ticker, tradeSide);
        if (!riskCheck.allowed) {
          riskAllowed = false;
          riskBlockReason = riskCheck.reason;
          if (riskCheck.reason === 'MAX_CONCURRENT_TRADES') {
            riskBlockReason = `MAX CONCURRENT TRADES (${riskCheck.count}/${3}) — Close existing positions first.`;
          } else if (riskCheck.reason === 'DAILY_LOSS_LIMIT_HIT') {
            riskBlockReason = `DAILY LOSS LIMIT HIT (${riskCheck.todayPnlPct?.toFixed(2) || 'N/A'}%) — Trading suspended for today.`;
          } else if (riskCheck.reason === 'CORRELATION_LIMIT') {
            riskBlockReason = `CORRELATION BLOCK — Too correlated with open position ${riskCheck.conflicting_asset} (r=${riskCheck.corr?.toFixed(2)}).`;
          }
        }
      } catch (riskErr) {
        // Fail OPEN for risk check errors (DB down = don't block trading entirely)
        console.warn('[RISK CONTROL] Check failed, allowing trade:', riskErr.message);
      }

      if (riskAllowed) {
        clientWs.send(JSON.stringify({
          status: 'trade_card',
          tradeData: {
            asset: ticker,
            side: tradeSide,
            entryPrice: currentPrice || 0,
            stopLoss: stopLoss,
            takeProfit: primaryTarget,
            riskPercentage: 2,
            kellySize: kellyResult.halfKelly,
            pattern: matched_setup_id || 'N/A',
            regime: regimeData ? regimeData.regime : 'N/A',
            source: 'AI_AGENT'
          }
        }));
      } else {
        const riskNotice = `\n⚠️ RISK CONTROL OVERRIDE: Trade card suppressed.\n   Reason: ${riskBlockReason}\n   The setup is valid but portfolio-level risk constraints prevent execution.\n`;
        clientWs.send(JSON.stringify({ status: 'update', text: riskNotice }));
        fullText += riskNotice;
      }
    }

    // === Populate ALL signal fields for proper audit resolution ===
    const signalData = {
      ticker: ticker || 'UNKNOWN',
      direction,
      rawConfidence,
      calibratedConfidence: calibResult.calibratedConfidence,
      hurstMean: hurstData?.meanH ?? null,
      hurstRS: hurstData?.rsH ?? null,
      hurstDFA: hurstData?.dfaH ?? null,
      hurstCI: hurstData?.ci95 ?? null,
      hurstStable: hurstData?.isStable ?? null,
      regime: regimeData?.regime ?? null,
      regimeHeuristicScore: regimeData?.heuristicScore ?? null,
      regimeActionable: regimeData?.isActionable ?? null,
      primaryTarget: null,
      extendedTarget: null,
      invalidationLevel: null,
      currentPrice: null,
      evGross: null,
      evNet: null,
      evPer100: null,
      kellyF: kellyResult.kellyF,
      halfKelly: kellyResult.halfKelly,
      estimatedFee: null,
      signalBlocked: kellyResult.action === 'SHIELD_MODE',
      blockedReason: kellyResult.action === 'SHIELD_MODE' ? kellyResult.reason : null,
      tradeTimeframe,
      predictionSummary: fullText.substring(0, 2000)
    };

    const signalHash = await logSignal(signalData);
    await auditCompliance(fullText, signalHash);
    
    if (signalHash && ticker && ticker !== 'UNKNOWN' && regimeData?.regime && kellyResult.action !== 'SHIELD_MODE') {
      registerSignal(signalHash, ticker, regimeData.regime);
    }
  } catch (err) {
    console.error('[PHASE 3] Post-stream intercept failed:', err.message);
  }
}

/**
 * Fallback: REST SSE streaming with Phase 3 integration
 */
async function streamViaRestSSE(clientWs, apiKey, systemPrompt, p3Context = {}) {
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
    for (const model of MODELS) {
      console.log(`[GEMINI] Attempting REST SSE with ${model}...`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn(`[GEMINI] ${model} failed with status: ${response.status}`);
        continue;
      }

      console.log(`[GEMINI] Connected successfully to ${model}`);
      success = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
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
      clientWs.send(JSON.stringify({ status: 'complete' }));
      break; // Exit loop on success
    }
    
    if (!success) {
      console.error('[GEMINI] All models exhausted and failed.');
      clientWs.send(JSON.stringify({ status: 'error', message: 'Gemini API rate limit occurred. Too many people are using the AI right now. Please wait a minute and try again.', rawError: '429 Too Many Requests on all fallback models' }));
    }
  } catch (error) {
    console.error('[REST-SSE] Stream connection error:', error);
    clientWs.send(JSON.stringify({ status: 'error', message: 'We lost connection to the AI. Retrying...', rawError: error.message }));
  }
}

// NOTE: logPredictionFromText was dead code (never called, used legacy `predictions` collection).
// Removed in Phase 1 cleanup. All signal logging now goes through logSignal() in executePhase3Intercept().
