import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Zap, Globe, CheckCircle, AlertTriangle, Trash2, Eye, EyeOff, Link2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useGhostStore from '../store/ghostStore';
import './BrokerSettingsPage.css';

const BROKER_INFO = {
  BINANCE: {
    name: 'Binance',
    description: 'Crypto — 600+ pairs globally',
    color: '#f0b90b',
    mode: 'LIVE_CRYPTO',
    guide: 'Secure, 1-Click OAuth connection to Binance.',
  },
  ALPACA: {
    name: 'Alpaca',
    description: 'US Stocks — $0 commission',
    color: '#ffdc00',
    mode: 'LIVE_US',
    guide: 'Secure, 1-Click OAuth connection to Alpaca.',
  },
  IBKR: {
    name: 'Interactive Brokers',
    description: '170+ markets, 40 countries',
    color: '#d92b2b',
    mode: 'LIVE_GLOBAL',
    guide: 'Secure, 1-Click OAuth connection to Interactive Brokers.',
  },
  ANGEL_ONE: {
    name: 'Angel One',
    description: 'Indian F&O — Nifty/BankNifty',
    color: '#ff7b00',
    mode: 'LIVE_FNO',
    guide: 'Native SmartAPI connection for F&O execution.',
  }
};

function BrokerCard({ brokerKey, isConnected, connectedAt, onDisconnect }) {
  const info = BROKER_INFO[brokerKey];
  const [isEditing, setIsEditing] = useState(false);
  
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  
  const [clientCode, setClientCode] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const token = useGhostStore(state => state.token);
  const fetchBrokerStatus = useGhostStore(state => state.fetchBrokerStatus);

  const handleConnectClick = () => {
    if (isConnected) return;
    setIsEditing(!isEditing);
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (brokerKey === 'ANGEL_ONE') {
      if (!clientCode || !password || !totpSecret) {
        alert('Client ID, Password, and TOTP Secret are required for Angel One.');
        return;
      }
    } else {
      if (!apiKey || !apiSecret) {
        alert('API Key and Secret are required.');
        return;
      }
    }
    
    setIsSubmitting(true);
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const payload = brokerKey === 'ANGEL_ONE' 
        ? { broker: brokerKey, clientCode, password, totpSecret }
        : { broker: brokerKey, apiKey, apiSecret };

      const res = await fetch(`${baseUrl}/api/broker/keys`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        setIsEditing(false);
        setApiKey('');
        setApiSecret('');
        await fetchBrokerStatus();
      } else {
        alert(data.error || 'Failed to connect broker');
      }
    } catch (err) {
      console.error('Connection failed:', err);
      alert('Network error while connecting');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`broker-card ${isConnected ? 'connected' : ''}`}>
      <div 
        className="broker-card-header" 
        onClick={handleConnectClick}
        style={{ cursor: isConnected ? 'default' : 'pointer' }}
      >
        <div className="broker-identity">
          <div className="broker-dot" style={{ background: info.color }} />
          <div>
            <div className="broker-name">{info.name}</div>
            <div className="broker-desc">{info.description}</div>
          </div>
        </div>
        <div className="broker-status-area">
          {isConnected ? (
            <div className="broker-connected-badge">
              <CheckCircle size={14} />
              <span>Connected</span>
            </div>
          ) : (
            <div className="broker-connect-hint">
              <Link2 size={14} />
              <span>{isEditing ? 'Cancel' : 'Connect'}</span>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isEditing && !isConnected && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="broker-manual-connect-form"
            style={{ overflow: 'hidden' }}
          >
            <form className="broker-form" onSubmit={handleConnectSubmit}>
              <div className="broker-guide">
                <Shield size={14} /> {info.guide}
              </div>
              
              {brokerKey === 'ANGEL_ONE' ? (
                <>
                  <div className="broker-field">
                    <label>Client ID</label>
                    <div className="broker-input-wrapper">
                      <input type="text" value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder="Enter Angel One Client ID" required />
                    </div>
                  </div>
                  <div className="broker-field">
                    <label>Login PIN / Password</label>
                    <div className="broker-input-wrapper">
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter login PIN or password" required />
                    </div>
                  </div>
                  <div className="broker-field">
                    <label>Authenticator TOTP Secret</label>
                    <div className="broker-input-wrapper">
                      <input type="password" value={totpSecret} onChange={(e) => setTotpSecret(e.target.value)} placeholder="Paste authenticator TOTP setup key" required />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="broker-field">
                    <label>API Key</label>
                    <div className="broker-input-wrapper">
                      <input 
                        type="text" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)} 
                        placeholder="Paste your API key here" 
                        required 
                      />
                    </div>
                  </div>
                  <div className="broker-field">
                    <label>API Secret</label>
                    <div className="broker-input-wrapper">
                      <input 
                        type="password" 
                        value={apiSecret} 
                        onChange={(e) => setApiSecret(e.target.value)} 
                        placeholder="Paste your API secret here" 
                        required 
                      />
                    </div>
                  </div>
                </>
              )}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="broker-submit-btn"
                style={{ background: info.color }}
              >
                {isSubmitting ? 'Connecting...' : `Connect ${info.name}`}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {isConnected && (
        <div className="broker-connected-info">
          <span className="broker-connected-time">Since {new Date(connectedAt).toLocaleDateString()}</span>
          <button className="broker-disconnect-btn" onClick={() => onDisconnect(brokerKey)}>
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export default function BrokerSettingsPage() {
  const { connectedBrokers, connectBroker, disconnectBroker, executionMode, setExecutionMode, fetchBrokerStatus, globalMarkets, fetchMarketStatus } = useGhostStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBrokerStatus();
    fetchMarketStatus();
  }, []);

  const connectedMap = {};
  (connectedBrokers || []).forEach(b => { connectedMap[b.broker] = b; });

  const modes = [
    { key: 'PAPER', label: 'Paper Trading', desc: 'Simulation mode — no real money at risk', icon: <Shield size={18} />, color: '#94a3b8' },
    { key: 'LIVE_CRYPTO', label: 'Live Crypto', desc: 'Execute via Binance API', icon: <Zap size={18} />, color: '#f0b90b', requires: 'BINANCE' },
    { key: 'LIVE_FNO', label: 'Live F&O', desc: 'Execute via Angel One SmartAPI', icon: <Globe size={18} />, color: '#ff7b00', requires: 'ANGEL_ONE' },
  ];

  const openMarkets = globalMarkets?.openNow || [];

  return (
    <div className="broker-settings-page">
      <div className="broker-page-container">
        <div className="broker-page-header">
          <div className="broker-page-title-group">
            <button className="broker-back-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2>Execution Settings</h2>
              <p className="broker-page-subtitle">Connect your broker to enable live trading</p>
            </div>
          </div>
        </div>

        {/* Execution Mode Selector */}
        <div className="execution-mode-section">
          <h3>EXECUTION ROUTING MODE</h3>
          <div className="mode-grid">
            {modes.map(m => {
              const isActive = executionMode === m.key;
              const hasBroker = !m.requires || connectedMap[m.requires];
              return (
                <button
                  key={m.key}
                  className={`mode-btn ${isActive ? 'active' : ''} ${!hasBroker && m.requires ? 'disabled' : ''}`}
                  onClick={() => {
                    if (hasBroker) setExecutionMode(m.key);
                    else alert(`Please connect ${m.requires} below to enable ${m.label}.`);
                  }}
                  style={isActive ? { borderColor: m.color, boxShadow: `0 0 20px ${m.color}22`, background: `${m.color}0a` } : {}}
                >
                  <div className="mode-icon" style={{ color: isActive ? m.color : 'var(--text-muted)' }}>{m.icon}</div>
                  <div className="mode-content">
                    <span className="mode-label" style={{ color: isActive ? m.color : 'var(--text-primary)' }}>{m.label}</span>
                    <span className="mode-desc">{!hasBroker && m.requires ? 'Requires API Connection' : m.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Broker Connections */}
        <div className="broker-connections-section">
          <h3>Broker Connections</h3>
          <div className="broker-list">
            {Object.keys(BROKER_INFO).map(key => (
              <BrokerCard
                key={key}
                brokerKey={key}
                isConnected={!!connectedMap[key]}
                connectedAt={connectedMap[key]?.connectedAt}
                onDisconnect={disconnectBroker}
              />
            ))}
          </div>
        </div>

        {/* Market Status */}
        {globalMarkets && (
          <div className="market-status-section">
            <h3>
              <Globe size={14} style={{ display: 'inline', marginRight: 6 }} />
              Global Markets ({globalMarkets.totalRegions} regions, {globalMarkets.totalAssets} assets)
            </h3>
            <div className="market-status-grid">
              {Object.entries(globalMarkets.regions || {}).map(([key, region]) => (
                <div key={key} className={`market-pill ${region.isOpen ? 'open' : 'closed'}`}>
                  <span className={`market-dot ${region.isOpen ? 'on' : 'off'}`} />
                  <span className="market-pill-name">{region.name}</span>
                  <span className="market-pill-count">{region.assetCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="broker-security-notice">
          <Shield size={14} />
          <span>Your API keys are encrypted with AES-256-GCM. GhostTrade never stores plaintext credentials. We never have access to your funds.</span>
        </div>
      </div>
    </div>
  );
}
