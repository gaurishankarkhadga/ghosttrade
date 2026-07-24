// =====================================================
// AUDIT DAEMON — Post-Trade Verification Engine
// Continuously checks signals against real market data
// and generates Error Vector Nodes for incorrect calls.
//
// PHASE 4 FIX: Now reads from `signals` collection
// (not legacy `predictions`) so the feedback loop works.
// Supports both crypto (CoinGecko) and stocks (Yahoo Finance).
// Uses timeframe-aware audit windows.
// =====================================================

import { getDb } from './mongoConfig.js';
import { writeErrorVector } from './memoryLedger.js';
import { resolveYahooSymbol } from './dataFetcher.js';
import yahooFinance from 'yahoo-finance2';

const AUDIT_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
let intervalId = null;

// =====================================================
// TICKER → COINGECKO ID MAPPING (Crypto)
// =====================================================
const TICKER_TO_COINGECKO = {
  'BTC': 'bitcoin',
  'BTCUSD': 'bitcoin',
  'BTCUSDT': 'bitcoin',
  'BTC/USD': 'bitcoin',
  'BTC/USDT': 'bitcoin',
  'BTC-USD': 'bitcoin',
  'ETH': 'ethereum',
  'ETHUSD': 'ethereum',
  'ETHUSDT': 'ethereum',
  'ETH/USD': 'ethereum',
  'ETH/USDT': 'ethereum',
  'ETH-USD': 'ethereum',
  'SOL': 'solana',
  'SOLUSD': 'solana',
  'SOL/USD': 'solana',
  'SOL/USDT': 'solana',
  'SOL-USD': 'solana',
  'XRP': 'ripple',
  'XRPUSD': 'ripple',
  'XRP-USD': 'ripple',
  'DOGE': 'dogecoin',
  'DOGE-USD': 'dogecoin',
  'ADA': 'cardano',
  'ADA-USD': 'cardano',
  'AVAX': 'avalanche-2',
  'AVAX-USD': 'avalanche-2',
  'DOT': 'polkadot',
  'DOT-USD': 'polkadot',
  'LINK': 'chainlink',
  'LINK-USD': 'chainlink',
  'MATIC': 'matic-network',
  'MATIC-USD': 'matic-network',
  'BNB': 'binancecoin',
  'BNB-USD': 'binancecoin',
  'LTC': 'litecoin',
  'LTC-USD': 'litecoin',
  'ATOM': 'cosmos',
  'UNI': 'uniswap',
  'NEAR': 'near',
  'APT': 'aptos',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'SUI': 'sui',
  'PEPE': 'pepe',
  'WIF': 'dogwifcoin',
};

// =====================================================
// TIMEFRAME-AWARE AUDIT WINDOW
// Intraday = 4h, Swing = 48h, Position = 7 days
// =====================================================
function getAuditWindowMs(tradeTimeframe) {
  switch (tradeTimeframe) {
    case 'SWING':    return 48 * 60 * 60 * 1000;  // 48 hours
    case 'POSITION': return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'INTRADAY':
    default:         return 4 * 60 * 60 * 1000;   // 4 hours
  }
}

// =====================================================
// PRICE FETCHING — Crypto via CoinGecko, Stocks via Yahoo
// =====================================================

/**
 * Determines if a ticker is a crypto asset.
 */
function isCryptoTicker(ticker) {
  const normalized = ticker.toUpperCase().replace(/[^A-Z0-9/-]/g, '');
  return !!TICKER_TO_COINGECKO[normalized];
}

/**
 * Fetches current price from CoinGecko (crypto only).
 */
async function fetchCryptoPrice(ticker) {
  const normalizedTicker = ticker.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const coinId = TICKER_TO_COINGECKO[normalizedTicker];
  
  if (!coinId) return null;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[AUDIT] CoinGecko API error ${response.status} for ${coinId}`);
      return null;
    }

    const data = await response.json();
    return data[coinId]?.usd || null;
  } catch (error) {
    console.error(`[AUDIT] CoinGecko price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Fetches current price from Yahoo Finance (stocks, forex, indices).
 */
async function fetchStockPrice(ticker) {
  try {
    // Use the shared Yahoo Finance symbol resolver (handles crypto aliases, forex pairs, stocks)
    const symbol = resolveYahooSymbol(ticker);
    if (!symbol) {
      console.warn(`[AUDIT] Cannot resolve Yahoo Finance symbol for ${ticker}`);
      return null;
    }
    
    const quote = await yahooFinance.quote(symbol);
    return quote?.regularMarketPrice || null;
  } catch (error) {
    console.warn(`[AUDIT] Yahoo Finance price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Universal price fetcher — tries crypto first, then stocks.
 */
async function fetchCurrentPrice(ticker) {
  if (!ticker || ticker === 'UNKNOWN') return null;

  if (isCryptoTicker(ticker)) {
    return fetchCryptoPrice(ticker);
  }
  
  return fetchStockPrice(ticker);
}

// =====================================================
// SIGNAL RESOLUTION — Reads from `signals` collection
// =====================================================

/**
 * Fetches signals that are due for audit from the `signals` collection.
 * A signal is due when: auditDue <= now AND resolvedOutcome is null.
 */
async function getDueSignals() {
  try {
    const db = await getDb();
    const now = new Date();
    
    const signals = await db.collection('signals')
      .find({
        auditDue: { $lte: now },
        resolvedOutcome: null,
        signalBlocked: { $ne: true }, // Don't audit SHIELD MODE signals
      })
      .sort({ auditDue: 1 })
      .limit(20) // Process max 20 per cycle
      .toArray();

    return signals;
  } catch (error) {
    console.error('[AUDIT] Failed to fetch due signals:', error.message);
    return [];
  }
}

/**
 * Marks a signal as resolved with CORRECT/INCORRECT/INCONCLUSIVE outcome.
 * This is the critical write that makes the calibration engine work.
 */
async function resolveSignal(signalHash, outcome, reason, actualPrice) {
  try {
    const db = await getDb();

    await db.collection('signals').updateOne(
      { _id: signalHash },
      {
        $set: {
          resolvedOutcome: outcome, // 'CORRECT' | 'INCORRECT' | 'INCONCLUSIVE'
          resolvedAt: new Date(),
          resolvedReason: reason,
          actualPrice: actualPrice,
        }
      }
    );

    console.log(`[AUDIT] Signal ${signalHash} resolved: ${outcome}`);
  } catch (error) {
    console.error(`[AUDIT] Failed to resolve signal ${signalHash}:`, error.message);
  }
}

/**
 * Extracts analytical context from the prediction summary for smarter error vectors
 */
function extractAnalyticalContext(predictionSummary) {
  if (!predictionSummary) return {};
  const text = predictionSummary;
  
  const regimeMatch = text.match(/REGIME:\s*(\S+)/i);
  const confluenceMatch = text.match(/CONFLUENCE SCORE:\s*(\d)\/7/i);
  const alignmentMatch = text.match(/Timeframe Alignment:\s*(ALIGNED|CONFLICTING)/i);
  const volumeMatch = text.match(/Volume-Price Divergence:.*?(bearish divergence|bullish divergence|declining volume|exhaustion)/i);
  const trapMatch = text.match(/inducement|trap|sweep/i);
  const evMatch = text.match(/Expected Value per \$100 risked:\s*\$?([-\d.]+)/i);
  
  return {
    regime: regimeMatch ? regimeMatch[1] : null,
    confluenceScore: confluenceMatch ? parseInt(confluenceMatch[1]) : null,
    alignment: alignmentMatch ? alignmentMatch[1] : null,
    volumeDivergence: volumeMatch ? volumeMatch[1] : null,
    trapDetected: trapMatch ? true : false,
    expectedValue: evMatch ? parseFloat(evMatch[1]) : null,
  };
}

/**
 * Determines if a prediction was correct based on actual price movement.
 * Generates rich, analytically-specific error vectors for the self-healing system.
 */
function evaluateSignal(signal, actualPrice) {
  const { direction, primaryTarget, invalidationLevel, currentPrice, predictionSummary } = signal;
  
  if (!actualPrice || !currentPrice) {
    return { correct: null, reason: 'Insufficient price data for evaluation' };
  }

  const priceChange = actualPrice - currentPrice;
  const percentChange = (priceChange / currentPrice) * 100;
  const ctx = extractAnalyticalContext(predictionSummary);

  function buildErrorContext(baseReason) {
    const contextParts = [baseReason];
    
    if (ctx.regime) {
      contextParts.push(`Regime was ${ctx.regime}`);
    }
    if (ctx.confluenceScore !== null && ctx.confluenceScore < 5) {
      contextParts.push(`Confluence was weak at ${ctx.confluenceScore}/7 — should have triggered SHIELD MODE`);
    }
    if (ctx.alignment === 'CONFLICTING') {
      contextParts.push(`Multi-timeframe alignment was CONFLICTING — higher timeframe structure disagreed with the call`);
    }
    if (ctx.volumeDivergence) {
      contextParts.push(`Volume showed ${ctx.volumeDivergence} which was ignored or underweighted`);
    }
    if (ctx.trapDetected) {
      contextParts.push(`Trap/inducement signals were detected but the prediction proceeded anyway`);
    }
    if (ctx.expectedValue !== null && ctx.expectedValue < 5) {
      contextParts.push(`Expected Value was only $${ctx.expectedValue.toFixed(1)}/100 — below the $5 threshold`);
    }
    
    return contextParts.join('. ') + '.';
  }

  const ticker = signal.ticker || 'UNKNOWN';

  if (direction === 'BULLISH') {
    if (invalidationLevel && actualPrice < invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bullish structure — price dropped to $${actualPrice.toFixed(2)} below invalidation $${invalidationLevel.toFixed(2)} (${percentChange.toFixed(1)}% loss)`)
      };
    }
    if (primaryTarget && actualPrice >= primaryTarget * 0.95) {
      return { correct: true, reason: `Target zone reached — price hit $${actualPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)}` };
    }
    if (priceChange < 0 && Math.abs(percentChange) > 2) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} reversed ${Math.abs(percentChange).toFixed(1)}% against bullish thesis — bearish pressure dominated`)
      };
    }
    if (priceChange >= 0) {
      return { correct: true, reason: `Directional bias held — ${percentChange.toFixed(1)}% in the predicted direction` };
    }
    return { correct: null, reason: `Inconclusive — only ${Math.abs(percentChange).toFixed(1)}% against thesis, within noise range` };
  }

  if (direction === 'BEARISH') {
    if (invalidationLevel && actualPrice > invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bearish structure — price rallied to $${actualPrice.toFixed(2)} above invalidation $${invalidationLevel.toFixed(2)} (+${percentChange.toFixed(1)}%)`)
      };
    }
    if (primaryTarget && actualPrice <= primaryTarget * 1.05) {
      return { correct: true, reason: `Target zone reached — price hit $${actualPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)}` };
    }
    if (priceChange > 0 && Math.abs(percentChange) > 2) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} reversed ${Math.abs(percentChange).toFixed(1)}% against bearish thesis — bullish momentum overpowered`)
      };
    }
    if (priceChange <= 0) {
      return { correct: true, reason: `Directional bias held — ${Math.abs(percentChange).toFixed(1)}% in the predicted direction` };
    }
    return { correct: null, reason: `Inconclusive — only ${Math.abs(percentChange).toFixed(1)}% against thesis, within noise range` };
  }

  return { correct: null, reason: 'Unknown direction' };
}

/**
 * Main audit cycle — processes all due signals
 */
async function runAuditCycle() {
  try {
    const dueSignals = await getDueSignals();
    
    if (dueSignals.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Processing ${dueSignals.length} due signal(s)...`);

    for (const signal of dueSignals) {
      try {
        // Fetch real-time price
        const actualPrice = await fetchCurrentPrice(signal.ticker);
        
        if (actualPrice === null) {
          await resolveSignal(signal._id, 'INCONCLUSIVE', 'No price data available', null);
          continue;
        }

        // Evaluate signal accuracy
        const evaluation = evaluateSignal(signal, actualPrice);

        if (evaluation.correct === false) {
          // === ERROR VECTOR COMPILATION ===
          await writeErrorVector(
            signal.ticker,
            evaluation.reason,
            signal._id
          );
          await resolveSignal(signal._id, 'INCORRECT', evaluation.reason, actualPrice);
        } else if (evaluation.correct === true) {
          await resolveSignal(signal._id, 'CORRECT', evaluation.reason, actualPrice);
        } else {
          await resolveSignal(signal._id, 'INCONCLUSIVE', evaluation.reason, actualPrice);
        }

        // Rate limit: wait 1.5s between price API calls
        await new Promise(r => setTimeout(r, 1500));

      } catch (error) {
        console.error(`[AUDIT DAEMON] Error processing signal ${signal._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[AUDIT DAEMON] Cycle error:', error.message);
  }
}

/**
 * Start the audit daemon — runs continuously on an interval
 */
export function startAuditDaemon() {
  console.log(`[AUDIT DAEMON] Started — checking every ${AUDIT_INTERVAL_MS / 1000}s for due signals`);
  
  // Run first cycle after a 30s delay to let the server warm up
  setTimeout(() => {
    runAuditCycle();
    intervalId = setInterval(runAuditCycle, AUDIT_INTERVAL_MS);
  }, 30000);
}

/**
 * Stop the audit daemon
 */
export function stopAuditDaemon() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[AUDIT DAEMON] Stopped');
  }
}
