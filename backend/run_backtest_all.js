import { runBacktest } from './backtestEngine.js';

async function main() {
    const assets = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
    const days = 730; // 2 years
    
    console.log("==================================================");
    console.log("🔬 GHOSTTRADE INSTITUTIONAL QUANTITATIVE BACKTEST");
    console.log("==================================================\n");

    for (const asset of assets) {
        console.log(`Running simulation for ${asset} (${days} days)...`);
        try {
            const result = await runBacktest(asset, days);
            
            if (result.error) {
                console.error(`❌ Error on ${asset}: ${result.error}`);
                continue;
            }

            console.log(`\n📊 RESULTS FOR ${asset} (Total Signals Taken: ${result.totalSignalsTaken})`);
            console.log(`   Simulated Days: ${result.daysSimulated}`);
            
            console.log(`\n📉 CURRENT BASELINE SYSTEM (Static Risk):`);
            console.log(`   Wins:     ${result.baseline.wins}`);
            console.log(`   Losses:   ${result.baseline.losses}`);
            console.log(`   Win Rate: ${result.baseline.winRate}%`);
            
            console.log(`\n📈 PROPOSED IMPROVED SYSTEM (Dynamic Profit Scaling TP1/TP2):`);
            console.log(`   Full Wins (TP2):  ${result.improved.fullWins}`);
            console.log(`   Partial Wins:     ${result.improved.partialWins} (50% profit taken at TP1, rest stopped at Break-Even)`);
            console.log(`   Losses:           ${result.improved.losses}`);
            console.log(`   True Win Rate:    ${result.improved.winRate}%`);
            console.log(`   Total Losses Saved: ${result.improved.lossesPrevented} trades`);
            console.log(`\n--------------------------------------------------`);
        } catch (err) {
            console.error(`Failed to process ${asset}:`, err.message);
        }
    }
    
    process.exit(0);
}

main();
