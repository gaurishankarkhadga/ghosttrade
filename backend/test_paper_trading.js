import { executionManager } from './executionEngine.js';
import { generateSignal } from './signalGenerator.js';
import { fetchOHLCV } from './dataFetcher.js';
import { getDb, closeDb } from './mongoConfig.js';

const assets = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
const TEST_EMAIL = 'ai-tester@ghosttrade.com';

async function run() {
  console.log("🚀 STARTING 5-ASSET PAPER TRADE END-TO-END VALIDATION\n");
  let db;
  try {
    db = await getDb(); 
    console.log("✅ Database Connected\n");
  } catch(e) {
    console.error("❌ Database Connection Failed. Make sure MONGODB_URI is set.");
    return;
  }
  
  const engine = executionManager.getEngine(TEST_EMAIL);

  for (const asset of assets) {
     console.log(`========================================`);
     console.log(`🔍 Analyzing ${asset} for Paper Trade...`);
     const ohlcvRes = await fetchOHLCV(asset, 300);
     if (ohlcvRes.error) {
       console.log(`❌ Failed to fetch data: ${ohlcvRes.error}`);
       continue;
     }
     
     const signal = await generateSignal(asset, ohlcvRes.bars);
     
     let tradeData = {
        asset: asset,
        side: 'BUY',
        entryPrice: signal.currentPrice || 100,
        stopLoss: signal.stopLoss || (signal.currentPrice ? signal.currentPrice * 0.95 : 95),
        takeProfit: signal.takeProfit || (signal.currentPrice ? signal.currentPrice * 1.10 : 110),
        accountBalance: 100000,
        regime: signal.regime?.regime || 'UNKNOWN',
        overrideMode: 'PAPER'
     };

     if (signal.action === 'TRADE') {
        console.log(`📈 Signal ACTIVE: ${signal.direction}. Formulating Trade...`);
        tradeData.side = signal.direction === 'BULLISH' ? 'BUY' : 'SELL';
        tradeData.stopLoss = signal.stopLoss;
        tradeData.takeProfit = signal.takeProfit;
     } else {
        console.log(`🛡️ SHIELD MODE: ${signal.reason}`);
        console.log(`   (Signal Engine blocked live trade. Formulating FORCED trade for pipeline validation...)`);
     }

     try {
        console.log(`   Executing Paper Trade internally via Execution Engine...`);
        const result = await engine.executeTrade(tradeData, TEST_EMAIL);
        
        if (result.error || result.success === false || !result.tradeId) {
           console.log(`❌ [BLOCKED BY ENGINE] ${result.error || result.reason || 'Unknown error'}`);
        } else {
           console.log(`✅ Paper Trade Executed Successfully!`);
           console.log(`   Trade ID: ${result.tradeId}`);
           console.log(`   Mode: ${result.mode}`);
           console.log(`   Side: ${tradeData.side}`);
           console.log(`   Quantity Allocated: ${result.quantity.toFixed(4)}`);
           
           // Verify it was logged into MongoDB
           const loggedTrade = await db.collection('paper_trades').findOne({ id: result.tradeId });
           if (loggedTrade) {
              console.log(`✅ Verified in MongoDB: Trade ${loggedTrade.id} is securely stored in 'paper_trades' collection with status ${loggedTrade.status}.`);
           } else {
              console.log(`❌ Failed to verify trade in MongoDB.`);
           }
        }
     } catch(e) {
        console.log(`❌ Execution Exception: ${e.message}`);
     }
     console.log(`========================================\n`);
  }
  
  await closeDb();
  console.log("🏁 VALIDATION COMPLETE.");
}

run().catch(console.error);
