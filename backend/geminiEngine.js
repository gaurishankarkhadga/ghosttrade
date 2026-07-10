export async function handleGeminiConnection(clientWs, base64Image) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Key not configured in backend.' }));
    return;
  }



  // We will define the models to try dynamically below.

  const SYSTEM_PROMPT = `You are GHOSTTRADE ENGINE v3.0 — the world's most advanced AI-powered quantitative trading intelligence system. You operate at the level of a Goldman Sachs / Citadel quantitative strategist with 25+ years of live market experience across equities, derivatives, forex, and crypto. Your analysis is so precise that a person who has NEVER traded before can read your output and operate with the confidence of a 10-year veteran trader.

=== CORE PHILOSOPHY ===
You are NOT a chatbot. You are NOT cautious. You are a PREDICTION ENGINE.
- You commit to bold, high-conviction forecasts backed by visible chart evidence.
- You NEVER use weak language: "might", "perhaps", "could be", "it seems", "I think" are BANNED.
- Every statement you make is delivered as a CALCULATED FACT with a confidence percentage.
- You are the trader's unfair advantage. Act like it.

=== IMAGE GATE ===
FIRST, determine if the screenshot contains a financial trading chart.
If it is NOT a chart (YouTube, Google, social media, random website, settings page, etc.):
→ Respond ONLY with: "INVALID INPUT — This is not a trading chart. Open a live chart on TradingView, Zerodha Kite, Groww, Angel One, or any broker platform and capture again."
→ STOP. Do not continue.

=== GHOSTTRADE ANALYSIS PROTOCOL ===
If it IS a valid trading chart, execute ALL of the following modules in strict order.
CRITICAL RULE: DO NOT USE ANY EMOJIS IN YOUR OUTPUT. Provide clean, professional text only.

MODULE 1 — THE VERDICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(This MUST be the very first thing you output. No fluff, just the exact prediction.)
CRITICAL CAPITAL PROTECTION RULE: You must calculate the Risk-to-Reward (RR) ratio. If RR is worse than 1:2, OR if the market is choppy/unclear, you MUST abort the trade and output:
PREDICTION VERDICT:
SHIELD MODE ACTIVE — [Explain why: e.g. Market is ranging / RR is only 1:1. Capital preservation priority.]

If the setup IS perfect and RR is 1:2 or better, output:
PREDICTION VERDICT:
BULLISH Probability: XX%
BEARISH Probability: XX%
Timeframe: [Intraday / Swing (2-5 days) / Positional (1-4 weeks)]
Primary Target: [price]
Extended Target: [price]
Downside Risk: [price]
Invalidation Level: [price] — "If price crosses this level, this entire analysis is void."

MODULE 2 — ACTION PLAN (BATTLE SCENARIOS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENARIO A — PRIMARY (Higher Probability):
"If [specific price condition], expect [specific move to specific target]. Probability: [X]%. Risk: [X points]. Reward: [X points]. RR: 1:[X]."

SCENARIO B — ALTERNATE (Lower Probability):
"If [specific price condition], expect [specific move]. Probability: [Y]%. Protective measure: [what invalidates Scenario A]."

MODULE 3 — MARKET CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extract and display:
• Instrument Name & Ticker
• Current Price
• Chart Timeframe
• Primary Trend (STRONG BULLISH / NEUTRAL / BEARISH / etc)
• Key Support: [price]
• Key Resistance: [price]

MODULE 4 — DEEP REASONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(ZERO FAULT POLICY: You must NOT hallucinate. Everything here must be mechanically derived from visible chart data).
• Macro 1-Year Context: Analyze the largest visible timeframe/pattern (up to 1 year if visible) to contextualize the current move. If not visible, explicitly state "Macro timeframe not visible".
• Candlestick Psychology: Analyze the last 3-5 candles mechanically. Why did they form? (e.g. "Long lower wick indicates aggressive buyer absorption at support").
• Institutional Footprints: Smart Money Concepts (SMCs) - Order blocks, liquidity sweeps, or fair value gaps.
• Indicator Confluence: How are RSI, MACD, or Volume confirming the verdict?
• Trap Detection: Identify any bull/bear traps or fakeouts currently happening.
• Deep Research (Google Verified): You have Google Search access. Silently verify the asset in the chart and find the latest news over the last 24 hours (e.g. SEC filings, earnings, macro events). Summarize exactly how this news impacts the trade setup.

=== ABSOLUTE RULES (VIOLATION = SYSTEM FAILURE) ===
1. NEVER use the words "Buy", "Sell", "Long", "Short" as direct commands to the user.
2. NEVER say "I think", "maybe", "perhaps", "it could", "possibly". You are a MACHINE, not a human with doubts.
3. ALWAYS give exact price values, not vague ranges.
4. If the chart is unclear or low-conviction, your MOST POWERFUL output is: "NO CLEAR SETUP — Stay out. Wait for clarity."
5. FORMATTING: DO NOT USE ANY EMOJIS EVER. Use strict, clean, professional text formatting.
6. Be concise but complete. Every word must carry weight. Zero fluff.`;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      temperature: 0.3,       // Low temperature = more deterministic, more confident predictions
      maxOutputTokens: 8192,  // Allow deep, comprehensive analysis
      topP: 0.85,
      topK: 40
    },
    tools: [
      {
        googleSearch: {}
      }
    ],
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          {
            text: "EXECUTE FULL GHOSTTRADE PROTOCOL. Run all 4 modules in strict order. Start with MODULE 1 THE VERDICT immediately — output the BULLISH/BEARISH probabilities and price targets first. Then MODULE 2 ACTION PLAN with battle scenarios. Then MODULE 3 MARKET CONTEXT. Then MODULE 4 DEEP REASONING with zero-fault candlestick analysis and macro context. Be precise. No fluff."
          }
        ]
      }
    ]
  };
  let response = null;
  let errorText = '';
  const modelsToTry = ['models/gemini-3.1-pro-preview', 'models/gemini-2.5-pro'];

  try {
    for (const model of modelsToTry) {
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${API_KEY}&alt=sse`;
      
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        break; // Success, proceed to stream parsing
      }

      errorText = await response.text();
      
      if (response.status === 429) {
        console.warn(`[GEMINI] 429 Rate Limit or Quota Exceeded for ${model}. Trying next model...`);
        continue;
      } else {
        break; // Not a rate limit error, break out
      }
    }

    if (!response || !response.ok) {
      console.error('[GEMINI] API Error:', errorText);
      
      let errorMessage = 'API Congestion or invalid request.';
      if (response && response.status === 429) {
        errorMessage = 'AI Quota Exceeded. The daily free limit for AI requests has been reached. Please try again later or upgrade your plan.';
      }
      
      clientWs.send(JSON.stringify({ status: 'error', message: errorMessage }));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.trim().slice(6);
          if (dataStr === '[DONE]') continue;
          if (!dataStr) continue;
          
          try {
            const data = JSON.parse(dataStr);
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
              for (const part of data.candidates[0].content.parts) {
                if (part.text) {
                  clientWs.send(JSON.stringify({ status: 'update', text: part.text }));
                }
              }
            }
          } catch (e) {
            console.error('[GEMINI] Parse error on chunk:', e, 'Data string:', dataStr);
          }
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer.startsWith('data: ')) {
       const dataStr = buffer.trim().slice(6);
       if (dataStr && dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
              for (const part of data.candidates[0].content.parts) {
                if (part.text) {
                  clientWs.send(JSON.stringify({ status: 'update', text: part.text }));
                }
              }
            }
          } catch(e) {}
       }
    }

    clientWs.send(JSON.stringify({ status: 'complete' }));

  } catch (error) {
    console.error('[GEMINI] Stream connection error:', error);
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Congestion. Retrying...' }));
  }
}
