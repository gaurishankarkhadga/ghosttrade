import { fetchOHLCV } from '../backend/dataFetcher.js';
import { generateSignal } from '../backend/signalGenerator.js';

async function runTest() {
  console.log("Fetching NEPAL data (300 bars to satisfy institutional engines)...");
  // Request 300 bars so Hurst and Regime engines have enough data
  const data = await fetchOHLCV("NABIL.NP", 300);
  
  if (!data || data.error) {
    console.error("Fetch failed:", data);
    return;
  }
  
  console.log(`Fetched ${data.bars.length} bars successfully via nepseAdapter!`);
  console.log("Running Deep Institutional Signal Generator...");
  
  const signal = await generateSignal("NABIL.NP", data.bars, {
    macroRegime: 'RISK_ON',
    sectorSentiment: 0.6,
    marketState: 'BULLISH',
    regime: 'VOLATILE'
  });
  
  console.log("\n=== ACTUAL AI OUTPUT FOR NABIL.NP ===");
  console.log(JSON.stringify(signal, null, 2));
}

runTest();
