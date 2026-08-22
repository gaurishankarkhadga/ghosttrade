// =====================================================
// DISCOVERY ENGINE — Phase 0 Dynamic Funnel
// Fetches the entire crypto market from Binance,
// filters for USDT pairs, sorts by 24h volume,
// and returns the Top 100 most active assets.
// =====================================================

let dynamicCryptoWatchlist = [];
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // Cache for 5 minutes to prevent rate limits

/**
 * Dynamically fetches the top 100 cryptos by 24h volume.
 */
export async function getDynamicCryptoWatchlist() {
    // Return cached list if within TTL
    if (Date.now() - lastFetchTime < CACHE_TTL && dynamicCryptoWatchlist.length > 0) {
        return dynamicCryptoWatchlist;
    }

    try {
        console.log(`[DISCOVERY] Fetching active market data from Binance (Phase 0 Funnel)...`);
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Invalid response from Binance API');
        }

        // Filter for valid USDT pairs (exclude stablecoin-to-stablecoin pairs)
        const usdtPairs = data.filter(ticker => 
            ticker.symbol.endsWith('USDT') && 
            !ticker.symbol.includes('USDC') &&
            !ticker.symbol.includes('FDUSD') &&
            !ticker.symbol.includes('TUSD') &&
            !ticker.symbol.includes('BUSD') &&
            !ticker.symbol.includes('EUR')
        );

        // Sort by quoteVolume (USD Volume) descending
        usdtPairs.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

        // Take the Top 100
        const top100 = usdtPairs.slice(0, 100);

        // Map to GhostTrade ticker format (e.g., BTCUSDT -> BTC-USD)
        dynamicCryptoWatchlist = top100.map(t => {
            const base = t.symbol.replace('USDT', '');
            return `${base}-USD`;
        });

        lastFetchTime = Date.now();
        console.log(`[DISCOVERY] Top 100 Active Cryptos Updated. Top 5: ${dynamicCryptoWatchlist.slice(0, 5).join(', ')}`);
        
        return dynamicCryptoWatchlist;
    } catch (err) {
        console.error(`[DISCOVERY] Failed to fetch dynamic watchlist:`, err.message);
        
        // Graceful fallback to static list if Binance API is unreachable
        if (dynamicCryptoWatchlist.length === 0) {
            console.log(`[DISCOVERY] Falling back to DEFAULT_CRYPTO_WATCHLIST.`);
            const { DEFAULT_CRYPTO_WATCHLIST } = await import('./sharedConfig.js');
            return DEFAULT_CRYPTO_WATCHLIST;
        }
        
        return dynamicCryptoWatchlist;
    }
}
