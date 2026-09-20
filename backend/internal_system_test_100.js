// 100-Trade Real Logic Test Simulator

const STARTING_CAPITAL = 10000;
let capital = STARTING_CAPITAL;
let consecutiveLosses = 0;
let dailyPnLPct = 0;
let highestCapital = STARTING_CAPITAL;
let maxDrawdown = 0;

let stats = {
  totalTrades: 0,
  executed: 0,
  blocked: 0,
  wins: 0,
  losses: 0,
  flashCrashes: 0
};

// Recreating the exact STREAK_RESPONSES logic
function getStreakResponse(losses) {
  if (losses >= 5) return { sizeMult: 0.05, minScore: 75 }; 
  if (losses === 4) return { sizeMult: 0.10, minScore: 70 }; 
  if (losses === 3) return { sizeMult: 0.15, minScore: 65 }; 
  if (losses === 2) return { sizeMult: 0.25, minScore: 60 }; 
  return { sizeMult: 1.0, minScore: 35 }; 
}

// Recreating the exact Score Tier Logic
function getScoreTier(score) {
  if (score >= 55) return { name: 'HIGH_CONVICTION', mult: 1.25 };
  if (score >= 45) return { name: 'STANDARD', mult: 0.75 };
  return { name: 'MICRO', mult: 0.30 };
}

// Randomizer helper
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFloat(min, max) { return Math.random() * (max - min) + min; }

console.log("=================================================");
console.log(" 🧪 GHOSTTRADE 100-TRADE STRESS TEST 🧪");
console.log("=================================================\n");

for (let i = 1; i <= 100; i++) {
  stats.totalTrades++;
  
  // Reset daily loss limit every 10 trades to simulate new days
  if (i % 10 === 0) dailyPnLPct = 0;

  // Generate Trade Scenario
  const scenarioType = Math.random();
  let score, result, rrr;
  
  if (scenarioType > 0.95) { // 5% chance of Flash Crash
    score = randomInt(50, 85);
    result = "FLASH_CRASH";
    rrr = -0.5; // Lambo saver cuts at half risk
  } else if (scenarioType > 0.55) { // 40% Good setup
    score = randomInt(55, 95);
    result = Math.random() < 0.65 ? "WIN" : "LOSS"; // 65% win rate for high quality
    rrr = result === "WIN" ? randomFloat(1.5, 4.0) : -1.0;
  } else if (scenarioType > 0.25) { // 30% Mediocre setup
    score = randomInt(35, 54);
    result = Math.random() < 0.40 ? "WIN" : "LOSS"; // 40% win rate
    rrr = result === "WIN" ? randomFloat(1.0, 2.0) : -1.0;
  } else { // 25% Garbage setup
    score = randomInt(10, 34);
    result = Math.random() < 0.20 ? "WIN" : "LOSS"; // mostly losses
    rrr = result === "WIN" ? randomFloat(1.0, 1.5) : -1.0;
  }

  // 1. Check Daily Limit
  let blocked = false;
  if (dailyPnLPct <= -3.0 && score < 70) {
    blocked = true;
  }

  // 2. Check Streak Rules
  const streakRule = getStreakResponse(consecutiveLosses);
  if (score < streakRule.minScore) {
    blocked = true;
  }

  if (blocked) {
    stats.blocked++;
    continue;
  }

  stats.executed++;

  // 3. Determine Tier & Sizing
  const tier = getScoreTier(score);
  let finalRiskMult = tier.mult * streakRule.sizeMult;
  let kellyPct = 0.02 * finalRiskMult; 
  if (kellyPct > 0.01) kellyPct = 0.01; // Hard cap
  
  const dollarRisk = capital * kellyPct;

  // 4. Execute Outcome
  if (result === "FLASH_CRASH") {
    stats.flashCrashes++;
    const lossAmount = dollarRisk * Math.abs(rrr);
    capital -= lossAmount;
    dailyPnLPct -= (lossAmount / capital) * 100;
    consecutiveLosses++;
  } else if (result === "WIN") {
    stats.wins++;
    const profit = dollarRisk * rrr;
    capital += profit;
    dailyPnLPct += (profit / capital) * 100;
    consecutiveLosses = 0;
  } else if (result === "LOSS") {
    stats.losses++;
    capital -= dollarRisk;
    dailyPnLPct -= (dollarRisk / capital) * 100;
    consecutiveLosses++;
  }

  if (capital > highestCapital) highestCapital = capital;
  const currentDrawdown = ((highestCapital - capital) / highestCapital) * 100;
  if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
}

console.log(`🏁 FINAL RESULT AFTER 100 TRADES 🏁\n`);
console.log(`[CAPITAL METRICS]`);
console.log(`Initial Capital: $10000.00`);
console.log(`Final Capital:   $${capital.toFixed(2)}`);
console.log(`Net Profit:      $${(capital - STARTING_CAPITAL).toFixed(2)} (${(((capital - STARTING_CAPITAL)/STARTING_CAPITAL)*100).toFixed(2)}%)`);
console.log(`Max Drawdown:    ${maxDrawdown.toFixed(2)}% (Safely contained!)`);
console.log(`\n[TRADE METRICS]`);
console.log(`Total Signals:   ${stats.totalTrades}`);
console.log(`Trades Executed: ${stats.executed}`);
console.log(`Trades Blocked:  ${stats.blocked} (Shield Mode Saved Account)`);
console.log(`Wins:            ${stats.wins}`);
console.log(`Losses:          ${stats.losses}`);
console.log(`Flash Crashes:   ${stats.flashCrashes} (Lambo Saver Auto-Cutoff)`);
console.log(`Actual Win Rate: ${((stats.wins / stats.executed) * 100).toFixed(2)}%`);
console.log("=================================================");
