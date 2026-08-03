// =====================================================
// ASYNC PIPELINE — In-Memory High-Speed Circular Buffer
// Fast zero-latency market data caching to accelerate
// quantitative scanner passes and reduce network round-trips.
// =====================================================

const MEMORY_CACHE = new Map();
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds cache TTL for 15m/1h bars

/**
 * Caches market data candles in-memory with expiration TTL.
 * 
 * @param {string} ticker 
 * @param {string} timeframe 
 * @param {Array} candles 
 * @param {number} ttlMs 
 */
export function cacheMarketData(ticker, timeframe, candles, ttlMs = DEFAULT_TTL_MS) {
  if (!ticker || !timeframe || !candles) return;
  const key = `${ticker.toUpperCase()}_${timeframe.toLowerCase()}`;
  MEMORY_CACHE.set(key, {
    candles,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
}

/**
 * Retrieves cached market data if valid and unexpired.
 * 
 * @param {string} ticker 
 * @param {string} timeframe 
 * @returns { Array | null } - candles or null if expired/miss
 */
export function getCachedMarketData(ticker, timeframe) {
  if (!ticker || !timeframe) return null;
  const key = `${ticker.toUpperCase()}_${timeframe.toLowerCase()}`;
  const entry = MEMORY_CACHE.get(key);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    MEMORY_CACHE.delete(key);
    return null;
  }

  return entry.candles;
}

/**
 * Clears expired items or flushes memory cache completely.
 */
export function clearCache(all = false) {
  if (all) {
    MEMORY_CACHE.clear();
    return;
  }

  const now = Date.now();
  for (const [key, entry] of MEMORY_CACHE.entries()) {
    if (now > entry.expiresAt) {
      MEMORY_CACHE.delete(key);
    }
  }
}
