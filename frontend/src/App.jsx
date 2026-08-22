import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useGhostStore from './store/ghostStore';
import './App.css';

import { SignInPage } from './components/ui/SignInFlow';
import TerminalNavbar from './components/TerminalNavbar';
import AiChatInterface from './components/AiChatInterface';
import PerformanceDashboard from './components/PerformanceDashboard';
import BrokerSettingsPage from './components/BrokerSettingsPage';
import OAuthCallback from './components/OAuthCallback';

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
  if (isTrialExpired) {
    return <Navigate to="/pricing" replace />;
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
  const { isAuthenticated, connectWebSocket, initAuditData, fetchBrokerStatus, fetchMarketStatus, login } = useGhostStore();

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
      initAuditData();
      fetchBrokerStatus();
      fetchMarketStatus();
    }
  }, [isAuthenticated, connectWebSocket, initAuditData, fetchBrokerStatus, fetchMarketStatus]);

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

      {/* Protected Broker Settings Route */}
      <Route 
        path="/settings" 
        element={
          <ProtectedLayout>
             <BrokerSettingsPage />
          </ProtectedLayout>
        } 
      />

      {/* OAuth Callback Route */}
      <Route 
        path="/oauth/callback" 
        element={<OAuthCallback />} 
      />

      {/* Protected Pricing Route (No Sidebar) */}
      <Route 
        path="/pricing" 
        element={
          isAuthenticated ? <PricingModal /> : <Navigate to="/connect" replace />
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
