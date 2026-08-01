import { detectPatterns } from './patternEngine.js';

async function runCombinedTest() {
  console.log("=== PHASE 2: VOLUME & VWAP FOOTPRINT TEST ===");

  const bars = [];
  let currentPrice = 100;
  for (let i = 0; i < 19; i++) {
    bars.push({
      date: new Date(Date.now() - (20 - i) * 60000),
      open: currentPrice,
      high: currentPrice + 2,
      low: currentPrice - 2,
      close: currentPrice + 1,
      volume: 1000
    });
    currentPrice += 1;
  }
  // VWAP is roughly 110.

  const retailHammer = {
    date: new Date(),
    open: 140,
    close: 142,
    high: 142.5,
    low: 130, 
    volume: 1000 
  };
  bars.push(retailHammer);

  console.log("\n1. Testing 'Retail' Hammer (No Volume Spike, No VWAP Bounce)...");
  let pattern = detectPatterns(bars);
  console.log(`Detected Pattern: ${pattern || 'NONE (Rejected by Institutional Filter)'}`);

  console.log("\n2. Testing 'Institutional' Hammer (Volume Spike)...");
  bars[19].volume = 5000;
  pattern = detectPatterns(bars);
  console.log(`Detected Pattern: ${pattern || 'NONE'}`);

  console.log("\n3. Testing 'VWAP Bounce' Hammer (Normal Volume, touches VWAP)...");
  bars[19].volume = 1000;
  bars[19].open = 110; 
  bars[19].close = 112; 
  bars[19].high = 112.5; 
  bars[19].low = 100; // Pierces VWAP
  pattern = detectPatterns(bars);
  console.log(`Detected Pattern: ${pattern || 'NONE (Failed)'}`);
}
runCombinedTest().catch(console.error);
