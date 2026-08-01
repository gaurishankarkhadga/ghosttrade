// =====================================================
// SENTIMENT ENGINE — Phase 5 Macro-Event Radar
// Scans real-time news APIs (CryptoPanic/RSS) to detect
// market-moving events, toxic FUD, and euphoric catalysts.
// Uses an NLP keyword matrix to score the sentiment.
// =====================================================

const TOXIC_KEYWORDS = ['hack', 'sued', 'sec', 'bankrupt', 'arrested', 'delisted', 'scam', 'exploit', 'drain', 'stolen'];
const BEARISH_KEYWORDS = ['selloff', 'crash', 'inflation', 'fed', 'rate hike', 'probe', 'investigation', 'delay'];
const BULLISH_KEYWORDS = ['elon', 'tesla', 'etf', 'approved', 'partnership', 'integration', 'buyback', 'adopted', 'bull'];

/**
 * Fetches real live financial news with multi-source fallback.
 * Source Priority:
 *   Crypto → CryptoPanic (free API) → Google News RSS → CoinTelegraph RSS
 *   NSE    → Economic Times RSS → Google News RSS
 * Each source has independent error handling so failures cascade gracefully.
 */
async function fetchLiveNews(ticker) {
  const isNSE = ticker.endsWith('.NS') || ticker.endsWith('.BO') || ticker.startsWith('NSE:') || ticker.startsWith('^');
  const cleanTicker = ticker.replace('.NS', '').replace('.BO', '').replace('NSE:', '').split('-')[0].toUpperCase();

  // Source 1: CryptoPanic API (crypto only — free tier, no key required for public filter)
  if (!isNSE) {
    try {
      const cpUrl = `https://cryptopanic.com/api/free/v1/posts/?auth_token=free&public=true&currencies=${cleanTicker}&kind=news`;
      const cpResponse = await fetch(cpUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostTrade/2.0)' },
        signal: AbortSignal.timeout(6000)
      });
      if (cpResponse.ok) {
        const cpData = await cpResponse.json();
        if (cpData.results && cpData.results.length > 0) {
          const titles = cpData.results.slice(0, 5).map(r => ({
            title: r.title,
            published_at: r.published_at || new Date().toISOString()
          }));
          if (titles.length > 0) return titles;
        }
      }
    } catch (e) {
      // Silent fallthrough to next source
    }
  }

  // Source 2: Google News RSS (works for both crypto and stocks)
  try {
    const searchTerm = isNSE ? `${cleanTicker}+NSE+stock` : `${cleanTicker}+crypto`;
    const googleRssUrl = `https://news.google.com/rss/search?q=${searchTerm}&hl=en&gl=US&ceid=US:en`;
    const gResponse = await fetch(googleRssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    if (gResponse.ok) {
      const xml = await gResponse.text();
      const titles = [];
      const titleMatches = xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g);
      for (const match of titleMatches) {
        if (match[1] && !match[1].includes('Google News') && match[1].length > 10) {
          titles.push({ title: match[1], published_at: new Date().toISOString() });
        }
      }
      if (titles.length > 0) return titles.slice(0, 5);
    }
  } catch (e) {
    // Silent fallthrough to next source
  }

  // Source 3: Original RSS (CoinTelegraph / Economic Times) — legacy fallback
  try {
    const rssUrl = isNSE
      ? 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'
      : 'https://cointelegraph.com/rss';

    const response = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const titles = [];
    const titleMatches = xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g);
    for (const match of titleMatches) {
      if (match[1] && !match[1].includes('Economic Times') && !match[1].includes('CoinTelegraph')) {
        titles.push({ title: match[1], published_at: new Date().toISOString() });
      }
    }

    const assetSpecific = titles.filter(t => t.title.toUpperCase().includes(cleanTicker));
    return assetSpecific.length > 0 ? assetSpecific : titles.slice(0, 3);
  } catch (err) {
    console.warn(`[SENTIMENT ENGINE] All news sources failed for ${ticker}:`, err.message);
    return [];
  }
}

/**
 * Runs a lightweight NLP keyword matrix over the news headlines to calculate
 * a sentiment multiplier for the Quantitative Score.
 */
function calculateSentimentMultiplier(headlines, ticker) {
  if (!headlines || headlines.length === 0) {
    return { multiplier: 1.0, bias: 'NEUTRAL', alerts: [] };
  }

  let toxicHits = 0;
  let bullishHits = 0;
  let bearishHits = 0;
  let alerts = [];

  const text = headlines.map(h => h.title.toLowerCase()).join(' ');
  const cleanTicker = ticker.replace('.NS', '').replace('NSE:', '').split('-')[0].toLowerCase();

  TOXIC_KEYWORDS.forEach(kw => {
    // Proximity Regex: Is the toxic keyword within 40 characters (~5 words) of the asset name?
    const regexStr1 = `${cleanTicker}.{0,40}${kw}`;
    const regexStr2 = `${kw}.{0,40}${cleanTicker}`;
    
    if (new RegExp(regexStr1, 'i').test(text) || new RegExp(regexStr2, 'i').test(text)) {
      toxicHits++;
      alerts.push(`TOXIC EVENT DETECTED: '${kw.toUpperCase()}' in direct proximity to '${cleanTicker.toUpperCase()}'`);
    }
  });

  BEARISH_KEYWORDS.forEach(kw => {
    if (text.includes(kw)) bearishHits++;
  });

  BULLISH_KEYWORDS.forEach(kw => {
    if (text.includes(kw)) bullishHits++;
  });

  // If a highly toxic event is detected, completely kill the setup (0.0 multiplier)
  if (toxicHits > 0) {
    return { multiplier: 0.0, bias: 'TOXIC', alerts };
  }

  // Calculate standard sentiment
  let multiplier = 1.0;
  let bias = 'NEUTRAL';

  if (bullishHits > bearishHits) {
    multiplier = 1.2; // 20% boost to QuantScore
    bias = 'BULLISH';
    alerts.push(`BULLISH CATALYST: Positive news sentiment detected.`);
  } else if (bearishHits > bullishHits) {
    multiplier = 0.7; // 30% penalty to QuantScore
    bias = 'BEARISH';
    alerts.push(`BEARISH CLOUD: Negative news sentiment detected.`);
  }

  return { multiplier, bias, alerts };
}

/**
 * Main public function. Fetches news for the asset and analyzes sentiment.
 */
export async function fetchAssetSentiment(ticker) {
  try {
    const headlines = await fetchLiveNews(ticker);
    const sentiment = calculateSentimentMultiplier(headlines, ticker);
    
    return {
      success: true,
      ticker,
      headlines: headlines.map(h => h.title),
      multiplier: sentiment.multiplier,
      bias: sentiment.bias,
      alerts: sentiment.alerts
    };
  } catch (error) {
    console.error(`[SENTIMENT ENGINE] Error fetching news for ${ticker}:`, error.message);
    return { success: false, multiplier: 1.0, bias: 'NEUTRAL', alerts: [] };
  }
}
