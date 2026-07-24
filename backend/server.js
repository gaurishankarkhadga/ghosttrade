import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { handleGeminiConnection } from './geminiEngine.js';
import { startAuditDaemon, stopAuditDaemon } from './auditDaemon.js';
import { startRegimeMonitor, stopRegimeMonitor, registerClient } from './regimeMonitor.js';
import { generateCalibrationReport } from './calibrationEngine.js';
import { closeDb } from './mongoConfig.js';
import { runBulkScan, DEFAULT_CRYPTO_WATCHLIST } from './scannerEngine.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Phase 3: Calibration Endpoint
app.get('/api/calibration', async (req, res) => {
  const days = parseInt(req.query.days) || 90;
  const report = await generateCalibrationReport(days);
  if (report.error) {
    return res.status(500).json(report);
  }
  res.json(report);
});

// Phase 4: Bulk Scanner Endpoint
app.post('/api/scan', async (req, res) => {
  const tickers = req.body.tickers || DEFAULT_CRYPTO_WATCHLIST;
  try {
    const results = await runBulkScan(tickers);
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

const PORT = process.env.PORT || 5000;

// Rate limiting state
// Structure: Map<ip, { count: number, resetTime: number }>
const rateLimits = new Map();
const MAX_REQUESTS_PER_MIN = 10;
const RESET_INTERVAL_MS = 60 * 1000;

// Cleanup expired rate limit entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits) {
    if (now > record.resetTime) rateLimits.delete(ip);
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record) {
    rateLimits.set(ip, { count: 1, resetTime: now + RESET_INTERVAL_MS });
    return true; // Allowed
  }

  if (now > record.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + RESET_INTERVAL_MS });
    return true; // Allowed
  }

  if (record.count >= MAX_REQUESTS_PER_MIN) {
    return false; // Blocked
  }

  record.count += 1;
  return true; // Allowed
}

const server = app.listen(PORT, () => {
  console.log(`Unbreakable Gateway listening on port ${PORT}`);
  
  // §1.2 — Start the Self-Healing Audit Daemon
  startAuditDaemon();
  
  // Phase 3 — Start Real-time Regime Monitor
  startRegimeMonitor();
});

const wss = new WebSocketServer({ 
  server, 
  path: '/stream',
  maxPayload: 10 * 1024 * 1024, // 10MB DoS protection limit
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, require an origin header — blocks server-side bots/scripts
    if (!origin) {
      if (isProduction) {
        console.warn('[SECURITY] Blocked WS connection with no origin header (production mode)');
        return callback(false, 403, 'Forbidden');
      }
      // Local dev: allow null origin for testing tools (Postman, wscat, etc.)
      return callback(true);
    }

    // Strictly allow only Chrome Extensions or Localhost
    if (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost')) {
      callback(true);
    } else {
      console.warn(`[SECURITY] Blocked unauthorized WS connection from origin: ${origin}`);
      callback(false, 403, 'Forbidden');
    }
  }
});

wss.on('connection', (ws, req) => {
  // Read from Render's load balancer forwarded header to prevent IP spoofing
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  
  console.log(`[WS] Client connected from ${ip}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'image_payload') {
        if (!checkRateLimit(ip)) {
          console.warn(`[RATE LIMIT] Blocked ${ip}`);
          ws.send(JSON.stringify({ status: 'error', message: 'API Congestion. Rate limit exceeded (Max 10 per minute). Retrying later.' }));
          return;
        }

        console.log(`[WS] Received image payload, routing to Gemini Engine`);
        handleGeminiConnection(ws, data.image);
      }
    } catch (e) {
      console.error('[WS] Failed to parse message', e);
    }
  });

  // Phase 3 — Register client for regime invalidation events
  registerClient(ws);

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (${ip})`);
  });
});

// === Graceful Shutdown ===
async function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] ${signal} received. Cleaning up...`);
  stopAuditDaemon();
  stopRegimeMonitor();
  await closeDb();
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
