import { detectPatterns } from './patternEngine.js';
import { vwap, volumeAnalysis } from './technicalEngine.js';
import { computeKelly } from './kellyEngine.js';

async function runCombinedTest() {
  console.log("=== PHASE 2: VOLUME & VWAP FOOTPRINT TEST ===");

  // Generate 20 dummy bars with normal volume
  const bars = [];
  let currentPrice = 100;
  for (let i = 0; i < 19; i++) {
    bars.push({
      date: new Date(Date.now() - (20 - i) * 60000),
      open: currentPrice,
      high: currentPrice + 2,
      low: currentPrice - 2,
      close: currentPrice + 1,
      volume: 1000 // Average volume
    });
    currentPrice += 1;
  }

  // 1. Test Retail Hammer (No Volume)
  // Wick is long, but volume is normal.
  const retailHammer = {
    date: new Date(),
    open: 110,
    close: 112,
    high: 112.5,
    low: 100, // Massive lower wick
    volume: 1000 // Retail volume
  };
  bars.push(retailHammer);

  console.log("\n1. Testing 'Retail' Hammer (No Volume Spike)...");
  let pattern = detectPatterns(bars);
  console.log(`Detected Pattern: ${pattern || 'NONE (Rejected by Institutional Filter)'}`);

  // 2. Test Institutional Hammer (Volume Spike)
  console.log("\n2. Testing 'Institutional' Hammer (Volume Spike)...");
  bars[19].volume = 5000; // 5x volume spike
  pattern = detectPatterns(bars);
  console.log(`Detected Pattern: ${pattern || 'NONE'}`);

  // 3. Pass to Phase 1 Kelly Engine
  if (pattern) {
    console.log(`\n3. Passing [${pattern}] to Phase 1 Kelly Engine...`);
    const mean_return = 0.03;
    const variance = Math.pow(0.06, 2); 
    const kellyCont = computeKelly({
      rewardPercent: 0.05,
      riskPercent: 0.02,
      empiricalData: {
        confidence_flag: 'OK',
        mean_return,
        variance
      }
    });
    console.log(`Continuous Kelly Position Size: ${(kellyCont.halfKelly).toFixed(2)}% of Portfolio`);
  }

  console.log("\nTests Complete.");
}

runCombinedTest().catch(console.error);
