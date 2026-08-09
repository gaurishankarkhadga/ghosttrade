import { calculateAllIndicators } from './technicalEngine.js';

async function testPepeFormatting() {
  console.log("==================================================");
  console.log("🐸 TESTING PEPE MICRO-CAP PRICE FORMATTING (MOCK)");
  console.log("==================================================\n");

  try {
    // 1. Generate Mock PEPE data (30 bars to satisfy the min requirement)
    console.log("Generating 30 bars of mock PEPE data ($0.00000812)...");
    const mockData = [];
    let basePrice = 0.00000812;
    for (let i = 0; i < 35; i++) {
        // slight random walk
        basePrice = basePrice * (1 + (Math.random() - 0.5) * 0.01);
        mockData.push({
            date: new Date(Date.now() - (35 - i) * 86400000).toISOString(),
            open: basePrice * 0.99,
            high: basePrice * 1.05,
            low: basePrice * 0.95,
            close: basePrice,
            volume: 5000000000 * Math.random()
        });
    }

    console.log(`✅ Successfully generated ${mockData.length} mock candles for PEPE.`);
    
    // 2. Run Technical Engine
    console.log("\nRunning Technical Engine...");
    const technicalContext = calculateAllIndicators(mockData);
    
    // 3. Output result
    console.log("\n=== TECHNICAL ENGINE OUTPUT ===");
    console.log(technicalContext);
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testPepeFormatting();
