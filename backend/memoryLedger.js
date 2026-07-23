// =====================================================
// MEMORY LEDGER — Self-Healing Cloud Memory System
// Logs predictions, manages error vectors, and provides
// context reinjection data for the AI engine.
// =====================================================

import crypto from 'crypto';
import { getDb } from './mongoConfig.js';

// NOTE: Legacy logPrediction() removed — all logging now goes through logSignal() below.


/**
 * Gets historical statistics for a specific ticker to inject into the AI prompt
 * @param {string} ticker 
 */
export async function getTickerStats(ticker) {
  try {
    const db = await getDb();
    const signals = await db.collection('signals').find({
      ticker: ticker,
      resolvedOutcome: { $in: ['CORRECT', 'INCORRECT'] }
    }).toArray();

    if (signals.length === 0) return null;

    const total = signals.length;
    const correct = signals.filter(s => s.resolvedOutcome === 'CORRECT').length;
    const winRate = (correct / total) * 100;
    
    const incorrectCalls = signals.filter(s => s.resolvedOutcome === 'INCORRECT');
    const avgConfidenceOnLosses = incorrectCalls.length > 0 
      ? incorrectCalls.reduce((s, c) => s + (c.calibratedConfidence || 50), 0) / incorrectCalls.length
      : 0;

    return {
      total,
      correct,
      winRate: parseFloat(winRate.toFixed(1)),
      avgConfidenceOnLosses: parseFloat(avgConfidenceOnLosses.toFixed(1))
    };
  } catch (error) {
    console.error(`[MEMORY] Failed to get ticker stats for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Retrieves the last N analyses for this ticker to provide session continuity
 * @param {string} ticker 
 * @param {number} limit 
 */
export async function getRecentAnalyses(ticker, limit = 2) {
  try {
    const db = await getDb();
    const recent = await db.collection('signals').find({ ticker })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return recent.map(r => ({
      direction: r.direction,
      confidence: r.calibratedConfidence || r.rawConfidence,
      target: r.primaryTarget,
      timeframe: r.tradeTimeframe,
      outcome: r.resolvedOutcome || 'PENDING',
      timestamp: r.timestamp
    }));
  } catch (error) {
    console.error(`[MEMORY] Failed to get recent analyses for ${ticker}:`, error.message);
    return [];
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

// NOTE: Legacy getDueAudits() removed — audit daemon now reads from signals collection directly.


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

    // Timeframe-aware audit window: Intraday=4h, Swing=48h, Position=7d
    const tf = (data.tradeTimeframe || 'INTRADAY').toUpperCase();
    const auditDelayMs = tf === 'POSITION' ? 7 * 24 * 60 * 60 * 1000
      : tf === 'SWING' ? 48 * 60 * 60 * 1000
      : 4 * 60 * 60 * 1000;
    const auditDue = new Date(timestamp.getTime() + auditDelayMs);

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
      tradeTimeframe:       data.tradeTimeframe       ?? 'INTRADAY',
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
