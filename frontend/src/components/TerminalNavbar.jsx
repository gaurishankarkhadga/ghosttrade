import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, List, LogOut, Activity } from 'lucide-react';
import './TerminalNavbar.css';

export default function TerminalNavbar({ isConnected, onLockTerminal }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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
      {/* DESKTOP VIEW: Old Bottom Left Dock */}
      <aside className="terminal-bottom-controls desktop-only">
        <div className="corner-logo">
          GT
          <span className="dock-tooltip">GhostTrade</span>
        </div>

        <div className={`status-icon-btn ${isConnected ? 'online' : 'offline'}`}>
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
          <span className="dock-tooltip">{isConnected ? 'System Active' : 'Offline'}</span>
        </div>

        <button onClick={onLockTerminal} className="icon-action-btn">
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
                <button className="dropdown-item">
                  <Settings size={16} />
                  <span>Account Settings</span>
                </button>
                <button className="dropdown-item">
                  <List size={16} />
                  <span>Trade Logs</span>
                </button>
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
