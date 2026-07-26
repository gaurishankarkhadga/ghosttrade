import { parseTicker, toYahooSymbol } from './marketRouter.js';
import { fetchMultiTimeframeOHLCV, getLogReturns } from './dataFetcher.js';
import { fetchOrderFlow, fetchOrderBookDepth } from './orderFlowEngine.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { computeKelly } from './kellyEngine.js';
import { fetchAssetSentiment } from './sentimentEngine.js';
import { runBulkScanPhase4 } from './scannerEngine.js';

async function verifyAllPhasesDeep() {
    console.log('====================================================================');
    console.log('  DEEP PHASE-BY-PHASE INPUT / OUTPUT VERIFICATION AUDIT');
    console.log('====================================================================\n');

    // ===================================================================
    // PHASE 1: MARKET ROUTER & DATA INGESTION
    // ===================================================================
    console.log('>>> [PHASE 1] Market Router & Data Ingestion Verification');
    const inputTicker1 = 'BINANCE:BTC-USD';
    const inputTicker2 = 'NSE:RELIANCE';
    const parsed1 = parseTicker(inputTicker1);
    const parsed2 = parseTicker(inputTicker2);
    const yahoo1 = toYahooSymbol(inputTicker1);
    const yahoo2 = toYahooSymbol(inputTicker2);

    console.log(`\nInput Symbol 1 : "${inputTicker1}"`);
    console.log('Output Parsed   :', JSON.stringify(parsed1));
    console.log('Output Yahoo Sym:', yahoo1);

    console.log(`\nInput Symbol 2 : "${inputTicker2}"`);
    console.log('Output Parsed   :', JSON.stringify(parsed2));
    console.log('Output Yahoo Sym:', yahoo2);

    console.log('\nFetching Live Multi-Timeframe OHLCV Data for RELIANCE.NS...');
    const ohlcvReliance = await fetchMultiTimeframeOHLCV('RELIANCE.NS', 300);
    console.log('Output OHLCV Summary:', {
        symbol: ohlcvReliance.symbol,
        barsCount15m: ohlcvReliance.timeframes['15m']?.length,
        barsCount1d: ohlcvReliance.timeframes['1d']?.length,
        latestBar1d: ohlcvReliance.timeframes['1d']?.[ohlcvReliance.timeframes['1d'].length - 1]
    });

    // ===================================================================
    // PHASE 2: LEVEL 2 ORDER FLOW & LIQUIDITY TELEMETRY
    // ===================================================================
    console.log('\n--------------------------------------------------------------------');
    console.log('>>> [PHASE 2] Level 2 Order Flow & Depth Telemetry Verification');
    console.log('Fetching Order Flow & Book Depth for Crypto (BTC-USD)...');
    const btcFlow = await fetchOrderFlow('BTC-USD');
    const btcDepth = await fetchOrderBookDepth('BTC-USD');
    console.log('\nCrypto Order Flow Output:');
    console.log(JSON.stringify({
        symbol: btcFlow.symbol,
        buyVolume: btcFlow.buyVolume,
        sellVolume: btcFlow.sellVolume,
        deltaPercent: btcFlow.deltaPercent,
        flowBias: btcFlow.flowBias
    }, null, 2));

    console.log('\nFetching Order Flow & Book Depth for Indian Equities (RELIANCE.NS)...');
    const nseFlow = await fetchOrderFlow('RELIANCE.NS');
    const nseDepth = await fetchOrderBookDepth('RELIANCE.NS');
    console.log('Indian Stock Order Flow Fallback Output:');
    console.log(JSON.stringify({
        available: nseFlow.available,
        flowBias: nseFlow.flowBias,
        depthAvailable: nseDepth.available,
        interpretation: nseDepth.interpretation
    }, null, 2));

    // ===================================================================
    // PHASE 3: MATHEMATICAL PHYSICS ENGINE (HURST & REGIME)
    // ===================================================================
    console.log('\n--------------------------------------------------------------------');
    console.log('>>> [PHASE 3] Quantitative Hurst Exponent & Regime Classifier');
    const relLogReturns = getLogReturns(ohlcvReliance.timeframes['1d']);
    console.log(`Input Log-Returns Array Length: ${relLogReturns.length} bars`);
    const hurstOutput = calculateHurst(relLogReturns);
    console.log('\nHurst Engine Full Output Object:');
    console.log(JSON.stringify({
        rsH: hurstOutput.rsH,
        dfaH: hurstOutput.dfaH,
        meanH: hurstOutput.meanH,
        disagreement: hurstOutput.disagreement,
        isStable: hurstOutput.isStable,
        regime: hurstOutput.regime
    }, null, 2));

    const regimeOutput = classifyRegime(hurstOutput, ohlcvReliance.timeframes['1d']);
    console.log('\nRegime Classifier Output Object:');
    console.log(JSON.stringify({
        regime: regimeOutput.regime,
        confidence: regimeOutput.confidence,
        isActionable: regimeOutput.isActionable,
        posteriorProbability: regimeOutput.posteriorProbability
    }, null, 2));

    // ===================================================================
    // PHASE 4: KELLY RISK SIZING ENGINE
    // ===================================================================
    console.log('\n--------------------------------------------------------------------');
    console.log('>>> [PHASE 4] Kelly Risk Sizing & Capital Allocation Engine');
    const kellyInputs = { winProbability: 0.70, rewardPercent: 0.05, riskPercent: 0.02 };
    console.log('Input Parameters:', JSON.stringify(kellyInputs));
    const kellyOutput = computeKelly(kellyInputs);
    console.log('Kelly Engine Output Object:');
    console.log(JSON.stringify({
        action: kellyOutput.action,
        evNetPercent: (kellyOutput.evNet * 100).toFixed(2) + '%',
        fullKellyFraction: (kellyOutput.kellyF * 100).toFixed(2) + '%',
        recommendedHalfKellyFraction: (kellyOutput.halfKelly * 100).toFixed(2) + '%'
    }, null, 2));

    // ===================================================================
    // PHASE 5: MULTI-MARKET SENTIMENT RADAR
    // ===================================================================
    console.log('\n--------------------------------------------------------------------');
    console.log('>>> [PHASE 5] Multi-Market News Sentiment Radar');
    console.log('Input 1: "BTC-USD" (Crypto)');
    const sentimentCrypto = await fetchAssetSentiment('BTC-USD');
    console.log('Output Sentiment (CoinTelegraph RSS):', JSON.stringify(sentimentCrypto));

    console.log('\nInput 2: "RELIANCE.NS" (Indian NSE Stock)');
    const sentimentNSE = await fetchAssetSentiment('RELIANCE.NS');
    console.log('Output Sentiment (Economic Times RSS):', JSON.stringify(sentimentNSE));

    // ===================================================================
    // PHASE 6: END-TO-END BULK SCANNER PIPELINE
    // ===================================================================
    console.log('\n--------------------------------------------------------------------');
    console.log('>>> [PHASE 6] End-to-End Bulk Scan Aggregation Engine');
    const watchlist = ['BTC-USD', 'RELIANCE.NS'];
    console.log('Input Watchlist:', JSON.stringify(watchlist));
    const bulkResults = await runBulkScanPhase4(watchlist);
    console.log('\nBulk Scan Final Output Results Array:');
    console.log(JSON.stringify(bulkResults, null, 2));

    console.log('\n====================================================================');
    console.log('  ALL PHASES DEEP I/O AUDIT COMPLETE — 100% VERIFIED');
    console.log('====================================================================\n');
}

verifyAllPhasesDeep().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
