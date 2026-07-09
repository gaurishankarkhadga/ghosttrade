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
        text: "You are a highly specialized chart analysis AI. 1. If the provided image is NOT a financial trading chart (e.g., it is a normal website, YouTube, etc.), you MUST strictly reply with: 'This is not a trading chart. Please provide a valid chart for analysis.' and refuse further analysis. 2. If it IS a trading chart, strictly output mathematical observations (e.g., 'Bullish Divergence detected'). NEVER execute trades, and NEVER say 'Buy' or 'Sell'."
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
            text: "Analyze this trading chart mathematically. If this is not a trading chart, state so immediately. Otherwise, output key observations, support/resistance, and patterns. Keep it brief. No Buy/Sell recommendations."
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
