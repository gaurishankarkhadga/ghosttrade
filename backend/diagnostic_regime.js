import { fetchOHLCV } from './dataFetcher.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';

async function main() {
  const data = await fetchOHLCV('BTC-USD', 1000);
  
  console.log("=== DIAGNOSTIC REPORT: WHY IS THE SCORE SO LOW? ===");
  console.log("HURST\t\tBASE SCALING\tCI PENALTY\tFINAL SCORE");
  
  let count = 0;
  // Sample 20 random stable regimes
  for (let i = 250; i < data.bars.length && count < 20; i++) {
    const slice = data.bars.slice(i - 200, i);
    const hurst = calculateHurst(slice);
    
    if (hurst.regime !== 'RANDOM_WALK' && hurst.isStable) {
        let baseScaling = 0;
        if (hurst.meanH > 0.55) baseScaling = Math.min(1.0, (hurst.meanH - 0.55) / 0.20);
        else if (hurst.meanH < 0.45) baseScaling = Math.min(1.0, (0.45 - hurst.meanH) / 0.20);
        
        const ciWidth = hurst.ci95.upper - hurst.ci95.lower;
        const ciPenalty = Math.min(Math.max(0, (ciWidth - 0.15)) * 1.5, 0.30);
        
        const finalScore = baseScaling - ciPenalty;
        
        console.log(`${hurst.meanH.toFixed(3)}\t\t${(baseScaling * 100).toFixed(1)}%\t\t-${(ciPenalty * 100).toFixed(1)}%\t\t${Math.max(0, finalScore * 100).toFixed(1)}%`);
        count++;
    }
  }
}

main().catch(console.error);
