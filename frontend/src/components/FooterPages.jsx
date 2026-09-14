import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from './ui/SignInFlow';
import { ChevronLeft, Terminal, ShieldAlert, FileText, Settings, Activity, Scale } from 'lucide-react';
import { motion } from 'framer-motion';
import './FooterPages.css';

// =====================================
// 1. DEDICATED LEGAL & COMPLIANCE PAGES
// =====================================

export const TermsOfServicePage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Scale size={32} className="header-icon" />
            <h1>Terms of Service</h1>
            <div className="last-updated">Last Updated: {new Date().toLocaleDateString()}</div>
          </div>
          <div className="document-content">
            <h3>1. ACCEPTANCE OF TERMS</h3>
            <p>By accessing the GhostTrade Terminal, you agree to be bound by these Terms of Service. This platform is designed for quantitative execution and requires a sophisticated understanding of algorithmic trading.</p>
            <h3>2. EXECUTION LIABILITY</h3>
            <p>GhostTrade Systems Inc. provides execution infrastructure but does not guarantee specific yields. The mathematical models are probabilistic, and black-swan market conditions may cause execution anomalies.</p>
            <h3>3. TERMINAL USAGE</h3>
            <p>Access is strictly limited to authorized personnel. Automated scraping, reverse-engineering of the signal ledger, or unauthorized API access will result in immediate termination.</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Scale size={32} className="header-icon" />
            <h1>Privacy Policy</h1>
            <div className="last-updated">Last Updated: {new Date().toLocaleDateString()}</div>
          </div>
          <div className="document-content">
            <h3>1. DATA COLLECTION</h3>
            <p>We log telemetry data, API execution latency, and session footprints. We do not sell your data. Execution parameters remain entirely encrypted in transit and at rest.</p>
            <h3>2. CRYPTOGRAPHIC ANONYMITY</h3>
            <p>All trades executed through our dark pools are cryptographically mixed to prevent front-running by opposing market makers.</p>
            <h3>3. RETENTION</h3>
            <p>Audit ledgers are retained immutably for compliance. User session data is purged every 90 days unless required by active investigations.</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export const RiskDisclosurePage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Scale size={32} className="header-icon" />
            <h1>Risk Disclosure</h1>
            <div className="last-updated">Last Updated: {new Date().toLocaleDateString()}</div>
          </div>
          <div className="document-content">
            <h3>HIGH-RISK WARNING</h3>
            <p>Trading foreign exchange, cryptocurrency, and derivatives on margin carries a high level of risk. The high degree of leverage can work against you as well as for you.</p>
            <h3>ALGORITHMIC EXECUTION RISKS</h3>
            <p>While our HFT engine operates in sub-millisecond conditions, latency arbitrage, flash crashes, and exchange downtime are risks inherent to the infrastructure.</p>
            <h3>NO FINANCIAL ADVICE</h3>
            <p>GhostTrade provides a tool for execution. We are not a registered broker-dealer or financial advisor. All models must be vetted by your own quantitative research.</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export const MasterServiceAgreementPage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Scale size={32} className="header-icon" />
            <h1>Master Service Agreement</h1>
            <div className="last-updated">Last Updated: {new Date().toLocaleDateString()}</div>
          </div>
          <div className="document-content">
            <h3>MASTER SERVICE AGREEMENT</h3>
            <p>This MSA governs the institutional deployment of the GhostTrade Engine. By deploying our on-premise or dedicated cloud nodes, you agree to the SLA terms outlined herein.</p>
            <h3>UPTIME GUARANTEE</h3>
            <p>We guarantee 99.999% uptime for the primary routing infrastructure. Scheduled maintenance windows occur strictly on weekends with 48 hours prior notice.</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

// =====================================
// 2. PLATFORM PAGES
// =====================================

export const ApiDocsPage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Terminal size={32} className="header-icon" />
            <h1>API Documentation</h1>
            <p>Integrate directly with the GhostTrade execution router via WebSocket or REST.</p>
          </div>
          
          <div className="api-code-block">
            <pre>
{`// Initialize WebSocket Connection
const ws = new WebSocket('wss://api.ghosttrade.com/v1/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: "subscribe",
    channels: ["orderbook.L2", "execution.fills"],
    auth_token: "YOUR_API_KEY"
  }));
};`}
            </pre>
          </div>
          
          <div className="document-content mt-4">
            <h3>Endpoints</h3>
            <ul>
              <li><code>POST /v1/orders</code> - Submit Institutional Order</li>
              <li><code>GET /v1/ledger</code> - Fetch Cryptographic Audit Ledger</li>
              <li><code>GET /v1/risk</code> - Current Portfolio Exposure</li>
            </ul>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export const BrokerIntegrationsPage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Settings size={32} className="header-icon" />
            <h1>Broker Integrations</h1>
            <p>Connect your existing institutional accounts via FIX or native API.</p>
          </div>
          
          <div className="integration-grid">
            <div className="integration-card">
              <h3>Binance Institutional</h3>
              <p>Native API v3 & WebSocket Stream. VIP limits supported.</p>
              <div className="status-badge connected">Supported</div>
            </div>
            <div className="integration-card">
              <h3>Interactive Brokers</h3>
              <p>FIX Gateway & TWS API for global equity and options.</p>
              <div className="status-badge connected">Supported</div>
            </div>
            <div className="integration-card">
              <h3>Deribit</h3>
              <p>Direct low-latency colocation websocket integration.</p>
              <div className="status-badge connected">Supported</div>
            </div>
            <div className="integration-card">
              <h3>Coinbase Prime</h3>
              <p>Institutional execution and cold storage settlement.</p>
              <div className="status-badge pending">Beta Access</div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

export const StatusDashboardPage = () => {
  const navigate = useNavigate();
  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          <div className="page-header">
            <Activity size={32} className="header-icon" />
            <h1>System Status</h1>
            <p>Real-time telemetry and infrastructure health.</p>
          </div>
          
          <div className="status-banner operational">
            All Systems Operational
          </div>
          
          <div className="status-metrics">
            <div className="status-row">
              <span>Matching Engine latency</span>
              <span className="metric-good">0.4ms</span>
            </div>
            <div className="status-row">
              <span>WebSocket Gateway</span>
              <span className="metric-good">99.999%</span>
            </div>
            <div className="status-row">
              <span>Audit Ledger Sync</span>
              <span className="metric-good">Operational</span>
            </div>
            <div className="status-row">
              <span>AI Oracle Inference</span>
              <span className="metric-good">12ms avg</span>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

// =====================================
// 3. ARCHITECTURE PAGES
// =====================================

export const ArchitecturePage = ({ title, type }) => {
  const navigate = useNavigate();
  
  const getContent = () => {
    switch (type) {
      case 'oracle':
        return (
          <>
            <h3>AI ORACLE ENGINE</h3>
            <p>The Oracle Engine is the core intelligence of GhostTrade. It ingests petabytes of market data—ranging from L2/L3 order books, macroeconomic indicators, to on-chain sentiment—in real time.</p>
            <h3>PREDICTIVE MODELING</h3>
            <p>Utilizing advanced deep learning networks (transformers and LSTMs), the Oracle generates probabilistic vectors for asset movements over multiple time horizons (tick-level to multi-day).</p>
            <h3>CONTINUOUS LEARNING</h3>
            <p>The model autonomously recalibrates its weights based on the outcomes of its own cryptographic audit ledger, ensuring adaptation to shifting market regimes without human intervention.</p>
          </>
        );
      case 'router':
        return (
          <>
            <h3>DIRECT MARKET ROUTER</h3>
            <p>Execution speed is critical. Our Direct Market Router bypasses traditional broker aggregators, sending FIX protocol messages directly to exchange matching engines.</p>
            <h3>DARK POOL LIQUIDITY</h3>
            <p>The router actively slices large block orders and distributes them across dark pools and lit markets to minimize market impact and avoid predatory high-frequency traders.</p>
            <h3>SUB-MILLISECOND LATENCY</h3>
            <p>Housed in bare-metal servers co-located in major financial data centers (Equinix NY4, LD4, TY3), the router achieves tick-to-trade latencies measured in microseconds.</p>
          </>
        );
      case 'risk':
        return (
          <>
            <h3>RISK SENTINEL</h3>
            <p>The Risk Sentinel operates as a completely independent sub-system from the Oracle Engine. Its sole purpose is to monitor portfolio exposure, margin utilization, and systemic risk.</p>
            <h3>DYNAMIC HEDGING</h3>
            <p>When the Sentinel detects beta exposure exceeding institutional thresholds, it automatically routes inverse delta-neutral hedging orders to counteract the risk.</p>
            <h3>HARD STOPS & CIRCUIT BREAKERS</h3>
            <p>In the event of a flash crash or extreme market volatility, the Risk Sentinel engages hard cryptographic circuit breakers, instantly flattening positions and pausing the router.</p>
          </>
        );
      case 'ledger':
        return (
          <>
            <h3>VERIFIED LEDGER</h3>
            <p>Trust is mathematical. The Verified Ledger is an immutable, append-only cryptographic log of every single signal, order, fill, and cancellation executed by the system.</p>
            <h3>REAL-TIME AUDITABILITY</h3>
            <p>Clients can cryptographically verify that the historical performance metrics displayed on the dashboard match the actual execution data recorded on the ledger.</p>
            <h3>ZERO TAMPERING</h3>
            <p>Because every tick is hashed and chained, it is computationally impossible for GhostTrade to retroactively alter past performance or hide drawdown periods.</p>
          </>
        );
      default:
        return <p>Architecture document unavailable.</p>;
    }
  };

  return (
    <PublicLayout>
      <div className="footer-page-wrapper">
        <div className="footer-page-container">
          <button className="back-button" onClick={() => navigate(-1)}><ChevronLeft size={18} /> Back</button>
          
          <div className="page-header">
            <ShieldAlert size={32} className="header-icon" />
            <h1>{title}</h1>
            <p>Core Infrastructure Specification</p>
          </div>
          
          <div className="document-content">
            {getContent()}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};
