import { executePhase3Intercept } from './backend/geminiEngine.js';

const mockWs = {
  send: (data) => {
    const parsed = JSON.parse(data);
    if (parsed.status === 'trade_card') {
      console.log('TRADE CARD SENT:');
      console.log(`- kellySize: ${parsed.tradeData.kellySize}`);
      console.log(`- signalBlocked: ${parsed.tradeData.signalBlocked}`);
      console.log(`- action/reason: ${parsed.tradeData.shieldReason || 'NONE'}`);
    } else {
      console.log(`OTHER EVENT: ${parsed.status}`);
    }
  }
};

const p3Context = {
  asset: "BTC-USD",
  candles1d: new Array(60).fill({close: 50000}),
  tf15m: new Array(50).fill({close: 50000}),
  currentPrice: 50000
};

async function run() {
  await executePhase3Intercept("Full Text", "Raw Text", p3Context, mockWs);
}

run();
