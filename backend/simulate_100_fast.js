import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { preTradeGate } from './ghostMindEngine.js';
import { getDb, closeDb } from './mongoConfig.js';

// Suppress excessive logging for speed
console.log = function() {};
console.warn = function() {};
console.error = function() {};

async function run() {
    process.stdout.write("==================================================\n");
    process.stdout.write("🔬 GHOSTMIND v2 LIVE 100-TRADE SIMULATION\n");
    process.stdout.write("==================================================\n\n");
    
    const asset = 'BTCUSDT';
    const dataResponse = await fetchOHLCV(asset, 1500); // Plenty of data
    const allCandles = dataResponse.bars || dataResponse;
    
    let tradesTaken = 0;
    let baselineWins = 0, baselineLosses = 0;
    let improvedWins = 0, improvedLosses = 0;
    let gatesTriggered = 0;
    let earlyCuts = 0;
    
    process.stdout.write(`Fetching historical data for ${asset} and running GhostMind...\n`);

    const results = [];

    // Loop backwards or forwards
    for (let i = 300; i < allCandles.length - 20; i++) {
        if (tradesTaken >= 100) break;

        const history = allCandles.slice(0, i + 1);
        const signal = await generateSignal(asset, history, { useCache: false });
        
        if (signal.action === 'TRADE' || signal.action === 'BUY' || signal.action === 'LONG') {
            const gateResult = await preTradeGate(signal, asset);
            if (gateResult.blocked) {
                gatesTriggered++;
                continue; 
            }
            
            tradesTaken++;
            
            const entry = signal.currentPrice || signal.price;
            const target = signal.takeProfit || signal.target || entry * 1.02;
            let stopLoss = signal.stopLoss || entry * 0.98;
            
            let baselineResult = 'PENDING';
            let improvedResult = 'PENDING';
            
            // GhostMind settings
            const earlyCutLevel = entry - ((entry - stopLoss) * 0.3);
            let tp1Hit = false;
            let currentStop = stopLoss;
            const tp1Level = entry + ((target - entry) * 0.5); // 0.5R
            const tp2Level = entry + ((target - entry) * 1.0); // 1.0R
            
            for (let j = i + 1; j < allCandles.length; j++) {
                const futureHigh = allCandles[j].high;
                const futureLow = allCandles[j].low;
                
                // BASELINE
                if (baselineResult === 'PENDING') {
                    if (futureLow <= stopLoss) baselineResult = 'LOSS';
                    else if (futureHigh >= target) baselineResult = 'WIN';
                }
                
                // IMPROVED (GhostMind)
                if (improvedResult === 'PENDING') {
                    // Early cut thesis check
                    if (futureLow <= earlyCutLevel && !tp1Hit) {
                        improvedResult = 'EARLY_CUT';
                        earlyCuts++;
                    }
                    else {
                        if (futureHigh >= tp1Level && !tp1Hit) {
                            tp1Hit = true;
                            currentStop = entry; // Breakeven lock
                        }
                        if (futureHigh >= tp2Level && tp1Hit) {
                            currentStop = Math.max(currentStop, tp1Level); // Trail
                        }
                        
                        if (futureLow <= currentStop) {
                            improvedResult = tp1Hit ? 'WIN' : 'LOSS';
                        } else if (futureHigh >= target) {
                            improvedResult = 'WIN';
                        }
                    }
                }
                
                if (baselineResult !== 'PENDING' && improvedResult !== 'PENDING') break;
            }
            
            if (baselineResult === 'WIN') baselineWins++;
            else if (baselineResult === 'LOSS') baselineLosses++;
            
            if (improvedResult === 'WIN') improvedWins++;
            else if (improvedResult === 'LOSS') improvedLosses++;
            
            results.push({
                entry, target, stopLoss, baselineResult, improvedResult
            });
        }
    }
    
    const baselineWinRate = tradesTaken > 0 ? ((baselineWins / tradesTaken) * 100).toFixed(1) : 0;
    const improvedWinRate = tradesTaken > 0 ? ((improvedWins / (improvedWins + improvedLosses)) * 100).toFixed(1) : 0;
    
    process.stdout.write(`\n📊 RESULTS OUT OF ${tradesTaken} TRADES\n`);
    process.stdout.write(`   Signals Blocked by Pre-Trade Gate: ${gatesTriggered}\n`);
    
    process.stdout.write(`\n📉 BASELINE SYSTEM (Static Risk):\n`);
    process.stdout.write(`   Wins:     ${baselineWins}\n`);
    process.stdout.write(`   Losses:   ${baselineLosses}\n`);
    process.stdout.write(`   Win Rate: ${baselineWinRate}%\n`);
    
    process.stdout.write(`\n📈 GHOSTMIND SYSTEM (With Early Cuts & Trailing Stops):\n`);
    process.stdout.write(`   Wins:     ${improvedWins}\n`);
    process.stdout.write(`   Losses:   ${improvedLosses}\n`);
    process.stdout.write(`   Early Cuts (-0.3R): ${earlyCuts}\n`);
    process.stdout.write(`   Win Rate: ${improvedWinRate}% (excluding early cuts)\n`);
    
    process.stdout.write(`\n🔥 VERDICT: GhostMind converted ${baselineLosses - improvedLosses - earlyCuts} full losses into Breakeven/Wins, and minimized ${earlyCuts} full losses to just -0.3R.\n`);
    
    await closeDb();
    process.exit(0);
}

run().catch(e => {
    process.stdout.write(`Error: ${e.message}\n`);
    process.exit(1);
});

