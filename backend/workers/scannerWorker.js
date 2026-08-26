import { parentPort } from 'worker_threads';
import { runBulkScanPhase4 } from '../scannerEngine.js';
import { getDynamicCryptoWatchlist } from '../discoveryEngine.js';
import { startWebSocketPipeline, liveMemoryState } from '../websocketEngine.js';
import { listAvailableRegions, getWatchlistForRegions } from '../globalWatchlists.js';
import { getDb } from '../mongoConfig.js';

let isBrainRunning = false;

async function runGhostBrainLoop() {
  if (isBrainRunning) return;
  isBrainRunning = true;

  console.log('[WORKER: SCANNER] Starting Ghost Brain Multi-Market Backend Loop...');

  // Initialize DB connection for this worker
  await getDb();

  // Initial fetch for dynamic Phase 0 Top 100 Crypto funnel
  let dynamicCryptoList = await getDynamicCryptoWatchlist();

  // Start WebSocket for Crypto level 2 depth
  await startWebSocketPipeline(dynamicCryptoList);

  const globalAssets = getWatchlistForRegions(listAvailableRegions());
  let activeWatchlist = [...new Set([...dynamicCryptoList, ...globalAssets])];

  console.log(`[WORKER: SCANNER] Waiting for initial order flow telemetry buffer to fill for ${activeWatchlist.length} assets...`);
  for (let i = 0; i < 15; i++) {
    const firstCrypto = dynamicCryptoList[0] || 'BTC-USD';
    const firstTrades = liveMemoryState.aggTrades[firstCrypto];
    if (firstTrades && firstTrades.length > 0) {
      console.log(`[WORKER: SCANNER] Telemetry buffer filled (${firstTrades.length} trades for ${firstCrypto}). Proceeding to initial scan.`);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Run initial scan
  try {
    console.log('[WORKER: SCANNER] Executing initial multi-market scan...');
    const initialResults = await runBulkScanPhase4(activeWatchlist);
    parentPort.postMessage({ type: 'GHOST_BRAIN_UPDATE', payload: initialResults });
  } catch (e) {
    console.error('[WORKER: SCANNER] Initial scan error:', e.message);
  }

  // Continuous loop
  while (true) {
    try {
      // Refresh the dynamic list every loop (the engine caches for 5 mins automatically)
      dynamicCryptoList = await getDynamicCryptoWatchlist();
      
      // Ensure WebSocket is updated with any new tickers seamlessly
      await startWebSocketPipeline(dynamicCryptoList);

      const globalAssets = getWatchlistForRegions(listAvailableRegions());
      activeWatchlist = [...new Set([...dynamicCryptoList, ...globalAssets])];

      const results = await runBulkScanPhase4(activeWatchlist);
      parentPort.postMessage({ type: 'GHOST_BRAIN_UPDATE', payload: results });
    } catch (e) {
      console.error('[WORKER: SCANNER] Loop error:', e.message);
    }
    // Sleep matches OHLCV cache TTL (5 min) / 5 = scan every 60s to avoid redundant cache reads and Yahoo rate-limits
    await new Promise(r => setTimeout(r, 60000));
  }
}

// Automatically start the loop when the worker is spawned
runGhostBrainLoop().catch(err => {
  console.error('[WORKER: SCANNER] Fatal Error:', err);
  process.exit(1);
});
