import { getDb, closeDb } from './mongoConfig.js';
import { computeKelly } from './kellyEngine.js';

async function verify() {
  const db = await getDb();
  const setups = await db.collection('setup_stats').find({}).sort({ setup_id: 1 }).toArray();
  
  console.log(`\n=== ALL SETUP STATS IN DATABASE (${setups.length} total) ===\n`);
  
  for (const s of setups) {
    const kelly = computeKelly({ mean_return: s.mean_return, variance: s.variance });
    console.log(`${s.setup_id.padEnd(35)} | WR: ${(s.win_rate * 100).toFixed(1)}% | N: ${String(s.sample_size).padStart(4)} | Kelly: ${kelly.action === 'SHIELD_MODE' ? 'SHIELD' : kelly.halfKelly + '%'} | Flag: ${s.confidence_flag}`);
  }
  
  await closeDb();
}

verify().catch(console.error);
