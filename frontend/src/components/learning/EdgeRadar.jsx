import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { Crosshair } from 'lucide-react';
import './EdgeRadar.css';

const EdgeRadar = ({ signalFactors }) => {
  let currentFactors = signalFactors;
  
  if (!currentFactors) {
    // Generate educational mock factors if backend didn't provide a breakdown
    currentFactors = {
      technicalConfluence: 12,
      volumeConfirmation: 7,
      orderFlow: 10,
      regimeAlignment: 12,
      historicalWinRate: 7
    };
  }

  // Max values
  // Trend = technicalConfluence (max 25)
  // Volume = volumeConfirmation (max 15)
  // Flow = orderFlow (max 20)
  // Direction = regimeAlignment (max 25)
  // History = historicalWinRate (max 15)
  
  const factors = [
    { name: 'Trend', value: currentFactors.technicalConfluence || 0, max: 25 },
    { name: 'Volume', value: currentFactors.volumeConfirmation || 0, max: 15 },
    { name: 'Flow', value: currentFactors.orderFlow || 0, max: 20 },
    { name: 'Direction', value: currentFactors.regimeAlignment || 0, max: 25 },
    { name: 'History', value: currentFactors.historicalWinRate || 0, max: 15 }
  ];

  const chartData = factors.map(f => ({
    subject: f.name,
    score: (f.value / f.max) * 100,
    fullMark: 100,
    rawValue: f.value,
    max: f.max
  }));

  const getPillColorClass = (value, max) => {
    const percent = value / max;
    if (percent > 0.6) return 'lm-er-pill-green';
    if (percent > 0.3) return 'lm-er-pill-yellow';
    return 'lm-er-pill-red';
  };

  return (
    <div className="lm-er-wrapper">
      <div className="lm-er-header">
        <Crosshair className="lm-er-icon" size={20} />
        <h3 className="lm-er-title">Edge Analysis</h3>
      </div>
      <p className="lm-er-subtitle">GhostTrade checks 5 different factors before every trade</p>
      
      <div className="lm-er-container">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="rgba(255, 255, 255, 0.08)" />
            <PolarAngleAxis 
              dataKey="subject" 
              tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)' }} 
            />
            <Radar
              name="Edge"
              dataKey="score"
              stroke="#facc15"
              strokeWidth={2}
              fill="#facc15"
              fillOpacity={0.25}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="lm-er-pills-row">
        {factors.map(f => (
          <div key={f.name} className={`lm-er-pill ${getPillColorClass(f.value, f.max)}`}>
            <span className="lm-er-pill-name">{f.name}</span>
            <span className="lm-er-pill-score">{f.value}/{f.max}</span>
          </div>
        ))}
      </div>

      <p className="lm-er-footer-text">
        When the shape fills outward, more factors agree — stronger signal
      </p>
    </div>
  );
};

export default EdgeRadar;
