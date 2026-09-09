import { getDb, closeDb } from './mongoConfig.js';
import { fetchLivePrice } from './dataFetcher.js';
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
      // DYNAMIC BREAKEVEN RISK-NEUTRALIZER (+1.0R Trail)
      // If price reaches TP1 (+1.0R), lock Stop-Loss to Entry ($0 Risk)
      // DYNAMIC BREAKEVEN & 50% PARTIAL PROFIT SCALE-OUT (+1.0R Trail)
      // When price reaches TP1 (+1.0R):
      // 1. Immediately bank 50% partial profit (+0.5R banked into balance)
      // 2. Lock Stop-Loss on the remaining 50% to Entry ($0 Risk)
      // ═══════════════════════════════════════════════════════
      if (!trade.breakevenLocked && trade.entryPrice && trade.stopLoss) {
        const initialSl = trade.initialStopLoss || trade.stopLoss;
        const riskDist = Math.abs(trade.entryPrice - initialSl);
        const tp1Price = (trade.side === 'LONG' || trade.side === 'BUY')
          ? trade.entryPrice + riskDist
          : trade.entryPrice - riskDist;

        const reachedTP1 = (trade.side === 'LONG' || trade.side === 'BUY')
          ? currentPrice >= tp1Price
          : currentPrice <= tp1Price;

        if (reachedTP1 && riskDist > 0) {
          trade.initialStopLoss = initialSl;
          trade.stopLoss = trade.entryPrice;
          trade.breakevenLocked = true;
          trade.partialTaken = true;
          trade.partialPnlPct = (riskDist / trade.entryPrice) * 100; // +1.0R gain on 50% size

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

      let hitSL = false;
      let hitTP = false;
      let reason = '';

      if (trade.side === 'LONG' || trade.side === 'BUY') {
        if (trade.stopLoss && currentPrice <= trade.stopLoss) {
          hitSL = true;
          reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : 'STOP_LOSS';
        } else if (trade.takeProfit && currentPrice >= trade.takeProfit) {
          hitTP = true;
          reason = 'TAKE_PROFIT';
        }
      } else if (trade.side === 'SHORT' || trade.side === 'SELL') {
        if (trade.stopLoss && currentPrice >= trade.stopLoss) {
          hitSL = true;
          reason = trade.breakevenLocked ? 'BREAKEVEN_EXIT' : 'STOP_LOSS';
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
