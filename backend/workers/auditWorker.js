import { parentPort } from 'worker_threads';
import { startAuditDaemon } from '../auditDaemon.js';
import { getDb } from '../mongoConfig.js';

async function run() {
  console.log('[WORKER: AUDIT] Initializing database and starting Audit Daemon...');
  
  try {
    // Initialize DB connection for this worker
    await getDb();
    
    // Start the continuous audit loop in the background thread
    startAuditDaemon();
    
    // Optional: communicate status back to the parent port
    if (parentPort) {
        parentPort.postMessage({ type: 'AUDIT_WORKER_STARTED' });
    }
  } catch (err) {
    console.error('[WORKER: AUDIT] Fatal Error:', err);
    process.exit(1);
  }
}

// Automatically start the loop when the worker is spawned
run();
