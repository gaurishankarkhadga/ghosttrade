import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useGhostStore from './store/ghostStore';
import './App.css';

import { SignInPage } from './components/ui/SignInFlow';
import TerminalNavbar from './components/TerminalNavbar';
import AiChatInterface from './components/AiChatInterface';

// Layout wrapper for authenticated routes to share the Navbar
const ProtectedLayout = ({ children }) => {
  const { isAuthenticated, isConnected, logout } = useGhostStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/connect" state={{ from: location }} replace />;
  }

  return (
    <div className="app-container">
      <TerminalNavbar
        isConnected={isConnected}
        onLockTerminal={() => logout()}
      />
      <main className="main-workspace">
        {children}
      </main>
    </div>
  );
};

export default function App() {
  const { isAuthenticated, connectWebSocket, login } = useGhostStore();

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
    }
  }, [isAuthenticated, connectWebSocket]);

  return (
    <Routes>
      {/* Public Route */}
      <Route 
        path="/connect" 
        element={
          isAuthenticated ? (
            <Navigate to="/terminal" replace />
          ) : (
            <SignInPage onLoginSuccess={(key) => login(key)} />
          )
        } 
      />
      
      {/* Protected Terminal Workspace Route */}
      <Route 
        path="/terminal" 
        element={
          <ProtectedLayout>
            <AiChatInterface />
          </ProtectedLayout>
        } 
      />

      {/* Default Redirection */}
      <Route 
        path="/" 
        element={<Navigate to={isAuthenticated ? "/terminal" : "/connect"} replace />} 
      />
      
      {/* Catch-all 404 (Redirect to root) */}
      <Route 
        path="*" 
        element={<Navigate to="/" replace />} 
      />
    </Routes>
  );
}
