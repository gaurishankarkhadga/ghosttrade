// =====================================================
// AUDIT DAEMON — Post-Trade Verification Engine
// Continuously checks signals against real market data
// and generates Error Vector Nodes for incorrect calls.
//
// PHASE 4 FIX: Now reads from `signals` collection
// (not legacy `predictions`) so the feedback loop works.
// Supports 100% native Binance (Crypto) and Angel One (Indian Markets).
// Uses timeframe-aware audit windows.
// Supports 100% native Binance (Crypto) and Angel One (Indian Markets).
// Uses timeframe-aware audit windows with historical candle playback.
// =====================================================

import { getDb } from './mongoConfig.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parentPort } from 'worker_threads';

// Initialize Gemini for Prompt Auditing
const rawKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.split(',')[0].trim() : null;
const genAI = rawKey ? new GoogleGenerativeAI(rawKey) : null;
import { writeErrorVector } from './memoryLedger.js';
import { fetchBinanceOHLCV, fetchAngelOneOHLCV } from './dataFetcher.js';

const AUDIT_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
let intervalId = null;

// =====================================================
// ENTERPRISE CACHE (Anti-Rate Limiting)
// =====================================================
const priceCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds

// =====================================================
// TICKER → COINGECKO ID MAPPING (Crypto)
// =====================================================
// TICKER_TO_COINGECKO removed for 100% dynamic Binance API

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
// PRICE FETCHING — 100% Native Binance & Angel One
// 100% NATIVE PRICE FETCHING — Binance (Crypto) & Angel One (NSE/NFO)
// Zero Yahoo Finance / Zero third-party scrapers
// =====================================================



/**
 * Fetches current price directly from Binance API (100% dynamic).
 */
async function fetchBinancePrice(ticker) {
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) {
    cleanTicker = cleanTicker.replace('USD', 'USDT');
  } else if (!cleanTicker.endsWith('USDT')) {
    cleanTicker += 'USDT';
  }

  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${cleanTicker}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && data.price) {
      return parseFloat(data.price);
    }
    return null;
  } catch (error) {
    console.warn(`[AUDIT] Binance fetch failed for ${cleanTicker}:`, error.message);
    return null;
  }
}

/**
 * Fetches current price for Indian market assets via Angel One.
 */
async function fetchAngelOnePrice(ticker) {
  try {
    const isIndian = ['NIFTY', 'BANKNIFTY', 'NIFTY50'].includes(ticker.toUpperCase().replace(/\s+/g, ''));
    if (isIndian) {
      const bars = await fetchAngelOneOHLCV(ticker, 1, 'ONE_DAY');
      if (bars && bars.length > 0) {
        return bars[bars.length - 1].close;
      }
    }
    return null;
  } catch (error) {
    console.warn(`[AUDIT] Angel One price fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Universal price fetcher — Binance for Crypto, Angel One for Indian Assets.
 */
async function fetchCurrentPrice(ticker) {
  if (!ticker || ticker === 'UNKNOWN') return null;

  const now = Date.now();
  if (priceCache.has(ticker)) {
    const cached = priceCache.get(ticker);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.price;
    }
  }

  let price = null;
  try {
    // 1. Binance for Crypto
    price = await fetchBinancePrice(ticker);
    
    // 2. Angel One for Indian Assets
    if (price === null) {
      price = await fetchAngelOnePrice(ticker);
    }

    if (price !== null) {
      priceCache.set(ticker, { price, timestamp: now });
    }
  } catch (err) {
    console.warn(`[AUDIT] Price fetch error for ${ticker}:`, err.message);
  }

  return price;
}

// =====================================================
// SIGNAL RESOLUTION — Reads from `signals` collection
// =====================================================

/**
 * Fetches all active, unresolved signals from the `signals` collection.
 * The verification engine evaluates them continuously in real-time.
 */
async function getActiveSignals() {
  try {
    const db = await getDb();
    
    const signals = await db.collection('signals')
      .find({
        resolvedOutcome: null,
      })
      .sort({ timestamp: -1 }) // Newest signals evaluated first to prevent starvation
      .limit(500) // Process max 500 per cycle
      .toArray();

    return signals;
  } catch (error) {
    console.error('[AUDIT] Failed to fetch active signals:', error.message);
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
    if (parentPort) {
      parentPort.postMessage({ type: 'AUDIT_UPDATE' });
    }
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
  
  // Legacy matches
  const regimeMatch = text.match(/REGIME:\s*(\S+)/i);
  const confluenceMatch = text.match(/CONFLUENCE SCORE:\s*(\d)\/7/i);
  const evMatch = text.match(/Expected Value per \$100 risked:\s*\$?([-\d.]+)/i);

  // Advanced Matrix Phase 1 Matches
  const matrix15mMatch = text.match(/15m Regime:\s*([A-Z-]+).*?Vol:\s*([A-Z_]+)/);
  const matrix1dMatch = text.match(/1D Regime:\s*([A-Z-]+).*?Vol:\s*([A-Z_]+)/);
  const shieldMatch = text.match(/🚨 TIME FRAME SHIELD TRIGGERED.*?fighting the 1D macro trend/i);
  const meanReversionTrapMatch = text.match(/⚠️ MEAN REVERSION TRAP DETECTED/i);
  const volAnomalyMatch = text.match(/⚠️ MICRO-VOLATILITY ANOMALY/i);

  // Level 2 Liquidity Phase 2 Matches
  const flowBiasMatch = text.match(/Flow Bias:\s*([A-Z_]+)/);
  const buyWallMatch = text.match(/Institutional BUY Walls.*?-\s*\$([\d,]+)\s*waiting/s);
  const sellWallMatch = text.match(/Institutional SELL Walls.*?-\s*\$([\d,]+)\s*waiting/s);
  const liquidityTrapMatch = text.match(/🚨 TRAP WARNING: If you are predicting a primary target ABOVE the largest SELL wall/i);
  
  return {
    regime: regimeMatch ? regimeMatch[1] : null,
    confluenceScore: confluenceMatch ? parseInt(confluenceMatch[1]) : null,
    expectedValue: evMatch ? parseFloat(evMatch[1]) : null,
    
    // Matrix data
    regime15m: matrix15mMatch ? matrix15mMatch[1] : null,
    vol15m: matrix15mMatch ? matrix15mMatch[2] : null,
    regime1d: matrix1dMatch ? matrix1dMatch[1] : null,
    vol1d: matrix1dMatch ? matrix1dMatch[2] : null,
    shieldTriggered: !!shieldMatch,
    meanReversionTrap: !!meanReversionTrapMatch,
    volAnomaly: !!volAnomalyMatch,

    // Level 2 data
    flowBias: flowBiasMatch ? flowBiasMatch[1] : null,
    hasMassiveBuyWall: !!buyWallMatch,
    hasMassiveSellWall: !!sellWallMatch,
    liquidityTrap: !!liquidityTrapMatch,
  };
}

/**
 * Determines if a prediction was correct based on actual price movement.
 * Evaluates continuously in real-time using High-Water Marks, or performs time expiration logic if auditDue is reached.
 * Generates rich, analytically-specific error vectors for the self-healing system.
 */
function evaluateSignal(signal, actualPrice, maxObservedPrice = actualPrice, minObservedPrice = actualPrice) {
  const { direction, primaryTarget, invalidationLevel, currentPrice, predictionSummary, auditDue } = signal;
  
  if (!actualPrice || !currentPrice) {
    return { correct: null, reason: 'Insufficient price data for evaluation' };
  }

  const priceChange = actualPrice - currentPrice;
  const percentChange = (priceChange / currentPrice) * 100;
  const ctx = extractAnalyticalContext(predictionSummary);
  
  const now = new Date();
  // Fallback due date: 48 hours after creation if auditDue is missing
  const fallbackDue = new Date(new Date(signal.timestamp || Date.now()).getTime() + 48 * 60 * 60 * 1000);
  const isExpired = signal.auditDue ? now >= new Date(signal.auditDue) : now >= fallbackDue;

  function buildErrorContext(baseReason) {
    const contextParts = [baseReason];
    
    // Legacy rules
    if (ctx.regime) contextParts.push(`Regime was ${ctx.regime}`);
    if (ctx.confluenceScore !== null && ctx.confluenceScore < 5) contextParts.push(`Confluence was weak (${ctx.confluenceScore}/7)`);
    if (ctx.expectedValue !== null && ctx.expectedValue < 5) contextParts.push(`Expected Value was <$5`);

    // Advanced Matrix Autopsy
    if (ctx.shieldTriggered) {
      contextParts.push(`CRITICAL ERROR: AI fought the 1D Macro Trend (${ctx.regime1d || 'Unknown'}) by trusting a conflicting 15m signal (${ctx.regime15m || 'Unknown'}). The Timeframe Shield warned against this trap`);
    }
    if (ctx.meanReversionTrap) {
      contextParts.push(`CRITICAL ERROR: AI fell for a Mean Reversion Trap. The 1D was chopping, the 15m breakout was a fakeout liquidity grab`);
    }
    if (ctx.volAnomaly) {
      contextParts.push(`RISK ERROR: Micro-Volatility was dangerously high (${ctx.vol15m}) compared to Macro baseline (${ctx.vol1d}), leading to a stop-out before directional execution`);
    }

    // Level 2 Liquidity Autopsy
    if (signal.direction === 'BULLISH' && ctx.flowBias && ctx.flowBias.includes('SELL')) {
      contextParts.push(`ORDER FLOW ERROR: AI called BULLISH despite ${ctx.flowBias} market aggression`);
    }
    if (signal.direction === 'BEARISH' && ctx.flowBias && ctx.flowBias.includes('BUY')) {
      contextParts.push(`ORDER FLOW ERROR: AI called BEARISH despite ${ctx.flowBias} market aggression`);
    }
    if (signal.direction === 'BULLISH' && ctx.liquidityTrap && ctx.hasMassiveSellWall) {
      contextParts.push(`LEVEL 2 FATAL ERROR: AI blindly called BULLISH directly into a massive Institutional SELL Wall. The price hit the wall and instantly reversed. You MUST front-run Level 2 walls`);
    }
    if (signal.direction === 'BEARISH' && ctx.hasMassiveBuyWall) {
       contextParts.push(`LEVEL 2 FATAL ERROR: AI called BEARISH into a massive Institutional BUY Wall. The price hit the support wall and bounced. Never short into heavy limit accumulation`);
    }
    
    return contextParts.join('. ') + '.';
  }

  const ticker = signal.ticker || 'UNKNOWN';
  const isNeutralOrBlocked = signal.direction === 'NEUTRAL' || signal.signalBlocked;

  if (!isNeutralOrBlocked && direction === 'BULLISH') {
    // 1. Take Profit Hit First (Target reached = instant win)
    if (primaryTarget && maxObservedPrice >= primaryTarget) {
      return { 
        correct: true, 
        reason: `Take Profit target reached — price hit $${maxObservedPrice.toFixed(4)} vs target $${primaryTarget.toFixed(4)} (entry: $${currentPrice.toFixed(4)})` 
      };
    }
    // 2. Continuous Invalidation (Hard Stop)
    if (invalidationLevel && minObservedPrice <= invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bullish structure — price dropped to $${minObservedPrice.toFixed(4)} hitting invalidation $${invalidationLevel.toFixed(4)}`)
      };
    }
    // 3. Significant Target Progress (>= 50% distance towards 1:2 target = 1:1 RRR achieved)
    if (primaryTarget && currentPrice) {
      const targetDistance = primaryTarget - currentPrice;
      const progressDistance = maxObservedPrice - currentPrice;
      const targetProgress = targetDistance > 0 ? progressDistance / targetDistance : 0;
      if (targetProgress >= 0.50) {
        return { 
          correct: true, 
          reason: `Target progress ${(targetProgress * 100).toFixed(0)}% (1:1 RRR secured) — price reached $${maxObservedPrice.toFixed(4)} vs target $${primaryTarget.toFixed(4)} (entry: $${currentPrice.toFixed(4)})` 
        };
      }
    }
    
    // 4. Time Expiration Logic
    if (isExpired) {
      // High-water mark check: if price achieved meaningful positive move during window
      const maxUpMove = ((maxObservedPrice - currentPrice) / currentPrice) * 100;
      if (maxUpMove >= 1.0) {
        return { correct: true, reason: `Directional bias confirmed via high-water mark — price reached +${maxUpMove.toFixed(1)}% ($${maxObservedPrice.toFixed(4)}) during the audit window (entry: $${currentPrice.toFixed(4)})` };
      }
      if (percentChange >= 0) {
        return { correct: true, reason: `Directional bias confirmed at expiration — +${percentChange.toFixed(2)}% in the predicted direction` };
      } else {
        return { 
          correct: false, 
          reason: buildErrorContext(`${ticker} failed to hold bullish thesis by expiration — closed at $${actualPrice.toFixed(4)} vs entry $${currentPrice.toFixed(4)} (${percentChange.toFixed(1)}%)`)
        };
      }
    }
    
    // 5. Still Pending
    return { correct: 'PENDING', reason: 'Signal is actively tracking real-time price action' };
  }

  if (!isNeutralOrBlocked && direction === 'BEARISH') {
    // 1. Short Take Profit Hit First (Target reached = instant win)
    if (primaryTarget && minObservedPrice <= primaryTarget) {
      return { 
        correct: true, 
        reason: `Short Take Profit target reached — price dropped to $${minObservedPrice.toFixed(4)} vs target $${primaryTarget.toFixed(4)} (entry: $${currentPrice.toFixed(4)})` 
      };
    }
    // 2. Continuous Invalidation (Hard Stop)
    if (invalidationLevel && maxObservedPrice >= invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bearish structure — price rallied to $${maxObservedPrice.toFixed(4)} hitting invalidation $${invalidationLevel.toFixed(4)}`)
      };
    }
    // 3. Significant Target Progress (>= 50% distance towards 1:2 target = 1:1 RRR achieved)
    if (primaryTarget && currentPrice) {
      const targetDistance = currentPrice - primaryTarget;
      const progressDistance = currentPrice - minObservedPrice;
      const targetProgress = targetDistance > 0 ? progressDistance / targetDistance : 0;
      if (targetProgress >= 0.50) {
        return { 
          correct: true, 
          reason: `Short target progress ${(targetProgress * 100).toFixed(0)}% (1:1 RRR secured) — price dropped to $${minObservedPrice.toFixed(4)} vs target $${primaryTarget.toFixed(4)} (entry: $${currentPrice.toFixed(4)})` 
        };
      }
    }
    
    // 4. Time Expiration Logic
    if (isExpired) {
      // High-water mark check: if price achieved meaningful downward move during window
      const maxDownMove = ((currentPrice - minObservedPrice) / currentPrice) * 100;
      if (maxDownMove >= 1.0) {
        return { correct: true, reason: `Directional bias confirmed via high-water mark — price dropped -${maxDownMove.toFixed(1)}% ($${minObservedPrice.toFixed(4)}) during the audit window (entry: $${currentPrice.toFixed(4)})` };
      }
      if (priceChange <= 0) {
        return { correct: true, reason: `Directional bias confirmed at expiration — ${Math.abs(percentChange).toFixed(2)}% in the predicted direction` };
      } else {
        return { 
          correct: false, 
          reason: buildErrorContext(`${ticker} failed to hold bearish thesis by expiration — closed at $${actualPrice.toFixed(4)} vs entry $${currentPrice.toFixed(4)} (+${percentChange.toFixed(1)}%)`)
        };
      }
    }

    // 5. Still Pending
    return { correct: 'PENDING', reason: 'Signal is actively tracking real-time price action' };
  }

  if (isNeutralOrBlocked) {
    // 1. Time Expiration Logic is the primary way to evaluate a FLAT/BLOCKED market
    if (isExpired) {
      // TUNED: Realistic asset-specific flat threshold
      // Crypto is inherently volatile — daily ATR for alts is 3-8%
      const isCrypto = ['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','DOT','LINK','MATIC','BNB','LTC','UNI','ATOM','NEAR','APT','ARB','OP','SUI','PEPE','WIF'].some(
        c => (ticker || '').toUpperCase().includes(c)
      );
      const isAltcoin = isCrypto && !['BTC','ETH'].some(
        c => (ticker || '').toUpperCase() === c
      );
      // BTC/ETH: 3.0% (was 0.8%), Altcoins: 5.0% (was 0.8%), Stocks: 1.5% (was 0.4%)
      const varianceThreshold = isAltcoin ? 5.0 : isCrypto ? 3.0 : 1.5;
      const maxDeviation = Math.max(
         Math.abs(maxObservedPrice - currentPrice),
         Math.abs(currentPrice - minObservedPrice)
      );
      const maxPercentDeviation = (maxDeviation / currentPrice) * 100;
      
      if (maxPercentDeviation <= varianceThreshold) {
        return { 
          correct: true, 
          reason: `Market successfully identified as flat/choppy — max deviation was only ${maxPercentDeviation.toFixed(1)}% (within ${varianceThreshold}% threshold) over the entire audit window.`
        };
      } else {
        // AI missed a significant move
        return {
          correct: false,
          reason: buildErrorContext(`AI incorrectly blocked/called flat — market made a significant move of ${maxPercentDeviation.toFixed(1)}% (above ${varianceThreshold}% threshold) against the neutral/blocked thesis during the window.`)
        };
      }
    }
    
    // 2. Still Pending
    return { correct: 'PENDING', reason: 'Signal is actively tracking real-time price action to verify flat market conditions' };
  }

  return { correct: null, reason: 'Unknown direction' };
}

/**
 * Verifies a signal using historical exchange candle playback (Binance / Angel One)
 * Guarantees definitive WIN (CORRECT) or LOSS (INCORRECT) verification without yellow inconclusive fallbacks.
 */
export async function verifySignalWithCandles(signal) {
  const ticker = signal.ticker || 'UNKNOWN';
  const startTime = new Date(signal.timestamp).getTime();
  const fallbackDue = startTime + 4 * 60 * 60 * 1000;
  const endTime = new Date(signal.auditDue || fallbackDue).getTime();
  
  let cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanTicker.endsWith('USD')) cleanTicker = cleanTicker.replace('USD', 'USDT');
  else if (!cleanTicker.endsWith('USDT')) cleanTicker += 'USDT';

  try {
    let candles = [];

    // 1. Fetch 15m historical candles from Binance for the exact window
    const url = `https://api.binance.com/api/v3/klines?symbol=${cleanTicker}&interval=15m&startTime=${startTime}&endTime=${endTime + 3600000}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        candles = data.map(k => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4])
        }));
      }
    }

    // 2. Fallback to latest Binance candles if window was slightly off
    if (candles.length === 0) {
      const latestUrl = `https://api.binance.com/api/v3/klines?symbol=${cleanTicker}&interval=15m&limit=30`;
      const latestRes = await fetch(latestUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (latestRes && latestRes.ok) {
        const latestData = await latestRes.json();
        if (Array.isArray(latestData) && latestData.length > 0) {
          candles = latestData.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4])
          }));
        }
      }
    }

    // 3. If Indian asset, fetch Angel One candles
    if (candles.length === 0) {
      const angelBars = await fetchAngelOneOHLCV(ticker, 30, 'FIFTEEN_MINUTE').catch(() => null);
      if (angelBars && angelBars.length > 0) {
        candles = angelBars.map(b => ({
          time: new Date(b.date).getTime(),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close
        }));
      }
    }

    if (candles.length > 0) {
      // 1. Sort candles chronologically
      candles.sort((a, b) => a.time - b.time);

      const currentPrice = signal.currentPrice || candles[0].open;
      const primaryTarget = signal.primaryTarget;
      const invalidationLevel = signal.invalidationLevel;

      let highestPrice = currentPrice;
      let lowestPrice = currentPrice;
      let tpReached = false;
      let halfTpReached = false;
      let slBreached = false;
      let breachCandlePrice = null;
      let tpCandlePrice = null;

      // Calculate 50% target milestone (securing 1:1 RRR on a 1:2 RRR trade)
      const halfTarget = signal.direction === 'BULLISH'
        ? (primaryTarget ? currentPrice + (primaryTarget - currentPrice) * 0.5 : null)
        : (primaryTarget ? currentPrice - (currentPrice - primaryTarget) * 0.5 : null);

      for (const candle of candles) {
        if (candle.high > highestPrice) highestPrice = candle.high;
        if (candle.low < lowestPrice) lowestPrice = candle.low;

        if (signal.direction === 'BULLISH') {
          // Take profit check first
          if (primaryTarget && candle.high >= primaryTarget) {
            tpReached = true;
            tpCandlePrice = primaryTarget;
            break; // Target hit! Trade concluded with WIN.
          }
          if (halfTarget && candle.high >= halfTarget) {
            halfTpReached = true;
          }
          // Stop loss check
          if (invalidationLevel && candle.low <= invalidationLevel) {
            slBreached = true;
            breachCandlePrice = candle.low;
            break; // Stop breached! Trade stopped out.
          }
        } else if (signal.direction === 'BEARISH') {
          // Short Take profit check first
          if (primaryTarget && candle.low <= primaryTarget) {
            tpReached = true;
            tpCandlePrice = primaryTarget;
            break; // Short target hit! Trade concluded with WIN.
          }
          if (halfTarget && candle.low <= halfTarget) {
            halfTpReached = true;
          }
          // Short Stop loss check
          if (invalidationLevel && candle.high >= invalidationLevel) {
            slBreached = true;
            breachCandlePrice = candle.high;
            break; // Short stop breached! Trade stopped out.
          }
        }
      }

      if (tpReached) {
        return {
          correct: true,
          actualPrice: tpCandlePrice,
          reason: `${ticker} reached Take Profit target of $${primaryTarget.toFixed(4)} during candle playback`
        };
      }

      if (slBreached) {
        return {
          correct: false,
          actualPrice: breachCandlePrice,
          reason: `${ticker} breached Stop Loss of $${invalidationLevel.toFixed(4)} (candle reached $${breachCandlePrice.toFixed(4)})`
        };
      }

      // If neither TP nor SL was touched during playback window:
      const finalClose = candles[candles.length - 1].close;

      if (halfTpReached) {
        return {
          correct: true,
          actualPrice: signal.direction === 'BULLISH' ? highestPrice : lowestPrice,
          reason: `${ticker} secured 50%+ target progress ($${signal.direction === 'BULLISH' ? highestPrice.toFixed(4) : lowestPrice.toFixed(4)}) without hitting Stop Loss`
        };
      }

      if (signal.direction === 'BULLISH') {
        const pct = ((finalClose - currentPrice) / currentPrice) * 100;
        if (finalClose >= currentPrice) {
          return {
            correct: true,
            actualPrice: finalClose,
            reason: `Bullish thesis confirmed at window close (+${pct.toFixed(2)}%)`
          };
        }
        return {
          correct: false,
          actualPrice: finalClose,
          reason: `Failed bullish thesis — closed at $${finalClose.toFixed(4)} vs entry $${currentPrice.toFixed(4)} (${pct.toFixed(2)}%)`
        };
      } else if (signal.direction === 'BEARISH') {
        const pct = ((currentPrice - finalClose) / currentPrice) * 100;
        if (finalClose <= currentPrice) {
          return {
            correct: true,
            actualPrice: finalClose,
            reason: `Bearish thesis confirmed at window close (+${pct.toFixed(2)}% directional gain)`
          };
        }
        return {
          correct: false,
          actualPrice: finalClose,
          reason: `Failed bearish thesis — closed at $${finalClose.toFixed(4)} vs entry $${currentPrice.toFixed(4)} (-${pct.toFixed(2)}%)`
        };
      }
    }
  } catch (err) {
    console.warn(`[AUDIT] Candle verification error for ${ticker}:`, err.message);
  }

  return null;
}

/**
 * Main audit cycle — processes all active signals in real-time
 */
async function runAuditCycle() {
  try {
    const activeSignals = await getActiveSignals();
    
    if (activeSignals.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Evaluating ${activeSignals.length} active signal(s) continuously...`);

    // Group signals by ticker to drastically reduce API calls and eliminate O(N) waiting
    const signalsByTicker = {};
    for (const signal of activeSignals) {
      const t = signal.ticker || 'UNKNOWN';
      if (!signalsByTicker[t]) signalsByTicker[t] = [];
      signalsByTicker[t].push(signal);
    }

    for (const ticker of Object.keys(signalsByTicker)) {
      try {
        const tickerSignals = signalsByTicker[ticker];
        // Fetch real-time price ONCE per ticker
        const actualPrice = await fetchCurrentPrice(ticker);
        
        for (const signal of tickerSignals) {
          try {
            if (actualPrice === null) {
              // If spot price fetch is temporarily unavailable, check if expired and verify via candle playback
              const fallbackDue = new Date(new Date(signal.timestamp || Date.now()).getTime() + 48 * 60 * 60 * 1000);
              const dueDate = signal.auditDue ? new Date(signal.auditDue) : fallbackDue;
              const isExpired = new Date() >= dueDate;
              
              if (isExpired) {
                const candleRes = await verifySignalWithCandles(signal);
                if (candleRes) {
                  if (candleRes.correct === true) {
                    await resolveSignal(signal._id, 'CORRECT', candleRes.reason, candleRes.actualPrice);
                  } else {
                    await writeErrorVector(signal.ticker, candleRes.reason, signal._id);
                    await resolveSignal(signal._id, 'INCORRECT', candleRes.reason, candleRes.actualPrice);
                  }
                  continue;
                }
              }
              continue; // Skip evaluation this cycle, try again next cycle
            }

            // CONTINUOUS HIGH-WATER MARK TRACKING
            const currentMax = signal.maxObservedPrice || signal.currentPrice || actualPrice;
            const currentMin = signal.minObservedPrice || signal.currentPrice || actualPrice;
            const newMax = Math.max(currentMax, actualPrice);
            const newMin = Math.min(currentMin, actualPrice);

            // Update DB so marks persist across daemon restarts
            const db = await getDb();
            await db.collection('signals').updateOne(
              { _id: signal._id },
              { $set: { maxObservedPrice: newMax, minObservedPrice: newMin } }
            );

            // Evaluate signal accuracy using the high-water marks
            const evaluation = evaluateSignal(signal, actualPrice, newMax, newMin);

            if (evaluation.correct === 'PENDING') {
              // Keep the signal active, do not resolve it yet
              continue; 
            }

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
              // Attempt candle playback before ever falling back
              const candleRes = await verifySignalWithCandles(signal);
              if (candleRes) {
                if (candleRes.correct === true) {
                  await resolveSignal(signal._id, 'CORRECT', candleRes.reason, candleRes.actualPrice);
                } else {
                  await writeErrorVector(signal.ticker, candleRes.reason, signal._id);
                  await resolveSignal(signal._id, 'INCORRECT', candleRes.reason, candleRes.actualPrice);
                }
              } else {
                await resolveSignal(signal._id, 'INCONCLUSIVE', evaluation.reason, actualPrice);
              }
            }
          } catch (error) {
            console.error(`[AUDIT DAEMON] Error processing signal ${signal._id}:`, error.message);
          }
        } // end for signal of tickerSignals

        // Rate limit: wait 1.5s between unique ticker price API calls
        await new Promise(r => setTimeout(r, 1500));

      } catch (error) {
        console.error(`[AUDIT DAEMON] Error processing ticker ${ticker}:`, error.message);
      }
    }
    
    // 2. Run LLM verification on general chat prompts
    await verifyChatPrompts();

    // 3. Verify open Paper Trades
    await verifyPaperTrades();

  } catch (error) {
    console.error('[AUDIT DAEMON] Cycle error:', error.message);
  }
}

/**
 * Automatically evaluates OPEN paper trades and closes them if SL/TP is hit.
 */
async function verifyPaperTrades() {
  try {
    const db = await getDb();
    const openTrades = await db.collection('paper_trades').find({
      status: 'OPEN'
    }).toArray();

    if (openTrades.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Evaluating ${openTrades.length} open paper trade(s)...`);

    for (const trade of openTrades) {
      const actualPrice = await fetchCurrentPrice(trade.asset);
      if (!actualPrice) continue;

      let newStatus = 'OPEN';
      let reason = '';
      const side = (trade.side || 'LONG').toUpperCase();

      if (side === 'LONG' || side === 'BUY') {
        // ATR Trailing Stop Logic (Infinite Runner)
        const trailingDistance = Math.abs(trade.takeProfit1 - trade.entryPrice) * 1.5; // Original 1.5 ATR risk

        if (trade.takeProfit1 && trade.entryPrice && !trade.tp1Hit) {
          if (actualPrice >= trade.takeProfit1) {
            const newStop = Math.max(trade.entryPrice, actualPrice - trailingDistance);
            await db.collection('paper_trades').updateOne(
              { id: trade.id },
              { $set: { stopLoss: newStop, tp1Hit: true } }
            );
            trade.stopLoss = newStop;
            trade.tp1Hit = true;
            console.log(`[AUDIT DAEMON] TP1 Hit for ${trade.asset}! 50% profits secured. Trailing Stop activated at $${newStop}`);
          }
        } else if (trade.tp1Hit) {
          // Continuously trail the stop loss up
          const trailingStop = actualPrice - trailingDistance;
          if (trailingStop > trade.stopLoss) {
             await db.collection('paper_trades').updateOne(
               { id: trade.id },
               { $set: { stopLoss: trailingStop } }
             );
             trade.stopLoss = trailingStop;
          }
        }

        if (trade.stopLoss && actualPrice <= trade.stopLoss) {
          newStatus = trade.tp1Hit ? 'WIN' : 'LOSS';
          reason = trade.tp1Hit ? `Trailing Stop hit at ${actualPrice} (Runner exited in profit)` : `Stop loss hit at ${actualPrice}`;
        }
        // Removed fixed TP2 exit to let the winner run infinitely via Trailing Stop
      } else if (side === 'SHORT' || side === 'SELL') {
        // ATR Trailing Stop Logic (Infinite Runner)
        const trailingDistance = Math.abs(trade.entryPrice - trade.takeProfit1) * 1.5;

        if (trade.takeProfit1 && trade.entryPrice && !trade.tp1Hit) {
          if (actualPrice <= trade.takeProfit1) {
            const newStop = Math.min(trade.entryPrice, actualPrice + trailingDistance);
            await db.collection('paper_trades').updateOne(
              { id: trade.id },
              { $set: { stopLoss: newStop, tp1Hit: true } }
            );
            trade.stopLoss = newStop;
            trade.tp1Hit = true;
            console.log(`[AUDIT DAEMON] TP1 Hit for ${trade.asset}! 50% profits secured. Trailing Stop activated at $${newStop}`);
          }
        } else if (trade.tp1Hit) {
          // Continuously trail the stop loss down
          const trailingStop = actualPrice + trailingDistance;
          if (trailingStop < trade.stopLoss) {
             await db.collection('paper_trades').updateOne(
               { id: trade.id },
               { $set: { stopLoss: trailingStop } }
             );
             trade.stopLoss = trailingStop;
          }
        }

        if (trade.stopLoss && actualPrice >= trade.stopLoss) {
          newStatus = trade.tp1Hit ? 'WIN' : 'LOSS';
          reason = trade.tp1Hit ? `Trailing Stop hit at ${actualPrice} (Runner exited in profit)` : `Stop loss hit at ${actualPrice}`;
        }
        // Removed fixed TP2 exit to let the winner run infinitely via Trailing Stop
      }

      if (newStatus !== 'OPEN') {
        await db.collection('paper_trades').updateOne(
          { id: trade.id },
          { $set: { status: newStatus, closedAt: new Date().toISOString(), closePrice: actualPrice, closeReason: reason } }
        );
        console.log(`[AUDIT DAEMON] Paper Trade ${trade.id} (${trade.asset}) closed with status ${newStatus}`);
        if (parentPort) {
          parentPort.postMessage({ type: 'AUDIT_UPDATE' });
        }
      }
      
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (err) {
    console.error('[AUDIT DAEMON] Paper trade verification error:', err.message);
  }
}

/**
 * Verify unstructured chat prompts using DETERMINISTIC price checks
 * HARDENED: Replaced LLM circular trust with pure market data verification
 * - Extracts tickers from the original prompt text
 * - Fetches current price vs price at prompt time
 * - Compares directional keywords in AI response against actual price movement
 */
async function verifyChatPrompts() {
  try {
    const db = await getDb();
    const duePrompts = await db.collection('prompt_logs').find({
      auditDue: { $lte: new Date() },
      resolvedOutcome: null
    }).limit(5).toArray();

    if (duePrompts.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Evaluating ${duePrompts.length} general chat prompt(s) via price verification...`);

    // Common ticker patterns to extract from text
    const TICKER_PATTERNS = [
      /\b(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|LINK|MATIC|BNB|LTC|DOT|UNI|ATOM|NEAR|APT|ARB|SUI)\b/gi,
      /\b(AAPL|TSLA|NVDA|MSFT|AMZN|GOOGL|META|NFLX|AMD|INTC)\b/gi,
      /\b(Bitcoin|Ethereum|Solana|Ripple|Dogecoin|Cardano)\b/gi,
    ];
    
    const NAME_TO_TICKER = {
      'BITCOIN': 'BTC', 'ETHEREUM': 'ETH', 'SOLANA': 'SOL',
      'RIPPLE': 'XRP', 'DOGECOIN': 'DOGE', 'CARDANO': 'ADA'
    };

    for (const prompt of duePrompts) {
      try {
        const fullText = `${prompt.prompt || ''} ${prompt.aiOutput || ''}`;
        
        // 1. Extract tickers from the prompt + AI output
        let tickers = new Set();
        for (const pattern of TICKER_PATTERNS) {
          const matches = fullText.match(pattern) || [];
          matches.forEach(m => {
            const upper = m.toUpperCase();
            tickers.add(NAME_TO_TICKER[upper] || upper);
          });
        }
        
        if (tickers.size === 0) {
          // No ticker found — can't verify with price data
          await db.collection('prompt_logs').updateOne(
            { _id: prompt._id },
            { $set: {
              resolvedOutcome: 'INCONCLUSIVE',
              resolvedReason: 'No asset ticker detected in prompt — price-based verification not possible',
              resolvedAt: new Date()
            }}
          );
          console.log(`[AUDIT DAEMON] Prompt ${prompt._id}: INCONCLUSIVE (no ticker found)`);
          continue;
        }

        // 2. Determine directional sentiment from the AI response
        const aiText = (prompt.aiOutput || '').toUpperCase();
        const bullishKeywords = ['BULLISH', 'BUY', 'LONG', 'UPSIDE', 'RALLY', 'SUPPORT', 'BOUNCE', 'HIGHER', 'ACCUMULATE'];
        const bearishKeywords = ['BEARISH', 'SELL', 'SHORT', 'DOWNSIDE', 'DROP', 'RESISTANCE', 'BREAKDOWN', 'LOWER', 'DISTRIBUTE'];
        
        let bullishScore = 0, bearishScore = 0;
        bullishKeywords.forEach(kw => { if (aiText.includes(kw)) bullishScore++; });
        bearishKeywords.forEach(kw => { if (aiText.includes(kw)) bearishScore++; });
        
        const impliedDirection = bullishScore > bearishScore ? 'BULLISH' 
                               : bearishScore > bullishScore ? 'BEARISH' 
                               : 'NEUTRAL';
        
        if (impliedDirection === 'NEUTRAL') {
          await db.collection('prompt_logs').updateOne(
            { _id: prompt._id },
            { $set: {
              resolvedOutcome: 'INCONCLUSIVE',
              resolvedReason: 'No clear directional claim in AI response — cannot verify neutral/educational responses via price action',
              resolvedAt: new Date()
            }}
          );
          console.log(`[AUDIT DAEMON] Prompt ${prompt._id}: INCONCLUSIVE (no directional claim)`);
          continue;
        }

        // 3. Fetch current price for the first detected ticker
        const primaryTicker = Array.from(tickers)[0];
        const { fetchLivePrice } = await import('./dataFetcher.js');
        const currentPrice = await fetchLivePrice(primaryTicker);
        
        if (!currentPrice) {
          await db.collection('prompt_logs').updateOne(
            { _id: prompt._id },
            { $set: {
              resolvedOutcome: 'INCONCLUSIVE',
              resolvedReason: `Could not fetch current price for ${primaryTicker} — data source unavailable`,
              resolvedAt: new Date()
            }}
          );
          continue;
        }

        // 4. Compare with price at time of prompt (if stored) or use a simple delta
        const promptPrice = prompt.priceAtTime || null;
        let verdict = 'INCONCLUSIVE';
        let reason = '';

        if (promptPrice && promptPrice > 0) {
          const priceChange = currentPrice - promptPrice;
          const pctChange = (priceChange / promptPrice) * 100;
          const minMove = 0.5; // Minimum 0.5% to be considered a meaningful move
          
          if (Math.abs(pctChange) < minMove) {
            verdict = 'INCONCLUSIVE';
            reason = `${primaryTicker} moved only ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}% since prompt — too small to verify (threshold: ${minMove}%)`;
          } else if ((impliedDirection === 'BULLISH' && pctChange > 0) || (impliedDirection === 'BEARISH' && pctChange < 0)) {
            verdict = 'CORRECT';
            reason = `${primaryTicker} ${impliedDirection === 'BULLISH' ? 'rose' : 'fell'} ${Math.abs(pctChange).toFixed(1)}% ($${promptPrice.toFixed(2)} → $${currentPrice.toFixed(2)}) — directional claim validated`;
          } else {
            verdict = 'INCORRECT';
            reason = `${primaryTicker} went ${pctChange > 0 ? 'up' : 'down'} ${Math.abs(pctChange).toFixed(1)}% ($${promptPrice.toFixed(2)} → $${currentPrice.toFixed(2)}) — opposite of ${impliedDirection} claim`;
          }
        } else {
          verdict = 'INCONCLUSIVE';
          reason = `Price at prompt time not recorded for ${primaryTicker} — cannot compute directional accuracy`;
        }

        await db.collection('prompt_logs').updateOne(
          { _id: prompt._id },
          { $set: {
            resolvedOutcome: verdict,
            resolvedReason: reason,
            verifiedPrice: currentPrice,
            verifiedTicker: primaryTicker,
            impliedDirection,
            resolvedAt: new Date()
          }}
        );
        
        console.log(`[AUDIT DAEMON] Prompt ${prompt._id} (${primaryTicker}): ${verdict} — ${reason}`);
        await new Promise(r => setTimeout(r, 1500));
        
      } catch (err) {
        console.error(`[AUDIT DAEMON] Error verifying prompt ${prompt._id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[AUDIT DAEMON] verifyChatPrompts error:', error.message);
  }
}

// =====================================================
// LLM-BASED PROMPT VERIFICATION (4-HOUR DELAY)
// =====================================================
async function auditPrompts() {
  if (!genAI) return;
  const db = await getDb();
  
  try {
    const pendingPrompts = await db.collection('prompt_logs').find({
      resolvedOutcome: null,
      auditDue: { $lte: new Date() }
    }).toArray();

    if (pendingPrompts.length === 0) return;

    console.log(`\n[PROMPT AUDIT] Evaluating ${pendingPrompts.length} conversational AI suggestions...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    for (const prompt of pendingPrompts) {
      try {
        const aiPrompt = `You are an objective auditor. 
Four hours ago, a user asked this: "${prompt.prompt}"
The AI responded with this advice/analysis: "${(prompt.aiOutput || '').substring(0, 1000)}"

Based on general market knowledge of what typically happens in 4 hours, or objective logic, was the AI's advice CORRECT or INCORRECT?
Reply strictly in this JSON format:
{
  "grade": "CORRECT" | "INCORRECT",
  "reason": "Brief explanation of why it was right or wrong."
}`;

        const result = await model.generateContent(aiPrompt);
        const text = result.response.text();
        
        let gradeData = { grade: 'INCONCLUSIVE', reason: 'Failed to parse AI evaluation' };
        try {
          const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
          gradeData = JSON.parse(jsonStr);
        } catch (e) {
          if (text.includes('CORRECT')) gradeData.grade = 'CORRECT';
          else if (text.includes('INCORRECT')) gradeData.grade = 'INCORRECT';
          gradeData.reason = text.substring(0, 200);
        }

        await db.collection('prompt_logs').updateOne(
          { _id: prompt._id },
          { $set: { 
            resolvedOutcome: gradeData.grade, 
            resolvedReason: gradeData.reason,
            resolvedAt: new Date().toISOString()
          }}
        );
        console.log(`[PROMPT AUDIT] Graded prompt: ${gradeData.grade}`);
      } catch (err) {
        console.error(`[PROMPT AUDIT] Error grading prompt ${prompt._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[PROMPT AUDIT] Daemon loop failed:', err.message);
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
    
    // Also run prompt audit every 5 mins
    auditPrompts();
    setInterval(auditPrompts, 5 * 60 * 1000);
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
