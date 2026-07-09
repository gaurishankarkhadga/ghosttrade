import WebSocket from 'ws';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_PATH = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash'; // Or gemini-3.1-flash-live-preview if permitted

export function handleGeminiConnection(clientWs, base64Image) {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Key not configured in backend.' }));
    return;
  }

  const geminiWsUrl = `wss://${GEMINI_HOST}${GEMINI_PATH}?key=${API_KEY}`;

  const geminiWs = new WebSocket(geminiWsUrl);

  geminiWs.on('open', () => {
    console.log('[GEMINI] WebSocket Connection Opened. Sending setup message...');

   
    const setupMessage = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["TEXT"]
        },
        // We can optionally add system instructions here to enforce the compliance rule
        systemInstruction: {
          parts: [{
            text: "You are a chart analysis AI. You must NEVER execute trades, and NEVER say 'Buy', 'Sell', or offer direct financial advice. STRICTLY output mathematical observations only (e.g., 'Bullish Divergence detected. Support at X'). Be concise."
          }]
        }
      }
    };

    geminiWs.send(JSON.stringify(setupMessage));
  });

  geminiWs.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Wait for setupComplete
      if (response.setupComplete) {
        console.log('[GEMINI] Setup complete. Sending image payload...');

        // Send the chart payload wrapped in realtimeInput schema
        const clientContent = {
          clientContent: {
            turns: [
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
                    text: "Analyze this trading chart mathematically. Output key observations, support/resistance, and patterns. Keep it brief. Remember: No Buy/Sell recommendations."
                  }
                ]
              }
            ],
            turnComplete: true
          }
        };

        geminiWs.send(JSON.stringify(clientContent));
        return;
      }

      // Handle server content chunks
      if (response.serverContent && response.serverContent.modelTurn) {
        const parts = response.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.text) {
            clientWs.send(JSON.stringify({ status: 'update', text: part.text }));
          }
        }

        if (response.serverContent.turnComplete) {
          clientWs.send(JSON.stringify({ status: 'complete' }));
          // We can close the gemini connection if it's a one-shot analysis per click
          geminiWs.close(1000, "Analysis complete");
        }
      }
    } catch (e) {
      console.error('[GEMINI] Failed to parse message', e, data.toString());
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[GEMINI] Connection closed: ${code} ${reason}`);
    // If it's not a normal closure, it could be a 1006 or similar
    if (code !== 1000) {
      clientWs.send(JSON.stringify({ status: 'error', message: 'API Congestion or disconnected. Retrying later.' }));
    }
  });

  geminiWs.on('error', (error) => {
    console.error('[GEMINI] Error:', error);
    // Self-healing error boundary
    clientWs.send(JSON.stringify({ status: 'error', message: 'API Congestion. Retrying...' }));
  });

  // Cleanup if the client disconnects before Gemini finishes
  clientWs.on('close', () => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close(1000, "Client disconnected");
    }
  });
}
