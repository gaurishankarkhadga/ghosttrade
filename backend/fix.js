const fs = require('fs');
const code = fs.readFileSync('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', 'utf8');

// Find the start of the Deep Scan interceptor
const startRegex = /\/\/\s*===\s*PHASE 4: DEEP SCAN INTERCEPTOR[^]*?if\s*\(prompt\.includes\('Execute Deep Scan'\)\)\s*\{/;
const startMatch = code.match(startRegex);
if (!startMatch) {
  console.log("Could not find start block");
  process.exit(1);
}

// Find the end of it (the pipeline marker)
const endRegex = /\/\/\s*===\s*DEEP THINK PIPELINE/;
const endMatch = code.match(endRegex);
if (!endMatch) {
  console.log("Could not find end block");
  process.exit(1);
}

const startIndex = startMatch.index;
const endIndex = endMatch.index;

const newBlock = `  // === PHASE 4: DEEP SCAN INTERCEPTOR (Now reads from global cache) ===
  // HONEST DEEP THINK: Only surfaces REAL profitable assets (TRADE signal + score >= 50).
  // When no profitable assets exist, respectfully tells the user with exact timestamp.
  if (prompt.includes('Execute Deep Scan')) {
    const marketMatch = prompt.match(/Market Region = ([^\\]]+)/);
    const market = marketMatch ? marketMatch[1] : 'Global';
    const scanTimestamp = new Date();
    const scanTimeIST = scanTimestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });
    const scanTimeUTC = scanTimestamp.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    clientWs.send(JSON.stringify({ status: 'update', text: \`\\n\\n**DEEP THINK — \${market.toUpperCase()} MARKET SCAN**\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n_Scanning for statistically profitable opportunities..._\\n\\n\` }));

    // Read from global cache instead of running a fresh scan
    const allCached = await getAllCachedAssets();
    let relevantAssets = allCached;
    
    // Filter by market if not Global
    if (market !== 'Global') {
      if (market.toUpperCase() === 'CRYPTO') {
        relevantAssets = allCached.filter(a => a.ticker && a.ticker.endsWith('-USD'));
      } else {
        const key = market.toUpperCase().replace(/\\s+/g, '');
        const tickersForMarket = getWatchlistForRegions([key]);
        const tickerSet = new Set(tickersForMarket);
        relevantAssets = allCached.filter(a => tickerSet.has(a.ticker));
      }
    }

    if (relevantAssets.length === 0) {
      // Fallback: if cache is empty (scanner hasn't run yet), run a fresh scan
      clientWs.send(JSON.stringify({ status: 'update', text: \`_Cache warming up... Running fresh real-time scan..._\\n\\n\` }));
      try {
        let tickersToScan = [];
        if (market === 'Global') {
          tickersToScan = getWatchlistForRegions(listAvailableRegions());
        } else {
          const key = market.toUpperCase().replace(/\\s+/g, '');
          tickersToScan = getWatchlistForRegions([key]);
        }
        const results = await runBulkScanPhase4(tickersToScan);
        relevantAssets = results.filter(r => r.status === 'success');
      } catch (e) {
        clientWs.send(JSON.stringify({ status: 'update', text: \`_Scanner encountered an issue: \${e.message}_\\n\` }));
        clientWs.send(JSON.stringify({ status: 'complete' }));
        return;
      }
    }

    const totalScanned = relevantAssets.length;
    const cacheInfo = await getCacheInfo();
    const dataAge = cacheInfo.ageMs ? Math.round(cacheInfo.ageMs / 1000) : null;

    // === HONEST FILTERING: Only REAL profitable assets ===
    // An asset is "profitable" ONLY if the deterministic signal generator says TRADE
    // AND the composite quant score is >= 50 (positive mathematical expectancy).
    const profitableAssets = relevantAssets
      .filter(r => r.status === 'success')
      .filter(r => r.signalData && r.signalData.action === 'TRADE')
      .filter(r => (r.signalData.score || r.score || 0) >= 50)
      .sort((a, b) => {
        const scoreA = a.signalData?.score || a.score || 0;
        const scoreB = b.signalData?.score || b.score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5);

    if (profitableAssets.length === 0) {
      // === HONEST "NO OPPORTUNITIES" RESPONSE ===
      let noOpReport = \`**NO PROFITABLE OPPORTUNITIES FOUND**\\n\\n\`;
      noOpReport += \`**Scan Time:** \${scanTimeIST} (\${scanTimeUTC})\\n\`;
      noOpReport += \`**Market:** \${market}\\n\`;
      noOpReport += \`**Assets Analyzed:** \${totalScanned}\\n\`;
      if (dataAge !== null) noOpReport += \`**Data Freshness:** \${dataAge}s ago\\n\`;
      noOpReport += \`\\n\`;
      noOpReport += \`The quantitative engine scanned \${totalScanned} assets across the \${market} market using real-time Binance data, Hurst fractal regime analysis, pattern detection, order flow telemetry, and Kelly criterion sizing.\\n\\n\`;
      noOpReport += \`**Result:** Every asset is currently in **Shield Mode** — meaning the mathematical expectancy is negative or neutral. There is no statistically validated edge to trade right now.\\n\\n\`;
      noOpReport += \`This is not an error. This is the system protecting your capital. When high-probability setups appear, Deep Think will surface them immediately.\\n\\n\`;
      noOpReport += \`_Next scan cycle will refresh automatically. You can run Deep Think again at any time._\\n\`;

      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: \`_Translating to \${language}..._\\n\\n\` }));
        noOpReport = await translateTextWithGroq(noOpReport, language);
      }

      const parts = noOpReport.split('\\n');
      for (const p of parts) {
        clientWs.send(JSON.stringify({ status: 'update', text: p + '\\n' }));
        await new Promise(r => setTimeout(r, 35));
      }

      // Send structured event for premium frontend rendering
      clientWs.send(JSON.stringify({
        status: 'deep_scan_results',
        scanData: {
          found: false,
          market,
          totalScanned,
          scanTime: scanTimeIST,
          scanTimeUTC,
          dataAge,
          scanCycle: cacheInfo.scanCycleCount || 0,
          assets: []
        }
      }));

    } else {
      // === PROFITABLE ASSETS FOUND — CLEAN EXECUTABLE FORMAT ===
      let report = \`**DEEP THINK COMPLETE — \${profitableAssets.length} PROFITABLE \${profitableAssets.length === 1 ? 'OPPORTUNITY' : 'OPPORTUNITIES'} FOUND**\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n\`;
      report += \`**Scan Time:** \${scanTimeIST}\\n\`;
      report += \`**Market:** \${market} | **Assets Analyzed:** \${totalScanned}\\n\`;
      if (dataAge !== null) report += \`**Data Freshness:** \${dataAge}s ago | Cycle #\${cacheInfo.scanCycleCount}\\n\`;
      report += \`\\n\`;

      const structuredAssets = [];

      profitableAssets.forEach((s, idx) => {
        const sig = s.signalData;
        const score = sig?.score || s.score || 0;
        const direction = sig?.direction || 'NEUTRAL';
        const dirIcon = direction === 'BULLISH' ? '▲' : direction === 'BEARISH' ? '▼' : '◆';
        const entry = sig?.currentPrice || s.currentPrice;
        const tp = sig?.takeProfit || s.takeProfit;
        const sl = sig?.stopLoss || s.stopLoss;
        const kelly = sig?.kelly?.halfKelly;
        const ev = sig?.expectedValue;
        const side = sig?.tradeSide || (direction === 'BEARISH' ? 'SHORT' : 'LONG');

        // Calculate percentages from real prices
        const tpPct = tp && entry ? ((Math.abs(tp - entry) / entry) * 100).toFixed(2) : null;
        const slPct = sl && entry ? ((Math.abs(entry - sl) / entry) * 100).toFixed(2) : null;

        const fPrice = (p) => p !== undefined && p !== null ? (typeof p === 'number' ? (p > 100 ? p.toFixed(2) : p.toFixed(4)) : p) : 'N/A';

        report += \`**#\${idx + 1}. \${dirIcon} \${s.ticker}** — \${direction} (Score: \${score}/100)\\n\`;
        report += \`• **Side:** \${side}\\n\`;
        report += \`• **Entry:** $\${fPrice(entry)}\\n\`;
        if (tp) report += \`• **Target:** $\${fPrice(tp)}\${tpPct ? \` (+\${tpPct}%)\` : ''}\\n\`;
        if (sl) report += \`• **Stop Loss:** $\${fPrice(sl)}\${slPct ? \` (-\${slPct}%)\` : ''}\\n\`;
        if (kelly) report += \`• **Position Size:** Half-Kelly \${(kelly * 100).toFixed(1)}%\\n\`;
        if (ev !== undefined && ev !== null) report += \`• **Edge:** \${ev >= 0 ? '+' : ''}$\${typeof ev === 'number' ? ev.toFixed(2) : ev} per $100 risked\\n\`;
        report += \`• **Regime:** \${s.macroRegime || 'N/A'} (Macro) | \${s.microRegime || 'N/A'} (Micro)\\n\`;
        report += \`\\n\`;

        // Build structured data for frontend card rendering
        structuredAssets.push({
          ticker: s.ticker,
          score,
          direction,
          side,
          entry,
          takeProfit: tp,
          stopLoss: sl,
          kellySize: kelly ? parseFloat((kelly * 100).toFixed(1)) : 0,
          expectedValue: ev,
          macroRegime: s.macroRegime,
          microRegime: s.microRegime,
          tpPercent: tpPct ? parseFloat(tpPct) : null,
          slPercent: slPct ? parseFloat(slPct) : null,
          scoreBreakdown: sig?.scoreBreakdown || null,
          pattern: sig?.pattern || sig?.setupId || s.setup_id || null,
          hurst: sig?.hurst || null,
          buyerPercent: sig?.buyerPercent
        });
      });

      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: \`_Translating to \${language}..._\\n\\n\` }));
        report = await translateTextWithGroq(report, language);
      }

      const parts = report.split('\\n');
      for (const p of parts) {
        clientWs.send(JSON.stringify({ status: 'update', text: p + '\\n' }));
        await new Promise(r => setTimeout(r, 35));
      }

      // Send structured event for premium frontend rendering
      clientWs.send(JSON.stringify({
        status: 'deep_scan_results',
        scanData: {
          found: true,
          market,
          totalScanned,
          scanTime: scanTimeIST,
          scanTimeUTC,
          dataAge,
          scanCycle: cacheInfo.scanCycleCount || 0,
          assets: structuredAssets
        }
      }));
    }

    clientWs.send(JSON.stringify({ status: 'complete' }));
    return;
  }

  `;

const finalCode = code.slice(0, startIndex) + newBlock + code.slice(endIndex);
fs.writeFileSync('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', finalCode);
console.log("SUCCESS");
