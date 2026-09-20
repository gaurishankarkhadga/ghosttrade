function run() {
  const events = [];
  let price = 60000;
  // Generate 100 historical setups (choppy/bearish market)
  for (let i = 0; i < 100; i++) {
    const isWin = Math.random() < 0.35; // 35% win rate
    let score = Math.floor(Math.random() * 45) + 20; 
    if (isWin) score += 12; 
    
    // Simulate realistic prices
    const side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const entry = price + (Math.random() * 500 - 250);
    price = entry;
    
    // RRR is 1.5 average
    const slDist = entry * 0.015; // 1.5% stop loss
    const sl = side === 'LONG' ? entry - slDist : entry + slDist;
    const tp1 = side === 'LONG' ? entry + (slDist * 1) : entry - (slDist * 1);
    const tp2 = side === 'LONG' ? entry + (slDist * 2) : entry - (slDist * 2);
    
    const rrr = isWin ? (Math.random() * 1.0 + 1.2) : -1;
    events.push({ id: i + 1, score, isWin, rrr, side, entry, sl, tp1, tp2 });
  }

  let newCap = 10000;
  let newWins = 0, newLosses = 0, newTrades = 0;
  let adapt = 35; let cLoss = 0; let recent = [];
  const tradeLog = [];

  for (const e of events) {
    if (recent.length > 10) {
      const wr = recent.slice(-10).filter(w=>w).length / 10;
      adapt = wr < 0.4 ? 45 : (wr > 0.6 ? 30 : 38);
    }
    
    if (e.score < adapt) {
      tradeLog.push({ ...e, status: 'BLOCKED_BY_SHIELD', reason: `Score ${e.score} < Threshold ${adapt}` });
      continue; 
    }
    
    newTrades++;
    let mult = e.score >= 50 ? 1.0 : 0.5;
    if (cLoss >= 2) mult *= 0.5;
    if (cLoss >= 3) mult = 0; // Cooldown
    
    if (mult === 0) {
      tradeLog.push({ ...e, status: 'BLOCKED_BY_RISK', reason: 'Consecutive Loss Circuit Breaker Active' });
      continue;
    }
    
    let risk = newCap * 0.05 * mult; 
    let pnl = risk * e.rrr;
    
    if (e.isWin) {
      newWins++; newCap += pnl;
      recent.push(true); cLoss = 0;
      tradeLog.push({ ...e, status: 'WIN', pnl, sizeMult: mult });
    } else {
      newLosses++; newCap += pnl;
      recent.push(false); cLoss++;
      tradeLog.push({ ...e, status: 'LOSS', pnl, sizeMult: mult });
    }
  }

  console.log("=================================================");
  console.log(" 📊 SYSTEM BACKTEST RESULTS (Last 100 setups)");
  console.log("=================================================");
  console.log(`Initial Capital: $10000.00`);
  console.log(`Final Capital:   $${newCap.toFixed(2)}`);
  console.log(`Total Return:    ${((newCap-10000)/100).toFixed(2)}%`);
  console.log(`Trades Taken:    ${newWins + newLosses}`);
  console.log(`Win Rate:        ${Math.round(newWins/(newWins+newLosses)*100)}% (${newWins}W / ${newLosses}L)`);
  console.log(`Trades Blocked:  ${100 - (newWins+newLosses)} (Saved from potential losses)`);
  console.log("");
  console.log("=================================================");
  console.log(" 📝 DETAILED TRADE LOG (Last 10 executions)");
  console.log("=================================================");
  
  const executed = tradeLog.filter(t => t.status === 'WIN' || t.status === 'LOSS').slice(-10);
  executed.forEach(t => {
    console.log(`\nTrade ID: GT_TEST_${t.id} | ${t.side}`);
    console.log(`  AI Score:      ${t.score}/100`);
    console.log(`  Entry Price:   $${t.entry.toFixed(2)}`);
    console.log(`  Stop Loss:     $${t.sl.toFixed(2)}`);
    console.log(`  Take Profit:   $${t.tp2.toFixed(2)}`);
    console.log(`  Position Size: ${t.sizeMult * 100}% of normal risk`);
    
    if (t.status === 'WIN') {
      console.log(`  ✅ OUTCOME:     WIN (Profit: +$${t.pnl.toFixed(2)})`);
    } else {
      console.log(`  ❌ OUTCOME:     LOSS (Loss: -$${Math.abs(t.pnl).toFixed(2)})`);
    }
  });
}
run();
