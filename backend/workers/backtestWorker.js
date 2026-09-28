import { parentPort, workerData } from 'worker_threads';
import { runBacktest, walkForwardBacktest } from '../backtestEngine.js';

async function run() {
  const { asset, days, options = {} } = workerData;
  console.log(`[WORKER: BACKTEST] Starting ${options.walkForward ? 'walk-forward' : 'standard'} backtest for ${asset} (${days} days)`);

  try {
    const result = options.walkForward
      ? await walkForwardBacktest(asset, days, options.splitRatio ?? 0.7)
      : await runBacktest(asset, days);

    if (parentPort) {
      parentPort.postMessage(result);
    }
  } catch (err) {
    console.error('[WORKER: BACKTEST] Fatal Error:', err);
    if (parentPort) parentPort.postMessage({ error: err.message });
    else process.exit(1);
  }
}

run();
