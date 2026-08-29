import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Activity, BarChart2, Terminal, Zap, ShieldCheck, Globe } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import AnimatedProLogo from './AnimatedProLogo';
import './TerminalNavbar.css';

const MODE_LABELS = {
  'PAPER':       { text: 'PAPER',  color: '#94a3b8', glow: 'none' },
  'LIVE_CRYPTO': { text: 'LIVE',   color: '#f0b90b', glow: '0 0 8px rgba(240,185,11,0.5)' },
  'LIVE_US':     { text: 'LIVE',   color: '#34d399', glow: '0 0 8px rgba(52,211,153,0.5)' },
  'LIVE_GLOBAL': { text: 'LIVE',   color: '#ef4444', glow: '0 0 8px rgba(239,68,68,0.5)' },
};

export default function TerminalNavbar({ isConnected, onLockTerminal }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { email, role, executionMode, syncSubscription } = useGhostStore();
  
  const navigate = useNavigate();
  const location = useLocation();
  const isAuditPage = location.pathname === '/audit';

  const modeInfo = MODE_LABELS[executionMode] || MODE_LABELS['PAPER'];
  const isLive = executionMode !== 'PAPER';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      {/* DESKTOP VIEW: Bottom Left Dock */}
      <aside className="terminal-bottom-controls desktop-only">
        <button onClick={() => navigate('/pricing')} className="icon-action-btn" style={{ color: '#00e699' }}>
          <ShieldCheck size={16} />
          <span className="dock-tooltip">Subscription</span>
        </button>

        {/* Execution Mode Button — Opens Broker Settings */}
        <button
          onClick={() => navigate('/settings')}
          className="icon-action-btn"
          style={{ color: modeInfo.color, boxShadow: modeInfo.glow }}
        >
          {isLive ? <Zap size={16} /> : <Globe size={16} />}
          <span className="dock-tooltip">
            {isLive ? `LIVE MODE — ${executionMode.replace('LIVE_', '')}` : 'Paper Mode — Connect'}
          </span>
        </button>

        {/* Performance Button */}
        {isAuditPage ? (
          <button onClick={() => navigate('/terminal')} className="icon-action-btn">
            <Terminal size={16} />
            <span className="dock-tooltip">Return to Terminal</span>
          </button>
        ) : (
          <button onClick={() => navigate('/audit')} className="icon-action-btn">
            <BarChart2 size={16} />
            <span className="dock-tooltip">Dashboard</span>
          </button>
        )}

        {/* Status Indicator */}
        <div className={`status-icon-btn ${isConnected ? 'online' : 'offline'}`}>
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
          <span className="dock-tooltip">{isConnected ? 'System Active' : 'Offline'}</span>
        </div>

        {/* Profile Icon */}
        <div className="corner-logo">
          <User size={18} color="#fff" />
          <span className="dock-tooltip">User Profile</span>
        </div>

        {/* Logout */}
        <button onClick={onLockTerminal} className="icon-action-btn" style={{ color: '#ef4444' }}>
          <LogOut size={16} />
          <span className="dock-tooltip">Lock Terminal</span>
        </button>
      </aside>

      {/* MOBILE VIEW: New Top Frosted Navbar */}
      <header className="terminal-top-navbar mobile-only">


        <div className="terminal-brand-logo" style={{ display: 'flex', alignItems: 'center' }}>
          <AnimatedProLogo size={48} color="#ffffff" isAnimating={false} />
        </div>

        <div className="profile-section" ref={dropdownRef}>
          <button 
            className="profile-trigger"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <User size={20} />
            <span className={`status-dot-overlay ${isConnected ? 'online' : 'offline'}`}></span>
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div 
                className="profile-dropdown"
                initial={{ opacity: 0, y: -15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* Execution Mode Badge */}
                <div className="dropdown-item" style={{ cursor: 'default', gap: '8px' }}>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: modeInfo.color, boxShadow: modeInfo.glow,
                      display: 'inline-block', flexShrink: 0,
                    }}
                  />
                  <span style={{ color: modeInfo.color, fontWeight: 600, fontSize: '0.8rem' }}>
                    {modeInfo.text} MODE
                  </span>
                </div>

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />

                <button className="dropdown-item" onClick={() => navigate('/pricing')}>
                  <ShieldCheck size={16} color="#00e699" />
                  <span style={{ color: '#00e699', fontWeight: 600 }}>Subscription</span>
                </button>

                <button className="dropdown-item" onClick={() => { navigate('/settings'); setIsDropdownOpen(false); }}>
                  <Settings size={16} />
                  <span>Connect</span>
                </button>

                {isAuditPage ? (
                  <button className="dropdown-item" onClick={() => navigate('/terminal')}>
                    <Terminal size={16} />
                    <span>Chat Terminal</span>
                  </button>
                ) : (
                  <button className="dropdown-item" onClick={() => navigate('/audit')}>
                    <BarChart2 size={16} />
                    <span>Dashboard</span>
                  </button>
                )}

                <button className="dropdown-item" onClick={() => { navigate('/settings'); setIsDropdownOpen(false); }}>
                  <Activity size={16} />
                  <span>Global Markets</span>
                </button>

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                <button className="dropdown-item danger" onClick={onLockTerminal}>
                  <LogOut size={16} />
                  <span>Lock Terminal</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
    </>
  );
}
