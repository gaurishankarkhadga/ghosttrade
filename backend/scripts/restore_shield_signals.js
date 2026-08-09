import { getDb, closeDb } from '../mongoConfig.js';

async function restoreSignals() {
  try {
    const db = await getDb();
    
    console.log('=== Restoring Deleted Signals ===');

    const backupSignals = await db.collection('shield_log').find({ _type: 'SHIELD_MODE_CLEANUP' }).toArray();
    
    if (backupSignals.length === 0) {
      console.log('No signals found to restore.');
      await closeDb();
      return;
    }

    const restoreDocs = backupSignals.map(s => {
      const doc = { ...s, _id: s._original_id };
      delete doc._original_id;
      delete doc._movedAt;
      delete doc._movedReason;
      delete doc._type;
      return doc;
    });

    // We use unordered bulk write to ignore duplicate key errors if some signals already exist
    const bulk = db.collection('signals').initializeUnorderedBulkOp();
    restoreDocs.forEach(doc => {
      bulk.find({ _id: doc._id }).upsert().updateOne({ $set: doc });
    });

    const result = await bulk.execute();
    console.log(`✓ Restored ${result.nUpserted + result.nModified} signals back to the main collection.`);
    
    // Now delete them from shield_log so we don't duplicate if run again
    await db.collection('shield_log').deleteMany({ _type: 'SHIELD_MODE_CLEANUP' });

    console.log('=== Restore Complete! Refresh your dashboard. ===');
    
    await closeDb();
  } catch (error) {
    console.error('Restore failed:', error.message);
    process.exit(1);
  }
}

restoreSignals();
