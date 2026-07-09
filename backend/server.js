import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { handleGeminiConnection } from './geminiEngine.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Rate limiting state
// Structure: Map<ip, { count: number, resetTime: number }>
const rateLimits = new Map();
const MAX_REQUESTS_PER_MIN = 10;
const RESET_INTERVAL_MS = 60 * 1000;

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
});

const wss = new WebSocketServer({ 
  server, 
  path: '/stream',
  maxPayload: 10 * 1024 * 1024, // 10MB DoS protection limit
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    // Strictly allow only Chrome Extensions or Localhost
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost')) {
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

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (${ip})`);
  });
});
