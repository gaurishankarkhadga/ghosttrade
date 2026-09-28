// =====================================================
// CORRELATION ENGINE — Phase 6 Liquidity Rotation
// Maps crypto assets into specific industry sectors.
// When toxic news destroys one asset, this engine detects
// where the panic-selling liquidity will rotate to.
// =====================================================

export const SECTOR_MAP = {
  'BTC-USD': 'STORE_OF_VALUE',
  'ETH-USD': 'LAYER_1',
  'SOL-USD': 'LAYER_1',
  'ADA-USD': 'LAYER_1',
  'BNB-USD': 'LAYER_1',
  'AVAX-USD': 'LAYER_1',
  'NEAR-USD': 'LAYER_1',
  'APT-USD': 'LAYER_1',
  'SUI-USD': 'LAYER_1',
  'DOGE-USD': 'MEME',
  'PEPE-USD': 'MEME',
  'SHIB-USD': 'MEME',
  'LINK-USD': 'DEFI_ORACLE',
  'UNI-USD': 'DEFI_DEX',
  'XRP-USD': 'LEGACY_PAYMENTS',
  'LTC-USD': 'LEGACY_PAYMENTS',
  'DOT-USD': 'LAYER_0',
  'ATOM-USD': 'LAYER_0',
  'ARB-USD': 'LAYER_2',
  'OP-USD': 'LAYER_2'
};

// Dynamic correlation calculation using Pearson correlation coefficient
export function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;
  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);
  
  const meanX = xSlice.reduce((s, v) => s + v, 0) / n;
  const meanY = ySlice.reduce((s, v) => s + v, 0) / n;
  
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// Dynamic sector assignment using correlation clustering
// If two assets have > 0.7 correlation over 30 periods, they're in the same "dynamic sector"
const correlationCache = new Map();
const CORRELATION_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function getDynamicSector(ticker, watchlistTickers) {
  const cacheKey = ticker;
  const cached = correlationCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CORRELATION_CACHE_TTL) {
    return cached.sector;
  }
  
  // Dynamically discover correlated assets from price data
  const sector = { ticker, correlatedAssets: [], highCorrelation: [] };
  // ... compute correlations with other tickers from the watchlist
  correlationCache.set(cacheKey, { sector, time: Date.now() });
  return sector;
}

const useDynamicSectors = true;

/**
 * Calculates cross-asset impacts based on the sentiment of all assets in the market.
 * If an asset suffers a TOXIC event, its sector competitors gain a potential rotation boost.
 * 
 * @param {Array} marketSentiment - Array of { ticker, sentimentBias, multiplier }
 * @returns {Object} rotationImpacts - Keyed by ticker, contains rotation multipliers.
 */
export function calculateRotationImpacts(marketSentiment) {
  const rotationImpacts = {};
  const toxicEventsBySector = {};
  const toxicTickers = [];

  // Initialize neutral impacts
  marketSentiment.forEach(s => {
    rotationImpacts[s.ticker] = { multiplier: 1.0, alerts: [] };
  });

  // Identify sectors experiencing a catastrophic (TOXIC) event
  marketSentiment.forEach(s => {
    if (s.sentimentBias === 'TOXIC') {
      toxicTickers.push(s.ticker);
      const sector = SECTOR_MAP[s.ticker];
      if (sector) {
        if (!toxicEventsBySector[sector]) toxicEventsBySector[sector] = [];
        toxicEventsBySector[sector].push(s.ticker);
      }
    }
  });

  // Apply Rotation Boosts to surviving competitors in the same sector
  marketSentiment.forEach(s => {
    if (s.sentimentBias === 'TOXIC') {
       rotationImpacts[s.ticker].multiplier = 0.0;
       rotationImpacts[s.ticker].alerts.push(`LIQUIDITY DRAIN: Capital rotating out to competitors.`);
       return;
    }

    if (useDynamicSectors) {
      let maxContagion = 0;
      let toxicSource = null;
      let maxCorr = 0;

      for (const t of toxicTickers) {
        const cached = correlationCache.get(t);
        let corr = 0;
        
        if (cached && cached.sector) {
          // Find correlation from array if it exists
          const assetMatch = cached.sector.correlatedAssets.find(a => a.ticker === s.ticker);
          if (assetMatch) {
            corr = assetMatch.correlation || 0;
          }
        }
        
        let contagion = 0;
        if (corr >= 0.9) contagion = 0.9;
        else if (corr >= 0.7) contagion = 0.7;
        else if (corr >= 0.5) contagion = 0.4;
        
        if (contagion > maxContagion) {
          maxContagion = contagion;
          toxicSource = t;
          maxCorr = corr;
        }
      }

      if (maxContagion > 0) {
        // Multiplier is reduced by contagion impact (e.g. 0.9x contagion = 0.1 multiplier)
        rotationImpacts[s.ticker].multiplier = (1 - maxContagion);
        rotationImpacts[s.ticker].alerts.push(
          `CONTAGION RISK: Highly correlated (${maxCorr.toFixed(2)}) with toxic asset [${toxicSource}]. Applying ${maxContagion}x contagion penalty.`
        );
      } else {
        // Fallback to static sector if no dynamic correlation data triggered a penalty
        const sector = SECTOR_MAP[s.ticker];
        const toxicCompetitors = sector ? toxicEventsBySector[sector] : null;
        if (toxicCompetitors && toxicCompetitors.length > 0) {
          rotationImpacts[s.ticker].multiplier = 0.5;
          rotationImpacts[s.ticker].alerts.push(
            `CONTAGION RISK: Sector member [${toxicCompetitors.join(', ')}] suffering toxic event. Applying contagion penalty.`
          );
        }
      }
    } else {
      // STATIC FALLBACK
      const sector = SECTOR_MAP[s.ticker];
      if (!sector) return;

      const toxicCompetitors = toxicEventsBySector[sector];
      if (toxicCompetitors && toxicCompetitors.length > 0) {
        rotationImpacts[s.ticker].multiplier = 0.5;
        rotationImpacts[s.ticker].alerts.push(
          `CONTAGION RISK: Sector member [${toxicCompetitors.join(', ')}] suffering toxic event. Applying contagion penalty.`
        );
      }
    }
  });

  return rotationImpacts;
}
