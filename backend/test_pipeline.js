import dotenv from 'dotenv';
dotenv.config();
import { handleGeminiConnection } from './geminiEngine.js';
import { getDb } from './mongoConfig.js';

class MockWebSocket {
    constructor() {
        this.messages = [];
    }
    send(data) {
        const parsed = JSON.parse(data);
        if (parsed.status === 'trade_card') {
            console.log("\n🔥 [END TO END] TRADE CARD RECEIVED 🔥");
            console.log(JSON.stringify(parsed.tradeData, null, 2));
        } else if (parsed.status === 'update') {
            // console.log(parsed.text.replace(/\n/g, ' '));
        } else if (parsed.status === 'complete') {
            console.log("\n✅ PIPELINE COMPLETE");
            process.exit(0);
        } else if (parsed.status === 'error') {
            console.error("❌ ERROR:", parsed.message);
            process.exit(1);
        }
    }
}

async function run() {
    console.log("Starting End-to-End Test for BANKNIFTY...");
    const mockWs = new MockWebSocket();
    await handleGeminiConnection(mockWs, { prompt: "Analyze BANKNIFTY and give me a trade setup", isSimpleMode: false });
}

run();
