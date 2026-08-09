// =====================================================
// CLEANUP SCRIPT — Remove SHIELD_MODE signals from audit pipeline
// These are "don't trade" decisions that were incorrectly being
// counted as predictions in the win/loss dashboard.
//
// Usage: node scripts/cleanup_shield_signals.js
// =====================================================

import { getDb, closeDb } from '../mongoConfig.js';

async function cleanupShieldSignals() {
  try {
    const db = await getDb();
    
    console.log('=== GhostTrade Signal Cleanup ===\n');

    // 1. Count current state
    const totalSignals = await db.collection('signals').countDocuments();
    const blockedSignals = await db.collection('signals').countDocuments({
      $or: [
        { signalBlocked: true },
        { direction: 'NEUTRAL', primaryTarget: null },
        { direction: 'NEUTRAL', primaryTarget: 0 },
      ]
    });
    const realSignals = totalSignals - blockedSignals;

    console.log(`Total signals in DB:     ${totalSignals}`);
    console.log(`SHIELD_MODE / junk:      ${blockedSignals}`);
    console.log(`Real trade signals:      ${realSignals}`);
    console.log('');

    if (blockedSignals === 0) {
      console.log('✓ No SHIELD_MODE signals to clean. Database is already clean.');
      await closeDb();
      return;
    }

    // 2. Move SHIELD_MODE signals to shield_log collection (backup, not delete)
    const shieldSignals = await db.collection('signals').find({
      $or: [
        { signalBlocked: true },
        { direction: 'NEUTRAL', primaryTarget: null },
        { direction: 'NEUTRAL', primaryTarget: 0 },
      ]
    }).toArray();

    if (shieldSignals.length > 0) {
      // Backup to shield_log
      const backupDocs = shieldSignals.map(s => ({
        ...s,
        _original_id: s._id,
        _movedAt: new Date(),
        _movedReason: 'cleanup_shield_signals: SHIELD_MODE should not be audited',
        _type: 'SHIELD_MODE_CLEANUP'
      }));
      // Remove _id to avoid conflicts
      backupDocs.forEach(d => delete d._id);
      
      await db.collection('shield_log').insertMany(backupDocs);
      console.log(`✓ Backed up ${backupDocs.length} signals to 'shield_log' collection`);
    }

    // 3. Delete from signals collection
    const deleteResult = await db.collection('signals').deleteMany({
      $or: [
        { signalBlocked: true },
        { direction: 'NEUTRAL', primaryTarget: null },
        { direction: 'NEUTRAL', primaryTarget: 0 },
      ]
    });

    console.log(`✓ Removed ${deleteResult.deletedCount} SHIELD_MODE signals from 'signals' collection`);

    // 4. Also clean up error vectors generated from these bad signals
    const errorVectorsCount = await db.collection('error_vectors').countDocuments();
    // Don't delete error vectors — they're useful for AI learning
    // But log the count for transparency
    console.log(`\n  Note: ${errorVectorsCount} error vectors remain in 'error_vectors' collection`);

    // 5. Final state
    const finalTotal = await db.collection('signals').countDocuments();
    const finalCorrect = await db.collection('signals').countDocuments({ resolvedOutcome: 'CORRECT' });
    const finalIncorrect = await db.collection('signals').countDocuments({ resolvedOutcome: 'INCORRECT' });
    const finalPending = await db.collection('signals').countDocuments({ resolvedOutcome: null });

    console.log(`\n=== CLEANED STATE ===`);
    console.log(`Total real signals:    ${finalTotal}`);
    console.log(`  CORRECT:             ${finalCorrect}`);
    console.log(`  INCORRECT:           ${finalIncorrect}`);
    console.log(`  PENDING:             ${finalPending}`);
    if (finalCorrect + finalIncorrect > 0) {
      const winRate = ((finalCorrect / (finalCorrect + finalIncorrect)) * 100).toFixed(1);
      console.log(`  Real Win Rate:       ${winRate}%`);
    }
    console.log(`\n✓ Cleanup complete. Dashboard will now show accurate numbers.`);

    await closeDb();
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanupShieldSignals();
