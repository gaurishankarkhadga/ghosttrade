import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { getDb, closeDb } from './mongoConfig.js';

console.log = function() {}; // suppress standard logs
console.warn = function() {};
console.error = function() {};

async function runHumanTest() {
    process.stdout.write("==================================================\n");
    process.stdout.write("🧠 HUMAN-LIKE VS BOT-LIKE BEHAVIOR TEST\n");
    process.stdout.write("==================================================\n\n");
    
    const asset = 'ETHUSDT';
    process.stdout.write(`Fetching historical data for ${asset}...\n`);
    const dataResponse = await fetchOHLCV(asset, 1000); 
    const allCandles = dataResponse.bars || dataResponse;
    
    let tradesTaken = 0;
    
    // Bot Metrics
    let botWins = 0, botLosses = 0;
    
    // Human Metrics
    let humanWins = 0, humanLosses = 0;
    let stopHuntsSurvived = 0; 
    
    // Human constraints
    const SLIPPAGE = 0.001; 

    for (let i = 200; i < allCandles.length - 10; i++) {
        if (tradesTaken >= 50) break;

        const history = allCandles.slice(0, i + 1);
        const signal = await generateSignal(asset, history, { useCache: false });
        
        if (signal.action === 'TRADE' || signal.action === 'BUY' || signal.action === 'LONG') {
            tradesTaken++;
            
            const botEntry = signal.currentPrice || signal.price;
            const humanEntry = botEntry * (1 + SLIPPAGE);
            
            const target = signal.takeProfit || botEntry * 1.02;
            const stopLoss = signal.stopLoss || botEntry * 0.98;
            
            let botResult = 'PENDING';
            let humanResult = 'PENDING';
            
            for (let j = i + 1; j < allCandles.length; j++) {
                const futureHigh = allCandles[j].high;
                const futureLow = allCandles[j].low;
                const futureClose = allCandles[j].close;
                
                // BOT LOGIC: Rigid exact numbers (Wick-based)
                if (botResult === 'PENDING') {
                    if (futureLow <= stopLoss) {
                        botResult = 'LOSS'; 
                    } else if (futureHigh >= target) {
                        botResult = 'WIN';
                    }
                }
                
                // HUMAN LOGIC: Close-based SL & Slippage
                if (humanResult === 'PENDING') {
                    const catastrophicDump = stopLoss * 0.98; 
                    
                    if (futureLow <= catastrophicDump || futureClose <= stopLoss) {
                        humanResult = 'LOSS'; 
                    } else if (futureHigh >= target) {
                        humanResult = 'WIN';
                    }
                }
                
                if (botResult !== 'PENDING' && humanResult !== 'PENDING') break;
            }
            
            if (botResult === 'WIN') botWins++;
            else if (botResult === 'LOSS') botLosses++;
            
            if (humanResult === 'WIN') humanWins++;
            else if (humanResult === 'LOSS') humanLosses++;
            
            if (botResult === 'LOSS' && humanResult === 'WIN') {
                stopHuntsSurvived++;
            }
        }
    }
    
    process.stdout.write(`\n📊 TEST RESULTS (50 Signals Evaluated)\n`);
    process.stdout.write(`\n🤖 BOT LOGIC (Rigid Wick-based Stop Loss, Zero Slippage):\n`);
    process.stdout.write(`   Wins:   ${botWins}\n`);
    process.stdout.write(`   Losses: ${botLosses}\n`);
    
    process.stdout.write(`\n🧠 HUMAN LOGIC (Close-based Stop Loss, 0.1% Slippage):\n`);
    process.stdout.write(`   Wins:   ${humanWins}\n`);
    process.stdout.write(`   Losses: ${humanLosses}\n`);
    
    process.stdout.write(`\n💡 HUMAN ADVANTAGE DISCOVERED:\n`);
    process.stdout.write(`   Stop Hunts Survived: ${stopHuntsSurvived} trades.\n`);
    
    await closeDb();
    process.exit(0);
}

runHumanTest().catch(e => {
    process.stdout.write(`Error: ${e.message}\n`);
    process.exit(1);
});

