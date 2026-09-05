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

      let hitSL = false;
      let hitTP = false;
      let reason = '';

      if (trade.side === 'LONG' || trade.side === 'BUY') {
        if (trade.stopLoss && currentPrice <= trade.stopLoss) { hitSL = true; reason = 'STOP_LOSS'; }
        else if (trade.takeProfit && currentPrice >= trade.takeProfit) { hitTP = true; reason = 'TAKE_PROFIT'; }
      } else if (trade.side === 'SHORT' || trade.side === 'SELL') {
        if (trade.stopLoss && currentPrice >= trade.stopLoss) { hitSL = true; reason = 'STOP_LOSS'; }
        else if (trade.takeProfit && currentPrice <= trade.takeProfit) { hitTP = true; reason = 'TAKE_PROFIT'; }
      }

      if (hitSL || hitTP) {
        const pnlPct = trade.entryPrice > 0
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * ((trade.side === 'SHORT' || trade.side === 'SELL') ? -1 : 1)
          : 0;
        const finalStatus = pnlPct >= 0 ? 'WIN' : 'LOSS';

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
