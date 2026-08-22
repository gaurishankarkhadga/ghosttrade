import { getDynamicCryptoWatchlist } from './discoveryEngine.js';
import { DEFAULT_CRYPTO_WATCHLIST } from './sharedConfig.js';

async function test() {
    console.log("==================================================");
    console.log("BEFORE (Static Watchlist):");
    console.log(`Total Assets: ${DEFAULT_CRYPTO_WATCHLIST.length}`);
    console.log(`List: ${DEFAULT_CRYPTO_WATCHLIST.join(', ')}`);
    console.log("==================================================");
    
    console.log("\nFetching Dynamic Top 100...");
    const dynamicList = await getDynamicCryptoWatchlist();
    
    console.log("\n==================================================");
    console.log("AFTER (Dynamic Top 100 Watchlist):");
    console.log(`Total Assets: ${dynamicList.length}`);
    console.log(`Top 10: ${dynamicList.slice(0, 10).join(', ')}`);
    console.log(`Bottom 10: ${dynamicList.slice(-10).join(', ')}`);
    console.log("==================================================");
    process.exit(0);
}

test();
