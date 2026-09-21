import React from 'react';
import { BookOpen, Zap, Activity } from 'lucide-react';
import StepProgressBar from './StepProgressBar';
import MarketMoodGauge from './MarketMoodGauge';
import SignalStrengthRing from './SignalStrengthRing';
import PriceStoryChart from './PriceStoryChart';
import BuyerVsSellerTug from './BuyerVsSellerTug';
import EdgeRadar from './EdgeRadar';
import RiskRewardScale from './RiskRewardScale';
import SimpleLesson from './SimpleLesson';
import './LearningModeBubble.css';

const LearningModeBubble = ({ tradeData, content, isGenerating }) => {
  const data = tradeData || {};
  const direction = data.direction || data.side || '';
  const dirUpper = direction.toString().toUpperCase();
  const isBuy = dirUpper === 'BUY' || dirUpper === 'LONG' || dirUpper === 'BULLISH';

  return (
    <div className="lm-container">
      <div className="lm-header-section">
        <div className="lm-badge">
          <BookOpen size={14} />
          <span>LEARNING MODE</span>
        </div>
        
        <div className="lm-title-row">
          {tradeData ? (
            <div className={`lm-direction-pill ${isBuy ? 'lm-pill-buy' : 'lm-pill-sell'}`}>
              <Zap size={14} />
              <span>{isBuy ? 'BULLISH SETUP' : 'BEARISH SETUP'}</span>
            </div>
          ) : (
            <div className="lm-direction-pill" style={{ background: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Activity className="lm-loading-icon" size={14} />
              <span>ANALYZING MARKET...</span>
            </div>
          )}
          {data.asset && (
            <div className="lm-asset-name">{data.asset}</div>
          )}
        </div>
      </div>


      <div className="lm-progress-wrapper">
        <StepProgressBar activeStep={tradeData ? 7 : 3} />
      </div>

      <div className="lm-steps-container">
        <div className="lm-step-section lm-delay-1">
          <MarketMoodGauge 
            regime={data.regime} 
            direction={direction} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-2">
          <SignalStrengthRing 
            score={data.signalScore} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-3">
          <PriceStoryChart 
            candles={data.candles} 
            entryPrice={data.entryPrice} 
            stopLoss={data.stopLoss} 
            takeProfit={data.takeProfit} 
            direction={direction} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-4">
          <BuyerVsSellerTug 
            ofiData={data.ofiData} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-5">
          <EdgeRadar 
            signalFactors={data.signalFactors || data.scoreBreakdown} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-6">
          <RiskRewardScale 
            riskRewardRatio={data.riskRewardRatio} 
            winRate={data.winRate} 
            entryPrice={data.entryPrice} 
            stopLoss={data.stopLoss} 
            takeProfit={data.takeProfit} 
          />
        </div>
        
        <div className="lm-step-section lm-delay-7">
          <SimpleLesson 
            educationalLesson={data.educationalLesson} 
            direction={direction} 
          />
        </div>
      </div>
    </div>
  );
};

export default LearningModeBubble;
