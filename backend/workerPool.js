import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const workerEvents = new EventEmitter();

let scannerWorker = null;
let auditWorker = null;

// Exponential backoff state for crash-loop prevention
const restartState = {
  scanner: { failures: 0, windowStart: Date.now() },
  audit:   { failures: 0, windowStart: Date.now() },
};

const MAX_FAILURES_PER_WINDOW = 5;     // Max crashes before giving up
const FAILURE_WINDOW_MS = 5 * 60_000;  // 5-minute sliding window
const BACKTEST_TIMEOUT_MS = 60_000;    // 60-second hard timeout for backtest workers

/**
 * Computes exponential backoff delay with a cap.
 * @param {number} failureCount - Number of consecutive failures
 * @returns {number} Delay in ms (5s, 10s, 20s, 40s, 60s max)
 */
function getBackoffDelay(failureCount) {
  return Math.min(5000 * Math.pow(2, failureCount), 60_000);
}

/**
 * Checks if a worker should be allowed to restart based on its failure history.
 * Resets the window if enough time has passed since the last failure burst.
 * @param {'scanner'|'audit'} workerName
 * @returns {boolean} true if restart is allowed
 */
function shouldRestart(workerName) {
  const state = restartState[workerName];
  const now = Date.now();

  // Reset failure window if the last burst was long ago
  if (now - state.windowStart > FAILURE_WINDOW_MS) {
    state.failures = 0;
    state.windowStart = now;
  }

  state.failures++;

  if (state.failures > MAX_FAILURES_PER_WINDOW) {
    console.error(`[WORKER POOL] ${workerName.toUpperCase()} Worker exceeded ${MAX_FAILURES_PER_WINDOW} crashes in ${FAILURE_WINDOW_MS / 1000}s. Halting restarts. Manual intervention required.`);
    return false;
  }

  return true;
}

/**
 * Starts the Scanner Worker Thread (Ghost Brain Loop)
 */
export function startScannerWorker() {
  if (scannerWorker) return;
  console.log('[WORKER POOL] Spawning Scanner Worker Thread...');
  
  scannerWorker = new Worker(path.join(__dirname, 'workers', 'scannerWorker.js'));

  scannerWorker.on('message', (message) => {
    if (message.type === 'GHOST_BRAIN_UPDATE') {
      workerEvents.emit('GHOST_BRAIN_UPDATE', message.payload);
    }
  });

  scannerWorker.on('error', (err) => {
    console.error('[WORKER POOL] Scanner Worker Error:', err);
  });

  scannerWorker.on('exit', (code) => {
    scannerWorker = null;

    if (!shouldRestart('scanner')) return;

    const delay = getBackoffDelay(restartState.scanner.failures);
    console.warn(`[WORKER POOL] Scanner Worker stopped with exit code ${code}. Restarting in ${delay / 1000}s... (attempt ${restartState.scanner.failures}/${MAX_FAILURES_PER_WINDOW})`);
    setTimeout(startScannerWorker, delay);
  });
}

/**
 * Starts the Audit Worker Thread (Database Verification Daemon)
 */
export function startAuditWorker() {
  if (auditWorker) return;
  console.log('[WORKER POOL] Spawning Audit Worker Thread...');
  
  auditWorker = new Worker(path.join(__dirname, 'workers', 'auditWorker.js'));

  auditWorker.on('error', (err) => {
    console.error('[WORKER POOL] Audit Worker Error:', err);
  });

  auditWorker.on('exit', (code) => {
    auditWorker = null;

    if (!shouldRestart('audit')) return;

    const delay = getBackoffDelay(restartState.audit.failures);
    console.warn(`[WORKER POOL] Audit Worker stopped with exit code ${code}. Restarting in ${delay / 1000}s... (attempt ${restartState.audit.failures}/${MAX_FAILURES_PER_WINDOW})`);
    setTimeout(startAuditWorker, delay);
  });
}

/**
 * Runs a Backtest on Demand in a short-lived worker thread.
 * Enforces a hard timeout to prevent indefinite hangs.
 */
export function runBacktestInWorker(asset, days) {
  return new Promise((resolve, reject) => {
    console.log(`[WORKER POOL] Spawning short-lived Backtest Worker for ${asset} (${days} days)`);
    const worker = new Worker(path.join(__dirname, 'workers', 'backtestWorker.js'), {
      workerData: { asset, days }
    });

    let settled = false;

    // Hard timeout — kill the worker if it takes too long
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error(`[WORKER POOL] Backtest Worker for ${asset} timed out after ${BACKTEST_TIMEOUT_MS / 1000}s. Terminating.`);
        worker.terminate();
        reject(new Error(`Backtest timed out after ${BACKTEST_TIMEOUT_MS / 1000} seconds.`));
      }
    }, BACKTEST_TIMEOUT_MS);

    worker.on('message', (result) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      }
    });

    worker.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Backtest Worker stopped with exit code ${code}`));
      }
    });
  });
}
