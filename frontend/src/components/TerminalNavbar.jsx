import React from 'react';
import './TerminalNavbar.css';

export default function TerminalNavbar({ isConnected, onLockTerminal }) {
  return (
    <aside className="terminal-bottom-controls">
      <div className="corner-logo">
        GT
        <span className="dock-tooltip">GhostTrade</span>
      </div>

      <div className={`status-icon-btn ${isConnected ? 'online' : 'offline'}`}>
        <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
        <span className="dock-tooltip">{isConnected ? 'System Active' : 'Offline'}</span>
      </div>

      <button onClick={onLockTerminal} className="icon-action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span className="dock-tooltip">Lock Terminal</span>
      </button>
    </aside>
  );
}
