function run() {
  const events = [];
  // Simulate a realistic toxic/choppy week where random trades cause drawdowns
  for (let i = 0; i < 100; i++) {
    // 38% win probability (choppy market)
    const isWin = Math.random() < 0.38;
    let score = Math.floor(Math.random() * 50) + 20; 
    if (isWin) score += 15; 
    const rrr = isWin ? (Math.random() * 1.0 + 1.2) : -1; 
    events.push({ id: i + 1, score, isWin, rrr });
  }

  let oldCap = 10000;
  let oldWins = 0, oldLosses = 0, oldTrades = 0;
  
  for (const e of events) {
    if (e.score >= 35) {
      oldTrades++;
      if (e.isWin) { oldWins++; oldCap += (oldCap * 0.05 * e.rrr); } // Fixed aggressive risk (5%)
      else { oldLosses++; oldCap -= (oldCap * 0.05); }
    }
  }

  let newCap = 10000;
  let newWins = 0, newLosses = 0, newTrades = 0, blocked = 0;
  let adapt = 35; let cLoss = 0, cWin = 0; let recent = [];

  for (const e of events) {
    if (recent.length > 10) {
      const wr = recent.slice(-10).filter(w=>w).length / 10;
      adapt = wr < 0.4 ? 45 : (wr > 0.6 ? 30 : 38);
    }
    
    if (e.score < adapt) { blocked++; continue; }
    
    newTrades++;
    let mult = e.score >= 50 ? 1.0 : 0.5;
    if (cLoss >= 2) mult *= 0.5;
    if (cLoss >= 3) mult *= 0.25;
    
    let risk = newCap * 0.05 * mult; // Max 5%, scaled down by streak
    
    if (e.isWin) {
      newWins++; newCap += (risk * e.rrr);
      recent.push(true); cWin++; cLoss = 0;
    } else {
      newLosses++; newCap -= risk;
      recent.push(false); cLoss++; cWin = 0;
    }
  }

  console.log("==========================================");
  console.log(" ⚠️ CHOPPY/TOXIC MARKET BACKTEST (100 Trades)");
  console.log("==========================================");
  console.log("❌ OLD SYSTEM (No Risk Control, Fixed Score):");
  console.log(`   Trades Taken: ${oldTrades}`);
  console.log(`   Win Rate: ${Math.round(oldWins/oldTrades*100)}% (${oldWins}W / ${oldLosses}L)`);
  console.log(`   Final Capital: $${oldCap.toFixed(2)} (Return: ${((oldCap-10000)/100).toFixed(2)}%)`);
  console.log("");
  console.log("✅ NEW SYSTEM (Auto-Learning & Risk Shield):");
  console.log(`   Trades Taken: ${newTrades} (Blocked by AI: ${blocked})`);
  console.log(`   Win Rate: ${Math.round(newWins/newTrades*100)}% (${newWins}W / ${newLosses}L)`);
  console.log(`   Final Capital: $${newCap.toFixed(2)} (Return: ${((newCap-10000)/100).toFixed(2)}%)`);
  console.log("==========================================");
}
run();
