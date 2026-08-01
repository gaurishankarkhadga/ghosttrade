import { getDb, closeDb } from './mongoConfig.js';
import { calculateHurst } from './hurstEngine.js';
import { classifyRegime } from './regimeClassifier.js';
import { sma, atr } from './technicalEngine.js';
import { detectPatterns } from './patternEngine.js';
import { computeStopLossTakeProfit } from './slTpCalculator.js';
import { getLogReturns, fetchMultiTimeframeOHLCV, getClosePrices } from './dataFetcher.js';
import { CURRENT_LOGIC_VERSION, constructSetupId } from './sharedConfig.js';

const BACKTEST_CONFIG = {
  forward_window_bars: { "15m": 40, "1h": 30, "1d": 15 },
  reward_risk_ratio: 2.0,
  min_sample_size: 30,
  warmup_period_bars: 250,
  slippage_pct: 0.001, // 0.1% slippage
};

export async function runBacktest(asset, timeframe) {
  console.log(`[BACKTEST] Starting for ${asset} on ${timeframe}...`);
  const data = await fetchMultiTimeframeOHLCV(asset, 3000); // 3000 bars
  
  if (!data || data.error) {
    console.log(`[BACKTEST] Failed to fetch data: ${data?.error || 'Unknown'}`);
    return;
  }
  
  const bars = data.timeframes ? data.timeframes[timeframe] : data[timeframe];
  if (!bars || bars.length < BACKTEST_CONFIG.warmup_period_bars) {
    console.log(`[BACKTEST] Not enough bars for ${asset} on ${timeframe}`);
    return;
  }
  console.log(`[BACKTEST] Fetched ${bars.length} bars.`);

  const results = [];
  const buckets = {
    '> 0.80': { wins: 0, total: 0 },
    '0.70-0.80': { wins: 0, total: 0 },
    '0.60-0.70': { wins: 0, total: 0 },
    '0.50-0.60': { wins: 0, total: 0 },
    '0.40-0.50': { wins: 0, total: 0 },
    '< 0.40': { wins: 0, total: 0 }
  };
  let maxHeuristicScore = 0;
  const forwardWindow = BACKTEST_CONFIG.forward_window_bars[timeframe] || 30;

  for (let i = BACKTEST_CONFIG.warmup_period_bars; i < bars.length - forwardWindow; i++) {
    const historicalSlice = bars.slice(i - BACKTEST_CONFIG.warmup_period_bars, i + 1);
    const pattern = detectPatterns(historicalSlice);
    
    if (!pattern) continue;

    const closes = getClosePrices(historicalSlice);
    const logReturns = getLogReturns(historicalSlice);
    const hurstResult = calculateHurst(logReturns);
    
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    
    let smaAlignment = 'NEUTRAL';
    if (ma20 > ma50 && ma50 > ma200) smaAlignment = 'BULLISH';
    if (ma20 < ma50 && ma50 < ma200) smaAlignment = 'BEARISH';
    
    const regime = classifyRegime(hurstResult);
    
    const setup_id = constructSetupId(pattern, regime.regime, closes);
    if (!setup_id) continue;

    const BULLISH_PATTERNS = ['hammer', 'bullish_engulfing', 'morning_star', 'three_white_soldiers'];
    const tradeSide = BULLISH_PATTERNS.includes(pattern) ? 'LONG' : 'SHORT';
    
    const slTp = computeStopLossTakeProfit(historicalSlice, tradeSide, 1.5, BACKTEST_CONFIG.reward_risk_ratio);
    if (!slTp) continue;

    const entryPrice = closes[closes.length - 1] * (tradeSide === 'LONG' ? (1 + BACKTEST_CONFIG.slippage_pct) : (1 - BACKTEST_CONFIG.slippage_pct));
    const stopLoss = slTp.stopLoss;
    const takeProfit = slTp.takeProfit;
    
    let outcome = "NO_RESULT";
    const futureBars = bars.slice(i + 1, i + 1 + forwardWindow);
    
    for (const fb of futureBars) {
      if (tradeSide === 'LONG') {
        if (fb.low <= stopLoss) { outcome = "LOSS"; break; }
        if (fb.high >= takeProfit) { outcome = "WIN"; break; }
      } else {
        if (fb.high >= stopLoss) { outcome = "LOSS"; break; }
        if (fb.low <= takeProfit) { outcome = "WIN"; break; }
      }
    }

    if (outcome !== "NO_RESULT") {
      results.push({
        setup_id,
        outcome,
        pnl_pct: outcome === "WIN" ? BACKTEST_CONFIG.reward_risk_ratio : -1
      });

      // Track empirical win rate by heuristicScore bucket
      const score = regime.heuristicScore / 100; // It was expressed as a percentage
      if (score > maxHeuristicScore) maxHeuristicScore = score;
      
      let bucketKey = '< 0.40';
      if (score > 0.80) bucketKey = '> 0.80';
      else if (score >= 0.70) bucketKey = '0.70-0.80';
      else if (score >= 0.60) bucketKey = '0.60-0.70';
      else if (score >= 0.50) bucketKey = '0.50-0.60';
      else if (score >= 0.40) bucketKey = '0.40-0.50';
      
      buckets[bucketKey].total++;
      if (outcome === 'WIN') buckets[bucketKey].wins++;
    }
  }

  const setupGroups = {};
  for (const r of results) {
    if (!setupGroups[r.setup_id]) {
      setupGroups[r.setup_id] = { win_count: 0, loss_count: 0, wins_pnl: 0, losses_pnl: 0, all_returns: [] };
    }
    const g = setupGroups[r.setup_id];
    if (r.outcome === "WIN") {
      g.win_count++;
      g.wins_pnl += r.pnl_pct;
    } else {
      g.loss_count++;
      g.losses_pnl += r.pnl_pct;
    }
    g.all_returns.push(r.pnl_pct);
  }

  const db = await getDb();
  const setupStatsColl = db.collection('setup_stats');
  const logic_version = CURRENT_LOGIC_VERSION;

  let upsertCount = 0;
  for (const [setup_id, g] of Object.entries(setupGroups)) {
    const total_resolved = g.win_count + g.loss_count;
    if (total_resolved === 0) continue;

    const win_rate = g.win_count / total_resolved;
    const mean_return = (g.wins_pnl + g.losses_pnl) / total_resolved;
    
    let sum_sq_diff = 0;
    for (const ret of g.all_returns) {
      sum_sq_diff += Math.pow(ret - mean_return, 2);
    }
    const variance = total_resolved > 1 ? sum_sq_diff / (total_resolved - 1) : 0;

    let confidence_flag = "OK";
    if (total_resolved < BACKTEST_CONFIG.min_sample_size) {
      confidence_flag = "INSUFFICIENT_DATA";
    } else if (win_rate < 0.40) {
      confidence_flag = "NEGATIVE_EDGE";
    }

    await setupStatsColl.updateOne(
      { setup_id, asset_class: 'crypto', timeframe },
      {
        $set: {
          asset_class: 'crypto',
          timeframe,
          win_rate,
          sample_size: total_resolved,
          mean_return,
          variance,
          confidence_flag,
          logic_version,
          atr_sl_multiplier: 1.5,
          tested_reward_risk_ratio: BACKTEST_CONFIG.reward_risk_ratio,
          last_updated: new Date().toISOString()
        }
      },
      { upsert: true }
    );
    upsertCount++;
  }
  console.log(`[BACKTEST] Upserted ${upsertCount} setups to MongoDB.`);
  
  // Print empirical bucket table
  console.log(`\n=== EMPIRICAL HEURISTIC VALIDATION for ${asset} ${timeframe} ===`);
  console.log(`Maximum Heuristic Score Reached: ${(maxHeuristicScore * 100).toFixed(2)}%`);
  console.log(`Bucket\t\tWin Rate\tTotal Trades`);
  for (const [bucket, data] of Object.entries(buckets)) {
      const wr = data.total > 0 ? ((data.wins / data.total) * 100).toFixed(1) + '%' : 'N/A';
      console.log(`${bucket}\t\t${wr}\t\t${data.total}`);
  }
  console.log(`=========================================================\n`);
}

if (process.argv[1] && process.argv[1].endsWith('backtestEngine.js')) {
  // Can add manual run trigger here if needed
}
