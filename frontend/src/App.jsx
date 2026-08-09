import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useGhostStore from './store/ghostStore';
import './App.css';

import { SignInPage } from './components/ui/SignInFlow';
import TerminalNavbar from './components/TerminalNavbar';
import AiChatInterface from './components/AiChatInterface';
import PerformanceDashboard from './components/PerformanceDashboard';

import { PricingModal } from './components/PricingModal';

// Layout wrapper for authenticated routes to share the Navbar
const ProtectedLayout = ({ children }) => {
  const { isAuthenticated, wsStatus, logout, role, promptsUsed, email, syncSubscription } = useGhostStore();
  const isConnected = wsStatus === 'CONNECTED';
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/connect" state={{ from: location }} replace />;
  }

  const isTrialExpired = role === 'trader' && promptsUsed >= 3;

  return (
    <div className="app-container">
      <TerminalNavbar
        isConnected={isConnected}
        onLockTerminal={() => logout()}
      />
      
      {/* Forced Paywall for Trial Expiry */}
      <PricingModal 
        isOpen={isTrialExpired} 
        onClose={() => {}} // Cannot close until upgraded
        onSuccess={(planId) => syncSubscription(planId)}
        userEmail={email}
        forceLock={isTrialExpired}
      />

      <main className="main-workspace" style={{ filter: isTrialExpired ? 'blur(5px)' : 'none', pointerEvents: isTrialExpired ? 'none' : 'auto' }}>
        {children}
      </main>
    </div>
  );
};

export default function App() {
  const { isAuthenticated, connectWebSocket, initAuditData, login } = useGhostStore();

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
      initAuditData();
    }
  }, [isAuthenticated, connectWebSocket, initAuditData]);

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

      {/* Protected Performance & Audit Route */}
      <Route 
        path="/audit" 
        element={
          <ProtectedLayout>
             <PerformanceDashboard />
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
