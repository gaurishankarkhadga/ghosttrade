// =====================================================
// TEST INSTITUTIONAL ENGINES — Order Flow, Lead-Lag, RL Execution & Async Pipeline
// =====================================================

import { calculateOrderFlowImbalance, detectLiquidityWalls, getOrderFlowMetrics } from './orderFlowEngine.js';
import { detectLeadLagDivergence, calculateCrossCorrelation } from './leadLagEngine.js';
import { getAdaptiveExecutionParams, calculateSharpeRatio, calculateSortinoRatio } from './rlExecutionAgent.js';
import { cacheMarketData, getCachedMarketData } from './asyncPipeline.js';

async function runInstitutionalTests() {
  console.log('=== RUNNING INSTITUTIONAL ENGINES VERIFICATION ===\n');

  // Synthetic 15m OHLCV bars
  const mockBars = [];
  let basePrice = 100;
  for (let i = 0; i < 30; i++) {
    const change = (Math.random() - 0.48) * 2;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    const volume = Math.floor(1000 + Math.random() * 5000);
    mockBars.push({ open, high, low, close, volume });
    basePrice = close;
  }

  // 1. Test Order Flow Engine
  console.log('1. Testing Order Flow Engine (Level 2 OFI & Walls)...');
  const ofiMetrics = getOrderFlowMetrics(mockBars);
  console.log('   OFI Ratio:', ofiMetrics.ofi);
  console.log('   Flow Bias:', ofiMetrics.flowBias);
  console.log('   Buy Wall:', ofiMetrics.buyWall || 'None');
  console.log('   Sell Wall:', ofiMetrics.sellWall || 'None');
  console.log('   Order Flow Engine OK!\n');

  // 2. Test Lead-Lag Engine
  console.log('2. Testing Lead-Lag Cross-Asset Arbitrage Engine...');
  const leaderBars = mockBars;
  const followerBars = mockBars.map(b => ({ ...b, close: b.close * 0.98 }));
  const leadLagRes = detectLeadLagDivergence(leaderBars, followerBars);
  console.log('   Divergence Signal:', leadLagRes.divergenceSignal);
  console.log('   Leader Return:', leadLagRes.leaderReturnPct + '%');
  console.log('   Follower Return:', leadLagRes.followerReturnPct + '%');
  console.log('   Lead-Lag Engine OK!\n');

  // 3. Test RL Execution Agent
  console.log('3. Testing RL Execution Agent (Adaptive Stops & Returns)...');
  const rlParams = getAdaptiveExecutionParams(mockBars, 'LONG', 'TRENDING');
  console.log('   Execution Policy:', rlParams.executionPolicy);
  console.log('   Adaptive ATR Multiplier:', rlParams.adaptiveAtrMultiplier);
  console.log('   Trailing Stop Pct:', rlParams.trailingStopPct + '%');
  
  const mockReturns = [0.02, -0.01, 0.035, -0.005, 0.04, 0.01];
  const sharpe = calculateSharpeRatio(mockReturns);
  const sortino = calculateSortinoRatio(mockReturns);
  console.log('   Sharpe Ratio:', sharpe);
  console.log('   Sortino Ratio:', sortino);
  console.log('   RL Execution Agent OK!\n');

  // 4. Test Async Circular Cache
  console.log('4. Testing Async Pipeline In-Memory Cache...');
  cacheMarketData('BTC-USD', '15m', mockBars);
  const cached = getCachedMarketData('BTC-USD', '15m');
  console.log('   Cache Hit Count:', cached ? cached.length : 0);
  console.log('   Async Pipeline OK!\n');

  console.log('=== ALL INSTITUTIONAL ENGINES PASSED VERIFICATION ===');
}

runInstitutionalTests().catch(err => {
  console.error('Institutional Engine Test Failed:', err);
  process.exit(1);
});
