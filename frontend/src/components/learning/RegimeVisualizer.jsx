import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

export default function RegimeVisualizer({ signalFactors }) {
  const data = [
    { subject: 'Trend', A: signalFactors?.technicalConfluence || 0, fullMark: 25 },
    { subject: 'Volume', A: signalFactors?.volumeConfirmation || 0, fullMark: 15 },
    { subject: 'Order Flow', A: signalFactors?.orderFlow || 0, fullMark: 20 },
    { subject: 'Regime', A: signalFactors?.regimeAlignment || 0, fullMark: 25 },
    { subject: 'Win Rate', A: signalFactors?.historicalWinRate || 0, fullMark: 15 },
  ];

  return (
    <div className="learning-radar-container">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
          <Radar name="Signal" dataKey="A" stroke="#facc15" strokeWidth={2} fill="#facc15" fillOpacity={0.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
