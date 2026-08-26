import { parentPort, workerData } from 'worker_threads';
import { runBacktest } from '../backtestEngine.js';

async function run() {
  const { asset, days } = workerData;
  console.log(`[WORKER: BACKTEST] Starting backtest for ${asset} (${days} days)`);
  
  try {
    const result = await runBacktest(asset, days);
    if (parentPort) {
        parentPort.postMessage(result);
    }
  } catch (err) {
    console.error('[WORKER: BACKTEST] Fatal Error:', err);
    process.exit(1);
  }
}

run();
