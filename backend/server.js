// =====================================================
// GHOSTTRADE SERVER — Institutional Fastify Gateway
// Wires ALL engines: Chat, Audit, Scanner, Daemons.
// =====================================================

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// === Engine Imports ===
import { runBulkScanPhase4 } from './scannerEngine.js';
import { DEFAULT_CRYPTO_WATCHLIST, DEFAULT_NSE_WATCHLIST } from './sharedConfig.js';
import { startWebSocketPipeline, liveMemoryState } from './websocketEngine.js';
import { handleGeminiConnection } from './geminiEngine.js';
import { startAuditDaemon } from './auditDaemon.js';
import { startRegimeMonitor, registerClient } from './regimeMonitor.js';
import { getDb } from './mongoConfig.js';

// === Security ===
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] WARNING: JWT_SECRET not set in environment. Using insecure fallback. Set JWT_SECRET in .env for production!');
}
const JWT_SECRET = process.env.JWT_SECRET || 'ghost-brain-dev-secret-CHANGE-IN-PROD-0xDEV';
const ACCESS_CODE_HASH = process.env.ACCESS_CODE_HASH || '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // bcrypt hash of 'whalesonly'

const fastify = Fastify({ logger: false });

// Rate limiting — apply globally but stricter on auth routes
await fastify.register(fastifyRateLimit, {
  global: false, // Only apply where explicitly added
});

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl) or matching allowed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: Origin not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
});
fastify.register(fastifyWebsocket);

const connectedClients = new Set();
let isBrainRunning = false;
let dbReady = false;

// In-Memory User Database — passwords stored as bcrypt hashes ONLY
// To generate a hash: node -e "const b=require('bcryptjs'); b.hash('yourpassword',10).then(console.log)"
const memoryDb = {
  users: [
    {
      email: 'trader@ghosttrade.io',
      // bcrypt hash of 'whalesonly' (cost=10)
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      role: 'admin'
    }
  ]
};

// =====================================================
// AUTH ROUTES
// =====================================================

fastify.post('/api/auth/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({ statusCode: 429, error: 'Too many login attempts. Please wait 1 minute.' })
    }
  }
}, async (request, reply) => {
  const { email, password } = request.body;
  if (!email || !password) {
    return reply.code(400).send({ error: 'Email and password are required.' });
  }

  const user = memoryDb.users.find(u => u.email === email);

  // Check hashed password against DB user
  const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  // Fallback: check against access code hash (for whalesonly bypass)
  const accessCodeValid = !passwordValid ? await bcrypt.compare(password, ACCESS_CODE_HASH) : false;

  if (passwordValid || accessCodeValid) {
    const tokenPayload = { authenticated: true, email: user?.email || email, role: user?.role || 'trader' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
    return reply.send({ token, email: user?.email || email });
  }

  return reply.code(401).send({ error: 'Invalid credentials. Access Denied.' });
});

fastify.post('/api/auth/signup', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({ statusCode: 429, error: 'Too many signup attempts. Please wait 1 minute.' })
    }
  }
}, async (request, reply) => {
  const { name, email, password } = request.body;

  if (!email || !password) {
    return reply.code(400).send({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
  }

  const existingUser = memoryDb.users.find(u => u.email === email);
  if (existingUser) {
    return reply.code(409).send({ error: 'Account with this email already exists.' });
  }

  // Hash password before storing — NEVER store plaintext
  const passwordHash = await bcrypt.hash(password, 10);
  memoryDb.users.push({ name, email, passwordHash, role: 'trader' });

  const token = jwt.sign({ authenticated: true, email, role: 'trader' }, JWT_SECRET, { expiresIn: '24h' });
  return reply.send({ token, email, name });
});

// =====================================================
// AUDIT REST ROUTES (Paper Trading + Prompt Logs)
// =====================================================

fastify.get('/api/audit', async (request, reply) => {
  try {
    if (!dbReady) {
      return reply.send({ activePaperTrades: [], closedPaperTrades: [], promptLogs: [] });
    }
    const db = await getDb();
    const activePaperTrades = await db.collection('paper_trades').find({ status: { $in: ['OPEN', 'PENDING_CONFIRMATION'] } }).sort({ executedAt: -1 }).toArray();
    const closedPaperTrades = await db.collection('paper_trades').find({ status: { $in: ['WIN', 'LOSS', 'CANCELLED'] } }).sort({ closedAt: -1 }).limit(100).toArray();
    const promptLogs = await db.collection('prompt_logs').find({}).sort({ timestamp: -1 }).limit(200).toArray();

    return reply.send({ activePaperTrades, closedPaperTrades, promptLogs });
  } catch (e) {
    console.error('[AUDIT API] GET /api/audit failed:', e.message);
    return reply.send({ activePaperTrades: [], closedPaperTrades: [], promptLogs: [] });
  }
});

fastify.post('/api/audit/trade', async (request, reply) => {
  try {
    const trade = request.body;
    if (!trade || !trade.id) {
      return reply.code(400).send({ error: 'Trade data with id is required.' });
    }
    if (dbReady) {
      const db = await getDb();
      await db.collection('paper_trades').updateOne(
        { id: trade.id },
        { $set: trade },
        { upsert: true }
      );
    }
    return reply.send({ success: true, id: trade.id });
  } catch (e) {
    console.error('[AUDIT API] POST /api/audit/trade failed:', e.message);
    return reply.code(500).send({ error: 'Failed to log trade.' });
  }
});

fastify.put('/api/audit/trade/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    const updates = request.body;
    if (dbReady) {
      const db = await getDb();
      await db.collection('paper_trades').updateOne(
        { id },
        { $set: updates }
      );
    }
    return reply.send({ success: true, id });
  } catch (e) {
    console.error('[AUDIT API] PUT /api/audit/trade/:id failed:', e.message);
    return reply.code(500).send({ error: 'Failed to update trade.' });
  }
});

fastify.post('/api/audit/prompt', async (request, reply) => {
  try {
    const promptLog = request.body;
    if (dbReady) {
      const db = await getDb();
      await db.collection('prompt_logs').insertOne({
        ...promptLog,
        timestamp: promptLog.timestamp || new Date().toISOString()
      });
    }
    return reply.send({ success: true });
  } catch (e) {
    console.error('[AUDIT API] POST /api/audit/prompt failed:', e.message);
    return reply.code(500).send({ error: 'Failed to log prompt.' });
  }
});

// =====================================================
// CHAT WEBSOCKET — AI Analysis Pipeline (Text + Image)
// =====================================================

fastify.register(async function chatRoutes(fastify) {
  fastify.get('/api/chat/stream', { websocket: true }, (socket, req) => {
    console.log('[CHAT WS] Client connected to /api/chat/stream');

    socket.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === 'START_ANALYSIS') {
          await handleGeminiConnection(socket, {
            prompt: message.prompt || '',
            imageBase64: message.image || null,
            language: message.language || 'English'
          });
        }
      } catch (err) {
        console.error('[CHAT WS] Processing error:', err.message);
        try {
          socket.send(JSON.stringify({
            status: 'error',
            message: 'Analysis engine encountered an error. Please try again.'
          }));
        } catch (_) { /* socket may be closed */ }
      }
    });

    socket.on('close', () => {
      console.log('[CHAT WS] Client disconnected from /api/chat/stream');
    });
  });
});

// =====================================================
// GHOST BRAIN WEBSOCKET — Scanner Broadcast
// =====================================================

function broadcast(payload) {
  const message = JSON.stringify({ type: 'GHOST_BRAIN_UPDATE', payload });
  for (const client of connectedClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

async function runGhostBrainLoop() {
  if (isBrainRunning) return;
  isBrainRunning = true;

  console.log('[DAEMON] Starting Ghost Brain Multi-Market Backend Loop (Binance + NSE)...');

  // Start WebSocket for Crypto level 2 depth
  await startWebSocketPipeline(DEFAULT_CRYPTO_WATCHLIST);

  const activeWatchlist = [...DEFAULT_CRYPTO_WATCHLIST, ...DEFAULT_NSE_WATCHLIST];

  console.log('[DAEMON] Waiting for initial order flow telemetry buffer to fill...');
  for (let i = 0; i < 15; i++) {
    const btcTrades = liveMemoryState.aggTrades['BTC-USD'];
    if (btcTrades && btcTrades.length > 0) {
      console.log(`[DAEMON] Telemetry buffer filled (${btcTrades.length} trades). Proceeding to initial scan.`);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Run initial scan
  try {
    console.log('[DAEMON] Executing initial multi-market scan...');
    const initialResults = await runBulkScanPhase4(activeWatchlist);
    broadcast(initialResults);
  } catch (e) {
    console.error('[DAEMON] Initial scan error:', e.message);
  }

  // Continuous loop
  while (true) {
    if (connectedClients.size > 0) {
      try {
        const results = await runBulkScanPhase4(activeWatchlist);
        broadcast(results);
      } catch (e) {
        console.error('[DAEMON] Loop error:', e.message);
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Secure WebSocket endpoint for the React UI (Ghost Brain)
fastify.register(async function brainRoutes(fastify) {
  fastify.get('/', { websocket: true }, (socket, req) => {
    const token = req.query.token;
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (e) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    connectedClients.add(socket);
    console.log(`[WS] Client Connected. Total viewers: ${connectedClients.size}`);

    // Register client for regime invalidation alerts
    registerClient(socket);

    // Start the engine if it's the first client
    runGhostBrainLoop();

    socket.on('close', () => {
      connectedClients.delete(socket);
      console.log(`[WS] Client Disconnected. Total viewers: ${connectedClients.size}`);
    });
  });
});

// =====================================================
// SERVER STARTUP — Initialize DB + Daemons
// =====================================================

const start = async () => {
  try {
    // Initialize MongoDB (graceful — app works without it)
    try {
      await getDb();
      dbReady = true;
      console.log('[INIT] MongoDB connected successfully');

      // Create indexes for paper trades and prompt logs
      const db = await getDb();
      await db.collection('paper_trades').createIndex({ id: 1 }, { unique: true });
      await db.collection('paper_trades').createIndex({ status: 1, executedAt: -1 });
      await db.collection('prompt_logs').createIndex({ timestamp: -1 });
    } catch (dbErr) {
      console.warn('[INIT] MongoDB connection failed — running without persistence:', dbErr.message);
      console.warn('[INIT] Set MONGODB_URI in .env for persistent storage (MongoDB Atlas recommended)');
    }

    // Start Self-Healing Feedback Loop Daemons
    if (dbReady) {
      startAuditDaemon();
      startRegimeMonitor();
    }

    await fastify.listen({ port: 5000, host: '0.0.0.0' });
    console.log('🚀 GhostTrade Server listening on http://localhost:5000');
    console.log('   ├── /api/auth/login      (POST)');
    console.log('   ├── /api/auth/signup     (POST)');
    console.log('   ├── /api/audit           (GET)');
    console.log('   ├── /api/audit/trade     (POST)');
    console.log('   ├── /api/audit/trade/:id (PUT)');
    console.log('   ├── /api/audit/prompt    (POST)');
    console.log('   ├── /api/chat/stream     (WS)');
    console.log('   └── /                    (WS - Ghost Brain)');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
