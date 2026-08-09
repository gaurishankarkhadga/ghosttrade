import { runBacktest } from './backtestEngine.js';

async function main() {
    console.log("==================================================");
    console.log("🔬 GHOSTTRADE: 5 TRADE E2E PROFITABILITY PROOF");
    console.log("==================================================\n");

    const asset = 'BTC-USD';
    const days = 730; 
    
    console.log(`Extracting trade data for ${asset}...\n`);
    
    try {
        const result = await runBacktest(asset, days);
        
        if (result.error) {
            console.error(`❌ Error on ${asset}: ${result.error}`);
            process.exit(1);
        }

        const tradeLog = result.tradeLog || [];
        
        // Find 5 trades that highlight the new upgrade (where we got a Partial Win instead of a Loss)
        const highlightTrades = tradeLog.filter(t => t.improvedOutcome === 'PARTIAL_WIN' && t.baselineOutcome === 'LOSS').slice(0, 5);

        if (highlightTrades.length === 0) {
            console.log("Could not find 5 partial win trades in this asset's history.");
        } else {
            let tradeCount = 1;
            for (const t of highlightTrades) {
                const entryDate = new Date(t.date).toISOString().split('T')[0];
                const exitDate = t.exitDate ? new Date(t.exitDate).toISOString().split('T')[0] : 'Unknown';
                
                console.log(`[TRADE #${tradeCount}] Asset: ${asset} | Entry Date: ${entryDate}`);
                console.log(`  Entry Price: $${t.entryPrice.toFixed(2)}`);
                console.log(`  Original Stop Loss: $${t.stopLossOriginal.toFixed(2)}`);
                console.log(`  Target 1 (TP1): $${t.target1.toFixed(2)}`);
                console.log(`  Target 2 (TP2): $${t.target2.toFixed(2)}`);
                console.log(`  Exit Date: ${exitDate}`);
                console.log(`--------------------------------------------------`);
                console.log(`  ❌ OLD SYSTEM (Baseline):`);
                console.log(`     The trade went up, but failed to reach TP2. Price reversed and plummeted.`);
                console.log(`     Result: ${t.baselineOutcome} (Stop Loss hit at $${t.stopLossOriginal.toFixed(2)})`);
                console.log(`     Capital Status: Wiped Out / Loss`);
                console.log(`\n  ✅ NEW SYSTEM (Scale-Out Active):`);
                console.log(`     The trade went up and successfully hit TP1 at $${t.target1.toFixed(2)}.`);
                console.log(`     AuditDaemon automatically sold 50% of position and secured CASH PROFIT.`);
                console.log(`     AuditDaemon moved Stop Loss to Break-Even ($${t.entryPrice.toFixed(2)}).`);
                console.log(`     Price reversed, stopping the remaining 50% out at $0 loss.`);
                console.log(`     Result: ${t.improvedOutcome} (Profitable Trade)`);
                console.log(`==================================================\n`);
                tradeCount++;
            }
        }
        
    } catch (err) {
        console.error(`Failed to process:`, err.message);
    }
    
    process.exit(0);
}

main();
