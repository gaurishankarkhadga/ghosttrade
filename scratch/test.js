import { runBulkScanPhase4 } from '../backend/scannerEngine.js';
import { getDynamicCryptoWatchlist } from '../backend/discoveryEngine.js';

async function main() {
    const list = await getDynamicCryptoWatchlist();
    console.log(list.slice(0, 2));
    const results = await runBulkScanPhase4(list.slice(0, 2));
    console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
