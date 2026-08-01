import { fetchOHLCV } from './dataFetcher.js';
async function test() {
  console.log("Fetching AAPL 15m 1000 bars...");
  const data = await fetchOHLCV('AAPL', '15m', 1000);
  console.log("Length:", data.bars ? data.bars.length : data);
}
test();
