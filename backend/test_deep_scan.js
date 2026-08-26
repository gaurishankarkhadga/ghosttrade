import { handleGeminiConnection } from './geminiEngine.js';
import { MARKET_REGIONS } from './globalWatchlists.js';

class MockWs {
  constructor() { this.messages = []; }
  send(data) { 
    const msg = JSON.parse(data);
    this.messages.push(msg.text || msg.status);
    process.stdout.write((msg.text || msg.status) + (msg.text ? '' : '\n'));
  }
}

async function test() {
  console.log("=== TESTING DEEP SCAN: CRYPTO ===");
  await handleGeminiConnection(new MockWs(), { prompt: "[Context: Market Region = Crypto]\nExecute Deep Scan across all quantitative regimes" });
  
  console.log("\n=== TESTING DEEP SCAN: INDIA ===");
  await handleGeminiConnection(new MockWs(), { prompt: "[Context: Market Region = India]\nExecute Deep Scan across all quantitative regimes" });
  
  process.exit(0);
}

test();
