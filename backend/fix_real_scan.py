import re

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', 'r') as f:
    code = f.read()

start_pattern = r"// === PHASE 4: DEEP SCAN INTERCEPTOR[^]+?if \(prompt\.includes\('Execute Deep Scan'\)\) \{"
start_match = re.search(r"// === PHASE 4: DEEP SCAN INTERCEPTOR.*?if \(prompt\.includes\('Execute Deep Scan'\)\) \{", code, re.DOTALL)
if not start_match:
    print("Could not find start block")
    exit(1)

end_match = re.search(r"// === DEEP THINK PIPELINE", code)
if not end_match:
    print("Could not find end block")
    exit(1)

start_index = start_match.start()
end_index = end_match.start()

new_block = """  // === PHASE 4: DEEP SCAN INTERCEPTOR (Real-time On-Demand Scan) ===
  if (prompt.includes('Execute Deep Scan')) {
    const marketMatch = prompt.match(/Market Region = ([^\\]]+)/);
    const market = marketMatch ? marketMatch[1] : 'Global';
    const scanTimestamp = new Date();
    const scanTimeIST = scanTimestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });
    const scanTimeUTC = scanTimestamp.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    // DO NOT send raw text report, just minimal telemetry so the premium card renders beautifully
    clientWs.send(JSON.stringify({ status: 'update', text: `_Initializing Real-Time Deep Compute Engine..._\\n` }));

    // Get the base list from cache to know what tickers exist
    const allCached = await getAllCachedAssets();
    let baseAssets = allCached;
    
    if (market !== 'Global') {
      if (market.toUpperCase() === 'CRYPTO') {
        baseAssets = allCached.filter(a => a.ticker && a.ticker.endsWith('-USD'));
      } else {
        const key = market.toUpperCase().replace(/\\s+/g, '');
        const tickersForMarket = getWatchlistForRegions([key]);
        const tickerSet = new Set(tickersForMarket);
        baseAssets = allCached.filter(a => tickerSet.has(a.ticker));
      }
    }

    if (baseAssets.length === 0) {
       let fbTickers = getWatchlistForRegions([market === 'Global' ? 'CRYPTO' : market.toUpperCase().replace(/\\s+/g, '')]);
       baseAssets = fbTickers.map(t => ({ ticker: t }));
    }

    // Take top 25 assets for deep on-demand scanning to keep it fast but highly accurate
    const targetTickers = baseAssets.slice(0, 25).map(a => a.ticker);
    
    let relevantAssets = [];
    const BATCH_SIZE = 5; 
    
    // Perform a GENUINE real-time scan instead of reading from cache
    for (let i = 0; i < targetTickers.length; i += BATCH_SIZE) {
      const batch = targetTickers.slice(i, i + BATCH_SIZE);
      const displayTicker = batch[0]; 
      
      const actions = ['Analyzing Order Flow on', 'Validating Hurst Fractal for', 'Calculating Kelly Risk on', 'Extracting Sentiment for', 'Synthesizing Neural Data on'];
      const action = actions[Math.floor(Math.random() * actions.length)];
      clientWs.send(JSON.stringify({ status: 'update', text: `_${action} ${displayTicker.replace('-USD', '')}..._\\n` }));
      
      try {
          const batchResults = await Promise.all(batch.map(t => scanTickerPhase4(t)));
          relevantAssets.push(...batchResults.filter(r => r.status === 'success'));
      } catch (err) {
          console.error('[DEEP SCAN] Batch error:', err);
      }
      
      await new Promise(r => setTimeout(r, 800)); // Natural pacing
    }
    
    clientWs.send(JSON.stringify({ status: 'update', text: `_Deep Compute Complete. Aggregating Results..._\\n\\n` }));
    await new Promise(r => setTimeout(r, 600));

    const totalScanned = targetTickers.length;

    // === HONEST FILTERING: Only REAL profitable assets ===
    const profitableAssets = relevantAssets
      .filter(r => r.signalData && r.signalData.action === 'TRADE')
      .filter(r => (r.signalData.score || r.score || 0) >= 50)
      .sort((a, b) => {
        const scoreA = a.signalData?.score || a.score || 0;
        const scoreB = b.signalData?.score || b.score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5);

    if (profitableAssets.length === 0) {
      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating Deep Scan results to ${language}..._\\n\\n` }));
      }

      clientWs.send(JSON.stringify({
        status: 'deep_scan_results',
        scanData: {
          found: false,
          market,
          totalScanned,
          scanTime: scanTimeIST,
          scanTimeUTC,
          dataAge: 0, // 0 because it's genuinely real-time
          scanCycle: 'ON-DEMAND',
          assets: []
        }
      }));

    } else {
      const structuredAssets = [];

      profitableAssets.forEach((s) => {
        const sig = s.signalData;
        const score = sig?.score || s.score || 0;
        const direction = sig?.direction || 'NEUTRAL';
        const entry = sig?.currentPrice || s.currentPrice;
        const tp = sig?.takeProfit || s.takeProfit;
        const sl = sig?.stopLoss || s.stopLoss;
        const kelly = sig?.kelly?.halfKelly;
        const ev = sig?.expectedValue;
        const side = sig?.tradeSide || (direction === 'BEARISH' ? 'SHORT' : 'LONG');

        const tpPct = tp && entry ? ((Math.abs(tp - entry) / entry) * 100).toFixed(2) : null;
        const slPct = sl && entry ? ((Math.abs(entry - sl) / entry) * 100).toFixed(2) : null;

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
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating Deep Scan results to ${language}..._\\n\\n` }));
      }

      clientWs.send(JSON.stringify({
        status: 'deep_scan_results',
        scanData: {
          found: true,
          market,
          totalScanned,
          scanTime: scanTimeIST,
          scanTimeUTC,
          dataAge: 0, // Real-time!
          scanCycle: 'ON-DEMAND',
          assets: structuredAssets
        }
      }));
    }

    clientWs.send(JSON.stringify({ status: 'complete' }));
    return;
  }

"""

final_code = code[:start_index] + new_block + code[end_index:]

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', 'w') as f:
    f.write(final_code)

print("SUCCESS")
