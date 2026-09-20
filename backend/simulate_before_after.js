// Backtest Simulation: GhostTrade OLD vs NEW Logic
// Simulates 100 market events to prove the value of the new Risk & Tiered Score System.

function generateMarketEvents(count) {
  const events = [];
  for (let i = 0; i < count; i++) {
    // Market edge is slightly positive, but noisy. 45% base win probability.
    const isWin = Math.random() < 0.45;
    // AI generates a score (correlated slightly with win probability)
    let score = Math.floor(Math.random() * 60) + 20; // 20 to 80
    if (isWin) score += 10; // Winners tend to have slightly higher scores
    if (score > 100) score = 100;
    
    // Reward multiplier (RRR)
    const rrr = isWin ? (Math.random() * 1.5 + 1.5) : -1; // Win = 1.5R to 3.0R, Loss = -1R
    
    events.push({ id: i + 1, score, isWin, rrr });
  }
  return events;
}

function runOldSystem(events) {
  let capital = 10000;
  let wins = 0;
  let losses = 0;
  let tradesTaken = 0;

  for (const event of events) {
    // OLD LOGIC: Hardcoded score >= 35, NO RISK CONTROL
    if (event.score >= 35) {
      tradesTaken++;
      // Fixed Kelly size override from old geminiEngine.js (17.5% risk - very aggressive)
      // We'll scale it to standard 2% base risk for fair comparison
      const riskAmount = capital * 0.02; 
      
      if (event.isWin) {
        wins++;
        capital += (riskAmount * event.rrr);
      } else {
        losses++;
        capital -= riskAmount;
      }
    }
  }

  return { capital, tradesTaken, wins, losses };
}

function runNewSystem(events) {
  let capital = 10000;
  let wins = 0;
  let losses = 0;
  let tradesTaken = 0;
  
  // New System State
  let adaptiveThreshold = 35;
  const recentOutcomes = [];
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  let dailyLossPct = 0;
  let blockedByRisk = 0;
  let blockedByThreshold = 0;

  for (const event of events) {
    // 1. Auto-Learning Threshold Update
    if (recentOutcomes.length >= 10) {
      const recentWins = recentOutcomes.slice(-20).filter(w => w).length;
      const recentWinRate = recentWins / Math.min(20, recentOutcomes.length);
      
      if (recentWinRate < 0.40) adaptiveThreshold = 50;
      else if (recentWinRate < 0.50) adaptiveThreshold = 42;
      else if (recentWinRate >= 0.65) adaptiveThreshold = 30;
      else adaptiveThreshold = 35;
    }

    // 2. Risk Control Gate
    if (dailyLossPct <= -5.0) {
      blockedByRisk++;
      dailyLossPct = 0; // Simulate next day reset for simplicity
      continue;
    }

    // 3. Score Tier Gate
    if (event.score < adaptiveThreshold) {
      blockedByThreshold++;
      continue;
    }

    // 4. Execution
    tradesTaken++;
    let sizeMultiplier = 1.0;
    
    // Tier sizing
    if (event.score >= 55) sizeMultiplier = 1.5;
    else if (event.score >= 45) sizeMultiplier = 1.0;
    else sizeMultiplier = 0.5;

    // Streak sizing (Risk Control)
    if (consecutiveLosses >= 2) sizeMultiplier *= 0.5;
    if (consecutiveLosses >= 3) sizeMultiplier *= 0.25;
    if (consecutiveWins >= 3) sizeMultiplier *= 1.25;
    
    // Standard 2% base risk * multiplier
    const riskAmount = capital * 0.02 * sizeMultiplier;

    if (event.isWin) {
      wins++;
      const profit = riskAmount * event.rrr;
      capital += profit;
      dailyLossPct += (profit / capital) * 100;
      
      recentOutcomes.push(true);
      consecutiveWins++;
      consecutiveLosses = 0;
    } else {
      losses++;
      capital -= riskAmount;
      dailyLossPct -= (riskAmount / capital) * 100;
      
      recentOutcomes.push(false);
      consecutiveLosses++;
      consecutiveWins = 0;
    }
  }

  return { capital, tradesTaken, wins, losses, blockedByThreshold, blockedByRisk };
}

const marketEvents = generateMarketEvents(100);
const oldResult = runOldSystem(marketEvents);
const newResult = runNewSystem(marketEvents);

console.log("==========================================");
console.log("       GHOSTTRADE BACKTEST RESULTS        ");
console.log("==========================================");
console.log(`Simulated ${marketEvents.length} market opportunities.`);
console.log("");
console.log("❌ BEFORE (Old Logic - Bypassed Risk, Fixed Score):");
console.log(`   Trades Taken: ${oldResult.tradesTaken}`);
console.log(`   Wins / Losses: ${oldResult.wins} / ${oldResult.losses} (${Math.round(oldResult.wins/oldResult.tradesTaken*100)}% Win Rate)`);
console.log(`   Final Capital: $${oldResult.capital.toFixed(2)} (from $10000)`);
const oldReturn = ((oldResult.capital - 10000) / 10000) * 100;
console.log(`   Total Return: ${oldReturn > 0 ? '+' : ''}${oldReturn.toFixed(2)}%`);
console.log("");
console.log("✅ AFTER (New Logic - Adaptive Threshold, Risk Shield, Tiered Sizing):");
console.log(`   Trades Taken: ${newResult.tradesTaken}`);
console.log(`   Trades Blocked (Low Score): ${newResult.blockedByThreshold}`);
console.log(`   Trades Blocked (Risk Shield): ${newResult.blockedByRisk}`);
console.log(`   Wins / Losses: ${newResult.wins} / ${newResult.losses} (${Math.round(newResult.wins/newResult.tradesTaken*100)}% Win Rate)`);
console.log(`   Final Capital: $${newResult.capital.toFixed(2)} (from $10000)`);
const newReturn = ((newResult.capital - 10000) / 10000) * 100;
console.log(`   Total Return: ${newReturn > 0 ? '+' : ''}${newReturn.toFixed(2)}%`);
console.log("==========================================");
