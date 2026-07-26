import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import useGhostStore from './store/ghostStore';

function AuthWall() {
  const { login } = useGhostStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const success = await login(password);
    setLoading(false);
    
    if (!success) {
      setError('ACCESS DENIED: Invalid Security Authorization Key.');
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">GB</div>
          <div>
            <div className="nav-title mono">GhostBrain Terminal v3</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Institutional Execution System</div>
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="mono">AUTHORIZATION CODE</label>
            <input 
              type="password" 
              className="input-styled mono" 
              placeholder="Enter security token..." 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ 
              color: 'var(--neon-red)', 
              fontSize: '0.8rem', 
              marginBottom: '16px', 
              padding: '10px', 
              background: 'rgba(244, 63, 94, 0.1)', 
              borderRadius: '6px',
              border: '1px solid rgba(244, 63, 94, 0.2)' 
            }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-terminal mono" disabled={loading}>
            {loading ? 'VERIFYING SECURITY KEY...' : 'CONNECT TO TERMINAL'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          <span>ENCRYPTION: AES-256-GCM</span>
          <span>SYSTEM: ONLINE</span>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { wsStatus, assets, logout } = useGhostStore();
  const [activeMarket, setActiveMarket] = useState('CRYPTO');
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Mock Market Filter
  const filteredAssets = Object.values(assets).filter(asset => {
    if (activeMarket === 'CRYPTO') return !asset.ticker.endsWith('.NS');
    if (activeMarket === 'NSE') return asset.ticker.endsWith('.NS') || asset.sector === 'INDIAN_NSE';
    return true;
  });

  return (
    <div>
      <header className="terminal-nav">
        <div className="nav-brand">
          <div className="auth-logo-icon" style={{ width: '32px', height: '32px', fontSize: '0.9rem' }}>GB</div>
          <div>
            <div className="nav-title mono">GhostBrain v3</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Institutional Sub-Millisecond Engine</div>
          </div>
        </div>

        <div className="market-selector">
          <button 
            className={`market-tab ${activeMarket === 'CRYPTO' ? 'active' : ''}`}
            onClick={() => setActiveMarket('CRYPTO')}
          >
            ⚡ CRYPTO (Binance)
          </button>
          <button 
            className={`market-tab ${activeMarket === 'NSE' ? 'active' : ''}`}
            onClick={() => setActiveMarket('NSE')}
          >
            🇮🇳 INDIAN MARKET (NSE)
          </button>
        </div>

        <div className="nav-stats">
          <div className={`badge ${wsStatus === 'CONNECTED' ? 'badge-green' : 'badge-red'}`}>
            <div className="badge-dot"></div>
            <span className="mono">STREAM: {wsStatus}</span>
          </div>

          <button 
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            EXIT
          </button>
        </div>
      </header>

      <main className="grid-container">
        {filteredAssets.length === 0 && wsStatus === 'CONNECTED' && (
           <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
             <div className="mono" style={{ fontSize: '1.2rem', marginBottom: '8px' }}>PULLING REAL-TIME MARKET PIPELINE...</div>
             <p style={{ fontSize: '0.85rem' }}>Waiting for sub-millisecond calculation cycle from Ghost Brain Engine...</p>
           </div>
        )}
        
        <div className="cards-grid">
          {filteredAssets.map(asset => {
             let scoreColor = 'var(--neon-cyan)';
             if (asset.score >= 75) scoreColor = 'var(--neon-green)';
             if (asset.score < 45) scoreColor = 'var(--neon-red)';

             return (
               <div key={asset.ticker} className="quant-card">
                  <div className="card-top">
                     <div>
                        <div className="ticker-title mono">{asset.ticker}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{asset.sector || 'GENERAL'}</div>
                     </div>
                     <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                        LIVE 0.2ms
                     </span>
                  </div>
                  
                  <div className="quant-gauge-box">
                     <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        QUANT SCORE
                     </span>
                     <span className="quant-score-val mono" style={{ color: scoreColor }}>
                        {asset.score}
                     </span>
                  </div>

                  <div className="gauge-bar-bg">
                     <div 
                        className="gauge-bar-fill" 
                        style={{ 
                          width: `${Math.min(Math.max(asset.score, 5), 100)}%`, 
                          background: scoreColor,
                          boxShadow: `0 0 10px ${scoreColor}`
                        }}
                     ></div>
                  </div>

                  <div className="metrics-table">
                     <div className="metric-row">
                        <span className="metric-label">Order Flow Bias</span>
                        <span className="metric-val mono">{asset.flowBias || 'NEUTRAL'}</span>
                     </div>
                     <div className="metric-row">
                        <span className="metric-label">Whale Trap Alert</span>
                        <span 
                          className="metric-val mono" 
                          style={{ color: asset.liquidityTrap ? 'var(--neon-red)' : 'var(--neon-green)' }}
                        >
                           {asset.liquidityTrap ? '🚨 TRAP DETECTED' : '✓ CLEAR'}
                        </span>
                     </div>
                     <div className="metric-row">
                        <span className="metric-label">Macro Regime (1D)</span>
                        <span className="metric-val mono">{asset.macroRegime || 'BALANCED'}</span>
                     </div>
                     <div className="metric-row">
                        <span className="metric-label">News Sentiment</span>
                        <span className="metric-val mono">{asset.sentimentBias || 'NEUTRAL'}</span>
                     </div>
                  </div>

                  <div className="kelly-banner">
                     <div>
                        <div className="kelly-title">RECOMMENDED KELLY POSITION</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Optimal Risk Allocation</div>
                     </div>
                     <div className="kelly-val mono">
                        {asset.recommendedSize ? `${asset.recommendedSize.toFixed(2)}%` : '0.00%'}
                     </div>
                  </div>
               </div>
             );
          })}
        </div>
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useGhostStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<AuthWall />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;
