import { runBacktest } from './backtestEngine.js';

async function main() {
    const asset = 'DOGE-USD'; 
    const days = 1000; 
    
    console.log("==================================================");
    console.log(`🔬 GHOSTTRADE 15-TRADE SIMULATION (${asset})`);
    console.log("==================================================\n");

    const result = await runBacktest(asset, days);
    
    if (result.error) {
        console.error(`❌ Error on ${asset}: ${result.error}`);
        process.exit(1);
    }

    const trades = result.tradeLog.slice(0, 15);
    
    if (trades.length < 15) {
        console.log(`Only found ${trades.length} trades!`);
        process.exit(1);
    }

    let baselineWins = 0;
    let baselineLosses = 0;
    let improvedWins = 0;
    let improvedLosses = 0;

    trades.forEach(t => {
        if (t.baselineOutcome === 'WIN') baselineWins++;
        else if (t.baselineOutcome === 'LOSS') baselineLosses++;

        if (t.improvedOutcome === 'WIN') improvedWins++;
        else if (t.improvedOutcome === 'LOSS') improvedLosses++;
    });

    const baselineWinRate = ((baselineWins / 15) * 100).toFixed(2);
    const improvedWinRate = ((improvedWins / 15) * 100).toFixed(2);

    console.log(`\n📉 BASELINE SYSTEM (Static Risk):`);
    console.log(`   Wins:     ${baselineWins}`);
    console.log(`   Losses:   ${baselineLosses}`);
    console.log(`   Win Rate: ${baselineWinRate}%`);
    
    console.log(`\n📈 PROPOSED IMPROVED SYSTEM (ATR Trailing Stop):`);
    console.log(`   Wins:     ${improvedWins}`);
    console.log(`   Losses:   ${improvedLosses}`);
    console.log(`   Win Rate: ${improvedWinRate}%`);

    console.log(`\nTrade Log (First 15 Trades):`);
    trades.forEach((t, i) => {
        const dateStr = new Date(t.date).toISOString().split('T')[0];
        console.log(`${(i+1).toString().padStart(2, ' ')}. Date: ${dateStr} | Entry: $${t.entryPrice.toFixed(4)} | Baseline: ${t.baselineOutcome} | Improved: ${t.improvedOutcome}`);
    });

    process.exit(0);
}

main();
