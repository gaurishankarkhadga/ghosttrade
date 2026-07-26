import React from 'react';

export default function TelemetryFooter({ isConnected, totalAssets = 2 }) {
  return (
    <footer style={{
      background: 'rgba(14, 16, 23, 0.95)',
      borderTop: '1px solid var(--border-subtle)',
      padding: '10px 24px',
      fontSize: '0.72rem',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      bottom: 0,
      zIndex: 50
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>NODE: <strong style={{ color: '#f8fafc' }}>ASIA-EAST-01</strong></span>
        <span>LATENCY: <strong style={{ color: '#059669' }}>0.2ms</strong></span>
        <span>ENGINE: <strong style={{ color: '#38bdf8' }}>HURST / DFA / BAYESIAN ACTIVE</strong></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span>MONITORED ASSETS: <strong style={{ color: '#f8fafc' }}>{totalAssets} TICKERS</strong></span>
        <span>ANGELONE ADAPTER: <strong style={{ color: '#059669' }}>READY (NSE/BSE)</strong></span>
        <span>WS STREAM: <strong style={{ color: isConnected ? '#059669' : '#dc2626' }}>{isConnected ? 'ONLINE' : 'RECONNECTING'}</strong></span>
      </div>
    </footer>
  );
}
