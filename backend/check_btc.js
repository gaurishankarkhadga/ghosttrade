import dotenv from 'dotenv';
dotenv.config();
import { getDb } from './mongoConfig.js';

async function checkBtc() {
  const db = await getDb();
  const btcSignals = await db.collection('signals')
    .find({ ticker: 'BTC', resolvedOutcome: 'INCORRECT' })
    .sort({ timestamp: -1 })
    .limit(2)
    .toArray();
  
  console.log("Found BTC Signals:", JSON.stringify(btcSignals, null, 2));
  process.exit(0);
}

checkBtc();
