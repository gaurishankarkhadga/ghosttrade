import React from 'react';

export default function RiskRewardSimulator({ riskRewardRatio, winRate }) {
  const rr = riskRewardRatio || 2;
  const wr = winRate || 50;
  
  return (
    <div className="learning-scale" style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 1rem', marginBottom: '0.5rem', color: '#94a3b8' }}>
        <span>Win Rate</span>
        <span>Risk:Reward</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 1rem', marginBottom: '1.5rem', fontWeight: 800, fontSize: '1.25rem' }}>
        <span style={{ color: '#38bdf8' }}>{wr}%</span>
        <span style={{ color: '#facc15' }}>1 : {rr}</span>
      </div>
      
      <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '0.5rem', padding: '1rem', border: '1px solid rgba(16,185,129,0.3)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(90deg, rgba(16,185,129,0.1), transparent)', zIndex: 0 }}></div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>Mathematical Expectancy</div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: '1.5rem', color: '#10b981', fontWeight: 800 }}>
          +${((wr/100)*rr*100 - (1 - wr/100)*100).toFixed(2)}
        </div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Net profit per $100 risked over time</div>
      </div>
    </div>
  );
}
