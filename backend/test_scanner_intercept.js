import { handleGeminiConnection } from './geminiEngine.js';

// Mock websocket
const mockWs = {
  send: (msg) => {
    const data = JSON.parse(msg);
    if (data.status === 'update') {
       process.stdout.write(data.text);
    } else if (data.status === 'complete') {
       console.log('\n[WS CLOSED]');
    } else {
       console.log('\n[WS]', msg);
    }
  }
};

async function testScan() {
    console.log("--- TESTING GLOBAL DEEP SCAN ---");
    await handleGeminiConnection(mockWs, { prompt: 'Execute Deep Scan across all quantitative regimes [Market: Global]' });
    
    console.log("\n--- TESTING INDIA DEEP SCAN ---");
    await handleGeminiConnection(mockWs, { prompt: 'Execute Deep Scan across all quantitative regimes [Market: India]' });
}

testScan();
