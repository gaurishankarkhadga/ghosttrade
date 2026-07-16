// =====================================================
// AUDIT DAEMON — 4-Hour Post-Trade Verification Engine
// Continuously checks predictions against real market data
// and generates Error Vector Nodes for incorrect calls.
// =====================================================

import { getDueAudits, markAudited, writeErrorVector } from './memoryLedger.js';

const AUDIT_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
let intervalId = null;

// =====================================================
// TICKER → COINGECKO ID MAPPING
// Expand this map as needed for new asset classes
// =====================================================
const TICKER_TO_COINGECKO = {
  'BTC': 'bitcoin',
  'BTCUSD': 'bitcoin',
  'BTCUSDT': 'bitcoin',
  'BTC/USD': 'bitcoin',
  'BTC/USDT': 'bitcoin',
  'ETH': 'ethereum',
  'ETHUSD': 'ethereum',
  'ETHUSDT': 'ethereum',
  'ETH/USD': 'ethereum',
  'ETH/USDT': 'ethereum',
  'SOL': 'solana',
  'SOLUSD': 'solana',
  'SOL/USD': 'solana',
  'SOL/USDT': 'solana',
  'XRP': 'ripple',
  'XRPUSD': 'ripple',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'LINK': 'chainlink',
  'MATIC': 'matic-network',
  'BNB': 'binancecoin',
  'LTC': 'litecoin',
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

/**
 * Fetches current price from CoinGecko's free API.
 * Uses the Demo API (no key required, 10K calls/month).
 */
async function fetchCurrentPrice(ticker) {
  const normalizedTicker = ticker.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const coinId = TICKER_TO_COINGECKO[normalizedTicker];
  
  if (!coinId) {
    console.warn(`[AUDIT] No CoinGecko mapping for ticker: ${ticker}`);
    return null;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      console.warn(`[AUDIT] CoinGecko API error ${response.status} for ${coinId}`);
      return null;
    }

    const data = await response.json();
    return data[coinId]?.usd || null;
  } catch (error) {
    console.error(`[AUDIT] Price fetch failed for ${ticker}:`, error.message);
    return null;
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
 * Returns { correct: boolean, reason: string }
 */
function evaluatePrediction(prediction, actualPrice) {
  const { direction, primaryTarget, invalidationLevel, currentPrice, predictionSummary } = prediction;
  
  if (!actualPrice || !currentPrice) {
    return { correct: null, reason: 'Insufficient price data for evaluation' };
  }

  const priceChange = actualPrice - currentPrice;
  const percentChange = (priceChange / currentPrice) * 100;
  const ctx = extractAnalyticalContext(predictionSummary);

  // Build rich context string for error vectors
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

  if (direction === 'BULLISH') {
    if (invalidationLevel && actualPrice < invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${prediction.ticker} failed bullish structure — price dropped to $${actualPrice.toFixed(2)} below invalidation $${invalidationLevel.toFixed(2)} (${percentChange.toFixed(1)}% loss)`)
      };
    }
    if (primaryTarget && actualPrice >= primaryTarget * 0.95) {
      return { correct: true, reason: `Target zone reached — price hit $${actualPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)}` };
    }
    if (priceChange < 0 && Math.abs(percentChange) > 2) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${prediction.ticker} reversed ${Math.abs(percentChange).toFixed(1)}% against bullish thesis — bearish pressure dominated`)
      };
    }
    // Small move, directional bias held
    if (priceChange >= 0) {
      return { correct: true, reason: `Directional bias held — ${percentChange.toFixed(1)}% in the predicted direction` };
    }
    // Small loss, not enough to invalidate
    return { correct: null, reason: `Inconclusive — only ${Math.abs(percentChange).toFixed(1)}% against thesis, within noise range` };
  }

  if (direction === 'BEARISH') {
    if (invalidationLevel && actualPrice > invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${prediction.ticker} failed bearish structure — price rallied to $${actualPrice.toFixed(2)} above invalidation $${invalidationLevel.toFixed(2)} (+${percentChange.toFixed(1)}%)`)
      };
    }
    if (primaryTarget && actualPrice <= primaryTarget * 1.05) {
      return { correct: true, reason: `Target zone reached — price hit $${actualPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)}` };
    }
    if (priceChange > 0 && Math.abs(percentChange) > 2) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${prediction.ticker} reversed ${Math.abs(percentChange).toFixed(1)}% against bearish thesis — bullish momentum overpowered`)
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
 * Main audit cycle — processes all due predictions
 */
async function runAuditCycle() {
  try {
    const dueAudits = await getDueAudits();
    
    if (dueAudits.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Processing ${dueAudits.length} due predictions...`);

    for (const prediction of dueAudits) {
      try {
        // Fetch real-time price
        const actualPrice = await fetchCurrentPrice(prediction.ticker);
        
        if (actualPrice === null) {
          // Can't verify — mark as audited but inconclusive
          await markAudited(prediction._id, 'INCONCLUSIVE — No price data available');
          continue;
        }

        // Evaluate prediction accuracy
        const evaluation = evaluatePrediction(prediction, actualPrice);

        if (evaluation.correct === false) {
          // === ERROR VECTOR COMPILATION ===
          // Write plain-English error node to the asset's profile
          await writeErrorVector(
            prediction.ticker,
            evaluation.reason,
            prediction._id
          );
          await markAudited(prediction._id, `INCORRECT — ${evaluation.reason}`);
        } else if (evaluation.correct === true) {
          await markAudited(prediction._id, `CORRECT — ${evaluation.reason}`);
        } else {
          await markAudited(prediction._id, `INCONCLUSIVE — ${evaluation.reason}`);
        }

        // Rate limit: wait 1.5s between CoinGecko calls to stay under free tier limits
        await new Promise(r => setTimeout(r, 1500));

      } catch (error) {
        console.error(`[AUDIT DAEMON] Error processing prediction ${prediction._id}:`, error.message);
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
  console.log(`[AUDIT DAEMON] Started — checking every ${AUDIT_INTERVAL_MS / 1000}s for due predictions`);
  
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
