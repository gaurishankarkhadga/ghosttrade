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

/**
 * Fetches macro correlation assets via Binance market data (BTC & ETH 24h momentum)
 */
export async function fetchMacroCorrelations() {
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT'];
    const results = await Promise.all(symbols.map(async sym => {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          symbol: sym,
          price: parseFloat(data.lastPrice),
          changePercent: parseFloat(data.priceChangePercent)
        };
      } catch (e) {
        return null;
      }
    }));

    const btc = results[0];
    const eth = results[1];

    let interpretation = "Market conditions stable. Standard asset correlation applies.";
    let riskEnvironment = "NEUTRAL";

    if (btc && eth) {
      if (btc.changePercent < -3 && eth.changePercent < -4) {
        riskEnvironment = "RISK_OFF";
        interpretation = `RISK OFF: Major market benchmarks down (BTC ${btc.changePercent.toFixed(1)}%, ETH ${eth.changePercent.toFixed(1)}%). Elevated downside pressure.`;
      } else if (btc.changePercent > 3 && eth.changePercent > 3) {
        riskEnvironment = "RISK_ON";
        interpretation = `RISK ON: Market benchmarks showing strong momentum (BTC +${btc.changePercent.toFixed(1)}%, ETH +${eth.changePercent.toFixed(1)}%). High liquidity tailwind.`;
      } else {
        interpretation = "Mixed macro signals. Standard asset correlation applies.";
      }
    }

    return {
      spx: null,
      dxy: null,
      vix: null,
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
    if (macro.dxy) block += `  US Dollar (DXY): ${macro.dxy.change > 0 ? '+' : ''}${macro.dxy.change.toFixed(2)}%\n`;
    if (macro.vix) block += `  Volatility (VIX): ${macro.vix.change > 0 ? '+' : ''}${macro.vix.change.toFixed(2)}%\n`;
    block += `Risk Environment: ${macro.riskEnvironment}\n`;
    block += `Macro Assessment: ${macro.interpretation}\n`;
    block += `IMPORTANT: Do not take long setups in a strong RISK_OFF environment unless the asset shows extreme relative strength.\n`;
  }

  return block;
}
