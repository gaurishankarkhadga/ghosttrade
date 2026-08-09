import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';

async function runBacktestComparison() {
  const assets = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
  const lookback = 200; 

  console.log("==================================================");
  console.log("🔬 HONEST QUANTITATIVE BACKTEST (BASELINE VS PROPOSED)");
  console.log("==================================================\n");

  for (const asset of assets) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Fetching 500 days of historical data for ${asset}...`);
    try {
      const dataResponse = await fetchOHLCV(asset, 500);
      const allCandles = dataResponse.bars || dataResponse.data || (Array.isArray(dataResponse) ? dataResponse : []);
      
      if (!allCandles || allCandles.length < 300) {
        console.log(`❌ Not enough data for ${asset}.`);
        continue;
      }

      let baselineWins = 0, baselineLosses = 0;
      let improvedWins = 0, improvedLosses = 0, improvedBreakEvens = 0;
      let tradesTaken = 0;

      console.log(`Simulating trades bar-by-bar (from day 200 to ${allCandles.length})...`);
      
      for (let i = lookback; i < allCandles.length - 10; i++) {
        // Slice the history up to day i
        const history = allCandles.slice(0, i + 1);
        const signal = await generateSignal(asset, history, { useCache: false });

        if (signal.action === 'TRADE' || signal.action === 'BUY' || signal.action === 'LONG') {
          tradesTaken++;
          const entry = signal.currentPrice || signal.price;
          const target = signal.takeProfit || signal.target;
          let stopLoss = signal.stopLoss;
          
          if (!entry || !target || !stopLoss) continue;

          // Now simulate the future bars
          let baselineResult = 'PENDING';
          let improvedResult = 'PENDING';
          let trailingStopMoved = false;
          const distanceToTarget = target - entry;
          const trailingTriggerPrice = entry + (distanceToTarget * 0.5);

          for (let j = i + 1; j < allCandles.length; j++) {
            const futureHigh = allCandles[j].high;
            const futureLow = allCandles[j].low;

            // BASELINE EVALUATION (Static Targets)
            if (baselineResult === 'PENDING') {
              if (futureLow <= stopLoss) {
                baselineResult = 'LOSS';
              } else if (futureHigh >= target) {
                baselineResult = 'WIN';
              }
            }

            // IMPROVED EVALUATION (Trailing Stop)
            if (improvedResult === 'PENDING') {
               if (futureHigh >= trailingTriggerPrice && !trailingStopMoved) {
                   trailingStopMoved = true;
                   stopLoss = entry; // Move stop to break-even
               }

               if (futureLow <= stopLoss) {
                   improvedResult = trailingStopMoved ? 'BREAK_EVEN' : 'LOSS';
               } else if (futureHigh >= target) {
                   improvedResult = 'WIN';
               }
            }
            
            if (baselineResult !== 'PENDING' && improvedResult !== 'PENDING') break;
          }

          if (baselineResult === 'WIN') baselineWins++;
          else if (baselineResult === 'LOSS') baselineLosses++;

          if (improvedResult === 'WIN') improvedWins++;
          else if (improvedResult === 'LOSS') improvedLosses++;
          else if (improvedResult === 'BREAK_EVEN') improvedBreakEvens++;
        }
      }

      console.log(`\n📊 RESULTS FOR ${asset} (Total Signals Taken: ${tradesTaken})`);
      
      // Calculate ratios
      const baselineTotal = baselineWins + baselineLosses;
      const baselineWinRate = baselineTotal > 0 ? (baselineWins / baselineTotal) * 100 : 0;
      
      const improvedTotal = improvedWins + improvedLosses + improvedBreakEvens;
      const improvedWinRate = improvedTotal > 0 ? (improvedWins / (improvedWins + improvedLosses)) * 100 : 0; // Exclude break-evens from loss ratio

      console.log(`\n📉 CURRENT BASELINE SYSTEM (Static Risk):`);
      console.log(`   Wins:   ${baselineWins}`);
      console.log(`   Losses: ${baselineLosses}`);
      console.log(`   Win Rate: ${baselineWinRate.toFixed(2)}%`);
      
      console.log(`\n📈 PROPOSED IMPROVED SYSTEM (Trailing Risk):`);
      console.log(`   Wins:         ${improvedWins}`);
      console.log(`   Losses:       ${improvedLosses}`);
      console.log(`   Break-Evens:  ${improvedBreakEvens} (Saved from being losses)`);
      console.log(`   True Loss Rate: ${improvedTotal > 0 ? ((improvedLosses / improvedTotal) * 100).toFixed(2) : 0}%`);
      
      if (baselineLosses > 0 && improvedLosses < baselineLosses) {
          console.log(`\n🔥 VERDICT: The Trailing Stop logic would have saved you from ${baselineLosses - improvedLosses} losses on ${asset}.`);
      }

    } catch (e) {
      console.error(`Error processing ${asset}:`, e.message);
    }
  }
}

runBacktestComparison();
