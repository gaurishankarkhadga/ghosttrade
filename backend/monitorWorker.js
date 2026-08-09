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
      const currentPrice = await fetchLivePrice(trade.asset);
      if (!currentPrice) {
        console.warn(`[MONITOR] Could not fetch live price for ${trade.asset}. Skipping.`);
        continue;
      }

      let hitSL = false;
      let hitTP = false;
      let reason = '';

      if (trade.side === 'LONG') {
        if (currentPrice <= trade.stopLoss) { hitSL = true; reason = 'STOP_LOSS'; }
        else if (currentPrice >= trade.takeProfit) { hitTP = true; reason = 'TAKE_PROFIT'; }
      } else if (trade.side === 'SHORT') {
        if (currentPrice >= trade.stopLoss) { hitSL = true; reason = 'STOP_LOSS'; }
        else if (currentPrice <= trade.takeProfit) { hitTP = true; reason = 'TAKE_PROFIT'; }
      }

      if (hitSL || hitTP) {
        const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'SHORT' ? -1 : 1);
        const finalStatus = pnlPct >= 0 ? 'WIN' : 'LOSS';

        console.log(`[MONITOR] 🚨 TRADE CLOSED: ${trade.asset} [${trade.side}] - Hit ${reason}`);
        console.log(`          Entry: $${trade.entryPrice} | Exit: $${currentPrice}`);
        console.log(`          Result: ${finalStatus} | PnL: ${pnlPct.toFixed(2)}%`);

        // Note: Live broker exit routing has been removed for the Global Intelligence Terminal architecture.
        // The ledger is now the primary source of truth for all trades.

        await db.collection('paper_trades').findOneAndUpdate(
          { _id: trade._id, status: 'OPEN' },
          {
            $set: {
              status: finalStatus,
              exitPrice: currentPrice,
              pnl: pnlPct,
              closedAt: new Date().toISOString(),
              closeReason: reason
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
