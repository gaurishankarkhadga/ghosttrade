import React from 'react';
import SparklineCanvas from './SparklineCanvas';

export default function QuantBentoCard({ asset, onOpenDeepDive, onOpenTradeModal }) {
  const {
    ticker = 'BTC-USD',
    currentPrice = 64293.93,
    score = 70,
    flowBias = 'Strong Buy',
    macroRegime = 'Trending',
    sentimentBias = 'Neutral',
    recommendedSize = 27.89,
    shieldTriggered = false,
    sector = 'Crypto'
  } = asset;

  const isNSE = ticker.includes('.NS');
  const basePrice = currentPrice || (isNSE ? 1280.30 : 64293.93);
  const sparklineData = Array.from({ length: 24 }, (_, i) => {
    const noise = Math.sin(i / 3) * (basePrice * 0.015) + (Math.random() - 0.48) * (basePrice * 0.008);
    return basePrice + noise;
  });

  const isPositive = score >= 50 && !shieldTriggered;
  const strokeColor = isPositive ? '#10b981' : '#ef4444';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      transition: 'var(--transition-smooth)',
      position: 'relative'
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--border-medium)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--border-subtle)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="font-orbitron font-bold" style={{ fontSize: '1.15rem', color: '#f8fafc' }}>
              {ticker}
            </h2>
            <span className="badge-flat badge-flat-blue">{isNSE ? 'NSE Stock' : 'Crypto'}</span>
          </div>
          <span className="font-sans text-xs" style={{ color: 'var(--text-muted)' }}>
            Sector: {sector}
          </span>
        </div>

        {/* Live Price Display */}
        <div style={{ textAlign: 'right' }}>
          <div className="font-mono font-bold" style={{ fontSize: '1.2rem', color: '#f8fafc' }}>
            {isNSE ? `₹${currentPrice.toLocaleString()}` : `$${currentPrice.toLocaleString()}`}
          </div>
          <span className="font-sans text-xs text-green" style={{ color: '#10b981' }}>Live Price</span>
        </div>
      </div>

      {/* Sparkline Canvas & Quant Score Gauge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-app)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="font-sans text-xs" style={{ color: 'var(--text-muted)' }}>Quant Score</span>
          <span className="font-orbitron font-bold" style={{ fontSize: '1.6rem', color: isPositive ? '#10b981' : '#ef4444', lineHeight: 1 }}>
            {score} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ 100</span>
          </span>
        </div>

        <SparklineCanvas data={sparklineData} color={strokeColor} width={150} height={42} />
      </div>

      {/* Metrics Table Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        fontSize: '0.8rem',
        fontFamily: 'var(--font-sans)'
      }}>
        <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Order Flow:</span>{' '}
          <strong style={{ color: String(flowBias).toLowerCase().includes('buy') ? '#10b981' : '#ef4444' }}>{flowBias}</strong>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Hurst Regime:</span>{' '}
          <strong style={{ color: '#38bdf8' }}>{macroRegime}</strong>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Sentiment:</span>{' '}
          <strong style={{ color: String(sentimentBias).toLowerCase() === 'bearish' ? '#ef4444' : '#94a3b8' }}>{sentimentBias}</strong>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Risk Shield:</span>{' '}
          <strong style={{ color: shieldTriggered ? '#ef4444' : '#10b981' }}>
            {shieldTriggered ? 'Shield Active' : 'Clear'}
          </strong>
        </div>
      </div>

      {/* Kelly Sizing Banner */}
      <div style={{
        background: shieldTriggered ? 'var(--accent-red-bg)' : 'rgba(37, 99, 235, 0.12)',
        border: `1px solid ${shieldTriggered ? 'rgba(239, 68, 68, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span className="font-orbitron text-xs font-semibold" style={{ color: shieldTriggered ? '#ef4444' : '#38bdf8' }}>
          Kelly Position Sizing
        </span>
        <span className="font-mono font-bold" style={{ fontSize: '1rem', color: shieldTriggered ? '#ef4444' : '#10b981' }}>
          {shieldTriggered ? '0.00% (Blocked)' : `${recommendedSize}%`}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
        <button
          onClick={() => onOpenDeepDive(asset)}
          className="btn-outline font-orbitron"
          style={{ width: '100%', padding: '9px 0', fontSize: '0.8rem' }}
        >
          View Details
        </button>

        <button
          onClick={() => onOpenTradeModal(asset)}
          className="btn-primary font-orbitron"
          style={{ width: '100%', padding: '9px 0', fontSize: '0.8rem' }}
        >
          Execute Trade
        </button>
      </div>
    </div>
  );
}
