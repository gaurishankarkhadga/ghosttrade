import React, { useState, useEffect } from 'react';

export default function CommandPalette({ isOpen, onClose, onSelectMarket, onSelectTicker }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    { type: 'MARKET', label: 'Switch to Crypto Market (Binance)', action: () => { onSelectMarket('CRYPTO'); onClose(); } },
    { type: 'MARKET', label: 'Switch to Indian Equities (NSE/BSE)', action: () => { onSelectMarket('NSE'); onClose(); } },
    { type: 'MARKET', label: 'View All Monitored Assets', action: () => { onSelectMarket('ALL'); onClose(); } },
    { type: 'TICKER', label: 'Analyze BTC-USD (Bitcoin)', action: () => { onSelectTicker('BTC-USD'); onClose(); } },
    { type: 'TICKER', label: 'Analyze RELIANCE.NS (Reliance Industries)', action: () => { onSelectTicker('RELIANCE.NS'); onClose(); } },
    { type: 'TICKER', label: 'Analyze TCS.NS (Tata Consultancy)', action: () => { onSelectTicker('TCS.NS'); onClose(); } },
    { type: 'TICKER', label: 'Analyze ETH-USD (Ethereum)', action: () => { onSelectTicker('ETH-USD'); onClose(); } },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
          <span className="font-orbitron font-bold text-cyan" style={{ fontSize: '0.9rem' }}>CMD+K</span>
          <input
            type="text"
            placeholder="Type a command or search ticker (e.g. RELIANCE, BTC)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem'
            }}
          />
          <span className="badge-flat font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>ESC</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
          {filtered.length > 0 ? (
            filtered.map((cmd, idx) => (
              <div
                key={idx}
                onClick={cmd.action}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'var(--transition-smooth)'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                <span className="font-sans" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{cmd.label}</span>
                <span className="badge-flat badge-flat-blue" style={{ fontSize: '0.68rem' }}>{cmd.type}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No matching commands or assets found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
