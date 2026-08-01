import fetch from 'node-fetch';

async function testBinance() {
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`Fetched ${data.length} candles from Binance`);
}
testBinance();
