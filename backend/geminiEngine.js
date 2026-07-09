import WebSocket from 'ws';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_PATH = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.0-flash-exp'; // Required model for Multimodal Live API (bidiGenerateContent)

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
        systemInstruction: {
          parts: [{
            text: "You are a highly specialized chart analysis AI. 1. If the provided image is NOT a financial trading chart (e.g., it is a normal website, YouTube, etc.), you MUST strictly reply with: 'This is not a trading chart. Please provide a valid chart for analysis.' and refuse further analysis. 2. If it IS a trading chart, strictly output mathematical observations (e.g., 'Bullish Divergence detected'). NEVER execute trades, and NEVER say 'Buy' or 'Sell'."
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
                    text: "Analyze this trading chart mathematically. If this is not a trading chart, state so immediately. Otherwise, output key observations, support/resistance, and patterns. Keep it brief. No Buy/Sell recommendations."
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
