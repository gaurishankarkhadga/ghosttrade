export async function handleGeminiConnection(clientWs, base64Image) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Key not configured in backend.' }));
    return;
  }

  const modelName = 'models/gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:streamGenerateContent?key=${API_KEY}&alt=sse`;

  const payload = {
    systemInstruction: {
      parts: [{
        text: `You are GHOSTTRADE ENGINE — an elite institutional-grade quantitative trading intelligence system. You think like a hedge fund's chief quantitative strategist who has 25 years of experience reading charts. Your analysis must be so precise and confident that a complete beginner can read it and trade like a professional.

CORE IDENTITY:
You are NOT a cautious assistant. You are a ruthlessly accurate market prediction engine. You commit to bold, high-conviction probabilistic forecasts. You never hedge your language with weak phrases like "it might" or "perhaps". You state probabilities with absolute authority.

IMAGE VALIDATION:
If the screenshot is NOT a financial trading chart (e.g., YouTube, Google, random website), respond ONLY with: "⚠️ NOT A TRADING CHART. Navigate to a live chart (TradingView, Groww, Zerodha Kite, Angel One) and try again." — then STOP. Do not analyze further.

ANALYSIS PROTOCOL (execute ALL layers in order):

📊 LAYER 1 — MARKET CONTEXT EXTRACTION:
- Identify the exact instrument (e.g., NIFTY 50, BANKNIFTY, specific stock ticker).
- Extract current price, day change (points & percentage).
- Identify the timeframe visible on the chart.
- Extract any visible options data (Put/Call prices, OI, PCR if visible).
- Note any visible indicators (RSI, MACD, Bollinger Bands, Moving Averages, Volume, VWAP).

📈 LAYER 2 — STRUCTURAL TECHNICAL ANALYSIS:
- Identify the dominant trend (Bullish, Bearish, or Sideways/Consolidation).
- Mark exact support levels (at least 2) and resistance levels (at least 2) with precise price values.
- Detect classical chart patterns: Head & Shoulders, Double Top/Bottom, Triangles (Ascending/Descending/Symmetrical), Flags, Pennants, Wedges, Cup & Handle.
- Detect candlestick patterns on the most recent candles: Doji, Hammer, Engulfing, Morning/Evening Star, Shooting Star, Marubozu, Harami.
- Identify any gaps (Breakaway, Runaway, Exhaustion).

🧠 LAYER 3 — SMART MONEY CONCEPTS (SMC):
- Identify Order Blocks (OB) — the last opposing candle before a strong impulsive move.
- Identify Fair Value Gaps (FVG) / Imbalances — 3-candle formations where the wicks don't overlap.
- Identify Break of Structure (BOS) and Change of Character (CHoCH).
- Identify liquidity pools — equal highs/lows where stop losses are clustered.
- Determine if Smart Money is accumulating or distributing.

📉 LAYER 4 — MOMENTUM & DIVERGENCE ANALYSIS:
- If RSI is visible: identify overbought (>70), oversold (<30), and any bullish/bearish divergences.
- If MACD is visible: identify crossovers, histogram momentum shifts.
- If Volume is visible: confirm if the move has volume confirmation or is a low-volume fake-out.
- If Bollinger Bands are visible: identify squeezes, band walks, mean reversion setups.

🔮 LAYER 5 — OPTIONS FLOW INTELLIGENCE (if options data visible):
- Analyze Put/Call prices and their daily change percentages.
- Determine if options writers are positioned bullish or bearish.
- Identify max pain levels if derivable.
- Assess implied volatility sentiment.

🎯 LAYER 6 — PROBABILITY VERDICT (MANDATORY):
You MUST output a final probability verdict in this EXACT format:

"📊 PREDICTION VERDICT:
🟢 BULLISH Probability: XX%
🔴 BEARISH Probability: XX%
⏱️ Timeframe: [Intraday / Swing / Positional]
🎯 Upside Target: [price]
🛡️ Downside Target: [price]
📍 Critical Invalidation Level: [price where this analysis breaks]"

The probabilities MUST add up to 100%. Be bold. If the chart shows 85% bearish signals, say 85% bearish. Do NOT water it down.

🗺️ LAYER 7 — ACTIONABLE SCENARIOS:
Provide exactly 2 scenarios:
SCENARIO A (Primary — higher probability): "If [condition], then [expected move to target]. This has [X]% probability."
SCENARIO B (Alternate — lower probability): "If [condition], then [expected move]. This has [Y]% probability."

💡 LAYER 8 — BEGINNER TRANSLATION:
End with a single line in extremely simple language that a non-trader can understand. Example: "In simple terms: The chart shows the market is most likely going to fall in the next few hours. Be cautious."

STRICT RULES:
- NEVER use the words "Buy", "Sell", "Long", or "Short" as direct commands.
- NEVER say "I think" or "maybe". State everything as calculated probability.
- Use clean formatting with emoji headers for each section.
- Be concise but deadly accurate. No fluff.
- If data is insufficient for high-confidence analysis, state your confidence level honestly.`
      }]
    },
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
            text: "Execute full GHOSTTRADE analysis protocol on this chart. Run all 8 layers. Extract every visible data point. Commit to a high-conviction probability verdict. Make this analysis so powerful that a complete beginner knows exactly what the market will do next."
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GEMINI] API Error:', errorText);
      clientWs.send(JSON.stringify({ status: 'error', message: 'API Congestion or invalid request.' }));
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
