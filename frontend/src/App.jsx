import React, { useState } from 'react';
import useGhostStore from './store/ghostStore';

function App() {
  const { isAuthenticated, login, wsStatus, assets } = useGhostStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const success = await login(password);
    if (!success) setError('Invalid access code.');
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <form className="glass-panel auth-box" onSubmit={handleLogin}>
          <h2><span className="mono">GhostBrain v3</span> Authentication</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Institutional Quant Terminal</p>
          <input 
            type="password" 
            className="input-field" 
            placeholder="Enter Access Code..." 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p style={{ color: 'var(--accent-red)', fontSize: '0.9rem' }}>{error}</p>}
          <button type="submit" className="btn-primary">INITIATE CONNECTION</button>
        </form>
      </div>
    );
  }

  // Determine global status color based on WebSocket
  let statusColor = 'yellow';
  if (wsStatus === 'CONNECTED') statusColor = 'green';
  if (wsStatus === 'DISCONNECTED') statusColor = 'red';

  return (
    <div>
      <header style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="mono">GhostBrain Terminal</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Live Multi-Layer Execution Pipeline</p>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span className={`status-badge ${statusColor}`}>
             WS: {wsStatus}
          </span>
        </div>
      </header>

      <main className="dashboard-grid">
        {Object.values(assets).length === 0 && wsStatus === 'CONNECTED' && (
           <p style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1', textAlign: 'center', marginTop: '50px' }}>
             Waiting for initial scan payload from Ghost Brain...
           </p>
        )}
        
        {Object.values(assets).map(asset => {
           let scoreColor = '#3b82f6';
           if (asset.score >= 80) scoreColor = '#10b981';
           if (asset.score < 40) scoreColor = '#ef4444';

           return (
             <div key={asset.ticker} className="glass-panel asset-card">
                <div className="asset-header">
                   <h2 className="mono">{asset.ticker}</h2>
                   <span className="status-badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{asset.sector}</span>
                </div>
                
                <div style={{ padding: '10px 0' }}>
                   <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>QuantScore</p>
                   <div className="quant-score" style={{ color: scoreColor }}>{asset.score}</div>
                   <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${asset.score}%`, background: scoreColor }}></div>
                   </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                   <div className="metric-row">
                      <span>Order Flow Bias</span>
                      <span className="metric-value">{asset.flowBias}</span>
                   </div>
                   <div className="metric-row">
                      <span>Whale Trap</span>
                      <span className="metric-value" style={{ color: asset.liquidityTrap ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                         {asset.liquidityTrap ? 'DETECTED' : 'CLEAR'}
                      </span>
                   </div>
                   <div className="metric-row">
                      <span>Macro Regime (1d)</span>
                      <span className="metric-value">{asset.macroRegime}</span>
                   </div>
                   <div className="metric-row">
                      <span>News Sentiment</span>
                      <span className="metric-value">{asset.sentimentBias}</span>
                   </div>
                </div>

                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                   <div className="metric-row">
                      <span style={{ fontWeight: 'bold' }}>Recommended Kelly Size</span>
                      <span className="metric-value" style={{ fontSize: '1.2rem', color: asset.recommendedSize > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                         {asset.recommendedSize.toFixed(2)}%
                      </span>
                   </div>
                </div>
             </div>
           );
        })}
      </main>
    </div>
  );
}

export default App;
