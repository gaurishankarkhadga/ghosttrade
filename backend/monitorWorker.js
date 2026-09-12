import { getDb, closeDb } from './mongoConfig.js';
import { fetchLivePrice, fetchOHLCV } from './dataFetcher.js';
import { fetchLivePrice, fetchOHLCV, fetchMultiTimeframeOHLCV } from './dataFetcher.js';
import { ObjectId } from 'mongodb';
import { executionManager } from './executionEngine.js';

// Check interval: every 10 seconds
const POLL_INTERVAL_MS = 10000;
let isShuttingDown = false;

async function checkOpenTrades() {
  if (isShuttingDown) return;

  try {
    const db = await getDb();
    const openTrades = await db.collection('paper_trades').find({ status: 'OPEN' }).toArray();

    if (openTrades.length === 0) {
      // console.log("[MONITOR] No open trades to track.");
      return;
    }

    // console.log(`[MONITOR] Tracking ${openTrades.length} open trades...`);

    for (const trade of openTrades) {
      // If underlyingAsset is tracked (e.g. F&O), track underlying price; otherwise track asset directly
      const assetToTrack = trade.underlyingAsset || trade.asset;
      const currentPrice = await fetchLivePrice(assetToTrack);
      if (!currentPrice) {
        console.warn(`[MONITOR] Could not fetch live price for ${assetToTrack}. Skipping.`);
        continue;
      }

      // ═══════════════════════════════════════════════════════
      // FEATURE 1: Early Warning Cut at -0.3R
      // ═══════════════════════════════════════════════════════
      if (!trade.thesisChecked && !trade.breakevenLocked && trade.entryPrice && trade.stopLoss) {
        const initialSl = trade.initialStopLoss || trade.stopLoss;
        const riskDist = Math.abs(trade.entryPrice - initialSl);
        const warningDist = riskDist * 0.3;
        
        const warningPrice = (trade.side === 'LONG' || trade.side === 'BUY')
          ? trade.entryPrice - warningDist
          : trade.entryPrice + warningDist;
          
        const hitWarning = (trade.side === 'LONG' || trade.side === 'BUY')
          ? currentPrice <= warningPrice
          : currentPrice >= warningPrice;

        if (hitWarning && riskDist > 0) {
          try {
            const candles = await fetchOHLCV(assetToTrack, '1h', 1);
            if (candles && candles.length > 0) {
            const multiData = await fetchMultiTimeframeOHLCV(assetToTrack, 5);
            if (multiData && multiData.timeframes && multiData.timeframes['1h'] && multiData.timeframes['1h'].length > 0) {
              const candles = multiData.timeframes['1h'];
              const latestCandle = candles[candles.length - 1];
              const bodySize = Math.abs(latestCandle.close - latestCandle.open);
              const bodyPct = (bodySize / latestCandle.close) * 100;
              
              const isLong = (trade.side === 'LONG' || trade.side === 'BUY');
              const oppositeClose = isLong 
                ? latestCandle.close < latestCandle.open 
                : latestCandle.close > latestCandle.open;
              
              if (oppositeClose && bodyPct > 1) {
                console.log(`[MONITOR] ⚠️ Thesis invalid for ${trade.asset}, cutting early at -0.3R.`);
                trade.stopLoss = currentPrice; // Force exit immediately
              }
            }
          } catch (e) {
            console.warn(`[MONITOR] Thesis check failed for ${trade.asset}: ${e.message}`);
          }
          trade.thesisChecked = true;
          try {
            await db.collection('paper_trades').updateOne(
              { _id: trade._id },
              { $set: { thesisChecked: true, stopLoss: trade.stopLoss } }
            );
          } catch (err) {
            console.warn(`[MONITOR] Failed to update thesisChecked for ${trade.asset}:`, err.message);
          }
        }
      }

      // ═══════════════════════════════════════════════════════
      // v3.0 FAST BREAKEVEN LOCK (+0.5R Trail)
      // When price reaches just +0.5R (half the risk distance):
      // 1. Immediately bank 50% partial profit (+0.25R locked in)
      // 2. Lock Stop-Loss on the remaining 50% to Entry ($0 Risk)
      // Result: Trade becomes risk-free VERY quickly.
      // Even if remaining 50% stops at breakeven, net PnL = +0.25R (WIN)
      // ═══════════════════════════════════════════════════════
      if (!trade.breakevenLocked && trade.entryPrice && trade.stopLoss) {
        const initialSl = trade.initialStopLoss || trade.stopLoss;
        const riskDist = Math.abs(trade.entryPrice - initialSl);
        // v3.0: Trigger at +0.5R instead of +1.0R for faster risk elimination
        const halfRiskDist = riskDist * 0.5;
        const tp1Price = (trade.side === 'LONG' || trade.side === 'BUY')
          ? trade.entryPrice + halfRiskDist
          : trade.entryPrice - halfRiskDist;

        const reachedTP1 = (trade.side === 'LONG' || trade.side === 'BUY')
          ? currentPrice >= tp1Price
          : currentPrice <= tp1Price;

        if (reachedTP1 && riskDist > 0) {
          trade.initialStopLoss = initialSl;
          trade.stopLoss = trade.entryPrice;
          trade.breakevenLocked = true;
          trade.partialTaken = true;
          trade.partialPnlPct = (halfRiskDist / trade.entryPrice) * 100; // +0.5R gain on 50% size

          // If Live Broker Trade, execute 50% market exit order
          if (trade.mode && trade.mode.startsWith('LIVE') && trade.broker && trade.userId && trade.quantity > 0) {
            try {
              const { getBrokerKeys } = await import('./brokerKeyManager.js');
              const { createAdapter } = await import('./brokerAdapter.js');
              const credentials = await getBrokerKeys(trade.userId, trade.broker);
              if (credentials) {
                const adapter = createAdapter(trade.broker, credentials);
                const executedSide = (trade.contractSide || trade.side || 'BUY').toUpperCase();
                const partialExitSide = executedSide === 'BUY' || executedSide === 'LONG' ? 'SELL' : 'BUY';
                const partialQty = Number((trade.quantity * 0.5).toFixed(4));

                console.log(`[MONITOR] 💰 EXECUTING 50% PARTIAL PROFIT ORDER: ${partialExitSide} ${partialQty} of ${trade.asset} on ${trade.broker}...`);
                await adapter.placeOrder({
                  symbol: trade.asset,
                  asset: trade.asset,
                  symbolToken: trade.symbolToken || null,
                  side: partialExitSide,
                  type: 'MARKET',
                  orderType: 'MARKET',
                  quantity: partialQty,
                  price: currentPrice
                });
              }
            } catch (pErr) {
              console.warn(`[MONITOR] Partial exit broker warning: ${pErr.message}`);
            }
          }

          try {
            // FIXED: Update trade quantity after partial exit to prevent double-exit
            const remainingQty = Number((trade.quantity - (trade.quantity * 0.5)).toFixed(8));
            
            await db.collection('paper_trades').updateOne(
              { _id: trade._id },
              {
                $set: {
                  stopLoss: trade.entryPrice,
                  initialStopLoss: initialSl,
                  breakevenLocked: true,
                  breakevenLockedAt: new Date(),
                  partialTaken: true,
                  partialPnlPct: trade.partialPnlPct,
                  partialPrice: currentPrice,
                  partialClosedAt: new Date(),
                  quantity: remainingQty
                }
              }
            );
            trade.quantity = remainingQty; // Update in-memory reference
            console.log(`[MONITOR] 🛡️ 50% PARTIAL PROFIT BANKED + BREAKEVEN LOCKED: ${trade.asset} hit +1.0R ($${tp1Price.toFixed(2)}). Banked +${trade.partialPnlPct.toFixed(2)}% on 50% size. Stop Loss moved to Entry $${trade.entryPrice} ($0 Capital Risk).`);
          } catch (err) {
            console.warn(`[MONITOR] Failed to persist breakeven/partial lock for ${trade.asset}:`, err.message);
          }
        }
      }

      // ═══════════════════════════════════════════════════════
      // FEATURE 2: Trailing Stop After Breakeven Lock
      // ═══════════════════════════════════════════════════════
      if (trade.breakevenLocked && trade.entryPrice && trade.stopLoss) {
        const initialSl = trade.initialStopLoss || trade.stopLoss;
        const riskDist = Math.abs(trade.entryPrice - initialSl);
        const trailDist = riskDist * 0.5;
        
        const isLong = (trade.side === 'LONG' || trade.side === 'BUY');
        
        let hwm = trade.highWaterMark || trade.entryPrice;
        let lwm = trade.lowWaterMark || trade.entryPrice;
        let slUpdated = false;
        let hwmChanged = false;

        if (isLong) {
          if (currentPrice > hwm) {
            hwm = currentPrice;
            trade.highWaterMark = hwm;
            hwmChanged = true;
            const newSl = hwm - trailDist;
            if (newSl > trade.stopLoss) {
              trade.stopLoss = newSl;
              slUpdated = true;
            }
          }
        } else {
          if (currentPrice < lwm) {
            lwm = currentPrice;
            trade.lowWaterMark = lwm;
            hwmChanged = true;
            const newSl = lwm + trailDist;
            if (newSl < trade.stopLoss) {
              trade.stopLoss = newSl;
              slUpdated = true;
            }
          }
        }

        if (hwmChanged) {
           try {
             const updateDoc = { stopLoss: trade.stopLoss };
             if (isLong) updateDoc.highWaterMark = hwm;
             else updateDoc.lowWaterMark = lwm;
             
             await db.collection('paper_trades').updateOne(
               { _id: trade._id },
               { $set: updateDoc }
             );
             if (slUpdated) {
               console.log(`[MONITOR] 📈 TRAILING STOP MOVED for ${trade.asset}: New SL at $${trade.stopLoss.toFixed(4)}`);
             }
           } catch (err) {
             console.warn(`[MONITOR] Failed to update trailing stop for ${trade.asset}:`, err.message);
           }
        }
      }

      // ═══════════════════════════════════════════════════════
      // FEATURE 3: Multi-Tier Profit Taking (Tier 2 at +1.0R)
      // ═══════════════════════════════════════════════════════
      if (trade.breakevenLocked && !trade.tier2Taken && trade.entryPrice && trade.stopLoss) {
        const initialSl = trade.initialStopLoss || trade.stopLoss;
        const riskDist = Math.abs(trade.entryPrice - initialSl);
        const tp2Price = (trade.side === 'LONG' || trade.side === 'BUY')
          ? trade.entryPrice + riskDist
          : trade.entryPrice - riskDist;

        const reachedTP2 = (trade.side === 'LONG' || trade.side === 'BUY')
          ? currentPrice >= tp2Price
          : currentPrice <= tp2Price;

        if (reachedTP2 && riskDist > 0) {
          trade.tier2Taken = true;
          const tier2PnlPct = (riskDist / trade.entryPrice) * 100;

          if (trade.mode && trade.mode.startsWith('LIVE') && trade.broker && trade.userId && trade.quantity > 0) {
            try {
              const { getBrokerKeys } = await import('./brokerKeyManager.js');
              const { createAdapter } = await import('./brokerAdapter.js');
              const credentials = await getBrokerKeys(trade.userId, trade.broker);
              if (credentials) {
                const adapter = createAdapter(trade.broker, credentials);
                const executedSide = (trade.contractSide || trade.side || 'BUY').toUpperCase();
                const partialExitSide = executedSide === 'BUY' || executedSide === 'LONG' ? 'SELL' : 'BUY';
                const partialQty = Number((trade.quantity * 0.5).toFixed(4)); // 50% of REMAINING quantity

                console.log(`[MONITOR] 💰 EXECUTING TIER 2 PROFIT ORDER: ${partialExitSide} ${partialQty} of ${trade.asset} on ${trade.broker}...`);
                await adapter.placeOrder({
                  symbol: trade.asset,
                  asset: trade.asset,
                  symbolToken: trade.symbolToken || null,
                  side: partialExitSide,
                  type: 'MARKET',
                  orderType: 'MARKET',
                  quantity: partialQty,
                  price: currentPrice
                });
              }
            } catch (pErr) {
              console.warn(`[MONITOR] Tier 2 exit broker warning: ${pErr.message}`);
            }
          }

          try {
            const remainingQty = Number((trade.quantity - (trade.quantity * 0.5)).toFixed(8));
            await db.collection('paper_trades').updateOne(
              { _id: trade._id },
              {
                $set: {
                  tier2Taken: true,
                  tier2PnlPct: tier2PnlPct,
                  tier2Price: currentPrice,
                  tier2ClosedAt: new Date(),
                  quantity: remainingQty
                }
              }
            );
            trade.quantity = remainingQty;
            console.log(`[MONITOR] 🛡️ TIER 2 PROFIT BANKED: ${trade.asset} hit +1.0R ($${tp2Price.toFixed(2)}). Banked +${tier2PnlPct.toFixed(2)}% on another 50% size.`);
          } catch (err) {
            console.warn(`[MONITOR] Failed to persist tier 2 lock for ${trade.asset}:`, err.message);
          }
        }
      }

      let hitSL = false;
      let hitTP = false;
      let reason = '';

      // ═══════════════════════════════════════════════════════
      // GHOSTMIND: HUMAN-LIKE CLOSE-BASED STOP LOSS
      // Doesn't panic on a 1-second wick. Waits for a candle close
      // unless it's a catastrophic flash crash (1.5x risk distance).
      // ═══════════════════════════════════════════════════════
      let isCatastrophic = false;
      let candleClosedBeyond = false;

      if (trade.side === 'LONG' || trade.side === 'BUY') {
        if (trade.stopLoss && currentPrice <= trade.stopLoss) {
          hitSL = true;
          reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : 'STOP_LOSS';
          const riskDist = Math.abs(trade.entryPrice - (trade.initialStopLoss || trade.stopLoss));
          const catastrophicSl = trade.stopLoss - (riskDist * 0.5); // 1.5R loss threshold
          
          if (currentPrice <= catastrophicSl) {
            isCatastrophic = true; // Bail immediately, freefall
          } else if (!trade.breakevenLocked) {
             // It's below SL, but is the 15m candle closed below it?
             try {
                const multiData = await fetchMultiTimeframeOHLCV(trade.asset, 5);
                if (multiData && multiData.timeframes && multiData.timeframes['15m'] && multiData.timeframes['15m'].length > 1) {
                   const bars = multiData.timeframes['15m'];
                   const lastClosedCandle = bars[bars.length - 2];
                   if (lastClosedCandle.close <= trade.stopLoss) {
                       candleClosedBeyond = true;
                   }
                }
             } catch (e) {
                // If API fails, default to safety (exit)
                candleClosedBeyond = true; 
             }
          }

          // We exit if:
          // 1. It's a catastrophic drop
          // 2. The 15m candle confirmed the break
          // 3. We are already at breakeven (don't risk profits on wicks)
          if (isCatastrophic || candleClosedBeyond || trade.breakevenLocked) {
            hitSL = true;
            reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : (isCatastrophic ? 'CATASTROPHIC_STOP' : 'CLOSE_BASED_STOP');
          }
        } else if (trade.takeProfit && currentPrice >= trade.takeProfit) {
          hitTP = true;
          reason = 'TAKE_PROFIT';
        }
      } else if (trade.side === 'SHORT' || trade.side === 'SELL') {
        if (trade.stopLoss && currentPrice >= trade.stopLoss) {
          hitSL = true;
          reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : 'STOP_LOSS';
          const riskDist = Math.abs(trade.entryPrice - (trade.initialStopLoss || trade.stopLoss));
          const catastrophicSl = trade.stopLoss + (riskDist * 0.5); 
          
          if (currentPrice >= catastrophicSl) {
            isCatastrophic = true;
          } else if (!trade.breakevenLocked) {
             try {
                const multiData = await fetchMultiTimeframeOHLCV(trade.asset, 5);
                if (multiData && multiData.timeframes && multiData.timeframes['15m'] && multiData.timeframes['15m'].length > 1) {
                   const bars = multiData.timeframes['15m'];
                   const lastClosedCandle = bars[bars.length - 2];
                   if (lastClosedCandle.close >= trade.stopLoss) {
                       candleClosedBeyond = true;
                   }
                }
             } catch (e) {
                candleClosedBeyond = true; 
             }
          }

          if (isCatastrophic || candleClosedBeyond || trade.breakevenLocked) {
            hitSL = true;
            reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : (isCatastrophic ? 'CATASTROPHIC_STOP' : 'CLOSE_BASED_STOP');
          }
        } else if (trade.takeProfit && currentPrice <= trade.takeProfit) {
          hitTP = true;
          reason = 'TAKE_PROFIT';
        }
      }

      if (hitSL || hitTP) {
        const remainingExitPnlPct = trade.entryPrice > 0
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * ((trade.side === 'SHORT' || trade.side === 'SELL') ? -1 : 1)
          : 0;

        // Blended PnL: 50% partial profit + 50% remaining exit minus 0.10% friction/fee buffer
        const frictionPct = 0.10;
        let pnlPct = remainingExitPnlPct;
        if (trade.partialTaken) {
          pnlPct = (trade.partialPnlPct * 0.5) + (remainingExitPnlPct * 0.5);
        }
        pnlPct = Math.max(-100, pnlPct - frictionPct);
        const finalStatus = pnlPct > 0 ? 'WIN' : (pnlPct === 0 ? 'BREAKEVEN' : 'LOSS');

        console.log(`[MONITOR] 🚨 TRADE TRIGGERED EXIT: ${trade.asset} [${trade.side}] - Hit ${reason}`);
        console.log(`          Entry: $${trade.entryPrice} | Exit Price: $${currentPrice}`);
        console.log(`          Result: ${finalStatus} | PnL: ${pnlPct.toFixed(2)}%`);

        // ═══════════════════════════════════════════════════════
        // LIVE BROKER EXIT EXECUTION — Closes real exchange position
        // ═══════════════════════════════════════════════════════
        let brokerExitInfo = null;
        if (trade.mode && trade.mode.startsWith('LIVE') && trade.broker && trade.userId) {
          try {
            const { getBrokerKeys } = await import('./brokerKeyManager.js');
            const { createAdapter } = await import('./brokerAdapter.js');
            const credentials = await getBrokerKeys(trade.userId, trade.broker);
            if (credentials) {
              const adapter = createAdapter(trade.broker, credentials);
              // Exit side is opposite of the executed contract side (BUY -> SELL, SELL -> BUY)
              const executedSide = (trade.contractSide || trade.side || 'BUY').toUpperCase();
              const exitSide = executedSide === 'BUY' || executedSide === 'LONG' ? 'SELL' : 'BUY';

              console.log(`[MONITOR] 🔴 SENDING LIVE BROKER EXIT ORDER: ${exitSide} ${trade.quantity} of ${trade.asset} on ${trade.broker}...`);
              const exitOrder = await adapter.placeOrder({
                symbol: trade.asset,
                asset: trade.asset,
                symbolToken: trade.symbolToken || null,
                side: exitSide,
                type: 'MARKET',
                orderType: 'MARKET',
                quantity: trade.quantity,
                price: currentPrice
              });

              brokerExitInfo = {
                orderId: exitOrder?.orderId || null,
                status: exitOrder?.success ? 'FILLED' : 'FAILED',
                filledPrice: exitOrder?.filledPrice || currentPrice,
                message: exitOrder?.message || null,
                exitedAt: new Date().toISOString()
              };
              console.log(`[MONITOR] ✅ LIVE BROKER EXIT RESULT:`, brokerExitInfo);
            } else {
              console.warn(`[MONITOR] ⚠️ No broker credentials found for ${trade.userId} on ${trade.broker}. Could not close live position.`);
            }
          } catch (brokerErr) {
            console.error(`[MONITOR] ❌ LIVE BROKER EXIT FAILED for ${trade.asset}:`, brokerErr.message);
            brokerExitInfo = { status: 'FAILED', error: brokerErr.message };
          }
        }

        await db.collection('paper_trades').findOneAndUpdate(
          { _id: trade._id, status: 'OPEN' },
          {
            $set: {
              status: finalStatus,
              exitPrice: brokerExitInfo?.filledPrice || currentPrice,
              pnl: pnlPct,
              closedAt: new Date().toISOString(),
              closeReason: reason,
              brokerExit: brokerExitInfo
            }
          }
        );
      }
    }
  } catch (err) {
    console.error('[MONITOR] Error polling open trades:', err);
  }
}

export function startMonitorWorker() {
  console.log(`[MONITOR] Background SL/TP Worker started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
  const interval = setInterval(checkOpenTrades, POLL_INTERVAL_MS);

  // Initial run immediately
  checkOpenTrades();

  return {
    stop: () => {
      isShuttingDown = true;
      clearInterval(interval);
      console.log("[MONITOR] Worker stopped.");
    }
  };
}

// Run as a standalone daemon if executed directly (e.g. via scanner or npm script)
if (process.argv[1] && process.argv[1].endsWith('monitorWorker.js')) {
  startMonitorWorker();
  
  process.on('SIGINT', async () => {
    isShuttingDown = true;
    console.log("\n[MONITOR] Shutting down gracefully...");
    await closeDb();
    process.exit(0);
  });
}
