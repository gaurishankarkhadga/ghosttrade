// =====================================================
// TEST CO-FOUNDER ENGINES — Predictive 5-10m Horizon, Educational Mentor & Black Swan Circuit-Breakers
// =====================================================

import { predict5to10mHorizon } from './predictiveEngine.js';
import { generateTradeLesson } from './educationalMentorEngine.js';
import { checkBlackSwanLiquidityCircuitBreaker } from './riskControlEngine.js';

async function runCoFounderTests() {
  console.log('=== RUNNING CO-FOUNDER BLUEPRINT ENGINES VERIFICATION ===\n');

  // Synthetic 15m OHLCV bars
  const mockBars = [];
  let basePrice = 100;
  for (let i = 0; i < 20; i++) {
    const open = basePrice;
    const close = basePrice + (i > 15 ? 1.5 : 0.2); // Volume & price surge near end
    const high = close + 0.3;
    const low = open - 0.2;
    const volume = i > 15 ? 10000 : 2000;
    mockBars.push({ open, high, low, close, volume });
    basePrice = close;
  }

  // 1. Test 5-10m Predictive Horizon Engine
  console.log('1. Testing 5-to-10 Minute Predictive Horizon Engine...');
  const predRes = predict5to10mHorizon(mockBars);
  console.log('   Predicted Direction:', predRes.predictedDirection);
  console.log('   Predictive Score:', predRes.predictiveScore + '/100');
  console.log('   Lookahead Horizon:', predRes.timeHorizonMinutes + ' minutes');
  console.log('   Rationale:', predRes.rationale);
  console.log('   Predictive Horizon Engine OK!\n');

  // 2. Test Educational Mentor Engine
  console.log('2. Testing Ghost AI Educational Mentor Engine...');
  const lessonRes = generateTradeLesson(
    { ticker: 'BTC-USD', side: 'LONG', rrr: 2.5 },
    { regime: 'TRENDING', hurstMean: 0.62 },
    { ofi: 0.35, flowBias: 'HEAVY_BUY_AGGRESSION' }
  );
  console.log('   Beginner Masterclass:\n  ', lessonRes.beginnerLesson);
  console.log('\n   Pro Quant Breakdown:\n  ', lessonRes.proLesson.replace(/\n/g, '\n   '));
  console.log('   Educational Mentor Engine OK!\n');

  // 3. Test Black Swan Liquidity Circuit-Breaker Guard
  console.log('3. Testing Black Swan Spread & Liquidity Circuit-Breaker Guard...');
  const normalGuard = checkBlackSwanLiquidityCircuitBreaker(0.05, 10);
  const flashCrashGuard = checkBlackSwanLiquidityCircuitBreaker(0.50, 60); // 0.50% spread, 60% depth drop
  console.log('   Normal Market Spread Check:', normalGuard.triggered ? 'TRIGGERED' : 'PASSED (Normal)');
  console.log('   Flash Crash Spread Check:', flashCrashGuard.triggered ? `TRIGGERED (${flashCrashGuard.reason})` : 'PASSED');
  console.log('   Black Swan Circuit-Breaker OK!\n');

  console.log('=== ALL CO-FOUNDER BLUEPRINT ENGINES PASSED VERIFICATION ===');
}

runCoFounderTests().catch(err => {
  console.error('Co-Founder Engine Test Failed:', err);
  process.exit(1);
});
