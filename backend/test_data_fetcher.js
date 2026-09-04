import dotenv from 'dotenv';
dotenv.config();

import { fetchOHLCV } from './dataFetcher.js';

async function test() {
    console.log("Testing NIFTY...");
    const data = await fetchOHLCV("NIFTY", 100);
    console.log(data ? `Success: ${data.bars.length} bars` : "Failed");
}
test();
