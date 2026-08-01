import { runBulkScanPhase4 } from './scannerEngine.js';
import { DEFAULT_CRYPTO_WATCHLIST } from './sharedConfig.js';

async function main() {
  const results = await runBulkScanPhase4(['BTC-USD', 'ETH-USD']);
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
