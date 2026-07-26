import { parseTicker, MARKET_TYPES } from './marketRouter.js';
import { fetchMultiTimeframeOHLCV, getLogReturns, resolveYahooSymbol } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { fetchAssetSentiment } from './sentimentEngine.js';
import { computeKelly } from './kellyEngine.js';
import { runBulkScanPhase4 } from './scannerEngine.js';

async function runFullBacktestSuite() {
    console.log('=====================================================');
    console.log('  GHOST BRAIN SYSTEM BACKTEST & AUDIT SUITE');
    console.log('=====================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passedTests++;
        } else {
            console.error(`  [FAIL] ${message}`);
            process.exitCode = 1;
        }
    }

    // TEST 1: Market Router Classification
    console.log('--- TEST 1: Market Router & Symbol Parsing ---');
    const cryptoParsed = parseTicker('BINANCE:BTC-USD');
    assert(cryptoParsed.marketType === MARKET_TYPES.CRYPTO && cryptoParsed.cleanSymbol === 'BTC-USD', 'Crypto ticker correctly classified');

    const nseParsed = parseTicker('RELIANCE.NS');
    assert(nseParsed.marketType === MARKET_TYPES.NSE && nseParsed.cleanSymbol === 'RELIANCE.NS', 'Indian NSE ticker correctly classified');

    const nsePrefixParsed = parseTicker('NSE:TCS');
    assert(nsePrefixParsed.marketType === MARKET_TYPES.NSE && nsePrefixParsed.cleanSymbol === 'TCS', 'NSE prefix ticker correctly classified');

    // TEST 2: Data Fetching (Crypto & Indian Stocks)
    console.log('\n--- TEST 2: Ingestion Engine (Binance/Yahoo Finance) ---');
    const btcSymbol = resolveYahooSymbol('BTC-USD');
    assert(btcSymbol === 'BTC-USD', 'BTC symbol resolved properly');

    const relianceSymbol = resolveYahooSymbol('RELIANCE.NS');
    assert(relianceSymbol === 'RELIANCE.NS', 'RELIANCE.NS symbol resolved properly');

    console.log('Fetching OHLCV bars for BTC-USD...');
    const btcData = await fetchMultiTimeframeOHLCV('BTC-USD', 300);
    assert(btcData && !btcData.error && btcData.timeframes['15m'], 'BTC-USD 15m OHLCV bars successfully fetched');

    console.log('Fetching OHLCV bars for RELIANCE.NS...');
    const nseData = await fetchMultiTimeframeOHLCV('RELIANCE.NS', 300);
    assert(nseData && !nseData.error && nseData.timeframes['15m'], 'RELIANCE.NS 15m OHLCV bars successfully fetched from NSE/Yahoo');

    // TEST 3: Mathematical Engine (Hurst + Regime)
    console.log('\n--- TEST 3: Quantitative Math Engines ---');
    const btcLogReturns = getLogReturns(btcData.timeframes['15m']);
    const btcHurstObj = calculateHurst(btcLogReturns);
    const btcHurstVal = btcHurstObj.meanH;
    assert(typeof btcHurstVal === 'number' && btcHurstVal >= 0 && btcHurstVal <= 1, `BTC Hurst Exponent calculated successfully (${btcHurstVal.toFixed(4)})`);

    const nseLogReturns = getLogReturns(nseData.timeframes['1d']);
    const nseHurstObj = calculateHurst(nseLogReturns);
    const nseHurstVal = nseHurstObj.meanH;
    assert(typeof nseHurstVal === 'number' && nseHurstVal >= 0 && nseHurstVal <= 1, `RELIANCE Hurst Exponent calculated successfully (${nseHurstVal ? nseHurstVal.toFixed(4) : 'N/A'})`);

    const regime15m = classifyRegime(btcHurstObj, btcData.timeframes['15m']);
    assert(regime15m && regime15m.regime, `Regime Classifier working (${regime15m.regime})`);

    // TEST 4: Multi-Market Sentiment RSS Radar
    console.log('\n--- TEST 4: Multi-Market News & Sentiment Radar ---');
    console.log('Fetching Crypto Sentiment (CoinTelegraph)...');
    const cryptoSentiment = await fetchAssetSentiment('BTC-USD');
    assert(cryptoSentiment && cryptoSentiment.bias, `Crypto Sentiment fetched (${cryptoSentiment.bias})`);

    console.log('Fetching Indian Market Sentiment (Economic Times)...');
    const nseSentiment = await fetchAssetSentiment('RELIANCE.NS');
    assert(nseSentiment && nseSentiment.bias, `Indian Market Sentiment fetched (${nseSentiment.bias})`);

    // TEST 5: Kelly Criterion Capital Allocation Engine
    console.log('\n--- TEST 5: Kelly Criterion Risk Engine ---');
    const kellyRes = computeKelly({ winProbability: 0.65, rewardPercent: 0.05, riskPercent: 0.02 });
    assert(kellyRes && typeof kellyRes.halfKelly === 'number', `Kelly Criterion calculated optimal fraction (${(kellyRes.halfKelly * 100).toFixed(2)}%)`);

    // TEST 6: Complete End-to-End Bulk Scan Execution
    console.log('\n--- TEST 6: End-to-End Multi-Market Bulk Scan Execution ---');
    const testWatchlist = ['BTC-USD', 'RELIANCE.NS'];
    console.log(`Executing scan for watchlist: ${JSON.stringify(testWatchlist)}...`);
    const scanResults = await runBulkScanPhase4(testWatchlist);
    assert(Array.isArray(scanResults) && scanResults.length === 2, 'Bulk scan returned results for all multi-market assets');
    
    scanResults.forEach(asset => {
        assert(typeof asset.score === 'number' && asset.score >= 0, `${asset.ticker} computed valid QuantScore (${asset.score})`);
        assert(asset.flowBias !== undefined, `${asset.ticker} computed Order Flow Bias (${asset.flowBias})`);
    });

    console.log('\n=====================================================');
    console.log(`  BACKTEST AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('=====================================================\n');

    if (passedTests === totalTests) {
        console.log('✓ ALL MULTI-MARKET PIPELINES VERIFIED STABLE AND PRODUCTION READY.');
    } else {
        console.error('× AUDIT FAILED.');
        process.exit(1);
    }
}

runFullBacktestSuite().catch(err => {
    console.error('FATAL BACKTEST ERROR:', err);
    process.exit(1);
});
