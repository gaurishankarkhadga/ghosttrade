import { runBacktest } from './backtestEngine.js';

async function main() {
  const assets = ['BTC-USD', 'ETH-USD'];
  const timeframes = ['15m', '1h'];
  
  for (const asset of assets) {
    for (const tf of timeframes) {
      await runBacktest(asset, tf);
    }
  }
}

main().catch(console.error);
