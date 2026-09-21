import React, { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import './MarketMoodGauge.css';

const MarketMoodGauge = ({ regime, direction }) => {
  const [rotation, setRotation] = useState(-90);

  useEffect(() => {
    let target = 0;
    
    // Normalize direction to uppercase string
    const dir = (direction || '').toUpperCase();
    const isBullish = ['BUY', 'LONG', 'BULLISH'].includes(dir);
    const isBearish = ['SELL', 'SHORT', 'BEARISH'].includes(dir);

    if (regime === 'TRENDING') {
      target = isBullish ? 60 : (isBearish ? -60 : 0);
    } else if (regime === 'MEAN_REVERTING') {
      target = isBullish ? 20 : (isBearish ? -20 : 0);
    } else {
      // RANDOM_WALK or unknown
      target = 0;
    }

    // Set rotation after a brief delay for animation
    const timer = setTimeout(() => setRotation(target), 100);
    return () => clearTimeout(timer);
  }, [regime, direction]);

  const getDescription = () => {
    const dir = (direction || '').toUpperCase();
    const isBullish = ['BUY', 'LONG', 'BULLISH'].includes(dir);
    const isBearish = ['SELL', 'SHORT', 'BEARISH'].includes(dir);

    if (regime === 'TRENDING') {
      if (isBullish) return 'The market is moving up with strong momentum';
      if (isBearish) return 'The market is moving down with strong pressure';
      return 'The market is moving with strong momentum';
    }
    if (regime === 'MEAN_REVERTING') {
      return 'The market is bouncing between levels — no clear trend';
    }
    return 'No clear direction right now — Ghostrade data suggests low probability';
  };

  const getSubtext = () => {
    if (regime === 'TRENDING') return 'Strong momentum detected';
    if (regime === 'MEAN_REVERTING') return 'Ranging conditions detected';
    return 'No clear trend right now';
  };

  return (
    <div className="lm-mg-container">
      <div className="lm-mg-header">
        <Compass className="lm-mg-icon" size={24} />
        <h3 className="lm-mg-title">Market Direction</h3>
      </div>
      <p className="lm-mg-subtitle">{getSubtext()}</p>
      
      <div className="lm-mg-gauge-wrapper">
        <svg viewBox="0 0 280 140" className="lm-mg-gauge">
          {/* Red Zone */}
          <path d="M 20 130 A 110 110 0 0 1 85 45" fill="none" stroke="#ef4444" strokeWidth="24" strokeLinecap="round" />
          {/* Yellow Zone */}
          <path d="M 85 45 A 110 110 0 0 1 195 45" fill="none" stroke="#facc15" strokeWidth="24" strokeLinecap="round" />
          {/* Green Zone */}
          <path d="M 195 45 A 110 110 0 0 1 260 130" fill="none" stroke="#10b981" strokeWidth="24" strokeLinecap="round" />
          
          {/* Needle Pivot */}
          <circle cx="140" cy="130" r="8" fill="white" />
          
          {/* Needle Group */}
          <g className="lm-mg-needle-group" style={{ transform: `rotate(${rotation}deg)` }}>
            <line x1="140" y1="130" x2="140" y2="40" stroke="white" strokeWidth="4" strokeLinecap="round" />
            <circle cx="140" cy="40" r="4" fill="#facc15" />
          </g>
        </svg>
      </div>

      <div className="lm-mg-labels">
        <span className="lm-mg-label lm-mg-label-red">Sellers</span>
        <span className="lm-mg-label lm-mg-label-yellow">Sideways</span>
        <span className="lm-mg-label lm-mg-label-green">Buyers</span>
      </div>

      <p className="lm-mg-description">{getDescription()}</p>
    </div>
  );
};

export default MarketMoodGauge;
