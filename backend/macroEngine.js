// =====================================================
// MACRO ENGINE — Correlation, Sentiment, & Economic Events
// Provides macro context to the AI, ensuring it doesn't
// trade against major macroeconomic trends.
// 100% Native Binance Market Data (Crypto Benchmarks).
// Zero Yahoo Finance.
// =====================================================

/**
 * Fetches Fear and Greed Index from alternative.me
 */
export async function fetchFearAndGreed() {
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=2', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.data && data.data.length > 0) {
      const current = data.data[0];
      const previous = data.data[1];
      
      const value = parseInt(current.value);
      const prevValue = parseInt(previous.value);
      
      let interpretation;
      if (value > 75) interpretation = "EXTREME GREED — High risk of market top/correction.";
      else if (value > 55) interpretation = "GREED — Market is bullish but cautious.";
      else if (value > 45) interpretation = "NEUTRAL — No clear sentiment bias.";
      else if (value > 25) interpretation = "FEAR — Market is bearish, potential accumulation zone.";
      else interpretation = "EXTREME FEAR — Maximum pessimism, historically a strong buying opportunity.";

      return {
        value,
        classification: current.value_classification,
        change: value - prevValue,
        interpretation
      };
    }
  } catch (error) {
    console.warn('[MACRO] Fear & Greed fetch failed:', error.message);
  }
  return null;
}

const MACRO_CONFIG = {
  VIX_HIGH_THRESHOLD: 80,
  USDC_UPPER_BOUND: 1.001,
  USDC_LOWER_BOUND: 0.999,
  BTC_RISK_OFF: -3,
  ETH_RISK_OFF: -4,
  BTC_RISK_ON: 3,
  ETH_RISK_ON: 3,
  DXY_RISK_OFF: 0.5,  // DXY proxy must move >= 0.5% to trigger RISK_OFF (prevents micro-fluctuation noise)
};

async function fetchDXYProxy() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=EURUSDT');
    if (!res.ok) return null;
    const data = await res.json();
    const eurChange = parseFloat(data.priceChangePercent || 0);
    return { dxyProxy: -eurChange, source: 'BINANCE_EUR_PROXY', eurChange };
  } catch (e) {
    console.warn('[MACRO] DXY proxy fetch failed:', e.message);
    return null;
  }
}

async function fetchBTCCandles() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=20');
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(d => ({ close: parseFloat(d[4]) }));
  } catch(e) {
    return null;
  }
}

function calculateCryptoVIX(btcCandles) {
  if (!btcCandles || btcCandles.length < 20) return null;
  const returns = btcCandles.slice(-20).map((c, i, arr) => {
    if (i === 0) return 0;
    return Math.log(c.close / arr[i-1].close);
  }).slice(1);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(365) * 100;
  return { cryptoVIX: parseFloat(annualizedVol.toFixed(1)), source: 'BTC_REALIZED_VOL' };
}

async function fetchStablecoinFlow() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=USDCUSDT');
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseFloat(data.lastPrice || 1);
    const isStable = price >= MACRO_CONFIG.USDC_LOWER_BOUND && price <= MACRO_CONFIG.USDC_UPPER_BOUND;
    return { usdcPrice: price, isStable, source: 'BINANCE_USDC' };
  } catch (e) {
    return null;
  }
}

/**
 * Fetches macro correlation assets via Binance market data (BTC & ETH 24h momentum)
 */
export async function fetchMacroCorrelations() {
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT'];
    const [btcRes, ethRes, dxyData, usdcData, btcCandles] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT`, { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchDXYProxy(),
      fetchStablecoinFlow(),
      fetchBTCCandles()
    ]);

    const btc = btcRes ? { price: parseFloat(btcRes.lastPrice), changePercent: parseFloat(btcRes.priceChangePercent) } : null;
    const eth = ethRes ? { price: parseFloat(ethRes.lastPrice), changePercent: parseFloat(ethRes.priceChangePercent) } : null;
    const vixData = calculateCryptoVIX(btcCandles);

    let interpretation = "Market conditions stable. Standard asset correlation applies.";
    let riskEnvironment = "NEUTRAL";

    if (usdcData && !usdcData.isStable) {
      riskEnvironment = "EXTREME_RISK_OFF";
      interpretation = `EXTREME RISK OFF: Stablecoin depeg detected (USDC at ${usdcData.usdcPrice}). High structural risk.`;
    } else if (vixData && vixData.cryptoVIX > MACRO_CONFIG.VIX_HIGH_THRESHOLD) {
      riskEnvironment = "RISK_OFF";
      interpretation = `RISK OFF: High crypto volatility detected (VIX Proxy: ${vixData.cryptoVIX}%). Elevated downside pressure.`;
    } else if (dxyData && dxyData.dxyProxy >= MACRO_CONFIG.DXY_RISK_OFF) { // DXY Proxy >= 0.5% means meaningful dollar strength
      riskEnvironment = "RISK_OFF";
      interpretation = `RISK OFF: Strong Dollar Proxy (DXY Proxy +${dxyData.dxyProxy.toFixed(2)}%). Macro headwind for crypto.`;
    } else if (btc && eth) {
      if (btc.changePercent < MACRO_CONFIG.BTC_RISK_OFF && eth.changePercent < MACRO_CONFIG.ETH_RISK_OFF) {
        riskEnvironment = "RISK_OFF";
        interpretation = `RISK OFF: Major market benchmarks down (BTC ${btc.changePercent.toFixed(1)}%, ETH ${eth.changePercent.toFixed(1)}%).`;
      } else if (btc.changePercent > MACRO_CONFIG.BTC_RISK_ON && eth.changePercent > MACRO_CONFIG.ETH_RISK_ON) {
        riskEnvironment = "RISK_ON";
        interpretation = `RISK ON: Market benchmarks showing strong momentum (BTC +${btc.changePercent.toFixed(1)}%, ETH +${eth.changePercent.toFixed(1)}%).`;
      }
    }

    let riskScore = 50;
    if (btc) {
      if (btc.changePercent > 2) riskScore += 20;
      if (btc.changePercent < -2) riskScore -= 20;
    }
    if (eth) {
      if (eth.changePercent > 2) riskScore += 15;
      if (eth.changePercent < -3) riskScore -= 15;
    }
    
    if (dxyData && dxyData.dxyProxy >= MACRO_CONFIG.DXY_RISK_OFF) riskScore -= Math.min(20, Math.round(dxyData.dxyProxy * 15)); // Proportional: 0.5% DXY = -8pts, 1% = -15pts, 1.3%+ = -20pts cap
    if (vixData && vixData.cryptoVIX > MACRO_CONFIG.VIX_HIGH_THRESHOLD) riskScore -= 20;
    if (usdcData && !usdcData.isStable) riskScore = 0; // Extreme risk off

    riskScore = Math.max(0, Math.min(100, riskScore));

    return {
      spx: null,
      dxy: dxyData ? { change: dxyData.dxyProxy, source: dxyData.source } : null,
      vix: vixData ? { change: vixData.cryptoVIX, source: vixData.source } : null,
      usdc: usdcData ? { price: usdcData.usdcPrice, isStable: usdcData.isStable } : null,
      riskScore,
      btc: btc ? { price: btc.price, change: btc.changePercent } : null,
      eth: eth ? { price: eth.price, change: eth.changePercent } : null,
      riskEnvironment,
      interpretation
    };
  } catch (error) {
    console.warn('[MACRO] Macro correlation fetch failed:', error.message);
    return null;
  }
}

/**
 * Formats macro context for AI prompt
 */
export function formatMacroContext(fng, macro) {
  if (!fng && !macro) return '';

  let block = `\n=== MACROECONOMIC & SENTIMENT CONTEXT ===\n`;
  
  if (fng) {
    block += `Crypto Fear & Greed Index: ${fng.value} (${fng.classification})\n`;
    block += `Sentiment Analysis: ${fng.interpretation}\n`;
  }

  if (macro) {
    block += `Macro Correlations (24h Change):\n`;
    if (macro.btc) block += `  Bitcoin (BTC): ${macro.btc.change > 0 ? '+' : ''}${macro.btc.change.toFixed(2)}%\n`;
    if (macro.eth) block += `  Ethereum (ETH): ${macro.eth.change > 0 ? '+' : ''}${macro.eth.change.toFixed(2)}%\n`;
    if (macro.spx) block += `  S&P 500 (SPX): ${macro.spx.change > 0 ? '+' : ''}${macro.spx.change.toFixed(2)}%\n`;
    if (macro.dxy) block += `  US Dollar Proxy (DXY): ${macro.dxy.change > 0 ? '+' : ''}${macro.dxy.change.toFixed(2)}%\n`;
    if (macro.vix) block += `  Crypto Volatility (VIX): ${macro.vix.change > 0 ? '+' : ''}${macro.vix.change.toFixed(2)}%\n`;
    if (macro.usdc) block += `  USDC Peg Status: $${macro.usdc.price.toFixed(3)} (${macro.usdc.isStable ? 'STABLE' : 'DEPEGGED'})\n`;
    block += `Risk Environment: ${macro.riskEnvironment}\n`;
    block += `Macro Assessment: ${macro.interpretation}\n`;
    block += `IMPORTANT: Do not take long setups in a strong RISK_OFF environment unless the asset shows extreme relative strength.\n`;
  }

  return block;
}
