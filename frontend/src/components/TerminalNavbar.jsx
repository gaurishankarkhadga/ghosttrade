import React from 'react';

export default function TerminalNavbar({
  activeMarket,
  onSelectMarket,
  searchQuery,
  onSearchChange,
  onOpenCmdK,
  isConnected,
  onLockTerminal
}) {
  return (
    <header style={{
      height: '64px',
      background: 'rgba(17, 20, 29, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand Logo & Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          color: '#fff',
          fontSize: '1.05rem',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          GT
        </div>
        <div>
          <h1 className="font-orbitron font-bold" style={{ fontSize: '1.05rem', color: '#f8fafc', lineHeight: 1.1 }}>
            GhostTrade <span style={{ color: '#38bdf8', fontSize: '0.78rem', fontWeight: 600 }}>Quant v3</span>
          </h1>
          <p className="font-sans text-xs" style={{ color: 'var(--text-muted)' }}>
            Institutional Trading Engine
          </p>
        </div>
      </div>

      {/* Market Router Switcher */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-input)',
        padding: '3px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        gap: '4px'
      }}>
        {[
          { id: 'ALL', label: 'All Markets' },
          { id: 'CRYPTO', label: 'Crypto Assets' },
          { id: 'NSE', label: 'Indian Equities (NSE)' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelectMarket(tab.id)}
            className="font-orbitron"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem',
              fontWeight: 600,
              border: activeMarket === tab.id ? '1px solid var(--border-accent)' : 'none',
              background: activeMarket === tab.id ? 'var(--bg-surface-elevated)' : 'transparent',
              color: activeMarket === tab.id ? '#38bdf8' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search ticker (e.g. Reliance, BTC)..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 12px',
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              outline: 'none',
              width: '210px',
              fontFamily: 'var(--font-sans)'
            }}
          />
        </div>

        <button
          onClick={onOpenCmdK}
          className="badge-flat font-mono"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '7px 10px'
          }}
        >
          <span style={{ color: '#38bdf8' }}>Cmd + K</span>
        </button>

        <div className={`badge-flat ${isConnected ? 'badge-flat-green' : 'badge-flat-red'}`}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isConnected ? '#10b981' : '#ef4444'
          }}></span>
          <span>{isConnected ? 'Stream Active' : 'Offline'}</span>
        </div>

        <button
          onClick={onLockTerminal}
          className="btn-outline font-orbitron"
          style={{ padding: '6px 14px', fontSize: '0.78rem' }}
        >
          Lock
        </button>
      </div>
    </header>
  );
}
