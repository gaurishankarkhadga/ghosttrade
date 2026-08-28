// =====================================================
// GHOSTTRADE SERVER — Institutional Fastify Gateway
// Wires ALL engines: Chat, Audit, Scanner, Daemons.
// Phase 7: Fortress Security Hardening Layer
// =====================================================

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// === Security Layer Imports ===
import { validateEnvironment } from './validateEnv.js';
import { registerSecurityMiddleware, validateWsOrigin, createWsRateLimiter } from './securityMiddleware.js';
import { sanitizeEmail, validatePassword, sanitizeString, sanitizeMongoQuery, sanitizeTicker, sanitizeName } from './inputValidator.js';

// Validate environment on startup (crashes in production if misconfigured)
validateEnvironment();

// === Engine Imports ===


import { 
  DEFAULT_CRYPTO_WATCHLIST, 
  DEFAULT_GLOBAL_STOCKS_WATCHLIST, 
  DEFAULT_INDIAN_STOCKS_WATCHLIST, 
  constructSetupId 
} from './sharedConfig.js';

import { startWebSocketPipeline, liveMemoryState } from './websocketEngine.js';
import { handleGeminiConnection } from './geminiEngine.js';
import { startAuditDaemon } from './auditDaemon.js';
import { startRegimeMonitor, registerClient } from './regimeMonitor.js';
import { getDb } from './mongoConfig.js';
import { executionManager } from './executionEngine.js';
import { startScannerWorker, startAuditWorker, runBacktestInWorker, workerEvents } from './workerPool.js';
import { getSystemPerformance } from './performanceEngine.js';
// === Global System Imports ===
import { storeBrokerKeys, deleteBrokerKeys, listConnectedBrokers, SUPPORTED_BROKERS } from './brokerKeyManager.js';
import { MARKET_REGIONS, listAvailableRegions, getTotalAssetCount, getWatchlistForRegions } from './globalWatchlists.js';
import { isMarketOpen, getOpenMarkets } from './marketHoursEngine.js';


// === Security ===
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] WARNING: JWT_SECRET not set in environment. Using insecure fallback. Set JWT_SECRET in .env for production!');
}
const JWT_SECRET = process.env.JWT_SECRET || 'ghost-brain-dev-secret-CHANGE-IN-PROD-0xDEV';
const JWT_ISSUER = 'ghosttrade';
const JWT_AUDIENCE = 'ghosttrade-client';
// Demo access kept for development/testing — will be removed in production deployment
const ACCESS_CODE_HASH = IS_PRODUCTION ? null : (process.env.ACCESS_CODE_HASH || '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

const fastify = Fastify({ logger: false, bodyLimit: 1048576 }); // 1MB default body limit

// Rate limiting — apply globally but stricter on auth routes
await fastify.register(fastifyRateLimit, {
  global: false, // Only apply where explicitly added
});

const ALLOWED_ORIGINS = [
  'https://ghosttradeai-test.netlify.app'
];

fastify.register(cors, {
  origin: 'https://ghosttradeai-test.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept', 'X-Request-ID'],
  credentials: true
});
fastify.register(fastifyWebsocket);

// === Register Fortress Security Middleware (Headers, Request IDs, Error Sanitization) ===
registerSecurityMiddleware(fastify);

// WebSocket rate limiter factory — 10 messages/second per connection
const wsRateLimiter = createWsRateLimiter(10, 1000);

// OAuth state tokens — TTL map for CSRF protection
const oauthStateTokens = new Map();

fastify.decorateRequest('user', null);

// === PUBLIC ROUTES (no auth required) ===
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/markets',
  '/api/paddle/webhook',
  '/api/chat/stream',
  '/api/broadcast',
];

fastify.addHook('onRequest', async (request, reply) => {
  const url = request.raw.url?.split('?')[0]; // Strip query params for matching
  
  // Skip auth for non-API routes (WebSocket upgrades handled separately)
  if (!url || !url.startsWith('/api/')) return;

  // Skip auth for explicitly public routes
  if (PUBLIC_ROUTES.some(route => url === route)) return;

  // ALL other /api/* routes require authentication
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    request.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid or expired token.' });
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
  const body = sanitizeMongoQuery(request.body || {});
  const { password } = body;
  
  // Validate email format and prevent NoSQL injection
  const emailCheck = sanitizeEmail(body.email);
  if (!emailCheck.valid) {
    return reply.code(400).send({ error: emailCheck.error || 'Invalid email format.' });
  }
  if (!password || typeof password !== 'string') {
    return reply.code(400).send({ error: 'Email and password are required.' });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ email: emailCheck.sanitized });

  // Check hashed password against DB user
  const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  // Demo fallback: only in development mode for testing
  const accessCodeValid = (!passwordValid && ACCESS_CODE_HASH) ? await bcrypt.compare(password, ACCESS_CODE_HASH) : false;

  if (passwordValid || accessCodeValid) {
    const tokenPayload = { 
      sub: user?.email || emailCheck.sanitized,
      email: user?.email || emailCheck.sanitized, 
      role: user?.role || 'trader',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
    return reply.send({ token, email: user?.email || emailCheck.sanitized, role: user?.role || 'trader', promptsUsed: user?.promptsUsed || 0 });
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
  const body = sanitizeMongoQuery(request.body || {});
  const { password } = body;

  // Validate email
  const emailCheck = sanitizeEmail(body.email);
  if (!emailCheck.valid) {
    return reply.code(400).send({ error: emailCheck.error || 'Invalid email format.' });
  }
  
  // Validate password strength
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) {
    return reply.code(400).send({ error: pwdCheck.error });
  }

  // Sanitize name
  const cleanName = sanitizeName(body.name);
  if (!cleanName) {
    return reply.code(400).send({ error: 'Valid name is required.' });
  }

  const db = await getDb();
  const existingUser = await db.collection('users').findOne({ email: emailCheck.sanitized });
  
  if (existingUser) {
    return reply.code(409).send({ error: 'Account with this email already exists.' });
  }

  // Hash password before storing — NEVER store plaintext
  const passwordHash = await bcrypt.hash(password, 12); // Increased cost factor from 10 to 12
  
  await db.collection('users').insertOne({
    name: cleanName,
    email: emailCheck.sanitized,
    passwordHash,
    role: 'trader',
    promptsUsed: 0,
    createdAt: new Date().toISOString()
  });

  const token = jwt.sign({ sub: emailCheck.sanitized, email: emailCheck.sanitized, role: 'trader', iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET, { expiresIn: '24h' });
  return reply.send({ token, email: emailCheck.sanitized, name: cleanName, role: 'trader', promptsUsed: 0 });
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
    const newToken = jwt.sign({ sub: decoded.email, email: decoded.email, role: newRole, iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET, { expiresIn: '24h' });
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
      return reply.send({ activePaperTrades: [], closedPaperTrades: [], promptLogs: [], systemPerformance: null });
    }
    const db = await getDb();
    const activePaperTrades = await db.collection('paper_trades').find({ status: { $in: ['OPEN', 'PENDING_CONFIRMATION'] } }).sort({ executedAt: -1 }).toArray();
    const closedPaperTrades = await db.collection('paper_trades').find({ status: { $in: ['WIN', 'LOSS', 'CANCELLED'] } }).sort({ closedAt: -1 }).limit(100).toArray();
    const promptLogs = await db.collection('prompt_logs').find({}).sort({ timestamp: -1 }).limit(200).toArray();
    const aiSignals = await db.collection('signals').find({}).sort({ timestamp: -1 }).limit(200).toArray();
    const systemPerformance = await getSystemPerformance();

    return reply.send({ activePaperTrades, closedPaperTrades, promptLogs, aiSignals, systemPerformance });
  } catch (e) {
    console.error('[AUDIT API] GET /api/audit failed:', e.message);
    return reply.send({ activePaperTrades: [], closedPaperTrades: [], promptLogs: [], systemPerformance: null });
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
  try {
    const engine = executionManager.getEngine(request.user.email);
    return reply.send({
      mode: engine.mode || 'PAPER',
      isBrokerAuthenticated: engine.isBrokerAuthenticated || false
    });
  } catch {
    return reply.send({ mode: 'PAPER', isBrokerAuthenticated: false });
  }
});

fastify.post('/api/execution/mode', async (request, reply) => {
  const { mode } = request.body || {};
  try {
    const engine = executionManager.getEngine(request.user.email);
    const result = await engine.setExecutionMode(mode, request.user.email);
    return reply.send(result);
  } catch (err) {
    return reply.send({ mode: 'PAPER', isBrokerAuthenticated: false, message: err.message });
  }
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

// =====================================================
// BROKER KEY MANAGEMENT API (Global Execution System)
// =====================================================

fastify.post('/api/broker/keys', async (request, reply) => {
  const { broker, apiKey, apiSecret, accountId, isPaper } = request.body || {};
  if (!broker || !apiKey) {
    return reply.code(400).send({ error: 'broker and apiKey are required.' });
  }
  if (!SUPPORTED_BROKERS.includes(broker)) {
    return reply.code(400).send({ error: `Unsupported broker. Supported: ${SUPPORTED_BROKERS.join(', ')}` });
  }
  try {
    await storeBrokerKeys(request.user.email, broker, { apiKey, apiSecret, accountId, isPaper: String(isPaper !== false) });
    return reply.send({ success: true, broker, message: `${broker} credentials stored securely (AES-256 encrypted).` });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.get('/api/broker/status', async (request, reply) => {
  try {
    const connected = await listConnectedBrokers(request.user.email);
    return reply.send({ brokers: connected, supportedBrokers: SUPPORTED_BROKERS });
  } catch (err) {
    return reply.send({ brokers: [], supportedBrokers: SUPPORTED_BROKERS });
  }
});

fastify.delete('/api/broker/keys/:broker', async (request, reply) => {
  const { broker } = request.params;
  try {
    await deleteBrokerKeys(request.user.email, broker);
    // Reset execution mode to PAPER after removing keys
    const engine = executionManager.getEngine(request.user.email);
    await engine.setExecutionMode('PAPER');
    return reply.send({ success: true, message: `${broker} credentials removed.` });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// =====================================================
// OAUTH FLOW API (Redirect Implementation)
// =====================================================

fastify.get('/api/broker/oauth/authorize', async (request, reply) => {
  const { broker } = request.query;
  if (!broker || !SUPPORTED_BROKERS.includes(broker)) {
    return reply.code(400).send({ error: 'Invalid broker for OAuth' });
  }
  
  const stateToken = crypto.randomBytes(16).toString('hex');
  const redirectUri = encodeURIComponent(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth/callback`);
  
  let authUrl = '';

  switch (broker) {
    case 'BINANCE':
      const binanceClientId = process.env.BINANCE_CLIENT_ID || 'GHOSTTRADE_DEMO_CLIENT_ID';
      authUrl = `https://accounts.binance.com/en/oauth/authorize?response_type=code&client_id=${binanceClientId}&redirect_uri=${redirectUri}&state=${stateToken}`;
      break;
    case 'ALPACA':
      const alpacaClientId = process.env.ALPACA_CLIENT_ID || 'GHOSTTRADE_DEMO_CLIENT_ID';
      authUrl = `https://app.alpaca.markets/oauth/authorize?response_type=code&client_id=${alpacaClientId}&redirect_uri=${redirectUri}&state=${stateToken}&scope=data,trading,account`;
      break;
    case 'IBKR':
      const ibkrClientId = process.env.IBKR_CLIENT_ID || 'GHOSTTRADE_DEMO_CLIENT_ID';
      authUrl = `https://ndcdyn.interactivebrokers.com/sso/Login?response_type=code&client_id=${ibkrClientId}&redirect_uri=${redirectUri}&state=${stateToken}`;
      break;
    default:
      return reply.code(400).send({ error: 'Broker not supported for OAuth yet' });
  }
  
  return reply.send({ url: authUrl });
});

fastify.post('/api/broker/oauth/callback', async (request, reply) => {
  const { broker, code, state } = request.body || {};
  if (!broker || !code) {
    return reply.code(400).send({ error: 'broker and code are required.' });
  }
  
  try {
    const redirectUri = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/oauth/callback` : 'http://localhost:5173/oauth/callback';
    let accessToken = '';
    let refreshToken = '';

    if (broker === 'ALPACA') {
      const clientId = process.env.ALPACA_CLIENT_ID;
      const clientSecret = process.env.ALPACA_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('Alpaca OAuth credentials not configured in backend.');

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);

      const tokenRes = await fetch('https://api.alpaca.markets/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`Alpaca OAuth failed: ${tokenData.message || JSON.stringify(tokenData)}`);
      
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;

    } else if (broker === 'BINANCE') {
      const clientId = process.env.BINANCE_CLIENT_ID;
      const clientSecret = process.env.BINANCE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('Binance OAuth credentials not configured in backend.');

      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      
      const tokenRes = await fetch('https://api.binance.com/oauth/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: params
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`Binance OAuth failed: ${tokenData.msg || JSON.stringify(tokenData)}`);
      
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;

    } else if (broker === 'IBKR') {
      const clientId = process.env.IBKR_CLIENT_ID;
      const clientSecret = process.env.IBKR_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('IBKR OAuth credentials not configured in backend.');

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      
      const tokenRes = await fetch('https://api.interactivebrokers.com/v1/oauth/access_token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: params
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`IBKR OAuth failed: ${tokenData.error || JSON.stringify(tokenData)}`);
      
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;

    } else {
      throw new Error('Unsupported broker for OAuth.');
    }

    // Store the real tokens securely
    await storeBrokerKeys(request.user.email, broker, { 
      apiKey: accessToken, 
      apiSecret: refreshToken, 
      accountId: 'oauth-linked', 
      isPaper: 'true' 
    });
    
    return reply.send({ success: true, broker, message: `${broker} OAuth connection established.` });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// =====================================================
// GLOBAL MARKET INFO API (Read-Only, No Auth Required)
// =====================================================

fastify.get('/api/markets', async (request, reply) => {
  const regions = {};
  for (const [key, data] of Object.entries(MARKET_REGIONS)) {
    const status = isMarketOpen(key);
    regions[key] = {
      name: data.name,
      timezone: data.timezone,
      hours: `${data.open} - ${data.close}`,
      is24h: data.is24h,
      broker: data.broker,
      assetCount: data.watchlist.length,
      isOpen: status.isOpen,
      status: status.reason,
    };
  }
  return reply.send({
    totalRegions: listAvailableRegions().length,
    totalAssets: getTotalAssetCount(),
    openNow: getOpenMarkets(),
    regions,
  });
});

// =====================================================
// NATIVE BACKTEST ENGINE API (Auth + Rate Limited)
// =====================================================
fastify.post('/api/backtest', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({ statusCode: 429, error: 'Backtest rate limit exceeded. Max 3 per minute.' })
    }
  }
}, async (request, reply) => {
  try {
    const body = sanitizeMongoQuery(request.body || {});
    const cleanTicker = sanitizeTicker(body.asset);
    if (!cleanTicker) {
      return reply.code(400).send({ error: 'Valid asset ticker is required.' });
    }
    const days = Math.min(Math.max(Number(body.days) || 730, 30), 1825); // Clamp 30-1825 days

    const result = await runBacktestInWorker(cleanTicker, days);
    
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
    // === SECURITY: Origin Validation ===
    if (!validateWsOrigin(req, ALLOWED_ORIGINS)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    // === SECURITY: Per-connection rate limiter ===
    const checkRate = wsRateLimiter(socket);

    console.log('[CHAT WS] Client connected to /api/chat/stream');

    socket.on('message', async (rawMessage) => {
      // Rate limit check
      if (!checkRate()) return;

      try {
        let message;
        try {
          message = JSON.parse(rawMessage.toString());
        } catch (parseErr) {
          socket.send(JSON.stringify({ status: 'error', message: 'Invalid message format.' }));
          return;
        }

        // === SECURITY: Message type whitelist ===
        if (message.type !== 'START_ANALYSIS') {
          socket.send(JSON.stringify({ status: 'error', message: 'Unknown message type.' }));
          return;
        }

        // 1. Verify Authentication
        const token = req.query.token;
        if (!token) {
          socket.send(JSON.stringify({ status: 'error', message: 'Unauthorized. Please login.' }));
          return socket.close(1008, 'Unauthorized');
        }

        let decoded;
        try {
          decoded = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
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

        // 4. Run Analysis (sanitize prompt input)
        const sanitizedPrompt = sanitizeString(message.prompt || '', 5000);
        await handleGeminiConnection(socket, {
          prompt: sanitizedPrompt || '',
          imageBase64: message.image || null,
          language: sanitizeString(message.language, 30) || 'English',
          isSimpleMode: !!message.isSimpleMode,
          promptsUsed: promptsUsed
        });
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

// Listen for updates from the Scanner Worker Thread
workerEvents.on('GHOST_BRAIN_UPDATE', broadcast);

// Secure WebSocket endpoint for the React UI (Ghost Brain)
fastify.register(async function brainRoutes(fastify) {
  fastify.get('/', { websocket: true }, (socket, req) => {
    // === SECURITY: Origin Validation ===
    if (!validateWsOrigin(req, ALLOWED_ORIGINS)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    const token = req.query.token;
    try {
      jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    } catch (e) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    connectedClients.add(socket);
    console.log(`[WS] Client Connected. Total viewers: ${connectedClients.size}`);

    // Register client for regime invalidation alerts
    registerClient(socket);

    // Start the engine if it's the first client
    startScannerWorker();

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
      startAuditWorker();
      startRegimeMonitor();

      // Note: State recovery for LIVE trades has been removed. All trades are purely PAPER now.
    }

    const PORT = process.env.PORT || 5000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
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
