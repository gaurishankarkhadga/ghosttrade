import { fetchOHLCV } from '../backend/dataFetcher.js';

async function testFetch() {
  console.log("Fetching OHLCV directly...");
  const data = await fetchOHLCV("NABIL.NP", 100);
  console.log("Fetch result keys:", Object.keys(data || {}));
  if (data.error) console.log("Error:", data.error, data.message);
  else console.log("Bars length:", data.bars.length);
}
testFetch();
