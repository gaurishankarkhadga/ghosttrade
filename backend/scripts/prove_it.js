import { generateSignal } from '../signalGenerator.js';
import { generateTradeLesson } from '../educationalMentorEngine.js';

async function runProof() {
  console.log("=== PROOF OF DETERMINISTIC ENGINE ===\n");
  
  // 1. Mock Data (Clear Uptrend)
  const mockCandles1d = Array.from({length: 200}, (_, i) => ({
    close: 60000 + (i * 50),
    high: 60100 + (i * 50),
    low: 59900 + (i * 50),
    open: 59950 + (i * 50),
    volume: 1000
  }));
  // Latest close is around 69950
  
  const contextData = {
    candles15m: [],
    candles1h: [],
    ofiSource: 'CANDLE_APPROXIMATION'
  };

  console.log("1. Running Signal Generator (Pure Math, No LLM)...");
  const signal = await generateSignal('BTC-USD', mockCandles1d, contextData);
  
  console.log("\n[ENGINE OUTPUT]");
  console.log(`Action:     ${signal.action}`);
  console.log(`Direction:  ${signal.direction}`);
  console.log(`Score:      ${signal.score}/100`);
  console.log(`Target:     $${signal.takeProfit.toFixed(2)}`);
  console.log(`Stop Loss:  $${signal.stopLoss.toFixed(2)}`);
  console.log(`Regime:     ${signal.regime}`);
  
  console.log("\n2. Generating Educational Lessons based on User Experience...");
  
  const beginnerLesson = await generateTradeLesson(
    'BTC-USD', signal.direction, signal.regime, 
    signal.kelly.kellyF, 0.65, 70, 0 // 0 prompts used = BEGINNER
  );
  
  const advancedLesson = await generateTradeLesson(
    'BTC-USD', signal.direction, signal.regime, 
    signal.kelly.kellyF, 0.65, 70, 25 // 25 prompts used = ADVANCED
  );

  console.log("\n[BEGINNER UI OUTPUT] (User has asked 0 questions)");
  console.log(beginnerLesson.beginnerLesson);
  console.log("\n[PRO UI OUTPUT] (User has asked 25 questions)");
  console.log(advancedLesson.proLesson);
  
  console.log("\n=== PROOF COMPLETE ===");
}

runProof().catch(console.error);
