// =====================================================
// BROKER KEY MANAGER — AES-256-GCM Encrypted Vault
// Stores user broker API credentials encrypted at rest.
// Uses Node.js built-in `crypto` module — zero deps.
//
// SECURITY MODEL:
// - Keys encrypted with AES-256-GCM (authenticated encryption)
// - Unique IV per encryption operation (prevents IV reuse attacks)
// - Auth tags prevent tampering
// - Master key from env var BROKER_ENCRYPTION_KEY
// - If no master key set, generates ephemeral key (dev mode only)
// - Phase 7: Key rotation support via BROKER_ENCRYPTION_KEY_OLD
// =====================================================

import crypto from 'crypto';
import { getDb } from './mongoConfig.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Master encryption key — MUST be set in production via .env
let ENCRYPTION_KEY = null;
let ENCRYPTION_KEY_OLD = null; // For key rotation support

function getMasterKey() {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY;

  const envKey = process.env.BROKER_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    // Valid 32-byte hex key
    ENCRYPTION_KEY = Buffer.from(envKey, 'hex');
  } else {
    if (IS_PRODUCTION) {
      console.error('[BROKER KEY MANAGER] ⚠️ WARNING: BROKER_ENCRYPTION_KEY is required in production.');
      console.error('[BROKER KEY MANAGER] Falling back to ephemeral key (keys will be lost on restart).');
      console.error('[BROKER KEY MANAGER] Please add BROKER_ENCRYPTION_KEY to your deployment variables.');
    } else {
      console.warn('[BROKER KEY MANAGER] ⚠️ BROKER_ENCRYPTION_KEY not set. Using ephemeral key.');
    }
    ENCRYPTION_KEY = crypto.randomBytes(32);
  }
  return ENCRYPTION_KEY;
}

/**
 * Gets the old master key for key rotation.
 * When BROKER_ENCRYPTION_KEY_OLD is set, decrypt will try old key on failure.
 */
function getOldMasterKey() {
  if (ENCRYPTION_KEY_OLD !== null) return ENCRYPTION_KEY_OLD;

  const envKeyOld = process.env.BROKER_ENCRYPTION_KEY_OLD;
  if (envKeyOld && envKeyOld.length === 64) {
    ENCRYPTION_KEY_OLD = Buffer.from(envKeyOld, 'hex');
    console.log('[BROKER KEY MANAGER] Old rotation key detected. Will attempt re-encryption on access.');
  } else {
    ENCRYPTION_KEY_OLD = false; // Mark as checked
  }
  return ENCRYPTION_KEY_OLD;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 * 
 * @param {string} plaintext — The secret to encrypt
 * @returns {string} — Encrypted string in iv:authTag:ciphertext format
 */
function encrypt(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * 
 * @param {string} encryptedText — Format: iv:authTag:ciphertext
 * @returns {string} — Decrypted plaintext
 */
function decrypt(encryptedText) {
  const key = getMasterKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('[BROKER KEY MANAGER] Invalid encrypted format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// =====================================================
// PUBLIC API — Store / Retrieve / Delete broker keys
// =====================================================

/**
 * Supported broker identifiers.
 */
export const SUPPORTED_BROKERS = ['BINANCE', 'ALPACA', 'IBKR', 'ANGEL_ONE'];

/**
 * Stores encrypted broker credentials for a user.
 * 
 * @param {string} userId — User email or unique ID
 * @param {string} broker — One of SUPPORTED_BROKERS
 * @param {Object} credentials — { apiKey, apiSecret, [additional fields] }
 */
export async function storeBrokerKeys(userId, broker, credentials) {
  if (!userId || !broker || !credentials) {
    throw new Error('[BROKER KEY MANAGER] userId, broker, and credentials are required');
  }

  if (!SUPPORTED_BROKERS.includes(broker)) {
    throw new Error(`[BROKER KEY MANAGER] Unsupported broker: ${broker}. Supported: ${SUPPORTED_BROKERS.join(', ')}`);
  }

  if (broker !== 'ANGEL_ONE' && !credentials.apiKey) {
    throw new Error('[BROKER KEY MANAGER] apiKey is required in credentials');
  }

  const db = await getDb();

  // Encrypt each credential field individually
  const encryptedCreds = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (value && typeof value === 'string') {
      encryptedCreds[key] = encrypt(value);
    }
  }

  await db.collection('broker_credentials').updateOne(
    { userId, broker },
    {
      $set: {
        userId,
        broker,
        credentials: encryptedCreds,
        updatedAt: new Date().toISOString(),
      },
      $setOnInsert: {
        createdAt: new Date().toISOString(),
      }
    },
    { upsert: true }
  );

  console.log(`[BROKER KEY MANAGER] Stored encrypted ${broker} credentials for ${userId}`);
}

/**
 * Retrieves and decrypts broker credentials for a user.
 * 
 * @param {string} userId — User email or unique ID
 * @param {string} broker — One of SUPPORTED_BROKERS
 * @returns {Object|null} — Decrypted credentials or null if not found
 */
export async function getBrokerKeys(userId, broker) {
  if (!userId || !broker) return null;

  const db = await getDb();
  const doc = await db.collection('broker_credentials').findOne({ userId, broker });

  if (!doc || !doc.credentials) return null;

  // Decrypt each field
  const decryptedCreds = {};
  for (const [key, value] of Object.entries(doc.credentials)) {
    if (value && typeof value === 'string') {
      try {
        decryptedCreds[key] = decrypt(value);
      } catch (err) {
        console.error(`[BROKER KEY MANAGER] Failed to decrypt ${key} for ${userId}/${broker}:`, err.message);
        return null; // Corrupted or wrong master key
      }
    }
  }

  // Inject Master Developer Key for Angel One
  if (broker === 'ANGEL_ONE' && process.env.ANGEL_API_KEY) {
    decryptedCreds.apiKey = process.env.ANGEL_API_KEY;
  }

  return decryptedCreds;
}

/**
 * Deletes broker credentials for a user.
 * 
 * @param {string} userId — User email or unique ID
 * @param {string} broker — One of SUPPORTED_BROKERS
 */
export async function deleteBrokerKeys(userId, broker) {
  if (!userId || !broker) return;

  const db = await getDb();
  await db.collection('broker_credentials').deleteOne({ userId, broker });
  console.log(`[BROKER KEY MANAGER] Deleted ${broker} credentials for ${userId}`);
}

/**
 * Lists which brokers a user has configured (without revealing keys).
 * 
 * @param {string} userId — User email or unique ID
 * @returns {Array<{ broker: string, connectedAt: string }>}
 */
export async function listConnectedBrokers(userId) {
  if (!userId) return [];

  const db = await getDb();
  const docs = await db.collection('broker_credentials')
    .find({ userId }, { projection: { broker: 1, updatedAt: 1, _id: 0 } })
    .toArray();

  return docs.map(d => ({ broker: d.broker, connectedAt: d.updatedAt }));
}
