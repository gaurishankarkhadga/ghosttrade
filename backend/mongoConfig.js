// =====================================================
// MONGODB CONFIGURATION — Local & Cloud Database Connector
// Supports local mongod and MongoDB Atlas.
// Phase 3: Adds indexes for signals, calibration, compliance.
// =====================================================

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'ghosttrade';

let client = null;
let db = null;

/**
 * Initialize and return the MongoDB connection.
 * Uses connection pooling — safe to call multiple times.
 */
export async function getDb() {
  if (db) return db;

  try {
    client = new MongoClient(MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    db = client.db(DB_NAME);
    
    // Phase 2 collections
    await db.collection('predictions').createIndex({ ticker: 1, timestamp: -1 });
    await db.collection('predictions').createIndex({ auditDue: 1, audited: 1 });
    await db.collection('error_vectors').createIndex({ ticker: 1, timestamp: -1 });

    // Phase 3 collections
    await db.collection('signals').createIndex({ ticker: 1, timestamp: -1 });
    await db.collection('signals').createIndex({ resolvedOutcome: 1, timestamp: -1 });
    await db.collection('signals').createIndex({ calibratedConfidence: 1, resolvedOutcome: 1 });
    await db.collection('signals').createIndex({ regimeInvalidated: 1 });
    await db.collection('calibration_snapshots').createIndex({ generatedAt: -1 });
    await db.collection('calibration_snapshots').createIndex({ windowDays: 1, generatedAt: -1 });
    await db.collection('compliance_violations').createIndex({ timestamp: -1 });
    await db.collection('compliance_violations').createIndex({ term: 1, timestamp: -1 });
    await db.collection('regime_invalidations').createIndex({ ticker: 1, invalidatedAt: -1 });

    console.log(`[MONGO] Connected to ${DB_NAME} cluster`);
    return db;
  } catch (error) {
    console.error('[MONGO] Connection failed:', error.message);
    // Reset so next call retries
    db = null;
    client = null;
    throw error;
  }
}

/**
 * Graceful shutdown hook
 */
export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MONGO] Connection closed');
  }
}
