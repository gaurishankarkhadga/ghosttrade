// =====================================================
// MARKET HOURS ENGINE — Timezone-Aware Session Logic
// Determines if a market is currently open, in pre-market,
// or closed. Used by the scanner to avoid scanning closed
// markets (saves API calls and prevents stale signals).
//
// DOES NOT modify scannerEngine.js behavior — only provides
// utility functions that can be optionally called.
// =====================================================

import { MARKET_REGIONS } from './globalWatchlists.js';

/**
 * Gets the current time in a specific timezone.
 * Uses Intl.DateTimeFormat for zero-dependency timezone conversion.
 * 
 * @param {string} timezone — IANA timezone (e.g., 'America/New_York')
 * @returns {{ hours: number, minutes: number, dayOfWeek: number }}
 */
function getTimeInTimezone(timezone) {
  const now = new Date();
  
  // Use Intl to get localized time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value || 'Mon';

  const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const dayOfWeek = dayMap[weekday] || 1;

  return { hours, minutes, dayOfWeek };
}

/**
 * Checks if a specific market region is currently open.
 * 
 * @param {string} regionKey — e.g., 'US', 'JAPAN', 'CRYPTO'
 * @returns {{ isOpen: boolean, reason: string, nextOpen: string|null }}
 */
export function isMarketOpen(regionKey) {
  const region = MARKET_REGIONS[regionKey.toUpperCase()];
  if (!region) {
    return { isOpen: false, reason: `Unknown region: ${regionKey}` };
  }

  // 24h markets (Crypto, Forex) are always open
  if (region.is24h) {
    return { isOpen: true, reason: `${region.name} trades 24/7` };
  }

  const { hours, minutes, dayOfWeek } = getTimeInTimezone(region.timezone);
  const currentMinutes = hours * 60 + minutes;

  // Weekend check (most stock markets closed Sat/Sun)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isOpen: false, reason: `${region.name} is closed (weekend)`, nextOpen: 'Monday' };
  }

  // Parse market hours
  const [openH, openM] = region.open.split(':').map(Number);
  const [closeH, closeM] = region.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
    const minutesLeft = closeMinutes - currentMinutes;
    return { isOpen: true, reason: `${region.name} is open (${minutesLeft} min until close)` };
  }

  if (currentMinutes < openMinutes) {
    const minutesUntilOpen = openMinutes - currentMinutes;
    return { isOpen: false, reason: `${region.name} opens in ${minutesUntilOpen} minutes`, nextOpen: region.open };
  }

  return { isOpen: false, reason: `${region.name} is closed for the day`, nextOpen: region.open };
}

/**
 * Returns all currently open market regions.
 * @returns {string[]} — Array of open region keys
 */
export function getOpenMarkets() {
  return Object.keys(MARKET_REGIONS).filter(key => isMarketOpen(key).isOpen);
}

/**
 * Returns the appropriate broker for a given ticker based on its exchange suffix.
 * @param {string} ticker — e.g., 'RELIANCE.NS', 'AAPL', 'BTC-USD'
 * @returns {string} — Broker identifier (e.g., 'BINANCE', 'ALPACA', 'IBKR')
 */
export function getBrokerForTicker(ticker) {
  if (!ticker) return 'PAPER';

  const upper = ticker.toUpperCase();

  // Crypto detection
  if (upper.includes('-USD') && !upper.includes('.')) {
    const cryptoTickers = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'MATIC',
      'LTC', 'DOT', 'UNI', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE'];
    const base = upper.split('-')[0];
    if (cryptoTickers.includes(base)) return 'BINANCE';
  }

  // Indian stocks
  if (upper.endsWith('.NS') || upper.endsWith('.BO')) return 'IBKR'; // IBKR supports NSE

  // Forex
  if (upper.endsWith('=X')) return 'IBKR';

  // International exchanges → IBKR
  const intlSuffixes = ['.L', '.T', '.HK', '.DE', '.AX', '.KS', '.TO', '.SA', '.PA', '.AS', '.SI', '.MI', '.SW', '.ST'];
  for (const suffix of intlSuffixes) {
    if (upper.endsWith(suffix)) return 'IBKR';
  }

  // US stocks (no suffix) → Alpaca
  if (!upper.includes('.') && !upper.includes('-') && !upper.includes('=')) return 'ALPACA';

  return 'IBKR'; // Default fallback for unknown
}

/**
 * Determines the market region for a given ticker.
 * @param {string} ticker
 * @returns {string} — Region key (e.g., 'US', 'INDIA', 'CRYPTO')
 */
export function getRegionForTicker(ticker) {
  if (!ticker) return 'US';

  const upper = ticker.toUpperCase();

  if (upper.includes('-USD') && !upper.includes('.')) return 'CRYPTO';
  if (upper.endsWith('.NS') || upper.endsWith('.BO')) return 'INDIA';
  if (upper.endsWith('.L')) return 'UK';
  if (upper.endsWith('.T')) return 'JAPAN';
  if (upper.endsWith('.HK')) return 'HONGKONG';
  if (upper.endsWith('.DE') || upper.endsWith('.PA') || upper.endsWith('.AS')) return 'EUROPE';
  if (upper.endsWith('.AX')) return 'AUSTRALIA';
  if (upper.endsWith('.KS')) return 'KOREA';
  if (upper.endsWith('.TO')) return 'CANADA';
  if (upper.endsWith('.SA')) return 'BRAZIL';
  if (upper.endsWith('.SI')) return 'SINGAPORE';
  if (upper.endsWith('=X')) return 'FOREX';

  return 'US'; // No suffix = US stock
}
