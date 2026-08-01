import { computeKelly } from './kellyEngine.js';

function runGap2Tests() {
  console.log("=== GAP 2: KELLY CAPPING TESTS ===");

  // Test 1: High EV that would normally result in > 10% Kelly
  const highEV = computeKelly({
    rewardPercent: 0.05,
    riskPercent: 0.01,
    empiricalData: {
      variance: 0.001,
      mean_return: 0.03
    }
  });

  console.log("Test 1: High EV Setup (Expected cap at 10%)");
  console.log(`Raw KellyF: ${(highEV.kellyF * 100).toFixed(2)}%`);
  console.log(`Half Kelly (Expected 10.00%): ${(highEV.halfKelly).toFixed(2)}%`);

  if (highEV.halfKelly === 10.00) {
    console.log("Result: PASSED");
  } else {
    console.log("Result: FAILED");
  }

  // Test 2: Low EV that results in < 10% Kelly
  const lowEV = computeKelly({
    rewardPercent: 0.02,
    riskPercent: 0.02,
    empiricalData: {
      variance: 0.04,
      mean_return: 0.005
    }
  });

  console.log("\nTest 2: Normal/Low EV Setup (Expected < 10%)");
  console.log(`Raw KellyF: ${(lowEV.kellyF * 100).toFixed(2)}%`);
  console.log(`Half Kelly: ${(lowEV.halfKelly).toFixed(2)}%`);

  if (lowEV.halfKelly < 10.00 && lowEV.halfKelly > 0) {
    console.log("Result: PASSED");
  } else {
    console.log("Result: FAILED");
  }
}

runGap2Tests();
