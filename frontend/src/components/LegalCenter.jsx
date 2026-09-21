import React, { useState, useEffect } from 'react';
import { Shield, FileText, Lock, AlertTriangle, Activity, Database, Scale, CreditCard, Cpu } from 'lucide-react';
import { PublicLayout } from './ui/SignInFlow';
import { useLocation } from 'react-router-dom';
import './LegalCenter.css';

const LEGAL_DOCUMENTS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    icon: <FileText size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using the Ghostrade platform, software, API, or services (collectively, the "Services"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Services.</p>
        
        <h2>2. Description of Service</h2>
        <p>Ghostrade is an advanced quantitative telemetry and market analysis tool. It provides mathematical data visualization and API routing services. Ghostrade does NOT provide financial advice, investment recommendations, or portfolio management services.</p>
        
        <h2>3. User Accounts & Eligibility</h2>
        <p>You must be at least 18 years old to use the Services. You are entirely responsible for maintaining the confidentiality of your account credentials and API keys. Ghostrade reserves the right to terminate or suspend access to any user immediately, without prior notice or liability, for any reason whatsoever.</p>
        
        <h2>4. Intellectual Property</h2>
        <p>The Service and its original content, features, proprietary algorithms, quantitative models, and functionality are and will remain the exclusive property of Ghostrade and its licensors. You may not reverse-engineer, decompile, or scrape the Ghostrade platform.</p>

        <h2>5. Limitation of Liability</h2>
        <p>In no event shall Ghostrade, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Services.</p>
      </>
    )
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    icon: <Lock size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us, such as when you create or modify your account, request customer support, or communicate with us. This includes your email address, billing information, and encrypted API keys.</p>
        
        <h2>2. How We Use Information</h2>
        <p>We use the information we collect to provide, maintain, and improve our Services, process transactions, send related information (including confirmations and invoices), and monitor usage trends. We do NOT sell your personal data to third parties.</p>
        
        <h2>3. API Key Security</h2>
        <p>Ghostrade operates on a strict non-custodial architecture. We do not hold your funds. API keys provided by users for broker integrations are encrypted on the client side using AES-256-GCM before transmission. Ghostrade servers never store your API credentials in plaintext.</p>

        <h2>4. Cookies & Tracking</h2>
        <p>We use cookies and similar tracking technologies to track the activity on our Service and hold certain information. You can instruct your browser to refuse all cookies, but doing so may limit your ability to use certain parts of the Service.</p>

        <h2>5. Data Rights (GDPR & DPDP Compliance)</h2>
        <p>Depending on your location, you may have the right to access, update, or delete the information we have on you. Please contact our Data Protection Officer at privacy@ghosttrade.com to exercise these rights.</p>
      </>
    )
  },
  {
    id: 'risk',
    title: 'Risk & Regulatory Disclosure',
    icon: <AlertTriangle size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <div className="legal-disclaimer-box">
          <h3>CRITICAL LEGAL DISCLAIMER</h3>
          <p>Ghostrade is an AI-powered telemetry and data visualization platform. It is NOT a SEBI-registered Investment Adviser (IA), Research Analyst (RA), or Broker-Dealer. Information provided by Ghostrade does not constitute financial advice, investment recommendations, or solicitation to buy or sell any asset.</p>
        </div>

        <h2>1. High Risk of Capital Loss</h2>
        <p>Trading in financial markets, including equities, forex, derivatives, and cryptocurrencies, involves a high degree of risk and may not be suitable for all individuals. You could sustain a loss of some or all of your initial capital. You should not trade with money you cannot afford to lose.</p>
        
        <h2>2. Quantitative Models & Accuracy</h2>
        <p>The mathematical models, Hurst Exponent calculations, Order Flow Imbalance metrics, and AI-generated setups presented by Ghostrade are derived from public market data and statistical probabilities. Past performance of these models is absolutely no guarantee of future results.</p>
        
        <h2>3. Educational Use Only</h2>
        <p>All data, charts, and analysis generated by the platform are meant strictly for educational and informational tracking. Users must conduct their own independent research and consult with a licensed financial advisor before making any financial decisions.</p>
      </>
    )
  },
  {
    id: 'msa',
    title: 'Master Service Agreement (API)',
    icon: <Activity size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Third-Party Broker Integrations</h2>
        <p>Ghostrade provides a technology interface that allows users to route data and telemetry to supported third-party brokers (e.g., Binance, AngelOne). Ghostrade is independent of these brokers and acts merely as a Software-as-a-Service (SaaS) routing layer.</p>
        
        <h2>2. Bring Your Own Key (BYOK)</h2>
        <p>Users are solely responsible for generating, managing, and securing their own API keys at their respective brokerage accounts. Ghostrade is not responsible for any unauthorized access to your broker account that occurs outside of our platform infrastructure.</p>
        
        <h2>3. API Outages and Slippage</h2>
        <p>Ghostrade makes no guarantees regarding the uptime, latency, or execution speed of third-party broker APIs. If a broker's API experiences downtime, rate-limiting, or rejects a routed setup, Ghostrade is completely held harmless. Ghostrade is not liable for market slippage, gap-downs, or failed order routing.</p>
      </>
    )
  },
  {
    id: 'refunds',
    title: 'Refund & Cancellation Policy',
    icon: <CreditCard size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Digital Subscription Nature</h2>
        <p>Ghostrade provides access to proprietary digital software, real-time data, and algorithmic processing capabilities. Due to the immediate access to these digital resources, all subscription purchases are final.</p>
        
        <h2>2. No Refunds</h2>
        <p>We do NOT offer refunds for any subscription payments once they have been processed. This includes monthly, quarterly, and annual billing cycles. We do not issue partial refunds for unused time within an active billing period.</p>
        
        <h2>3. Cancellation Policy</h2>
        <p>You may cancel your Ghostrade subscription at any time via your account settings dashboard. Upon cancellation, you will retain access to the platform until the end of your current paid billing cycle. You will not be charged again moving forward.</p>
      </>
    )
  },
  {
    id: 'aml',
    title: 'AML & KYC Deferment',
    icon: <Scale size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Non-Custodial Declaration</h2>
        <p>Ghostrade is exclusively a data analysis software provider. We do not accept, hold, transmit, or custody any fiat currency, cryptocurrency, or securities on behalf of our users.</p>
        
        <h2>2. KYC & AML Compliance Deferment</h2>
        <p>Because Ghostrade does not facilitate the transfer of value or operate as an exchange, all Anti-Money Laundering (AML) and Know-Your-Customer (KYC) obligations remain the strict legal responsibility of the third-party brokers (e.g., Binance, AngelOne) where the user holds their actual accounts and funds.</p>
        
        <h2>3. Zero Tolerance for Illicit Use</h2>
        <p>While Ghostrade does not perform KYC, we maintain a zero-tolerance policy toward the use of our software for market manipulation, wash trading, or routing illicit funds. We will immediately terminate access to any user found violating these terms and cooperate fully with international law enforcement.</p>
      </>
    )
  },
  {
    id: 'aup',
    title: 'Acceptable Use Policy',
    icon: <Shield size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Restricted Activities</h2>
        <p>You agree not to engage in any of the following prohibited activities: (i) copying, distributing, or disclosing any part of the Services in any medium, including by any automated or non-automated "scraping"; (ii) using any automated system, including "robots," "spiders," or "offline readers," to access the Services; (iii) attempting to interfere with or compromise the system integrity or security.</p>
        
        <h2>2. Algorithmic Integrity</h2>
        <p>Users are expressly forbidden from reverse-engineering the Ghostrade quantitative models, Hurst Exponent calculators, or Order Flow parsing systems. Any attempt to decompile the software will result in an immediate lifetime ban without refund.</p>
      </>
    )
  },
  {
    id: 'security',
    title: 'Security & Data Protection (DPA)',
    icon: <Database size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Encryption Standards</h2>
        <p>All sensitive user data in transit is encrypted using TLS 1.3. User API keys provided for broker integrations are encrypted using AES-256-GCM symmetric encryption algorithms prior to storage. Decryption keys are isolated securely and are not stored alongside the ciphertext payload.</p>
        
        <h2>2. Data Breach Protocol</h2>
        <p>In the unlikely event of a data breach affecting user information, Ghostrade will notify affected users within 72 hours of discovering the breach, detailing the scope of the incident and the remediation steps taken.</p>
      </>
    )
  },
  {
    id: 'ai',
    title: 'AI Transparency Statement',
    icon: <Cpu size={16} />,
    updated: 'September 21, 2026',
    content: (
      <>
        <h2>1. Deterministic vs. Generative Models</h2>
        <p>Ghostrade utilizes deterministic algorithms and fixed statistical parameters (such as the Hurst Exponent and Volume Delta limits) for market analysis. We do not use generative Large Language Models (LLMs) to make directional market assumptions or execution routes.</p>
        
        <h2>2. AI "Hallucination" Liability</h2>
        <p>The text generation modules of the Ghostrade interface are used strictly for formatting output data into readable telemetry summaries. By using the platform, users acknowledge that any descriptive text generated by the AI is observational analysis of math data, and any misinterpretation of this data by the user is not the liability of Ghostrade.</p>
      </>
    )
  }
];

export function LegalCenter() {
  const [activeDoc, setActiveDoc] = useState(LEGAL_DOCUMENTS[0]);
  const location = useLocation();

  useEffect(() => {
    // Check if URL passed a specific legal section (e.g. /legal#privacy)
    const hash = location.hash.replace('#', '');
    if (hash) {
      const doc = LEGAL_DOCUMENTS.find(d => d.id === hash);
      if (doc) setActiveDoc(doc);
    }
  }, [location]);

  return (
    <PublicLayout>
      <div className="legal-center-wrapper">
        <div className="legal-center-container">
          
          <aside className="legal-sidebar">
            <div className="legal-sidebar-header">Legal & Compliance</div>
            <nav className="legal-nav">
              {LEGAL_DOCUMENTS.map((doc) => (
                <button 
                  key={doc.id}
                  className={`legal-nav-btn ${activeDoc.id === doc.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveDoc(doc);
                    window.location.hash = doc.id;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {doc.icon}
                  {doc.title}
                </button>
              ))}
            </nav>
          </aside>

          <main className="legal-content-area">
            <div className="legal-content-header">
              <h1>{activeDoc.title}</h1>
              <span className="legal-last-updated">Last Updated: {activeDoc.updated}</span>
            </div>
            
            <div className="legal-document">
              {activeDoc.content}
            </div>
          </main>

        </div>
      </div>
    </PublicLayout>
  );
}

export default LegalCenter;
