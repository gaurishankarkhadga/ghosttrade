function run() {
  const events = [];
  // True crash/bear market
  for (let i = 0; i < 100; i++) {
    const isWin = Math.random() < 0.25; // 25% win rate (horrible market)
    let score = Math.floor(Math.random() * 45) + 20; 
    if (isWin) score += 10; 
    const rrr = isWin ? (Math.random() * 0.5 + 1.0) : -1; // 1.25R average
    events.push({ id: i + 1, score, isWin, rrr });
  }

  let oldCap = 10000;
  let oldWins = 0, oldLosses = 0, oldTrades = 0;
  for (const e of events) {
    if (e.score >= 35) {
      oldTrades++;
      if (e.isWin) { oldWins++; oldCap += (oldCap * 0.05 * e.rrr); } 
      else { oldLosses++; oldCap -= (oldCap * 0.05); }
    }
  }

  let newCap = 10000;
  let newWins = 0, newLosses = 0, newTrades = 0, blocked = 0;
  let adapt = 35; let cLoss = 0; let recent = [];

  for (const e of events) {
    if (recent.length > 10) {
      const wr = recent.slice(-10).filter(w=>w).length / 10;
      adapt = wr < 0.35 ? 50 : 40; // Extremely strict if dying
    }
    
    if (e.score < adapt) { blocked++; continue; }
    
    newTrades++;
    let mult = 0.5; // Micro tier due to low scores
    if (cLoss >= 2) mult *= 0.5;
    if (cLoss >= 3) mult = 0; // CIRCUIT BREAKER (0 risk)
    
    let risk = newCap * 0.05 * mult; 
    
    if (e.isWin) {
      newWins++; newCap += (risk * e.rrr);
      recent.push(true); cLoss = 0;
    } else {
      newLosses++; newCap -= risk;
      recent.push(false); cLoss++;
    }
  }

  console.log("=================================================");
  console.log(" 📉 BEAR MARKET CRASH SIMULATION (100 Trades)");
  console.log("=================================================");
  console.log("❌ OLD SYSTEM (No Risk Control, Bypassed Filters):");
  console.log(`   Trades Taken: ${oldTrades}`);
  console.log(`   Win Rate: ${Math.round(oldWins/oldTrades*100)}% (${oldWins}W / ${oldLosses}L)`);
  console.log(`   Final Capital: $${oldCap.toFixed(2)} (Drawdown: ${((oldCap-10000)/100).toFixed(2)}%)`);
  console.log("");
  console.log("✅ NEW SYSTEM (Auto-Learning, Circuit Breakers):");
  console.log(`   Trades Taken: ${newTrades} (Blocked by AI/Risk: ${blocked})`);
  console.log(`   Win Rate: ${Math.round(newWins/newTrades*100)}% (${newWins}W / ${newLosses}L)`);
  console.log(`   Final Capital: $${newCap.toFixed(2)} (Drawdown: ${((newCap-10000)/100).toFixed(2)}%)`);
  console.log("=================================================");
}
run();
