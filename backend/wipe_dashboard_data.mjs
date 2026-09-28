import dotenv from 'dotenv';
dotenv.config();
import { getDb, closeDb } from './mongoConfig.js';

async function wipeDashboardData() {
  console.log('====================================================');
  console.log('🧹 GHOSTTRADE: WIPE TRADES & DASHBOARD DATA ONLY');
  console.log('====================================================\n');

  try {
    const db = await getDb();
    console.log('[1/4] Connected to MongoDB.');

    const targetCollections = [
      'paper_trades',
      'signals',
      'prompt_logs',
      'loss_autopsy',
      'loss_patterns'
    ];

    console.log('\n[2/4] Pre-wipe document counts:');
    for (const colName of targetCollections) {
      const count = await db.collection(colName).countDocuments();
      console.log(`  • ${colName}: ${count} documents`);
    }

    const usersCount = await db.collection('users').countDocuments();
    const credsCount = await db.collection('broker_credentials').countDocuments();
    console.log(`  🔒 users (PRESERVED): ${usersCount} accounts`);
    console.log(`  🔒 broker_credentials (PRESERVED): ${credsCount} configs`);

    console.log('\n[3/4] Wiping trade & dashboard collections...');
    for (const colName of targetCollections) {
      const res = await db.collection(colName).deleteMany({});
      console.log(`  ✅ Cleared ${colName} (${res.deletedCount} removed)`);
    }

    console.log('\n[4/4] Verifying clean state:');
    let allClean = true;
    for (const colName of targetCollections) {
      const count = await db.collection(colName).countDocuments();
      if (count !== 0) {
        console.error(`  ❌ ${colName} still has ${count} documents!`);
        allClean = false;
      } else {
        console.log(`  ✨ ${colName}: 0 documents (CLEAN)`);
      }
    }

    const postUsersCount = await db.collection('users').countDocuments();
    const postCredsCount = await db.collection('broker_credentials').countDocuments();
    console.log(`  🔒 users: ${postUsersCount} accounts intact`);
    console.log(`  🔒 broker_credentials: ${postCredsCount} configs intact`);

    console.log('\n====================================================');
    if (allClean && postUsersCount === usersCount) {
      console.log('🎉 SUCCESS: All trades and dashboard data cleanly wiped!');
      console.log('User accounts, logins, and broker keys remain 100% intact.');
      console.log('You are ready for fresh manual testing.');
    } else {
      console.warn('⚠️ Verification warning: please inspect counts.');
    }
    console.log('====================================================');

  } catch (err) {
    console.error('Wipe failed with error:', err.message);
  } finally {
    await closeDb();
    process.exit(0);
  }
}

wipeDashboardData();
