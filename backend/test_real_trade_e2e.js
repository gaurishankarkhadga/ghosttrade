import { fetchOHLCV } from './dataFetcher.js';
import { generateSignal } from './signalGenerator.js';
import { executionManager } from './executionEngine.js';
import { getDb } from './mongoConfig.js';

async function runRealEndToEndTest() {
  console.log("==================================================");
  console.log("📈 GHOSTTRADE END-TO-END DEEP ANALYSIS TEST");
  console.log("==================================================\n");

  const assetsToTest = ['BTC-USD', 'ETH-USD', 'AAPL', 'TSLA', 'SOL-USD', 'NVDA', 'MATIC'];
  const email = 'ai-tester@ghosttrade.com';
  
  for (const asset of assetsToTest) {
      try {
        console.log(`\n--------------------------------------------------`);
        console.log(`[1] Fetching live OHLCV data for ${asset} from Yahoo Finance...`);
        const dataResponse = await fetchOHLCV(asset, 200);
        const candles = dataResponse.bars;
        
        if (!candles || !Array.isArray(candles) || candles.length < 50) {
          console.log(`❌ Failed to fetch enough data for ${asset}.`);
          continue;
        }
        
        console.log(`✅ Successfully fetched ${candles.length} daily bars. Current Price: $${candles[candles.length - 1]?.close?.toFixed(4) || 0}`);
        
        console.log(`[2] Running Deep Deterministic Analysis (Hurst, Regime, Order Flow, Patterns)...`);
        const signal = await generateSignal(asset, candles, { useCache: false });
        
        console.log("\n=== DETERMINISTIC SIGNAL OUTPUT ===");
        console.log(`Action:      ${signal.action}`);
        console.log(`Score:       ${signal.score}/100`);
        if (signal.reason) {
          console.log(`Reason:      ${signal.reason}`);
        }
        
        const hurst = signal.hurst || signal.metrics?.hurst;
        const ofi = signal.ofi || signal.metrics?.orderFlow;
        
        console.log(`Hurst Exp:   ${hurst?.meanH?.toFixed(2) || 'N/A'}`);
        console.log(`Order Flow:  ${ofi?.imbalance > 0 ? 'BUYING' : 'SELLING'} PRESSURE`);
        
        if (signal.action !== 'SHIELD_MODE' && signal.action !== 'NO_SIGNAL') {
            console.log(`Entry:       $${signal.currentPrice || signal.price}`);
            console.log(`Target:      $${signal.stopLossTakeProfit?.takeProfit || signal.target || signal.takeProfit}`);
            console.log(`Stop Loss:   $${signal.stopLossTakeProfit?.stopLoss || signal.stopLoss}`);
            
            console.log(`\n[3] Signal Approved (${signal.action}). Sending to Execution Engine...`);
            
            const db = await getDb();
            if(!db) {
                console.log("❌ MongoDB not connected. Cannot log trade.");
                return;
            }

            const engine = executionManager.getEngine(email);
            const execResult = await engine.executeTrade({
              asset: asset,
              side: signal.action === 'BUY' || signal.tradeSide === 'LONG' || signal.direction === 'BULLISH' ? 'BUY' : 'SELL',
              entryPrice: signal.currentPrice || signal.price,
              stopLoss: signal.stopLossTakeProfit?.stopLoss || signal.stopLoss,
              takeProfit: signal.stopLossTakeProfit?.takeProfit || signal.target,
              accountBalance: 100000, 
              regime: signal.regime?.regime || 'TRENDING',
              overrideMode: 'PAPER'
            }, email);

            if (execResult.success) {
                console.log(`\n✅ TRADE SUCCESSFULLY EXECUTED AND LOGGED TO DATABASE!`);
                console.log(`   Trade ID:    ${execResult.tradeId}`);
                console.log(`   Kelly Size:  ${(execResult.kellyFraction * 100).toFixed(2)}% of Portfolio`);
                console.log(`   Position:    ${execResult.quantity} units`);
                break; // Stop testing after we successfully execute one trade
            } else {
                console.log(`\n⚠️ EXECUTION BLOCKED BY RISK ENGINE: ${execResult.error || execResult.reason}`);
            }
        } else {
            console.log(`\n[3] Trade Blocked by SHIELD_MODE (Insufficient Edge). Moving to next asset...`);
        }

      } catch (error) {
        console.error("❌ Test failed for " + asset + ":", error.message);
      }
  }
  
  console.log("\n==================================================");
  console.log("🏁 END-TO-END VERIFICATION COMPLETE");
  console.log("==================================================");
  process.exit(0);
}

runRealEndToEndTest();
