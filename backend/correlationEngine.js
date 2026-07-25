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

  // Initialize neutral impacts
  marketSentiment.forEach(s => {
    rotationImpacts[s.ticker] = { multiplier: 1.0, alerts: [] };
  });

  // Identify sectors experiencing a catastrophic (TOXIC) event
  marketSentiment.forEach(s => {
    if (s.sentimentBias === 'TOXIC') {
      const sector = SECTOR_MAP[s.ticker];
      if (sector) {
        if (!toxicEventsBySector[sector]) toxicEventsBySector[sector] = [];
        toxicEventsBySector[sector].push(s.ticker);
      }
    }
  });

  // Apply Rotation Boosts to surviving competitors in the same sector
  marketSentiment.forEach(s => {
    const sector = SECTOR_MAP[s.ticker];
    if (!sector) return;

    const toxicCompetitors = toxicEventsBySector[sector];
    
    // If there is a toxic event in this sector, and THIS asset is NOT the toxic one
    if (toxicCompetitors && toxicCompetitors.length > 0 && s.sentimentBias !== 'TOXIC') {
      // Apply a 1.25x Liquidity Rotation Boost (capital fleeing the competitor and entering this one)
      rotationImpacts[s.ticker].multiplier = 1.25;
      rotationImpacts[s.ticker].alerts.push(
        `LIQUIDITY ROTATION DETECTED: Capital fleeing toxic competitor(s) [${toxicCompetitors.join(', ')}]. Boost applied.`
      );
    }
    
    // If THIS asset is the toxic one, ensure it remains dead (handled by sentiment engine, but enforced here)
    if (s.sentimentBias === 'TOXIC') {
       rotationImpacts[s.ticker].multiplier = 0.0;
       rotationImpacts[s.ticker].alerts.push(`LIQUIDITY DRAIN: Capital rotating out to competitors.`);
    }
  });

  return rotationImpacts;
}
