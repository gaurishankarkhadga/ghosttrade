import React, { useEffect, useState } from 'react';
import { Shield, ArrowUp, ArrowDown } from 'lucide-react';
import './RiskRewardScale.css';

const RiskRewardScale = ({ riskRewardRatio, winRate, entryPrice, stopLoss, takeProfit }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rr = Number(riskRewardRatio) || 2;
  const wr = Number(winRate) || 50;

  const expectedValue = ((wr / 100) * rr * 100) - ((1 - wr / 100) * 100);

  const ep = Number(entryPrice);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);

  let riskLabel = '1x';
  let rewardLabel = `${rr.toFixed(1)}x`;

  if (!isNaN(ep) && !isNaN(sl) && !isNaN(tp)) {
    const riskAmt = Math.abs(ep - sl);
    const rewAmt = Math.abs(tp - ep);
    if (riskAmt > 0 && rewAmt > 0) {
      riskLabel = `$${riskAmt.toFixed(4)}`;
      rewardLabel = `$${rewAmt.toFixed(4)}`;
    }
  }

  const cappedRR = Math.min(rr, 5);
  const baseHeight = 60;
  const evColorClass = expectedValue > 0 ? 'lm-rrs-text-green' : 'lm-rrs-text-red';

  return (
    <div className="lm-rrs-wrapper">
      <div className="lm-rrs-header">
        <Shield className="lm-rrs-icon" size={20} />
        <h3 className="lm-rrs-title">Risk vs Reward</h3>
      </div>
      <p className="lm-rrs-subtitle">What you could lose vs what you could gain</p>

      <div className="lm-rrs-bars-wrapper">
        <div className="lm-rrs-bar-group">
          <span className="lm-rrs-bar-label">
            RISK <ArrowDown size={14} className="lm-rrs-text-red" />
          </span>
          <span className="lm-rrs-bar-value">{riskLabel}</span>
          <div className="lm-rrs-bar-container">
            <div 
              className={`lm-rrs-bar lm-rrs-bar-risk ${mounted ? 'lm-rrs-animate-in' : ''}`}
              style={{ height: `${baseHeight}px` }}
            />
          </div>
        </div>

        <div className="lm-rrs-bar-group">
          <span className="lm-rrs-bar-label">
            REWARD <ArrowUp size={14} className="lm-rrs-text-green" />
          </span>
          <span className="lm-rrs-bar-value">{rewardLabel}</span>
          <div className="lm-rrs-bar-container">
            <div 
              className={`lm-rrs-bar lm-rrs-bar-reward ${mounted ? 'lm-rrs-animate-in' : ''}`}
              style={{ height: `${baseHeight * cappedRR}px` }}
            />
          </div>
        </div>
      </div>

      <div className="lm-rrs-metrics">
        <div className="lm-rrs-metric">
          <span className="lm-rrs-metric-name">Risk:Reward</span>
          <span className="lm-rrs-metric-val lm-rrs-text-gold">1 : {(Number(rr) || 0).toFixed(1)}</span>
        </div>
        <div className="lm-rrs-metric">
          <span className="lm-rrs-metric-name">Win Rate</span>
          <span className="lm-rrs-metric-val lm-rrs-text-blue">{(Number(wr) || 0).toFixed(1)}%</span>
        </div>
      </div>

      <div className="lm-rrs-ev-box">
        <div className="lm-rrs-ev-label">Expected Value</div>
        <div className={`lm-rrs-ev-value ${evColorClass}`}>
          {expectedValue > 0 ? '+' : ''}${(!isNaN(expectedValue) ? expectedValue : 0).toFixed(2)} 
          <span className="lm-rrs-ev-suffix"> per $100 risked</span>
        </div>
      </div>

      <p className="lm-rrs-note">
        A good setup risks less than it could gain. Ghostrade only analyzes setups with positive expected value.
      </p>
    </div>
  );
};

export default RiskRewardScale;
