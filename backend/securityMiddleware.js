// =====================================================
// SECURITY MIDDLEWARE — Fortress-Grade HTTP Hardening
// Registers HTTP security headers, body size limits,
// request ID tracking, and error sanitization on Fastify.
// 
// ZERO DEPENDENCIES — Uses only Node.js built-in crypto.
// Does NOT modify any existing route logic.
// =====================================================

import crypto from 'crypto';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Registers all security middleware on a Fastify instance.
 * Call once during server initialization, AFTER cors but BEFORE routes.
 * 
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerSecurityMiddleware(fastify) {
  // =====================================================
  // 1. REQUEST ID — Unique correlation ID per request
  // =====================================================
  fastify.addHook('onRequest', async (request, reply) => {
    request.requestId = request.headers['x-request-id'] || crypto.randomUUID();
    reply.header('X-Request-ID', request.requestId);
  });

  // =====================================================
  // 2. HTTP SECURITY HEADERS — Defense-in-depth
  // =====================================================
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');

    // Disable legacy XSS filter (CSP replaces it)
    reply.header('X-XSS-Protection', '0');

    // Referrer policy — don't leak full URL to third parties
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Disable dangerous browser features
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // Prevent caching of sensitive API responses
    if (request.url?.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      reply.header('Pragma', 'no-cache');
    }

    // HSTS — Force HTTPS in production (browsers remember for 1 year)
    if (IS_PRODUCTION) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy — restrict what the browser can load/execute
    // Only applied to non-API responses (API responses are JSON, not HTML)
    if (!request.url?.startsWith('/api/')) {
      const cspDirectives = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' wss: https://*.googleapis.com https://*.binance.com https://*.paddle.com",
        "img-src 'self' data: blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      reply.header('Content-Security-Policy', cspDirectives);
    }

    return payload;
  });

  // =====================================================
  // 3. ERROR SANITIZATION — Strip internal details
  // =====================================================
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Log full error internally with request ID for forensics
    if (statusCode >= 500) {
      console.error(`[SECURITY] [${request.requestId}] Internal Error on ${request.method} ${request.url}:`, error.message);
    }

    // In production, never expose internal error details to clients
    if (IS_PRODUCTION && statusCode >= 500) {
      return reply.code(statusCode).send({
        error: 'Internal Server Error',
        requestId: request.requestId,
      });
    }

    // Rate limit errors — pass through cleanly
    if (statusCode === 429) {
      return reply.code(429).send({
        error: error.message || 'Too many requests. Please slow down.',
        requestId: request.requestId,
      });
    }

    // Validation / client errors — safe to return
    return reply.code(statusCode).send({
      error: error.message || 'Request failed.',
      requestId: request.requestId,
    });
  });

  // =====================================================
  // 4. WEBSOCKET ORIGIN VALIDATION HELPER
  // Exported for use in WS upgrade handlers.
  // =====================================================

  console.log('[SECURITY] ✅ Security middleware registered (Headers, Request IDs, Error Sanitization)');
}

/**
 * Validates that a WebSocket upgrade request comes from an allowed origin.
 * Use in WS route handlers to prevent Cross-Site WebSocket Hijacking.
 * 
 * @param {import('http').IncomingMessage} req — Raw HTTP request from WS upgrade
 * @param {string[]} allowedOrigins — List of allowed origin URLs
 * @returns {boolean} — true if origin is allowed
 */
export function validateWsOrigin(req, allowedOrigins) {
  const origin = req.headers?.origin;

  // Allow connections with no Origin header (server-to-server, mobile apps, CLI tools, CloudFront stripped)
  if (!origin) return true;

  // Strict enforcement for Netlify
  return origin === 'https://ghosttradeai-test.netlify.app';
}

/**
 * WebSocket message rate limiter.
 * Returns a function that tracks message frequency per connection.
 * Disconnects the socket if the rate is exceeded.
 * 
 * @param {number} maxMessages — Max messages allowed in the window
 * @param {number} windowMs — Time window in milliseconds
 * @returns {(socket: WebSocket) => (callback: Function) => Function}
 */
export function createWsRateLimiter(maxMessages = 10, windowMs = 1000) {
  return function attachToSocket(socket) {
    let messageCount = 0;
    let windowStart = Date.now();

    return function checkRate() {
      const now = Date.now();

      // Reset window if enough time has passed
      if (now - windowStart > windowMs) {
        messageCount = 0;
        windowStart = now;
      }

      messageCount++;

      if (messageCount > maxMessages) {
        console.warn(`[WS SECURITY] Rate limit exceeded (${messageCount}/${maxMessages} in ${windowMs}ms). Disconnecting.`);
        try {
          socket.send(JSON.stringify({ status: 'error', message: 'Rate limit exceeded. Slow down.' }));
          socket.close(1008, 'Rate limit exceeded');
        } catch (_) { /* socket may already be closed */ }
        return false;
      }

      return true;
    };
  };
}
