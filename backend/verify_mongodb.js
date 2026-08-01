import { getDb, closeDb } from './mongoConfig.js';

async function auditDB() {
  console.log("=== GHOSTTRADE DATABASE AUDIT ===");
  try {
    const db = await getDb();
    
    const countV2 = await db.collection('setup_stats').countDocuments({ logic_version: "v2.0.0-core" });
    console.log(`Total v2.0.0-core Setups Found: ${countV2}`);

    const highConfidence = await db.collection('setup_stats').countDocuments({ logic_version: "v2.0.0-core", sample_size: { $gte: 100 } });
    console.log(`- High Confidence (>= 100 samples): ${highConfidence} setups`);

    const medConfidence = await db.collection('setup_stats').countDocuments({ logic_version: "v2.0.0-core", sample_size: { $gte: 30, $lt: 100 } });
    console.log(`- Usable (30-99 samples): ${medConfidence} setups`);

    const lowConfidence = await db.collection('setup_stats').countDocuments({ logic_version: "v2.0.0-core", sample_size: { $lt: 30 } });
    console.log(`- Insufficient Data (< 30 samples): ${lowConfidence} setups`);

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await closeDb();
  }
}

auditDB();
