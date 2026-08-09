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
import { DEFAULT_CRYPTO_WATCHLIST, DEFAULT_GLOBAL_STOCKS_WATCHLIST, constructSetupId } from './sharedConfig.js';
import { startWebSocketPipeline, liveMemoryState } from './websocketEngine.js';
import { handleGeminiConnection } from './geminiEngine.js';
import { startAuditDaemon } from './auditDaemon.js';
import { startRegimeMonitor, registerClient } from './regimeMonitor.js';
import { getDb } from './mongoConfig.js';
import { runBacktest } from './backtestEngine.js';
import { executionManager } from './executionEngine.js';


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

fastify.decorateRequest('user', null);

fastify.addHook('onRequest', async (request, reply) => {
  const url = request.raw.url;
  
  // Protect specific REST routes
  if (url.startsWith('/api/execution/') || url.startsWith('/api/audit/')) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid Authorization header.' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      request.user = decoded;
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized: Invalid or expired token.' });
    }
  }
});

const connectedClients = new Set();
let isBrainRunning = false;
let dbReady = false;

// MongoDB users collection replaces memoryDb

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

  const db = await getDb();
  const user = await db.collection('users').findOne({ email });

  // Check hashed password against DB user
  const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  // Fallback: check against access code hash (for whalesonly bypass / admin initial setup)
  const accessCodeValid = !passwordValid ? await bcrypt.compare(password, ACCESS_CODE_HASH) : false;

  if (passwordValid || accessCodeValid) {
    const tokenPayload = { authenticated: true, email: user?.email || email, role: user?.role || 'trader' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
    return reply.send({ token, email: user?.email || email, role: user?.role || 'trader', promptsUsed: user?.promptsUsed || 0 });
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

  const db = await getDb();
  const existingUser = await db.collection('users').findOne({ email });
  
  if (existingUser) {
    return reply.code(409).send({ error: 'Account with this email already exists.' });
  }

  // Hash password before storing — NEVER store plaintext
  const passwordHash = await bcrypt.hash(password, 10);
  
  await db.collection('users').insertOne({
    name,
    email,
    passwordHash,
    role: 'trader',
    promptsUsed: 0,
    createdAt: new Date().toISOString()
  });

  const token = jwt.sign({ authenticated: true, email, role: 'trader' }, JWT_SECRET, { expiresIn: '24h' });
  return reply.send({ token, email, name, role: 'trader', promptsUsed: 0 });
});

fastify.post('/api/auth/paddle-sync', async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader) return reply.code(401).send({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const { role } = request.body || {};
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDb();
    
    const newRole = role || 'pro';

    // Update DB
    await db.collection('users').updateOne(
      { email: decoded.email },
      { $set: { role: newRole } }
    );
    
    // Issue a new token with updated role
    const newToken = jwt.sign({ authenticated: true, email: decoded.email, role: newRole }, JWT_SECRET, { expiresIn: '24h' });
    return reply.send({ token: newToken, role: newRole });
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
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
    const aiSignals = await db.collection('signals').find({}).sort({ timestamp: -1 }).limit(200).toArray();

    return reply.send({ activePaperTrades, closedPaperTrades, promptLogs, aiSignals });
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
      // Wait 4 hours for chat verifications by default
      const auditDueTime = new Date(Date.now() + 4 * 60 * 60 * 1000); 
      await db.collection('prompt_logs').insertOne({
        ...promptLog,
        timestamp: promptLog.timestamp || new Date().toISOString(),
        auditDue: auditDueTime,
        resolvedOutcome: null, // Will be CORRECT / INCORRECT / INCONCLUSIVE
        resolvedReason: null,  // Will be the LLM's explanation
        resolvedAt: null
      });
    }
    return reply.send({ success: true });
  } catch (e) {
    console.error('[AUDIT API] POST /api/audit/prompt failed:', e.message);
    return reply.code(500).send({ error: 'Failed to log prompt.' });
  }
});

fastify.get('/api/audit/prompts', async (request, reply) => {
  try {
    if (dbReady) {
      const db = await getDb();
      const audits = await db.collection('prompt_logs').find({}).sort({ timestamp: -1 }).limit(100).toArray();
      return reply.send(audits);
    }
    return reply.send([]);
  } catch (e) {
    console.error('[AUDIT API] GET /api/audit/prompts failed:', e.message);
    return reply.code(500).send({ error: 'Failed to fetch prompt audits.' });
  }
});

// =====================================================
// UNIFIED EXECUTION API (Paper + Angel One Live Trading)
// =====================================================

fastify.get('/api/execution/status', async (request, reply) => {
  return reply.send({
    mode: 'PAPER',
    isBrokerAuthenticated: false
  });
});

fastify.post('/api/execution/mode', async (request, reply) => {
  const { mode } = request.body || {};
  if (mode !== 'PAPER') {
    return reply.code(400).send({ error: 'Global Intelligence Terminal is strictly locked to PAPER mode.' });
  }
  return reply.send({ mode: 'PAPER', isBrokerAuthenticated: false });
});

fastify.post('/api/execution/trade', async (request, reply) => {
  const { asset, side, entryPrice, stopLoss, takeProfit, accountBalance, regime, mode } = request.body || {};
  if (!asset || !side || !entryPrice) {
    return reply.code(400).send({ error: 'asset, side, and entryPrice are required.' });
  }

  try {
    const engine = executionManager.getEngine(request.user.email);
    const result = await engine.executeTrade({
      asset,
      side,
      entryPrice: Number(entryPrice),
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
      accountBalance: accountBalance ? Number(accountBalance) : 100000,
      regime: regime || 'TRENDING',
      overrideMode: mode
    }, request.user.email);
    return reply.send(result);
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.post('/api/execution/reset', async (request, reply) => {
  try {
    const db = await getDb();
    if (db) {
      await db.collection('paper_trades').updateMany(
        { status: 'OPEN' },
        { $set: { status: 'CLOSED', closedAt: new Date().toISOString() } }
      );
    }
    return reply.send({ success: true, message: 'All open test trades cleared.' });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// Broker credentials logic has been deprecated.

// =====================================================
// NATIVE BACKTEST ENGINE API
// =====================================================
fastify.post('/api/backtest', async (request, reply) => {
  try {
    const { asset, days } = request.body || {};
    if (!asset) {
      return reply.code(400).send({ error: 'Asset ticker is required' });
    }

    const result = await runBacktest(asset, days || 730);
    
    if (result.error) {
       return reply.code(500).send(result);
    }

    return reply.send(result);
  } catch (error) {
    console.error('[BACKTEST API] Error:', error.message);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

// =====================================================
// PADDLE BILLING WEBHOOK API
// =====================================================

fastify.post('/api/paddle/webhook', async (request, reply) => {
  const signature = request.headers['paddle-signature'] || '';
  const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const webhookSecret = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET || process.env.PADDLE_WEBHOOK_SECRET_KEY || '';

  console.log('[PADDLE WEBHOOK] Event received at /api/paddle/webhook');

  try {
    let eventData = null;

    if (process.env.PADDLE_API_KEY && webhookSecret && signature) {
      try {
        const { Environment, Paddle } = await import('@paddle/paddle-node-sdk');
        const paddle = new Paddle(process.env.PADDLE_API_KEY, {
          environment: Environment.sandbox
        });
        eventData = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
      } catch (unmarshalErr) {
        console.warn('[PADDLE WEBHOOK] Unmarshal signature check fallback:', unmarshalErr.message);
        eventData = typeof request.body === 'object' ? request.body : JSON.parse(rawBody);
      }
    } else {
      eventData = typeof request.body === 'object' ? request.body : JSON.parse(rawBody || '{}');
    }

    const eventType = eventData?.event_type || eventData?.eventType;
    console.log(`[PADDLE WEBHOOK] Event Type: ${eventType || 'UNKNOWN'}`);

    if (dbReady) {
      const db = await getDb();
      if (db) {
        await db.collection('paddle_events').insertOne({
          eventId: eventData?.event_id || eventData?.eventId,
          eventType,
          data: eventData?.data,
          receivedAt: new Date().toISOString()
        });
        
        // Map user to Pro tier based on Paddle checkout custom_data
        const customData = eventData?.data?.custom_data || {};
        if (customData.userId && (eventType?.includes('subscription.created') || eventType?.includes('subscription.updated'))) {
          await db.collection('users').updateOne(
            { email: customData.userId },
            { $set: { role: 'pro' } }
          );
          console.log(`[PADDLE WEBHOOK] Upgraded user ${customData.userId} to pro tier.`);
        }
      }
    }

    return reply.send({ received: true });
  } catch (err) {
    console.error('[PADDLE WEBHOOK ERROR]', err.message);
    return reply.code(500).send({ error: 'Webhook processing error' });
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
          // 1. Verify Authentication
          const token = req.query.token;
          if (!token) {
            socket.send(JSON.stringify({ status: 'error', message: 'Unauthorized. Please login.' }));
            return socket.close(1008, 'Unauthorized');
          }

          let decoded;
          try {
            decoded = jwt.verify(token, JWT_SECRET);
          } catch (err) {
            socket.send(JSON.stringify({ status: 'error', message: 'Session expired. Please login again.' }));
            return socket.close(1008, 'Session Expired');
          }

          // 2. Check Trial Limits
          const db = await getDb();
          const user = await db.collection('users').findOne({ email: decoded.email });
          
          if (!user) {
            socket.send(JSON.stringify({ status: 'error', message: 'User not found.' }));
            return socket.close(1008, 'User Not Found');
          }

          const role = user.role || 'trader';
          const promptsUsed = user.promptsUsed || 0;

          if (role === 'trader' && promptsUsed >= 3) {
            socket.send(JSON.stringify({ 
              status: 'error', 
              message: 'FREE_TRIAL_EXCEEDED' 
            }));
            return; // Don't close socket immediately, let frontend handle the message
          }

          // 3. Increment Prompt Count
          await db.collection('users').updateOne(
            { email: decoded.email },
            { $inc: { promptsUsed: 1 } }
          );

          // 4. Run Analysis
          await handleGeminiConnection(socket, {
            prompt: message.prompt || '',
            imageBase64: message.image || null,
            language: message.language || 'English',
            isSimpleMode: message.isSimpleMode || false,
            promptsUsed: promptsUsed
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

  const activeWatchlist = [...DEFAULT_CRYPTO_WATCHLIST, ...DEFAULT_GLOBAL_STOCKS_WATCHLIST];

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
    // Initialize MongoDB (Strictly required for SaaS auth)
    try {
      const db = await getDb();
      dbReady = true;
      console.log('[INIT] MongoDB connected successfully');

      // Create indexes for users, paper trades and prompt logs
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('paper_trades').createIndex({ id: 1 }, { unique: true });
      await db.collection('paper_trades').createIndex({ status: 1, executedAt: -1 });
      await db.collection('prompt_logs').createIndex({ timestamp: -1 });
    } catch (dbErr) {
      console.error('[FATAL] MongoDB connection failed. MongoDB Atlas is REQUIRED for multi-tenant SaaS Auth.');
      console.error('[FATAL] Error:', dbErr.message);
      process.exit(1);
    }

    // Start Self-Healing Feedback Loop Daemons
    if (dbReady) {
      startAuditDaemon();
      startRegimeMonitor();

      // Note: State recovery for LIVE trades has been removed. All trades are purely PAPER now.
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
    console.error(err);
    process.exit(1);
  }
};

start();
