/**
 * Market Router Module
 * Classifies tickers into Market Types (CRYPTO vs NSE/INDIAN) and routes data fetching.
 */

export const MARKET_TYPES = {
    CRYPTO: 'CRYPTO',
    NSE: 'NSE'
};

export const DEFAULT_WATCHLISTS = {
    CRYPTO: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    NSE: ['RELIANCE', 'TCS', 'INFY', 'NIFTY']
};

/**
 * Detects the market type of a given symbol.
 * @param {string} symbol - e.g. "BTCUSDT", "RELIANCE", "NIFTY", "BINANCE:BTCUSDT", "NSE:RELIANCE"
 * @returns {object} { symbol, marketType, cleanSymbol }
 */
export function parseTicker(symbol) {
    if (!symbol || typeof symbol !== 'string') {
        throw new Error(`Invalid ticker symbol provided to marketRouter: ${symbol}`);
    }

    let clean = symbol.trim().toUpperCase();
    let marketType = MARKET_TYPES.CRYPTO;

    if (clean.startsWith('NSE:') || clean.endsWith('.NS') || clean.endsWith('.BO') || clean === 'NIFTY' || clean === 'BANKNIFTY' || clean === '^NSEI' || clean === '^BSESN') {
        marketType = MARKET_TYPES.NSE;
        clean = clean.replace('NSE:', '').replace(/\.(NS|BO)$/, '').replace('^NSEI', 'NIFTY').replace('^BSESN', 'SENSEX');
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
 * Normalizes ticker symbol to standard exchange format
 * @param {string} symbol 
 * @returns {string} clean standard symbol
 */
export function toStandardSymbol(symbol) {
    const parsed = parseTicker(symbol);
    return parsed.cleanSymbol;
}

export const toYahooSymbol = toStandardSymbol;
