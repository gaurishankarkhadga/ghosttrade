import dotenv from 'dotenv';
dotenv.config();
import { getDb } from './mongoConfig.js';
import { fetchLivePrice } from './dataFetcher.js';

async function checkMeta() {
  const db = await getDb();
  const metaSignal = await db.collection('signals').findOne({ ticker: 'META', resolvedOutcome: null });
  
  if (!metaSignal) {
    console.log("No pending META signal found.");
    process.exit(0);
  }

  console.log("Found Pending META Signal:", JSON.stringify(metaSignal, null, 2));
  
  const currentPrice = await fetchLivePrice('META');
  console.log("\n=========================");
  console.log("Current Live META Price:", currentPrice);
  console.log("Signal Target:", metaSignal.primaryTarget);
  console.log("Signal SL:", metaSignal.invalidationLevel);
  console.log("Signal Entry:", metaSignal.currentPrice);
  console.log("=========================\n");

  // Let's resolve it manually for the user based on logic
  let outcome = 'INCONCLUSIVE';
  let reason = 'Manual verification: Price did not reach target or stop loss.';
  
  if (metaSignal.direction === 'BEARISH') {
      if (currentPrice >= metaSignal.invalidationLevel) {
          outcome = 'INCORRECT';
          reason = `META failed bearish structure — price rallied to $${currentPrice.toFixed(2)} hitting invalidation $${metaSignal.invalidationLevel.toFixed(2)}`;
      } else if (currentPrice <= metaSignal.primaryTarget) {
          outcome = 'CORRECT';
          reason = `META bearish target hit! Price fell to $${currentPrice.toFixed(2)}`;
      } else {
          // If neither, calculate percentage
          const pct = ((currentPrice - metaSignal.currentPrice) / metaSignal.currentPrice) * 100;
          if (pct < -0.3) {
             outcome = 'CORRECT';
             reason = `Directional bias confirmed via manual check — fell ${Math.abs(pct).toFixed(2)}%`;
          } else if (pct > 0.3) {
             outcome = 'INCORRECT';
             reason = `Directional bias failed manual check — rose ${Math.abs(pct).toFixed(2)}%`;
          }
      }
  }
  
  console.log(`Setting outcome to: ${outcome}`);
  console.log(`Reason: ${reason}`);

  await db.collection('signals').updateOne(
      { _id: metaSignal._id },
      { $set: { resolvedOutcome: outcome, resolvedReason: reason, resolvedAt: new Date() } }
  );
  
  console.log("Database updated successfully.");
  process.exit(0);
}

checkMeta();
