import React, { useState } from 'react';

export default function TradeExecutionModal({ asset, onClose }) {
  if (!asset) return null;

  const {
    ticker = 'RELIANCE.NS',
    currentPrice = 1280.30,
    recommendedSize = 27.89,
    shieldTriggered = false
  } = asset;

  const isNSE = ticker.includes('.NS');
  const [side, setSide] = useState('BUY');
  const [targetBroker, setTargetBroker] = useState(isNSE ? 'ANGELONE' : 'SIMULATION');
  const [capitalUsd, setCapitalUsd] = useState(10000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState(null);

  const allocatedUsd = shieldTriggered ? 0 : (capitalUsd * (recommendedSize / 100));
  const estimatedShares = Math.max(1, Math.floor(allocatedUsd / (currentPrice || 1)));

  const handleExecute = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setOrderResult({
        orderId: `ORD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        ticker,
        side,
        qty: estimatedShares,
        price: currentPrice,
        broker: targetBroker === 'ANGELONE' ? 'AngelOne SmartAPI (NSE)' : 'Paper Trading Simulator',
        timestamp: new Date().toLocaleTimeString()
      });
    }, 1000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '14px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 className="font-orbitron font-bold" style={{ fontSize: '1.2rem', color: '#f8fafc' }}>
              Execute Order ({ticker})
            </h2>
            <p className="font-sans text-xs" style={{ color: 'var(--text-muted)' }}>
              Kelly Risk Managed Order Router
            </p>
          </div>

          <button onClick={onClose} className="btn-outline font-sans" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Close
          </button>
        </div>

        {orderResult ? (
          /* Execution Confirmation Card */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="badge-flat badge-flat-green font-sans" style={{ width: '100%', padding: '14px', textAlign: 'center', fontSize: '0.9rem' }}>
              Order Successfully Placed via {orderResult.broker}
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }} className="font-mono text-xs">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order ID:</span>
                <strong>{orderResult.orderId}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ticker Symbol:</span>
                <strong>{orderResult.ticker}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Side / Quantity:</span>
                <strong style={{ color: orderResult.side === 'BUY' ? '#10b981' : '#ef4444' }}>{orderResult.side} {orderResult.qty} Units</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Execution Price:</span>
                <strong>{isNSE ? `₹${orderResult.price}` : `$${orderResult.price}`}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span>
                <strong>{orderResult.timestamp}</strong>
              </div>
            </div>

            <button onClick={onClose} className="btn-primary font-orbitron" style={{ width: '100%', padding: '12px 0' }}>
              Return to Terminal
            </button>
          </div>
        ) : (
          /* Order Configuration Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Broker Router Selector */}
            <div>
              <label className="font-sans text-xs" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Target Execution Broker
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setTargetBroker('ANGELONE')}
                  className="font-orbitron"
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: targetBroker === 'ANGELONE' ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                    background: targetBroker === 'ANGELONE' ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-surface)',
                    color: targetBroker === 'ANGELONE' ? '#38bdf8' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  AngelOne SmartAPI
                </button>

                <button
                  type="button"
                  onClick={() => setTargetBroker('SIMULATION')}
                  className="font-orbitron"
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: targetBroker === 'SIMULATION' ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                    background: targetBroker === 'SIMULATION' ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-surface)',
                    color: targetBroker === 'SIMULATION' ? '#38bdf8' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  Paper Simulator
                </button>
              </div>
            </div>

            {/* Side Switcher (BUY vs SELL) */}
            <div>
              <label className="font-sans text-xs" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Order Direction
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className="font-orbitron"
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: side === 'BUY' ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                    background: side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-surface)',
                    color: side === 'BUY' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  Buy (Long)
                </button>

                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className="font-orbitron"
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: side === 'SELL' ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
                    background: side === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-surface)',
                    color: side === 'SELL' ? '#ef4444' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  Sell (Short)
                </button>
              </div>
            </div>

            {/* Position Sizing & Price Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="font-sans text-xs" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Portfolio Capital ($)
                </label>
                <input
                  type="number"
                  value={capitalUsd}
                  onChange={e => setCapitalUsd(Number(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div>
                <label className="font-sans text-xs" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Calculated Kelly Units
                </label>
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: '#10b981'
                }}>
                  {estimatedShares} Units (${allocatedUsd.toFixed(2)})
                </div>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleExecute}
              disabled={isSubmitting || shieldTriggered}
              className="btn-primary font-orbitron"
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: '0.9rem',
                opacity: shieldTriggered ? 0.5 : 1
              }}
            >
              {isSubmitting ? 'Placing Order...' : shieldTriggered ? 'Order Blocked by Risk Shield' : `Submit ${side} Order`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
