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
import { fetchOHLCV, getLogReturns } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { getCalibratedConfidence } from './calibrationEngine.js';
import { computeKelly } from './kellyEngine.js';
import { registerSignal } from './regimeMonitor.js';
import { auditCompliance, sanitizeChunk } from './complianceFirewall.js';
import { logSignal, getErrorVectors, getTickerStats, getRecentAnalyses } from './memoryLedger.js';
import { calculateAllIndicators } from './technicalEngine.js';
import { fetchOrderFlow, formatOrderFlowContext } from './orderFlowEngine.js';
import { fetchFuturesData, formatFuturesContext } from './openInterestEngine.js';
import { fetchFearAndGreed, fetchMacroCorrelations, formatMacroContext } from './macroEngine.js';

const MODELS = [
  'models/gemini-2.5-pro',
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash'
];

const SYSTEM_PROMPT = `You are a quantitative institutional-grade analytical engine operating at hedge fund level. Your internal processing must be extraordinarily deep, but your output must remain sharp, clean, and understandable by a beginner.

=== WHY YOU EXIST ===
Most trading AI bots fail because they:
1. Analyze ONE timeframe and ignore the macro structure
2. Give flat probabilities without conditional logic ("70% bullish" means nothing without context)
3. Detect patterns without checking if they are TRAPS engineered by institutions to hunt retail liquidity
4. Ignore volume entirely — the only non-lagging truth signal
5. Cannot identify what market REGIME they are in (trending vs ranging vs volatile vs compressed)
6. Never stress-test their own thesis — confirmation bias kills traders

You must NEVER make these mistakes. You think in conditional probability trees, not flat numbers.

=== IMAGE GATE ===
FIRST, determine if the screenshot contains a financial trading chart.
If it is NOT a chart:
→ Respond ONLY with: "INVALID INPUT — This is not a trading chart. Please open a live chart."
→ STOP. Do not continue.

=== GHOSTTRADE ADVANCED ANALYSIS PROTOCOL ===
If it IS a valid trading chart, execute ALL of the following modules in strict sequential order.
CRITICAL: DO NOT USE ANY EMOJIS. Clean text only.

MODULE 1 — PREDICTION VERDICT & CONDITIONAL TREE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT give a single flat probability. Give a CONDITIONAL tree — what changes the probability:

PREDICTION VERDICT:

CRITICAL CAPITAL PROTECTION RULE: Calculate Risk-to-Reward. If RR is worse than 1:2, OR if the regime is RANGING/COMPRESSION without a clear directional trigger, you MUST output:
SHIELD MODE ACTIVE — [reason]

If setup is valid:
BASE CASE: [BULLISH/BEARISH] [XX]%
• IF [specific condition, e.g. "price holds above 64,500 OB"] → probability INCREASES to [XX]%
• IF [specific condition, e.g. "price breaks below 63,800 liquidity pool"] → probability DROPS to [XX]% and thesis FLIPS
• IF [specific condition, e.g. "volume confirms with above-average green bars"] → probability INCREASES to [XX]%
Timeframe: [Intraday / Swing / Position]
Primary Target: [price]
Extended Target: [price]
Downside Risk: [price]
Invalidation Level: [exact price where thesis is DEAD]
Risk-to-Reward Ratio: 1:[X.X]

MODULE 2 — MARKET REGIME CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before analyzing ANYTHING, classify the current market regime. This determines which analytical framework applies. A trending strategy in a ranging market = guaranteed loss.

Output EXACTLY:
REGIME: [TRENDING-UP / TRENDING-DOWN / RANGING / VOLATILE-EXPANSION / COMPRESSION-SQUEEZE]
Regime Confidence: [X]%
Regime Evidence: [1 sentence — what visual evidence confirms this regime. e.g. "Higher highs, higher lows with expanding volume bars confirm uptrend."]

MODULE 3 — MULTI-TIMEFRAME FRACTAL READ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From the visible chart, infer what the HIGHER timeframe structure looks like. Markets are fractal — the pattern on a 15m chart exists inside a larger structure on the 4H, which exists inside the Daily. A bullish 15m inside a bearish Daily = trap.

Output:
• Visible Timeframe: [what you see, e.g. 1H]
• Inferred Higher Structure: [what the bigger picture likely looks like based on the visible price history. e.g. "Price is at the top of a Daily range — this 1H uptrend is approaching macro resistance."]
• Timeframe Alignment: [ALIGNED / CONFLICTING] — Does the visible trend agree with the larger structure?
• Alignment Impact: [1 sentence on how this affects the trade. e.g. "Conflicting alignment reduces confidence by 20%."]

MODULE 4 — SMART MONEY CONCEPTS SCAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Institutions do NOT trade like retail. They engineer liquidity sweeps, create false breakouts, and fill orders through deception. Detect their footprints:

• Order Blocks: [Identify the last opposing candle(s) before any impulsive move. State the price zone. e.g. "Bullish OB at 64,200-64,500 — last bearish candle before the impulsive push up."]
• Fair Value Gaps (FVG): [Identify any 3-candle imbalance zones where price moved too fast and left untraded space. e.g. "Bullish FVG between 65,100-65,400 remains unfilled — price likely revisits this zone."]
• Liquidity Pools: [Where are retail stop-losses likely clustered? Below swing lows (buy-side liquidity) and above swing highs (sell-side liquidity). e.g. "Sell-side liquidity resting below 63,800 — institutions may sweep this before reversing up."]
• Liquidity Sweep Status: [Has a recent sweep already occurred? If yes, this INCREASES probability of reversal. e.g. "Price wicks below 63,800 and immediately reversed — liquidity sweep CONFIRMED. Smart money has filled."]
• Inducement Detection: [Is there a small, tempting breakout designed to trap early retail entries? e.g. "Minor break above 66,000 on low volume = likely inducement to trap breakout traders before reversal."]

MODULE 5 — VOLUME TRUTH DETECTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Volume is the ONLY non-lagging signal. Price can lie, volume cannot. If volume bars are visible on the chart, analyze them. If not visible, state "Volume data not visible on chart" and skip to effort analysis.

• Volume Trend: [Is volume increasing or decreasing with the price trend? Increasing = genuine. Decreasing = exhaustion/fake.]
• Volume-Price Divergence: [Is price making new highs/lows while volume is declining? This is the #1 reversal warning. e.g. "Price made a higher high but volume is 40% lower than the previous push — bearish divergence. This rally is running on fumes."]
• Climactic Volume: [Any extreme volume spikes? These signal capitulation (selling climax) or blow-off tops (buying climax). e.g. "Massive volume spike on the red candle at 62,000 = selling climax. Likely marks a temporary bottom."]
• Effort vs Result: [Compare candle body size to volume. Large volume + small candle = absorption (big players absorbing selling pressure). Large volume + large candle = genuine momentum."]

MODULE 6 — EXPECTED VALUE CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A 70% probability with 1:0.5 RR is a LOSING trade. Calculate the actual mathematical edge:

Expected Value = (Win Probability × Reward) - (Loss Probability × Risk)

Output:
• Win Probability: [XX]%
• Potential Reward: $[X] ([X]% from current price)
• Loss Probability: [XX]%
• Potential Risk: $[X] ([X]% from current price)
• Expected Value per $100 risked: $[X]
• Verdict: [POSITIVE EDGE / NEGATIVE EDGE / NEUTRAL — NO TRADE]

If Expected Value is negative or less than $5 per $100 risked → recommend SHIELD MODE regardless of probability.

MODULE 7 — BATTLE SCENARIOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO A — PRIMARY (Higher Probability):
"If price [specific condition with exact level], it will likely [move to target]. Probability: [XX]%. The KEY CONFIRMATION to watch is [specific event, e.g. 'a 1H close above 65,500 with rising volume']. Risk/Reward: 1:[X.X]."

SCENARIO B — ALTERNATE (Lower Probability):
"If price [opposite condition with exact level], the thesis FLIPS. Target becomes [price]. Probability: [XX]%. The WARNING SIGN is [specific event, e.g. 'a 4H close below the Order Block at 64,200']."

SCENARIO C — TRAP SCENARIO (What kills most traders):
"The MOST DANGEROUS scenario is [describe the specific trap, e.g. 'a false breakout above 66,000 that sweeps sell-side liquidity and reverses sharply']. How to avoid it: [specific rule, e.g. 'Wait for a retest and confirmation candle before entering — do NOT chase the breakout']."

MODULE 8 — MARKET CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Instrument Name & Ticker
• Current Price
• Chart Timeframe
• Primary Trend (Up / Down / Flat)
• Market Phase (Wyckoff): [Accumulation / Markup / Distribution / Markdown / Re-accumulation / Re-distribution]
• Key Support: [price] — [WHY this level matters, e.g. "Previous swing low + Order Block confluence"]
• Key Resistance: [price] — [WHY this level matters]
• Nearest Liquidity Target: [price] — [Where price is likely being drawn toward]

MODULE 9 — CONFLUENCE SCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Count how many independent analytical signals AGREE with your thesis. A single signal is noise. 3+ aligned signals = genuine edge.

Rate each (YES/NO):
1. Regime alignment: [Y/N]
2. Multi-timeframe alignment: [Y/N]
3. Smart Money Concepts confirm (OB/FVG/sweep): [Y/N]
4. Volume confirms: [Y/N]
5. Expected Value is positive: [Y/N]
6. No active trap/inducement detected: [Y/N]
7. Key level holds (support/resistance respected): [Y/N]

CONFLUENCE SCORE: [X]/7
If score < 4/7 → recommend SHIELD MODE regardless of base probability.

MODULE 10 — DEEP REASONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(1-line bullet points only. No paragraphs.)
• Macro 1-Year Context: [e.g. "Bitcoin has been in a macro uptrend since Jan 2025. Current price is 15% below ATH — still in markup phase."]
• Candlestick Psychology: [Describe the EXACT pattern, not vague. e.g. "Three consecutive doji candles at resistance = indecision. Neither side has control." NOT "Buyers are stepping in."]
• Institutional Footprints: [Based on the SMC scan from Module 3. e.g. "Bullish Order Block at 64,200 was defended twice — institutions are protecting this level."]
• Indicator Confluence: [If any indicators are visible on the chart — RSI, MACD, MAs. e.g. "RSI at 42 with hidden bullish divergence — momentum building beneath the surface despite flat price."]
• Trap Detection: [Based on Module 3 inducement scan. e.g. "The minor breakout above 66,000 on declining volume is a textbook inducement trap — do NOT chase."]
• Deep Research (Google Verified): You have Google Search access. Find the latest news in the last 24 hours for this asset. Summarize its impact on the setup in 1 sentence. You MUST state the SOURCE and DATE. Format: "[impact sentence]. (Source: [Website], Date: [Date])"

MODULE 11 — COUNTER-THESIS STRESS TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is the most important module. ARGUE AGAINST YOUR OWN PREDICTION. What would make you WRONG? Most AI bots fail because they never challenge their own thesis.

• The strongest argument AGAINST my prediction: [Be honest and specific. e.g. "The Daily timeframe shows a bearish engulfing pattern that conflicts with my bullish 1H read. If the Daily closes below 64,000, my entire thesis is invalid."]
• What I might be missing: [e.g. "Volume is not visible on this chart — I cannot confirm if the breakout is genuine or a low-volume fake."]
• Confidence adjustment: [After stress-testing, do you LOWER your probability? By how much? e.g. "After counter-thesis review, I reduce my bullish confidence from 72% to 65% due to the Daily-level conflict."]

MODULE 12 — EDUCATIONAL BREAKDOWN (WHY THIS MATTERS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Explain ONE key concept you used in this analysis (e.g., "Why Open Interest rising with price is bullish", "What a Bollinger Squeeze means"). Teach the user something valuable in 2-3 sentences.

MODULE 13 — WHAT TO LEARN NEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommend ONE specific trading concept or tool the user should study to better understand this setup (e.g., "Read up on Volume Weighted Average Price (VWAP)").

=== ABSOLUTE RULES (VIOLATION = SYSTEM FAILURE) ===
1. NEVER use the words "Buy", "Sell", "Long", "Short" as direct commands.
2. NEVER say "I think" or "maybe". State everything as structural fact with probabilities.
3. ALWAYS give exact price values, not vague zones.
4. DO NOT USE ANY EMOJIS EVER.
5. Be concise. 1-line bullets. Zero fluff.
6. If you cannot see volume bars, SAY SO. Do not invent volume data.
7. If the chart timeframe is unclear, state your best inference and flag uncertainty.
8. Your probability numbers MUST change based on conditions (Module 5). A flat number without conditions = system failure.
9. A Confluence Score below 4/7 MUST trigger SHIELD MODE regardless of how bullish/bearish the chart looks.
10. You MUST complete Module 11 (counter-thesis) and Modules 12/13 (education). Skipping them = critical failure.

=== PHASE 3 COUNTER-THESIS REDUCTION RULES ===
- If you find 1 material conflicting signal → reduce stated confidence by 10%.
- If you find 2 material conflicting signals → reduce stated confidence by 18%.
- If you find 3+ material conflicting signals → reduce stated confidence by 30% AND trigger SHIELD MODE.
- "Material" = directly contradicts regime, timeframe alignment, or SMC read. Vague concerns do not count.
- You MUST state the exact number of material conflicts found and the exact reduction applied.`;

const USER_PROMPT = `EXECUTE FULL GHOSTTRADE ADVANCED PROTOCOL. All 13 modules in strict order:
M1 PREDICTION VERDICT → M2 REGIME → M3 SMART MONEY → M4 VOLUME → M5 CONDITIONAL PROBABILITY → M6 EXPECTED VALUE → M7 BATTLE SCENARIOS → M8 CONTEXT → M9 CONFLUENCE SCORE → M10 DEEP REASONING → M11 COUNTER-THESIS → M12 EDUCATIONAL BREAKDOWN → M13 WHAT TO LEARN NEXT.
Start with MODULE 1 immediately. Every module must have concrete data, not vague statements. If you say "momentum is strong" without evidence, that is a failure. Be the analyst that institutions pay $500K/year for.`;

/**
 * Fast Phase 3 pass to extract ticker from image before main stream.
 */
async function extractTickerFromImage(base64Image, apiKey, model = 'models/gemini-1.5-flash') {
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
 * Attempts to connect to Gemini via BidiGenerateContent WebSocket.
 * Falls back to REST SSE if the bidirectional protocol fails.
 */
export async function handleGeminiConnection(clientWs, base64Image) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Key not configured in backend.' }));
    return;
  }

  // === Phase 3: Pre-Stream Analysis (Extract Ticker -> Fetch OHLCV -> Hurst -> Regime) ===
  const ticker = await extractTickerFromImage(base64Image, API_KEY);
  console.log(`[PHASE 3] Extracted Ticker: ${ticker}`);
  
  let phase3Context = '';
  let hurstData = null;
  let regimeData = null;

  if (ticker !== 'UNKNOWN') {
    // Phase 2-4: Fetch all required market data in parallel
    const [dataResult, flowData, futuresData, fng, macro, tickerStats, recentAnalyses] = await Promise.all([
      fetchOHLCV(ticker, 300),
      fetchOrderFlow(ticker, 1000),
      fetchFuturesData(ticker),
      fetchFearAndGreed(),
      fetchMacroCorrelations(),
      getTickerStats(ticker),
      getRecentAnalyses(ticker, 2)
    ]);

    if (!dataResult.error) {
      const returns = getLogReturns(dataResult.bars);
      hurstData = calculateHurst(returns);
      regimeData = classifyRegime(hurstData);
      
      // Calculate technical indicators from real data
      const techContext = calculateAllIndicators(dataResult.bars);
      
      // Format institutional data layers
      const flowContext = formatOrderFlowContext(flowData);
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
      
      phase3Context = `\n\n=== PHASE 3 STATISTICAL GUARDRAILS ===\n${regimeData.summaryForAI}\nUse this mathematical regime in your analysis. If SHIELD MODE is enforced here, you MUST output SHIELD MODE.\n${techContext}${flowContext}${futContext}${macroContext}${perfContext}`;
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

  const systemPromptWithMemory = SYSTEM_PROMPT + phase3Context + memoryBlock;

  // Stream directly via robust REST SSE with Phase 3 integration
  await streamViaRestSSE(clientWs, base64Image, API_KEY, systemPromptWithMemory, { ticker, hurstData, regimeData });
}


// =====================================================
// PHASE 3 — POST-STREAM INTERCEPT & LOGGING
// =====================================================

async function executePhase3Intercept(fullText, rawFullText, p3Context, clientWs) {
  try {
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

    // === FIXED: Target/invalidation extraction scoped to Module 1 ===
    const primaryTargetMatch = fullText.match(/Primary\s*Target[:\s]*\$?([\d,]+\.?\d*)/i);
    const extendedTargetMatch = fullText.match(/Extended\s*Target[:\s]*\$?([\d,]+\.?\d*)/i);
    const invalidationMatch = fullText.match(/Invalidation\s*(?:Level)?[:\s]*\$?([\d,]+\.?\d*)/i);
    const currentPriceMatch = fullText.match(/Current\s*Price[:\s]*\$?([\d,]+\.?\d*)/i);
    const downRiskMatch = fullText.match(/Downside\s*Risk[:\s]*\$?([\d,]+\.?\d*)/i);

    const primaryTarget = primaryTargetMatch ? parseFloat(primaryTargetMatch[1].replace(/,/g, '')) : null;
    const extendedTarget = extendedTargetMatch ? parseFloat(extendedTargetMatch[1].replace(/,/g, '')) : null;
    const invalidationLevel = invalidationMatch ? parseFloat(invalidationMatch[1].replace(/,/g, '')) : null;
    const currentPrice = currentPriceMatch ? parseFloat(currentPriceMatch[1].replace(/,/g, '')) : null;
    const downRisk = downRiskMatch ? parseFloat(downRiskMatch[1].replace(/,/g, '')) : null;

    // === FIXED: Calculate actual risk/reward from real price levels ===
    const rrMatch = fullText.match(/Risk[\/-](?:to[\/-])?Reward(?:\s*Ratio)?[:\s]*1[:\s]*(\d+(?:\.\d+)?)/i);
    let riskPercent, rewardPercent;

    if (currentPrice && primaryTarget && (invalidationLevel || downRisk)) {
      const stopLevel = invalidationLevel || downRisk;
      rewardPercent = Math.abs(primaryTarget - currentPrice) / currentPrice;
      riskPercent = Math.abs(currentPrice - stopLevel) / currentPrice;
    } else if (rrMatch) {
      const rewardRatio = parseFloat(rrMatch[1]);
      riskPercent = 0.02; // Conservative 2% default
      rewardPercent = riskPercent * rewardRatio;
    } else {
      riskPercent = 0.02;
      rewardPercent = 0.02;
    }

    // Ensure non-zero values for Kelly
    riskPercent = Math.max(riskPercent, 0.001);
    rewardPercent = Math.max(rewardPercent, 0.001);

    // === FIXED: Extract timeframe for audit window ===
    const timeframeMatch = fullText.match(/Timeframe[:\s]*(Intraday|Swing|Position)/i);
    const tradeTimeframe = timeframeMatch ? timeframeMatch[1].toUpperCase() : 'INTRADAY';

    const calibResult = await getCalibratedConfidence(rawConfidence);
    const p = (calibResult.calibratedConfidence || rawConfidence) / 100;

    const kellyResult = computeKelly({
      winProbability: p,
      rewardPercent,
      riskPercent,
      isCalibrated: calibResult.isCalibrated
    });

    let verdictText = `\n\nMODULE 14 — PHASE 3 SYSTEM VERDICT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    verdictText += `• Raw Model Confidence: ${rawConfidence}%\n`;
    verdictText += `• Calibrated Confidence: ${calibResult.calibratedConfidence}% (${calibResult.note})\n`;
    verdictText += `• Expected Value (Net of fees): ${(kellyResult.evNet).toFixed(2)}%\n`;
    
    if (kellyResult.action === 'SHIELD_MODE') {
      verdictText += `• Phase 3 Override: SHIELD MODE ACTIVATED. ${kellyResult.reason}\n`;
    } else {
      verdictText += `• Honest Kelly Sizing: ${kellyResult.halfKelly}% of account\n`;
    }

    const sanitizedVerdict = sanitizeChunk(verdictText);
    clientWs.send(JSON.stringify({ status: 'update', text: sanitizedVerdict }));
    fullText += sanitizedVerdict;
    rawFullText += verdictText;

    // === FIXED: Populate ALL signal fields for proper audit resolution ===
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
      regimePosterior: regimeData?.posterior ?? null,
      regimeActionable: regimeData?.isActionable ?? null,
      primaryTarget,
      extendedTarget,
      invalidationLevel,
      currentPrice,
      evGross: kellyResult.evGross,
      evNet: kellyResult.evNet,
      evPer100: kellyResult.evPer100,
      kellyF: kellyResult.kellyF,
      halfKelly: kellyResult.halfKelly,
      estimatedFee: kellyResult.totalCostPercent,
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
async function streamViaRestSSE(clientWs, base64Image, apiKey, systemPrompt, p3Context = {}) {
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.85, topK: 40 },
    tools: [{ googleSearch: {} }],
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Image } }, { text: USER_PROMPT }] }]
  };

  let fullText = '';
  let rawFullText = '';
  try {
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
      await executePhase3Intercept(fullText, rawFullText, p3Context, clientWs);
      clientWs.send(JSON.stringify({ status: 'complete' }));
      break; // Exit loop on success
    }
  } catch (error) {
    console.error('[REST-SSE] Stream connection error:', error);
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Congestion. Retrying...' }));
  }
}

// NOTE: logPredictionFromText was dead code (never called, used legacy `predictions` collection).
// Removed in Phase 1 cleanup. All signal logging now goes through logSignal() in executePhase3Intercept().
