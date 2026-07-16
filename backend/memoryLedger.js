// =====================================================
// MEMORY LEDGER — Self-Healing Cloud Memory System
// Logs predictions, manages error vectors, and provides
// context reinjection data for the AI engine.
// =====================================================

import crypto from 'crypto';
import { getDb } from './mongoConfig.js';

/**
 * §1.2 — State Extraction & Hashing
 * Logs a completed prediction to the cloud database.
 * Generates a unique SHA-256 hash as the document ID.
 */
export async function logPrediction(data) {
  try {
    const db = await getDb();
    
    const timestamp = new Date();
    const auditDue = new Date(timestamp.getTime() + (4 * 60 * 60 * 1000)); // +4 hours

    // Generate unique data hash
    const hashInput = JSON.stringify({
      ticker: data.ticker,
      timestamp: timestamp.toISOString(),
      direction: data.direction,
      primaryTarget: data.primaryTarget,
    });
    const predictionHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);

    const document = {
      _id: predictionHash,
      ticker: data.ticker || 'UNKNOWN',
      timestamp,
      direction: data.direction || 'NEUTRAL',
      bullishProb: data.bullishProb,
      bearishProb: data.bearishProb,
      primaryTarget: data.primaryTarget,
      invalidationLevel: data.invalidationLevel,
      currentPrice: data.currentPrice,
      predictionSummary: data.predictionSummary || '',
      auditDue,
      audited: false,
      auditResult: null,
    };

    await db.collection('predictions').insertOne(document);
    console.log(`[MEMORY] Prediction logged: ${data.ticker} → ${data.direction} | Hash: ${predictionHash} | Audit due: ${auditDue.toISOString()}`);
    
    return predictionHash;
  } catch (error) {
    // Duplicate key (same prediction) is fine — skip silently
    if (error.code === 11000) {
      console.log('[MEMORY] Duplicate prediction hash — skipping');
      return null;
    }
    console.error('[MEMORY] Failed to log prediction:', error.message);
    throw error;
  }
}

/**
 * §1.2 — Error Vector Retrieval for Context Reinjection
 * Fetches the last N error vector nodes for a given asset class.
 * If ticker is null, returns the most recent vectors across all assets.
 */
export async function getErrorVectors(ticker, limit = 5) {
  try {
    const db = await getDb();
    
    const query = ticker ? { ticker: ticker.toUpperCase() } : {};
    
    const vectors = await db.collection('error_vectors')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return vectors;
  } catch (error) {
    console.error('[MEMORY] Failed to fetch error vectors:', error.message);
    return [];
  }
}

/**
 * §1.2 — Error Vector Compilation
 * Writes a plain-English error description to the asset's database profile.
 */
export async function writeErrorVector(ticker, errorDescription, originalPredictionHash) {
  try {
    const db = await getDb();
    
    const document = {
      ticker: ticker.toUpperCase(),
      timestamp: new Date(),
      errorDescription, // e.g., "Bitcoin failed 1h bullish structure due to low macro volume trap"
      originalPredictionHash,
    };

    const result = await db.collection('error_vectors').insertOne(document);
    console.log(`[MEMORY] Error Vector written for ${ticker}: "${errorDescription}"`);
    
    return result.insertedId;
  } catch (error) {
    console.error('[MEMORY] Failed to write error vector:', error.message);
    throw error;
  }
}

/**
 * Fetches predictions that are due for audit (auditDue <= now AND audited === false)
 */
export async function getDueAudits() {
  try {
    const db = await getDb();
    
    const now = new Date();
    const predictions = await db.collection('predictions')
      .find({
        auditDue: { $lte: now },
        audited: false,
      })
      .sort({ auditDue: 1 })
      .limit(20) // Process max 20 per cycle to prevent overload
      .toArray();

    return predictions;
  } catch (error) {
    console.error('[MEMORY] Failed to fetch due audits:', error.message);
    return [];
  }
}

/**
 * Marks a prediction as audited with the result
 */
export async function markAudited(predictionHash, result) {
  try {
    const db = await getDb();
    
    await db.collection('predictions').updateOne(
      { _id: predictionHash },
      { 
        $set: { 
          audited: true, 
          auditResult: result,
          auditedAt: new Date(),
        } 
      }
    );

    console.log(`[MEMORY] Prediction ${predictionHash} marked as audited: ${result}`);
  } catch (error) {
    console.error('[MEMORY] Failed to mark audited:', error.message);
  }
}

// =====================================================
// PHASE 3 — Full Signal Logging (PRD §4.6)
// =====================================================

/**
 * Logs a Phase 3 signal with the full analytical schema.
 * Includes Hurst, regime, EV-net-of-fees, Kelly, calibration fields.
 */
export async function logSignal(data) {
  try {
    const db = await getDb();
    const timestamp = new Date();
    const auditDue  = new Date(timestamp.getTime() + (4 * 60 * 60 * 1000));

    const hashInput = JSON.stringify({
      ticker:        data.ticker,
      timestamp:     timestamp.toISOString(),
      direction:     data.direction,
      rawConfidence: data.rawConfidence,
    });
    const signalHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);

    const document = {
      _id:                  signalHash,
      ticker:               data.ticker               || 'UNKNOWN',
      timestamp,
      auditDue,
      direction:            data.direction            || 'NEUTRAL',
      rawConfidence:        data.rawConfidence        ?? null,
      calibratedConfidence: data.calibratedConfidence ?? null,
      hurstMean:            data.hurstMean            ?? null,
      hurstRS:              data.hurstRS              ?? null,
      hurstDFA:             data.hurstDFA             ?? null,
      hurstCI:              data.hurstCI              ?? null,
      hurstStable:          data.hurstStable          ?? null,
      regime:               data.regime               ?? null,
      regimePosterior:      data.regimePosterior      ?? null,
      regimeActionable:     data.regimeActionable     ?? null,
      primaryTarget:        data.primaryTarget        ?? null,
      extendedTarget:       data.extendedTarget       ?? null,
      invalidationLevel:    data.invalidationLevel    ?? null,
      currentPrice:         data.currentPrice         ?? null,
      evGross:              data.evGross              ?? null,
      evNet:                data.evNet                ?? null,
      evPer100:             data.evPer100             ?? null,
      kellyF:               data.kellyF               ?? null,
      halfKelly:            data.halfKelly            ?? null,
      estimatedFee:         data.estimatedFee         ?? null,
      estimatedSpread:      data.estimatedSpread      ?? null,
      signalBlocked:        data.signalBlocked        ?? false,
      blockedReason:        data.blockedReason        ?? null,
      predictionSummary:    data.predictionSummary    || '',
      resolvedOutcome:      null,
      resolvedAt:           null,
      actualPrice:          null,
      regimeInvalidated:    false,
    };

    await db.collection('signals').insertOne(document);
    console.log(`[MEMORY] Signal logged: ${data.ticker} → ${data.direction} | Calibrated: ${data.calibratedConfidence ?? 'pending'}% | Hash: ${signalHash}`);
    return signalHash;

  } catch (error) {
    if (error.code === 11000) {
      console.log('[MEMORY] Duplicate signal — skipping');
      return null;
    }
    console.error('[MEMORY] Failed to log signal:', error.message);
    throw error;
  }
}

/**
 * Logs a compliance violation to the compliance_violations collection.
 */
export async function logComplianceViolation(term, context, signalHash) {
  try {
    const db = await getDb();
    await db.collection('compliance_violations').insertOne({
      term,
      context:    context.substring(0, 200),
      signalHash: signalHash || null,
      timestamp:  new Date(),
    });
    console.warn(`[COMPLIANCE] Violation logged: "${term}" | Signal: ${signalHash || 'unknown'}`);
  } catch (err) {
    console.error('[COMPLIANCE] Failed to log violation:', err.message);
  }
}
