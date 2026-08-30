import { runBulkScanPhase4 } from './scannerEngine.js';
import { updateGlobalCache, getAllCachedAssets } from './globalAnalysisCache.js';
import { handleGeminiConnection } from './geminiEngine.js';

async function main() {
  console.log('--- Testing scannerEngine fix ---');
  // Scan ATOM-USD (which is known to often not have a pattern)
  const results = await runBulkScanPhase4(['ATOM-USD', 'BTC-USD', 'ETH-USD']);
  console.log(`Scan completed. Found ${results.length} results.`);
  
  // Verify that even if it's skipped, signalData is populated
  let hasSkippedButValid = false;
  for (const r of results) {
    console.log(`\nTicker: ${r.ticker}`);
    console.log(`Status: ${r.status}`);
    console.log(`Reason: ${r.reason || 'none'}`);
    console.log(`Has signalData: ${!!r.signalData}`);
    if (r.status === 'skipped' && r.signalData) {
      hasSkippedButValid = true;
    }
  }
  
  console.log('\n--- Testing cache update ---');
  await updateGlobalCache(results);
  const cached = await getAllCachedAssets();
  console.log(`Assets in cache: ${cached.length}`);
  for (const a of cached) {
    console.log(`- ${a.ticker}: has signalData? ${!!a.signalData}`);
  }

  console.log('\n--- Testing Crypto Deep Scan fix ---');
  // Mock websocket
  const mockWs = {
    send: (data) => console.log(`[WS] ${data}`)
  };
  
  // Fake some dynamic crypto list entries in cache to test filtering
  const fakeCryptoList = [
    { ticker: 'SOL-USD', status: 'success', score: 95, signalData: { action: 'TRADE', direction: 'BULLISH', setupId: 'hammer', stopLoss: 1, takeProfit: 2 } },
    { ticker: 'WIF-USD', status: 'success', score: 85, signalData: { action: 'TRADE', direction: 'BULLISH', setupId: 'bullish_engulfing', stopLoss: 1, takeProfit: 2 } },
  ];
  await updateGlobalCache(fakeCryptoList);
  
  await handleGeminiConnection(mockWs, { prompt: '[Context: Market Region = Crypto]\nExecute Deep Scan across all quantitative regimes' });
  
  console.log('\n--- Done ---');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
