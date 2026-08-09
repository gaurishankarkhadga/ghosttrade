import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, List, LogOut, Activity, BarChart2, Terminal, Zap, ShieldCheck } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import { PricingModal } from './PricingModal';
import './TerminalNavbar.css';

export default function TerminalNavbar({ isConnected, onLockTerminal }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { email, role, syncSubscription } = useGhostStore();
  
  const navigate = useNavigate();
  const location = useLocation();
  const isAuditPage = location.pathname === '/audit';

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
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} userEmail={email} onSuccess={(planId) => syncSubscription(planId)} />

      {/* DESKTOP VIEW: Bottom Left Dock */}
      <aside className="terminal-bottom-controls desktop-only">
        <button onClick={() => setIsPricingModalOpen(true)} className="icon-action-btn" style={{ color: '#00e699' }}>
          <ShieldCheck size={16} />
          <span className="dock-tooltip">Pro Membership / Plans</span>
        </button>

        {/* 1. Performance Button */}
        {isAuditPage ? (
          <button onClick={() => navigate('/terminal')} className="icon-action-btn">
            <Terminal size={16} />
            <span className="dock-tooltip">Return to Terminal</span>
          </button>
        ) : (
          <button onClick={() => navigate('/audit')} className="icon-action-btn">
            <BarChart2 size={16} />
            <span className="dock-tooltip">Performance Audit</span>
          </button>
        )}

        {/* 2. Indicator */}
        <div className={`status-icon-btn ${isConnected ? 'online' : 'offline'}`}>
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
          <span className="dock-tooltip">{isConnected ? 'System Active' : 'Offline'}</span>
        </div>

        {/* 3. Profile Icon */}
        <div className="corner-logo">
          <User size={18} color="#fff" />
          <span className="dock-tooltip">User Profile</span>
        </div>

        {/* 4. Logout with red color */}
        <button onClick={onLockTerminal} className="icon-action-btn" style={{ color: '#ef4444' }}>
          <LogOut size={16} />
          <span className="dock-tooltip">Lock Terminal</span>
        </button>
      </aside>

      {/* MOBILE VIEW: New Top Frosted Navbar */}
      <header className="terminal-top-navbar mobile-only">
        <div className="brand-dots">
          <span className="brand-dot"></span>
          <span className="brand-dot"></span>
          <span className="brand-dot"></span>
          <span className="brand-dot"></span>
        </div>

        <div className="terminal-brand-text">
          GHOST<span style={{ color: '#38bdf8' }}>TRADE</span>
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
                <button className="dropdown-item" onClick={() => { setIsPricingModalOpen(true); setIsDropdownOpen(false); }}>
                  <ShieldCheck size={16} color="#00e699" />
                  <span style={{ color: '#00e699', fontWeight: 600 }}>Pro Membership / Plans</span>
                </button>
                <button className="dropdown-item">
                  <Settings size={16} />
                  <span>Account Settings</span>
                </button>
                {isAuditPage ? (
                  <button className="dropdown-item" onClick={() => navigate('/terminal')}>
                    <Terminal size={16} />
                    <span>Chat Terminal</span>
                  </button>
                ) : (
                  <button className="dropdown-item" onClick={() => navigate('/audit')}>
                    <BarChart2 size={16} />
                    <span>Audit & Performance</span>
                  </button>
                )}
                <button className="dropdown-item">
                  <Activity size={16} />
                  <span>System Health</span>
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
