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
};

function BrokerCard({ brokerKey, isConnected, connectedAt, onDisconnect }) {
  const info = BROKER_INFO[brokerKey];
  const [isRedirecting, setIsRedirecting] = useState(false);
  const token = useGhostStore(state => state.token);

  const handleConnectClick = async () => {
    if (isConnected || isRedirecting) return;
    setIsRedirecting(true);

    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${baseUrl}/api/broker/oauth/authorize?broker=${brokerKey}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate OAuth flow');
        setIsRedirecting(false);
      }
    } catch (err) {
      console.error('OAuth initiation failed:', err);
      alert('Network error while initiating OAuth');
      setIsRedirecting(false);
    }
  };

  return (
    <div className={`broker-card ${isConnected ? 'connected' : ''}`}>
      <div 
        className="broker-card-header" 
        onClick={handleConnectClick}
        style={{ cursor: isConnected ? 'default' : 'pointer', opacity: isRedirecting ? 0.7 : 1 }}
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
              {isRedirecting ? (
                <span className="text-gray-400 text-sm">Redirecting...</span>
              ) : (
                <>
                  <Link2 size={14} />
                  <span>Connect</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

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
    { key: 'PAPER', label: 'Paper Trading', desc: 'Simulation mode — no real money', icon: <Shield size={15} />, color: '#94a3b8' },
    { key: 'LIVE_CRYPTO', label: 'Live Crypto', desc: 'Execute via Binance', icon: <Zap size={15} />, color: '#f0b90b', requires: 'BINANCE' },
    { key: 'LIVE_US', label: 'Live US Stocks', desc: 'Execute via Alpaca', icon: <Zap size={15} />, color: '#ffdc00', requires: 'ALPACA' },
    { key: 'LIVE_GLOBAL', label: 'Live Global', desc: '170+ markets via IBKR', icon: <Globe size={15} />, color: '#d92b2b', requires: 'IBKR' },
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
          <h3>Execution Mode</h3>
          <div className="mode-grid">
            {modes.map(m => {
              const isActive = executionMode === m.key;
              const hasBroker = !m.requires || connectedMap[m.requires];
              return (
                <button
                  key={m.key}
                  className={`mode-btn ${isActive ? 'active' : ''} ${!hasBroker && m.requires ? 'disabled' : ''}`}
                  onClick={() => hasBroker && setExecutionMode(m.key)}
                  disabled={!hasBroker && !!m.requires}
                  style={isActive ? { borderColor: m.color, boxShadow: `0 0 12px ${m.color}33` } : {}}
                >
                  <span className="mode-icon" style={{ color: m.color }}>{m.icon}</span>
                  <span className="mode-label">{m.label}</span>
                  <span className="mode-desc">{!hasBroker && m.requires ? 'Connect broker first' : m.desc}</span>
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
