import { handleGeminiConnection } from './geminiEngine.js';

class MockWs {
  constructor() { this.responses = []; }
  send(data) { 
    const parsed = JSON.parse(data);
    this.responses.push(parsed);
    if(parsed.status === 'update') {
      process.stdout.write(parsed.text);
    } else {
      console.log('\n[WS]', parsed);
    }
  }
}

async function run() {
  console.log("=== TESTING TEXT MODE (SHOULD ROUTE TO GROQ AND GENERATE REAL TEXT) ===");
  const ws1 = new MockWs();
  // Simulate a real phase 3 data context (not dummy)
  const realP3Context = {
    isImageMode: false,
    userPrompt: "Analyze this asset",
    ticker: "BTC-USD"
  };
  
  // Create a minimal system prompt similar to what's normally sent
  const systemPrompt = `You are a quantitative institutional-grade analytical engine. Your output MUST be extremely concise, clean, and sharp. No fluff, no paragraphs, no emojis. 

If the image is NOT a trading chart, respond ONLY with: "INVALID INPUT — This is not a trading chart."

If it IS a trading chart, output exactly this structure:

PREDICTION VERDICT:
BASE CASE: [BULLISH/BEARISH/NEUTRAL] [XX]%
Timeframe: [Intraday / Swing]
Current Price: [price]`;

  await handleGeminiConnection(ws1, "dummy payload to hit text mode");
}

run();
