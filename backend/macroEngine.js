// =====================================================
// MACRO ENGINE — Correlation, Sentiment, & Economic Events
// Provides macro context to the AI, ensuring it doesn't
// trade against major macroeconomic trends.
// =====================================================

import yahooFinance from 'yahoo-finance2';

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
 * Fetches macro correlation assets (SPX, DXY, VIX)
 */
export async function fetchMacroCorrelations() {
  try {
    const symbols = ['^GSPC', 'DX-Y.NYB', '^VIX'];
    const results = await Promise.all(symbols.map(async sym => {
      try {
        const quote = await yahooFinance.quote(sym);
        return {
          symbol: sym,
          price: quote.regularMarketPrice,
          changePercent: quote.regularMarketChangePercent
        };
      } catch (e) {
        return null;
      }
    }));

    const spx = results[0];
    const dxy = results[1];
    const vix = results[2];

    let interpretation = "";
    let riskEnvironment = "NEUTRAL";

    if (spx && dxy && vix) {
      // DXY and VIX up, SPX down = Risk Off
      if (dxy.changePercent > 0.2 && vix.changePercent > 2 && spx.changePercent < -0.5) {
        riskEnvironment = "RISK_OFF";
        interpretation = "RISK OFF ENVIRONMENT: Dollar (DXY) and Volatility (VIX) are rising, while Equities (SPX) are falling. High probability of crypto/risk-asset selloff.";
      } 
      // SPX up, DXY down, VIX down = Risk On
      else if (spx.changePercent > 0.5 && dxy.changePercent < -0.2 && vix.changePercent < -2) {
        riskEnvironment = "RISK_ON";
        interpretation = "RISK ON ENVIRONMENT: Equities rising, Dollar and Volatility falling. Strong tailwind for crypto and risk assets.";
      }
      else {
        interpretation = "Mixed macro signals. Standard asset correlation applies.";
      }
    }

    return {
      spx: spx ? { price: spx.price, change: spx.changePercent } : null,
      dxy: dxy ? { price: dxy.price, change: dxy.changePercent } : null,
      vix: vix ? { price: vix.price, change: vix.changePercent } : null,
      riskEnvironment,
      interpretation
    };
  } catch (error) {
    console.warn('[MACRO] Correlation fetch failed:', error.message);
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
    if (macro.spx) block += `  S&P 500 (SPX): ${macro.spx.change > 0 ? '+' : ''}${macro.spx.change.toFixed(2)}%\n`;
    if (macro.dxy) block += `  US Dollar (DXY): ${macro.dxy.change > 0 ? '+' : ''}${macro.dxy.change.toFixed(2)}%\n`;
    if (macro.vix) block += `  Volatility (VIX): ${macro.vix.change > 0 ? '+' : ''}${macro.vix.change.toFixed(2)}%\n`;
    block += `Risk Environment: ${macro.riskEnvironment}\n`;
    block += `Macro Assessment: ${macro.interpretation}\n`;
    block += `IMPORTANT: Do not take long setups in a strong RISK_OFF environment unless the asset shows extreme relative strength.\n`;
  }

  return block;
}
