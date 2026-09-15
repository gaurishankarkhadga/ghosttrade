import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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
import GhostAbout from './components/GhostAbout';
import { WhyGhostTrade } from './components/WhyGhostTrade';
import { TermsOfServicePage, PrivacyPolicyPage, RiskDisclosurePage, MasterServiceAgreementPage, ApiDocsPage, BrokerIntegrationsPage, StatusDashboardPage, ArchitecturePage } from './components/FooterPages';

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

  const isAuditPage = location.pathname === '/audit';
  const isSettingsPage = location.pathname === '/settings';

  return (
    <div className="app-container">
      <div 
        className={isAuditPage ? "hide-navbar-mobile" : ""}
        style={{
          opacity: isSettingsPage ? 0 : 1,
          pointerEvents: isSettingsPage ? 'none' : 'auto',
          transition: 'opacity 0.3s ease-in-out'
        }}
      >
        <TerminalNavbar
          isConnected={isConnected}
          onLockTerminal={() => logout()}
        />
      </div>
      
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
    <>
    <ToastContainer position="top-right" theme="dark" />
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
        
        {/* Public About Route */}
        <Route path="/" element={<GhostAbout />} />
        <Route path="/about" element={<GhostAbout />} />
        
        {/* Public Why Us Route */}
        <Route path="/why-us" element={<WhyGhostTrade />} />

        {/* Public Footer Pages */}
        <Route path="/architecture/oracle" element={<ArchitecturePage title="Oracle Engine" type="oracle" />} />
        <Route path="/architecture/router" element={<ArchitecturePage title="Direct Market Router" type="router" />} />
        <Route path="/architecture/risk" element={<ArchitecturePage title="Risk Sentinel" type="risk" />} />
        <Route path="/architecture/ledger" element={<ArchitecturePage title="Verified Ledger" type="ledger" />} />
        
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/risk" element={<RiskDisclosurePage />} />
        <Route path="/msa" element={<MasterServiceAgreementPage />} />
        
        <Route path="/api-docs" element={<ApiDocsPage />} />
        <Route path="/broker-integrations" element={<BrokerIntegrationsPage />} />
        <Route path="/status" element={<StatusDashboardPage />} />

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

        {/* Pricing Route */}
        <Route 
          path="/pricing" 
          element={<PricingModal />} 
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
    </>
  );
}
