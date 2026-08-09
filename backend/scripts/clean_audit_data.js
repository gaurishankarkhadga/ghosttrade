import { getDb, closeDb } from '../mongoConfig.js';

async function cleanData() {
  try {
    const db = await getDb();
    const collectionsToClean = [
      'paper_trades',
      'signals',
      'prompt_logs',
      'error_vectors',
      'compliance_violations',
      'regime_invalidations',
      'shield_log'
    ];

    console.log('Starting cleanup of trade audit and performance data...');

    for (const collName of collectionsToClean) {
      try {
        const result = await db.collection(collName).deleteMany({});
        console.log(`Cleaned ${result.deletedCount} documents from ${collName}`);
      } catch (err) {
        console.warn(`Could not clean ${collName}: ${err.message}`);
      }
    }

    console.log('Cleanup completed successfully. Auth and core data untouched.');
  } catch (error) {
    console.error('Failed to clean data:', error);
  } finally {
    await closeDb();
  }
}

cleanData();
