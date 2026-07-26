import React from 'react';

export default function MarketOverviewHeader({ scanData = [] }) {
  const avgScore = scanData.length > 0
    ? Math.round(scanData.reduce((acc, curr) => acc + (curr.score || 0), 0) / scanData.length)
    : 45;
  const trapsCount = scanData.filter(d => d.shieldTriggered || d.liquidityTrap).length;
  const avgKelly = scanData.length > 0
    ? (scanData.reduce((acc, curr) => acc + (curr.recommendedSize || 0), 0) / scanData.length).toFixed(2)
    : '13.94';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '18px 22px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '16px'
    }}>
      {/* Metric 1 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="font-sans text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Macro Market Regime
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="font-orbitron font-bold" style={{ fontSize: '1.15rem', color: '#f8fafc' }}>
            Trending <span className="font-mono text-xs text-green" style={{ color: '#10b981' }}>(H = 0.640)</span>
          </span>
        </div>
      </div>

      {/* Metric 2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="font-sans text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Quant Score Average
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="font-orbitron font-bold" style={{ fontSize: '1.15rem', color: '#38bdf8' }}>
            {avgScore} / 100
          </span>
          <span className="badge-flat badge-flat-blue">Optimal</span>
        </div>
      </div>

      {/* Metric 3 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="font-sans text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Risk Shield Status
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="font-orbitron font-bold" style={{ fontSize: '1.15rem', color: trapsCount > 0 ? '#ef4444' : '#10b981' }}>
            {trapsCount} Detected
          </span>
          <span className={`badge-flat ${trapsCount > 0 ? 'badge-flat-red' : 'badge-flat-green'}`}>
            {trapsCount > 0 ? 'Shield Active' : 'Clear'}
          </span>
        </div>
      </div>

      {/* Metric 4 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="font-sans text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Portfolio Kelly Exposure
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="font-orbitron font-bold" style={{ fontSize: '1.15rem', color: '#10b981' }}>
            {avgKelly}%
          </span>
          <span className="badge-flat badge-flat-green">Capital Safe</span>
        </div>
      </div>
    </div>
  );
}
