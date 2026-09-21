// =====================================================
// ADVANCED SECURITY MODULE (Tech Giant Standard)
// Implements strict payload validation, AI Bot blocking,
// and edge-level request termination.
// =====================================================

export function registerAdvancedSecurity(fastify) {
  
  // 1. BLOCKED USER AGENTS (AI Scrapers & Malicious Bots)
  const BLOCKED_AGENTS = [
    'GPTBot', 'ChatGPT-User', 'Google-Extended', 
    'Anthropic-ai', 'Claude-Web', 'CCBot', 
    'PerplexityBot', 'cohere-ai'
  ];

  fastify.addHook('onRequest', async (request, reply) => {
    // === AI BOT BLOCKER ===
    const userAgent = request.headers['user-agent'] || '';
    const isBlocked = BLOCKED_AGENTS.some(bot => userAgent.includes(bot));
    
    if (isBlocked) {
      console.warn(`[SECURITY] Blocked AI Bot/Scraper: ${userAgent} (IP: ${request.ip})`);
      return reply.code(403).send({ error: 'Access Denied: Automated scraping is prohibited.' });
    }
  });

  // 2. STRICT PAYLOAD VALIDATION & CSRF DEFENSE
  // Fastify already enforces bodyLimit, but we add an extra layer
  // to instantly drop abnormal content-types to prevent exploit chains.
  fastify.addHook('preValidation', async (request, reply) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers['content-type'] || '';
      
      // If it's an API request expecting JSON, but receives something else (e.g. form-data from a bot)
      if (request.url.startsWith('/api/') && contentType && !contentType.includes('application/json')) {
        return reply.code(415).send({ error: 'Unsupported Media Type. Only application/json is allowed.' });
      }
    }
  });

  console.log('[SECURITY] 🛡️ Advanced Tech Giant Security (Anti-Bot, Strict Payloads) Registered.');
}
