// =====================================================
// GLOBAL WATCHLISTS — Every Major Market on Earth
// Organized by region. Each entry uses Yahoo Finance symbol format.
// Used by scannerEngine and frontend market selector.
// Does NOT modify sharedConfig.js — standalone module.
// =====================================================

// =====================================================
// CRYPTO — 24/7 Global
// =====================================================
export const WATCHLIST_CRYPTO = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD',
  'DOGE-USD', 'ADA-USD', 'AVAX-USD', 'LINK-USD', 'MATIC-USD',
  'LTC-USD', 'DOT-USD', 'UNI-USD', 'ATOM-USD', 'NEAR-USD',
  'APT-USD', 'ARB-USD', 'OP-USD', 'SUI-USD', 'PEPE-USD',
];

// =====================================================
// UNITED STATES — NYSE + NASDAQ
// =====================================================
export const WATCHLIST_US = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'BRK-B', 'JPM', 'V', 'UNH', 'MA', 'HD', 'PG', 'JNJ',
  'XOM', 'BAC', 'ABBV', 'KO', 'PFE', 'COST', 'MRK', 'PEP',
  'AMD', 'NFLX', 'CRM', 'INTC', 'DIS', 'CSCO', 'ADBE',
];

// =====================================================
// INDIA — NSE
// =====================================================
export const WATCHLIST_INDIA = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'KOTAKBANK.NS', 'LT.NS',
  'AXISBANK.NS', 'HINDUNILVR.NS', 'BAJFINANCE.NS', 'MARUTI.NS', 'TATAMOTORS.NS',
  'SUNPHARMA.NS', 'TITAN.NS', 'WIPRO.NS', 'HCLTECH.NS', 'ADANIENT.NS',
];

// =====================================================
// UNITED KINGDOM — LSE
// =====================================================
export const WATCHLIST_UK = [
  'HSBA.L', 'BP.L', 'SHEL.L', 'AZN.L', 'GSK.L',
  'ULVR.L', 'RIO.L', 'LSEG.L', 'DGE.L', 'BATS.L',
  'VOD.L', 'LLOY.L', 'BARC.L', 'NG.L', 'BHP.L',
];

// =====================================================
// JAPAN — TSE (Tokyo)
// =====================================================
export const WATCHLIST_JAPAN = [
  '7203.T', '6758.T', '9984.T', '6861.T', '8306.T',
  '7267.T', '6902.T', '4063.T', '8035.T', '9432.T',
  '6501.T', '7741.T', '4502.T', '6367.T', '8058.T',
];
// Display names: Toyota, Sony, SoftBank, Keyence, MUFG, Honda, Denso, Shin-Etsu, TEL, NTT

// =====================================================
// EUROPE — XETRA (Germany) + Euronext (France/Netherlands)
// =====================================================
export const WATCHLIST_EUROPE = [
  'SAP.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'BAS.DE',   // Germany
  'MC.PA', 'OR.PA', 'SAN.PA', 'AI.PA', 'BNP.PA',       // France
  'ASML.AS', 'PHIA.AS', 'UNA.AS', 'INGA.AS', 'AD.AS',  // Netherlands
];

// =====================================================
// AUSTRALIA — ASX
// =====================================================
export const WATCHLIST_AUSTRALIA = [
  'BHP.AX', 'CBA.AX', 'CSL.AX', 'NAB.AX', 'WBC.AX',
  'ANZ.AX', 'WES.AX', 'MQG.AX', 'FMG.AX', 'WDS.AX',
];

// =====================================================
// HONG KONG — HKEX
// =====================================================
export const WATCHLIST_HONGKONG = [
  '0700.HK', '9988.HK', '1299.HK', '0005.HK', '0941.HK',
  '2318.HK', '0388.HK', '1810.HK', '0027.HK', '0883.HK',
];
// Tencent, Alibaba, AIA, HSBC HK, China Mobile, Ping An, HKEX, Xiaomi

// =====================================================
// SOUTH KOREA — KRX
// =====================================================
export const WATCHLIST_KOREA = [
  '005930.KS', '000660.KS', '035420.KS', '051910.KS', '006400.KS',
  '035720.KS', '003550.KS', '105560.KS', '068270.KS', '055550.KS',
];
// Samsung, SK Hynix, NAVER, LG Chem, Samsung SDI, Kakao, LG, KB Financial

// =====================================================
// CANADA — TSX
// =====================================================
export const WATCHLIST_CANADA = [
  'SHOP.TO', 'RY.TO', 'TD.TO', 'ENB.TO', 'BNS.TO',
  'CNR.TO', 'BMO.TO', 'CP.TO', 'SU.TO', 'TRI.TO',
];

// =====================================================
// BRAZIL — B3
// =====================================================
export const WATCHLIST_BRAZIL = [
  'PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'ABEV3.SA',
  'WEGE3.SA', 'RENT3.SA', 'BBAS3.SA', 'JBSS3.SA', 'ELET3.SA',
];

// =====================================================
// SINGAPORE — SGX
// =====================================================
export const WATCHLIST_SINGAPORE = [
  'D05.SI', 'O39.SI', 'U11.SI', 'Z74.SI', 'S58.SI',
  'C6L.SI', 'S68.SI', 'A17U.SI', 'G13.SI', 'BN4.SI',
];

// =====================================================
// FOREX — Major Pairs
// =====================================================
export const WATCHLIST_FOREX = [
  'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X',
  'USDCHF=X', 'NZDUSD=X', 'EURGBP=X', 'USDINR=X', 'GBPJPY=X',
];

// =====================================================
// REGION METADATA — Market hours, timezone, broker
// =====================================================
export const MARKET_REGIONS = {
  CRYPTO:    { name: 'Crypto',        timezone: 'UTC',              open: '00:00', close: '23:59', is24h: true,  broker: 'BINANCE',  watchlist: WATCHLIST_CRYPTO },
  US:        { name: 'United States', timezone: 'America/New_York', open: '09:30', close: '16:00', is24h: false, broker: 'ALPACA',   watchlist: WATCHLIST_US },
  INDIA:     { name: 'India',         timezone: 'Asia/Kolkata',     open: '09:15', close: '15:30', is24h: false, broker: 'ANGEL_ONE', watchlist: WATCHLIST_INDIA },
  UK:        { name: 'United Kingdom',timezone: 'Europe/London',    open: '08:00', close: '16:30', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_UK },
  JAPAN:     { name: 'Japan',         timezone: 'Asia/Tokyo',       open: '09:00', close: '15:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_JAPAN },
  EUROPE:    { name: 'Europe',        timezone: 'Europe/Berlin',    open: '09:00', close: '17:30', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_EUROPE },
  AUSTRALIA: { name: 'Australia',     timezone: 'Australia/Sydney', open: '10:00', close: '16:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_AUSTRALIA },
  HONGKONG:  { name: 'Hong Kong',     timezone: 'Asia/Hong_Kong',   open: '09:30', close: '16:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_HONGKONG },
  KOREA:     { name: 'South Korea',   timezone: 'Asia/Seoul',       open: '09:00', close: '15:30', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_KOREA },
  CANADA:    { name: 'Canada',        timezone: 'America/Toronto',  open: '09:30', close: '16:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_CANADA },
  BRAZIL:    { name: 'Brazil',        timezone: 'America/Sao_Paulo',open: '10:00', close: '17:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_BRAZIL },
  SINGAPORE: { name: 'Singapore',     timezone: 'Asia/Singapore',   open: '09:00', close: '17:00', is24h: false, broker: 'IBKR',     watchlist: WATCHLIST_SINGAPORE },
  FOREX:     { name: 'Forex',         timezone: 'UTC',              open: '00:00', close: '23:59', is24h: true,  broker: 'IBKR',     watchlist: WATCHLIST_FOREX },
};

/**
 * Returns all watchlist tickers for a given set of region keys.
 * @param {string[]} regionKeys — e.g., ['US', 'CRYPTO', 'INDIA']
 * @returns {string[]}
 */
export function getWatchlistForRegions(regionKeys) {
  const tickers = [];
  for (const key of regionKeys) {
    const region = MARKET_REGIONS[key.toUpperCase()];
    if (region) tickers.push(...region.watchlist);
  }
  return [...new Set(tickers)]; // Deduplicate
}

/**
 * Returns all available region keys.
 * @returns {string[]}
 */
export function listAvailableRegions() {
  return Object.keys(MARKET_REGIONS);
}

/**
 * Returns total number of tracked assets across all regions.
 */
export function getTotalAssetCount() {
  return Object.values(MARKET_REGIONS).reduce((sum, r) => sum + r.watchlist.length, 0);
}
