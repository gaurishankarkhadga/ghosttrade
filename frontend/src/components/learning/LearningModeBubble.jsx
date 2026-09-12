import React, { useState, useEffect } from 'react';
import { Shield, Zap, Activity, Crosshair, BarChart3, TrendingUp, Layers, CheckCircle } from 'lucide-react';
import PriceActionCanvas from './PriceActionCanvas';
import RegimeVisualizer from './RegimeVisualizer';
import OrderFlowWaterfall from './OrderFlowWaterfall';
import RiskRewardSimulator from './RiskRewardSimulator';
import MarketAnalogyCard from './MarketAnalogyCard';
import LearningQuizCard from './LearningQuizCard';
import './LearningMode.css';

const LearningModeBubble = ({ tradeData, content, isGenerating }) => {
  const [displayedScore, setDisplayedScore] = useState(0);

  useEffect(() => {
    if (!tradeData?.signalScore) return;
    const target = tradeData.signalScore;
    let start = 0;
    const duration = 1000;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setDisplayedScore(target);
        clearInterval(timer);
      } else {
        setDisplayedScore(start);
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [tradeData?.signalScore]);

  // If there's no trade data yet...
  if (!tradeData) {
    return (
      <div className="learning-bubble">
        {/* If we are generating, show loading animation with the stream text */}
        {isGenerating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
            <Activity size={32} color="#facc15" style={{ animation: 'pulseGlow 2s infinite' }} />
            <div style={{ color: '#94a3b8', marginTop: '1rem', fontWeight: 600 }}>Analyzing Market Data...</div>
            {content && (
              <div style={{ marginTop: '1.5rem', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.6', textAlign: 'left', width: '100%', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '0.5rem' }}>
                {content}
              </div>
            )}
          </div>
        ) : (
          /* If generation finished and no tradeData, it was a conversational question */
          <div className="learning-section">
            <div style={{ color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{content}</div>
          </div>
        )}
      </div>
    );
  }

  const { direction, entryPrice, stopLoss, takeProfit, riskRewardRatio, signalScore, regime, ofiData, winRate, candles, educationalLesson, signalFactors } = tradeData;
  const isBuy = direction === 'BUY' || direction === 'LONG';

  return (
    <div className="learning-bubble">
      
      {/* 1. Header */}
      <div className="learning-section learning-delay-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(30,25,15,0.9), rgba(20,16,8,0.95))' }}>
        <div>
          <div className={`learning-direction-pill ${isBuy ? 'buy' : 'sell'}`}>
            <Zap size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            {direction} SIGNAL
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '1.1rem', color: '#94a3b8' }}>
            Entry: <span style={{ color: '#fff', fontWeight: '800' }}>{entryPrice ? `$${entryPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}` : 'Market'}</span>
          </div>
        </div>
        
        <div className="learning-confidence-ring">
          <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle className="learning-confidence-track" cx="50" cy="50" r="40" />
            <circle 
              className="learning-confidence-fill" 
              cx="50" cy="50" r="40" 
              style={{ strokeDashoffset: 251.2 - (251.2 * (signalScore || 0) / 100) }}
            />
          </svg>
          <div className="learning-confidence-score">{Math.round(displayedScore)}</div>
        </div>
      </div>

      {/* AI Explanation / Content (If any text was streamed, let's show it here!) */}
      {content && (
        <div className="learning-section learning-delay-2" style={{ borderLeft: '3px solid #38bdf8' }}>
          <div style={{ color: '#e2e8f0', lineHeight: 1.6, fontSize: '0.95rem' }}>{content}</div>
        </div>
      )}

      {/* 2. Price Action Canvas */}
      {candles && candles.length > 0 && (
        <div className="learning-section learning-delay-2" style={{ padding: '0.5rem' }}>
          <div className="learning-section-title" style={{ padding: '1rem 1rem 0 1rem' }}>
            <TrendingUp size={18} /> Price Action Setup
          </div>
          <div style={{ padding: '0 1rem' }} className="learning-section-label">
            We use these candlestick patterns to spot institutional footprints before retail traders react.
          </div>
          <PriceActionCanvas 
            candles={candles} 
            entryPrice={entryPrice} 
            stopLoss={stopLoss} 
            takeProfit={takeProfit} 
            direction={direction} 
          />
        </div>
      )}

      {/* 3. Regime Visualizer */}
      {signalFactors && (
        <div className="learning-section learning-delay-3">
           <div className="learning-section-title">
             <Crosshair size={18} /> Edge Matrix
           </div>
           <RegimeVisualizer signalFactors={signalFactors} />
           <div className="learning-section-label">
             Our model scans 5 different technical layers. When they all stretch outwards, conviction is highest.
           </div>
        </div>
      )}

      {/* 4. Order Flow Waterfall */}
      {ofiData && (
        <div className="learning-section learning-delay-4">
           <div className="learning-section-title">
             <Activity size={18} /> Order Flow Imbalance
           </div>
           <OrderFlowWaterfall ofiData={ofiData} />
           <div className="learning-section-label">
             This isn't lagging indicator data. This is real-time aggressive market buying vs selling pressure.
           </div>
        </div>
      )}

      {/* 5. Heatmap inline */}
      {signalFactors && (
        <div className="learning-section learning-delay-5">
          <div className="learning-section-title">
            <Layers size={18} /> Signal Factors
          </div>
          <div className="learning-heatmap">
            {Object.entries(signalFactors).filter(([k]) => k !== 'ofiSource').map(([key, val]) => {
              const numVal = Number(val);
              const maxVal = key === 'regimeAlignment' ? 25 : key === 'technicalConfluence' ? 25 : 20;
              const pct = (numVal / maxVal) * 100;
              const hue = pct > 60 ? 150 : pct > 30 ? 40 : 0; // green, orange, red
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="learning-heatmap-cell" style={{ background: `hsl(${hue}, 70%, 15%)`, border: `1px solid hsl(${hue}, 70%, 30%)`, color: `hsl(${hue}, 70%, 70%)`, width: '100%' }}>
                    {numVal}
                  </div>
                  <div className="learning-heatmap-label">{key.substring(0,4).toUpperCase()}</div>
                </div>
              );
            })}
          </div>
          <p className="learning-section-label">Green factors confirm the trade. We want alignment across multiple variables.</p>
        </div>
      )}

      {/* 6. Risk Reward Simulator */}
      {(riskRewardRatio || winRate) && (
        <div className="learning-section learning-delay-6">
           <div className="learning-section-title">
             <Shield size={18} /> Expectancy (EV)
           </div>
           <RiskRewardSimulator riskRewardRatio={riskRewardRatio} winRate={winRate} />
        </div>
      )}

      {/* 7. Market Analogy Card */}
      <MarketAnalogyCard 
        regime={regime} 
        direction={direction} 
      />

      {/* 8. Learning Quiz Card */}
      <LearningQuizCard />

    </div>
  );
};

export default LearningModeBubble;
