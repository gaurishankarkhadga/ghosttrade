import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import './SignalStrengthRing.css';

const SignalStrengthRing = ({ score = 0 }) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let startTime;
    const duration = 1500;
    const startScore = displayScore;
    const endScore = Math.max(0, Math.min(100, score));

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayScore(startScore + (endScore - startScore) * easeProgress);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [score]);

  const getColor = (val) => {
    if (val < 40) return '#ef4444';
    if (val <= 70) return '#facc15';
    return '#10b981';
  };

  const ringColor = getColor(score);
  
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="lm-sr-container">
      <div className="lm-sr-header">
        <Gauge className="lm-sr-header-icon" size={24} style={{ color: '#facc15' }} />
        <h2 className="lm-sr-title">Signal Strength</h2>
      </div>
      <p className="lm-sr-subtitle">How confident is Ghostrade in this setup?</p>
      
      <div className="lm-sr-ring-wrapper">
        <svg 
          className="lm-sr-svg" 
          viewBox={`0 0 ${size} ${size}`}
          style={{ 
            filter: `drop-shadow(0 0 8px ${ringColor}40)`,
            '--ring-circumference': circumference 
          }}
        >
          <circle
            className="lm-sr-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <circle
            className="lm-sr-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            stroke={ringColor}
          />
        </svg>
        <div className="lm-sr-content">
          <div className="lm-sr-score" style={{ color: ringColor }}>
            {Math.floor(displayScore)}
          </div>
          <div className="lm-sr-max">/100</div>
        </div>
      </div>
      <div className="lm-sr-label">Ghostrade Signal Strength</div>
    </div>
  );
};

export default SignalStrengthRing;
