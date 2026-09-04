import { fetchOHLCV, fetchLivePrice } from './dataFetcher.js';

async function runTests() {
  try {
    console.log("=====================================");
    console.log("   GHOSTTRADE INTERNAL DATA TEST     ");
    console.log("=====================================\n");

    console.log("[TEST 1] Altcoin Live Price: TRX-USD");
    const trxPrice = await fetchLivePrice('TRX-USD');
    console.log("➔ Result:", trxPrice ? `$${trxPrice}` : "FAILED");

    console.log("\n[TEST 2] Altcoin Historical OHLCV: PENDLE");
    const pendleData = await fetchOHLCV('PENDLE');
    if (pendleData && pendleData.bars) {
      console.log(`➔ Fetched ${pendleData.bars.length} bars from Binance successfully. Last bar:`);
      console.log(pendleData.bars[pendleData.bars.length - 1]);
    } else {
      console.log("➔ FAILED:", pendleData);
    }

    console.log("\n[TEST 3] Stock Live Price (Fallback): AAPL");
    const aaplPrice = await fetchLivePrice('AAPL');
    console.log("➔ Result:", aaplPrice ? `$${aaplPrice}` : "FAILED");

    console.log("\n[TEST 4] Stock Historical OHLCV (Fallback): TSLA");
    const tslaData = await fetchOHLCV('TSLA');
    if (tslaData && tslaData.bars) {
      console.log(`➔ Fetched ${tslaData.bars.length} bars from Yahoo successfully. Last bar:`);
      console.log(tslaData.bars[tslaData.bars.length - 1]);
    } else {
      console.log("➔ FAILED:", tslaData);
    }
    
    console.log("\n=====================================");
    console.log("            TEST COMPLETE            ");
    console.log("=====================================");
    process.exit(0);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

runTests();
