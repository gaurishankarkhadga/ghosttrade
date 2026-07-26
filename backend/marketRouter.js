/**
 * Market Router Module
 * Classifies tickers into Market Types (CRYPTO vs NSE/INDIAN) and routes data fetching.
 */

export const MARKET_TYPES = {
    CRYPTO: 'CRYPTO',
    NSE: 'NSE'
};

export const DEFAULT_WATCHLISTS = {
    CRYPTO: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    NSE: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', '^NSEI']
};

/**
 * Detects the market type of a given symbol.
 * @param {string} symbol - e.g. "BTC-USD", "RELIANCE.NS", "^NSEI", "BINANCE:BTC-USD", "NSE:RELIANCE"
 * @returns {object} { symbol, marketType, cleanSymbol }
 */
export function parseTicker(symbol) {
    if (!symbol || typeof symbol !== 'string') {
        throw new Error(`Invalid ticker symbol provided to marketRouter: ${symbol}`);
    }

    let clean = symbol.trim().toUpperCase();
    let marketType = MARKET_TYPES.CRYPTO;

    if (clean.startsWith('NSE:') || clean.endsWith('.NS') || clean.endsWith('.BO') || clean === '^NSEI' || clean === '^BSESN') {
        marketType = MARKET_TYPES.NSE;
        clean = clean.replace('NSE:', '');
    } else if (clean.startsWith('BINANCE:')) {
        marketType = MARKET_TYPES.CRYPTO;
        clean = clean.replace('BINANCE:', '');
    }

    return {
        original: symbol,
        cleanSymbol: clean,
        marketType
    };
}

/**
 * Normalizes Yahoo Finance ticker formatting
 * @param {string} symbol 
 * @returns {string} formatted Yahoo Finance symbol
 */
export function toYahooSymbol(symbol) {
    const parsed = parseTicker(symbol);
    if (parsed.marketType === MARKET_TYPES.NSE) {
        if (parsed.cleanSymbol.endsWith('.NS') || parsed.cleanSymbol.startsWith('^')) {
            return parsed.cleanSymbol;
        }
        return `${parsed.cleanSymbol}.NS`;
    }
    return parsed.cleanSymbol;
}
