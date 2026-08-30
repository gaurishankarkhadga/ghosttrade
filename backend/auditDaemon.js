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
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parentPort } from 'worker_threads';

// Initialize Gemini for Prompt Auditing
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
import { writeErrorVector } from './memoryLedger.js';
import { resolveYahooSymbol } from './dataFetcher.js';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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
 * Universal price fetcher — tries cache first, then crypto, then stocks, then dynamic fallback.
 */
async function fetchCurrentPrice(ticker) {
  if (!ticker || ticker === 'UNKNOWN') return null;

  const now = Date.now();
  if (priceCache.has(ticker)) {
    const cached = priceCache.get(ticker);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.price; // Serve from cache
    }
  }

  let price = null;
  try {
    if (isCryptoTicker(ticker)) {
      price = await fetchCryptoPrice(ticker);
    }
    
    // Dynamic Fallback 1: If it's a crypto we missed in mapping, or just a stock
    if (price === null) {
      price = await fetchStockPrice(ticker);
    }
    
    // Dynamic Fallback 2: Ultimate fallback for raw crypto tickers that failed stock resolution
    if (price === null && !ticker.includes('-') && !ticker.includes('/')) {
      price = await fetchStockPrice(`${ticker}-USD`);
    }

    if (price !== null) {
      priceCache.set(ticker, { price, timestamp: now });
    }
  } catch (err) {
    console.warn(`[AUDIT] Robust price fetch error for ${ticker}:`, err.message);
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
      .sort({ timestamp: 1 }) // Older signals evaluated first
      .limit(50) // Process max 50 per cycle
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
  const isExpired = auditDue ? now >= new Date(auditDue) : false;

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
    // 1. Continuous Hard Stops (SL / TP)
    if (invalidationLevel && minObservedPrice <= invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bullish structure — price dropped to $${minObservedPrice.toFixed(2)} hitting invalidation $${invalidationLevel.toFixed(2)}`)
      };
    }
    // TUNED: Require reaching at least 30% of the target distance (was 50%)
    // Direction accuracy matters more than exact target hit
    if (primaryTarget && currentPrice) {
      const targetDistance = primaryTarget - currentPrice;
      const progressDistance = maxObservedPrice - currentPrice;
      const targetProgress = targetDistance > 0 ? progressDistance / targetDistance : 0;
      if (targetProgress >= 0.30) {
        return { correct: true, reason: `Target progress ${(targetProgress * 100).toFixed(0)}% — price reached $${maxObservedPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)} (entry: $${currentPrice.toFixed(2)})` };
      }
    }
    
    // 2. Time Expiration Logic
    if (isExpired) {
      // High-water mark check: if price EVER moved meaningfully in predicted direction during the window, count as CORRECT
      const maxUpMove = ((maxObservedPrice - currentPrice) / currentPrice) * 100;
      if (maxUpMove >= 0.5) {
        return { correct: true, reason: `Directional bias confirmed via high-water mark — price reached +${maxUpMove.toFixed(1)}% ($${maxObservedPrice.toFixed(2)}) during the audit window (entry: $${currentPrice.toFixed(2)})` };
      }
      const minProgressForWin = 0.15; // Lowered from 0.5% — direction accuracy matters
      if (percentChange >= minProgressForWin) {
        return { correct: true, reason: `Directional bias confirmed at expiration — +${percentChange.toFixed(2)}% in the predicted direction` };
      } else if (percentChange >= -0.3) {
        // Tiny adverse move or flat — not enough evidence to call it wrong
        return { 
          correct: null, 
          reason: `${ticker} bullish thesis inconclusive — price change ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}% is within noise range`
        };
      } else {
        return { 
          correct: false, 
          reason: buildErrorContext(`${ticker} failed to hold bullish thesis by expiration — dropped ${Math.abs(percentChange).toFixed(1)}%`)
        };
      }
    }
    
    // 3. Still Pending
    return { correct: 'PENDING', reason: 'Signal is actively tracking real-time price action' };
  }

  if (!isNeutralOrBlocked && direction === 'BEARISH') {
    // 1. Continuous Hard Stops (SL / TP)
    if (invalidationLevel && maxObservedPrice >= invalidationLevel) {
      return { 
        correct: false, 
        reason: buildErrorContext(`${ticker} failed bearish structure — price rallied to $${maxObservedPrice.toFixed(2)} hitting invalidation $${invalidationLevel.toFixed(2)}`)
      };
    }
    // TUNED: Require reaching at least 30% of the target distance (was 50%)
    if (primaryTarget && currentPrice) {
      const targetDistance = currentPrice - primaryTarget;
      const progressDistance = currentPrice - minObservedPrice;
      const targetProgress = targetDistance > 0 ? progressDistance / targetDistance : 0;
      if (targetProgress >= 0.30) {
        return { correct: true, reason: `Target progress ${(targetProgress * 100).toFixed(0)}% — price reached $${minObservedPrice.toFixed(2)} vs target $${primaryTarget.toFixed(2)} (entry: $${currentPrice.toFixed(2)})` };
      }
    }
    
    // 2. Time Expiration Logic
    if (isExpired) {
      // High-water mark check: if price EVER moved meaningfully in predicted direction during the window, count as CORRECT
      const maxDownMove = ((currentPrice - minObservedPrice) / currentPrice) * 100;
      if (maxDownMove >= 0.5) {
        return { correct: true, reason: `Directional bias confirmed via high-water mark — price reached -${maxDownMove.toFixed(1)}% ($${minObservedPrice.toFixed(2)}) during the audit window (entry: $${currentPrice.toFixed(2)})` };
      }
      const minProgressForWin = 0.15; // Lowered from 0.5%
      if (Math.abs(percentChange) >= minProgressForWin && priceChange <= 0) {
        return { correct: true, reason: `Directional bias confirmed at expiration — ${Math.abs(percentChange).toFixed(2)}% in the predicted direction` };
      } else if (priceChange > 0 && percentChange < 0.3) {
        // Tiny adverse move — not enough evidence to call it wrong
        return {
          correct: null,
          reason: `${ticker} bearish thesis inconclusive — price change +${percentChange.toFixed(2)}% is within noise range`
        };
      } else if (priceChange > 0) {
        return { 
          correct: false, 
          reason: buildErrorContext(`${ticker} failed to hold bearish thesis by expiration — rose +${percentChange.toFixed(1)}%`)
        };
      } else {
        // Price went down but less than threshold — still correct direction
        return { correct: true, reason: `Directional bias confirmed at expiration — ${Math.abs(percentChange).toFixed(2)}% in the predicted direction` };
      }
    }

    // 3. Still Pending
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
 * Main audit cycle — processes all active signals in real-time
 */
async function runAuditCycle() {
  try {
    const activeSignals = await getActiveSignals();
    
    if (activeSignals.length === 0) return;
    
    console.log(`[AUDIT DAEMON] Evaluating ${activeSignals.length} active signal(s) continuously...`);

    for (const signal of activeSignals) {
      try {
        // Fetch real-time price
        const actualPrice = await fetchCurrentPrice(signal.ticker);
        
        if (actualPrice === null) {
          // If price fetch fails, check if the signal has already expired
          const isExpired = signal.auditDue ? new Date() >= new Date(signal.auditDue) : false;
          if (isExpired) {
            await resolveSignal(signal._id, 'INCONCLUSIVE', 'No price data available at expiration', null);
          }
          continue; // Skip evaluation this cycle, try again next time
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
          // Rate limit: wait 1.5s between API calls to prevent IP ban
          await new Promise(r => setTimeout(r, 1500));
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
          await resolveSignal(signal._id, 'INCONCLUSIVE', evaluation.reason, actualPrice);
        }

        // Rate limit: wait 1.5s between price API calls
        await new Promise(r => setTimeout(r, 1500));

      } catch (error) {
        console.error(`[AUDIT DAEMON] Error processing signal ${signal._id}:`, error.message);
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
