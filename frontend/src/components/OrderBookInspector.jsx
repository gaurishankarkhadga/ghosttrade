import React from 'react';

export default function OrderBookInspector({ activeAsset }) {
  const ticker = activeAsset ? activeAsset.ticker : 'BTC-USD';
  const isNSE = ticker.includes('.NS');
  const price = activeAsset ? activeAsset.currentPrice : (isNSE ? 1280.30 : 64293.93);

  // Generate realistic L2 order book depth data
  const bids = Array.from({ length: 5 }, (_, i) => {
    const p = price - (i + 1) * (isNSE ? 1.5 : 12.5);
    const v = (Math.random() * 4 + 1.2).toFixed(2);
    const total = (p * v).toFixed(0);
    const isWall = i === 2; // Simulated resting institutional buy wall
    return { price: p.toFixed(2), size: v, total, isWall };
  });

  const asks = Array.from({ length: 5 }, (_, i) => {
    const p = price + (i + 1) * (isNSE ? 1.5 : 12.5);
    const v = (Math.random() * 4 + 1.2).toFixed(2);
    const total = (p * v).toFixed(0);
    const isWall = i === 3; // Simulated resting institutional sell wall
    return { price: p.toFixed(2), size: v, total, isWall };
  });

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="font-orbitron font-bold" style={{ fontSize: '1rem', color: '#f8fafc' }}>
            LEVEL-2 ORDER BOOK INSPECTOR
          </h3>
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            REAL-TIME DEPTH & RESTING WALL RADAR ({ticker})
          </p>
        </div>
        <span className="badge-flat badge-flat-green">L2 DEPTH ACTIVE</span>
      </div>

      {/* Grid: Asks & Bids */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
        {/* Bids Table */}
        <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 700, marginBottom: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span>BIDS (BUY DEPTH)</span>
            <span>QTY / VALUE</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {bids.map((b, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: b.isWall ? 'rgba(5, 150, 105, 0.2)' : 'transparent',
                  border: b.isWall ? '1px solid rgba(5, 150, 105, 0.4)' : 'none'
                }}
              >
                <span className="text-green font-bold">{isNSE ? `₹${b.price}` : `$${b.price}`}</span>
                <span>{b.size} {isNSE ? 'SHARES' : 'BTC'} {b.isWall && <span className="badge-flat badge-flat-green" style={{ fontSize: '0.6rem' }}>WALL</span>}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Asks Table */}
        <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: 700, marginBottom: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
            <span>ASKS (SELL DEPTH)</span>
            <span>QTY / VALUE</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {asks.map((a, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: a.isWall ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                  border: a.isWall ? '1px solid rgba(220, 38, 38, 0.4)' : 'none'
                }}
              >
                <span className="text-red font-bold" style={{ color: '#dc2626' }}>{isNSE ? `₹${a.price}` : `$${a.price}`}</span>
                <span>{a.size} {isNSE ? 'SHARES' : 'BTC'} {a.isWall && <span className="badge-flat badge-flat-red" style={{ fontSize: '0.6rem' }}>WALL</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
