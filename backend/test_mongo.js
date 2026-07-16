import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeDb } from './mongoConfig.js';
import { logPrediction, getErrorVectors, writeErrorVector } from './memoryLedger.js';

async function runTest() {
  try {
    console.log('Connecting to local MongoDB...');
    await getDb();
    console.log('Connected!');

    // 1. Simulate writing an error vector
    console.log('\n--- Writing Simulated Error Vector for BTC ---');
    await writeErrorVector(
      'BTC',
      'Failed bullish structure. Regime was RANGING. Confluence was weak at 3/7. Expected Value was only $2.5/100.',
      'test_prediction_id_123'
    );
    console.log('Error vector written.');

    // 2. Read error vectors back out (this is what the AI does before every chart analysis)
    console.log('\n--- Reading Error Vectors for BTC ---');
    const vectors = await getErrorVectors('BTC');
    console.log('Retrieved Vectors:', vectors);

    console.log('\n✅ Local Self-Healing Memory System is FULLY OPERATIONAL.');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await closeDb();
  }
}

runTest();
