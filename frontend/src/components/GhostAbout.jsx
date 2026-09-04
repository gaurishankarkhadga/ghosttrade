import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, Shield, Zap, Activity, Cpu, 
  CheckCircle2, Lock, Key, FileText, Server, Globe, 
  ChevronDown, BarChart2, TrendingUp, DollarSign,
  PieChart, Sliders, ShieldAlert, Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AnimatedProLogo from './AnimatedProLogo';
import { PublicLayout } from './ui/SignInFlow';
import './GhostAbout.css';

const tabContentVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.45, 
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.08,
      delayChildren: 0.04
    } 
  },
  exit: { 
    opacity: 0, 
    y: -10, 
    transition: { duration: 0.2, ease: "easeIn" } 
  }
};

const tabItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } 
  }
};

const CryptographicLedger = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const generateHash = () => Math.random().toString(16).substring(2, 10).toUpperCase();
    const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'EUR/USD'];
    
    // Initial logs
    const initialLogs = Array(5).fill(0).map(() => ({
      id: Math.random(),
      hash: generateHash(),
      pair: pairs[Math.floor(Math.random() * pairs.length)],
      latency: Math.floor(Math.random() * 20 + 5) + 'ms',
      status: 'VERIFIED'
    }));
    setLogs(initialLogs);

    const interval = setInterval(() => {
      setLogs(prev => {
        const newLog = {
          id: Math.random(),
          hash: generateHash(),
          pair: pairs[Math.floor(Math.random() * pairs.length)],
          latency: Math.floor(Math.random() * 20 + 5) + 'ms',
          status: 'VERIFIED'
        };
        return [newLog, ...prev].slice(0, 5); // Keep max 5
      });
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="trading-widget ledger-stream">
      <div className="widget-row header-row font-mono">
        <span>TX HASH</span>
        <span>ASSET</span>
        <span>LATENCY</span>
        <span>STATE</span>
      </div>
      <AnimatePresence mode="popLayout">
        {logs.map(log => (
          <motion.div 
            key={log.id}
            layout
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="widget-row font-mono"
          >
            <span className="text-muted">0x{log.hash}</span>
            <span>{log.pair}</span>
            <span>{log.latency}</span>
            <span className="badge-tag green">{log.status}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const EquityCurveVisualization = () => {
  return (
    <div className="equity-curve-container scroll-reveal delay-100">
      <div className="equity-curve-header text-center">
        <h3 style={{ color: 'var(--color-ghost-buy)', fontFamily: 'var(--font-mono)', fontSize: '14px', letterSpacing: '0.05em', marginBottom: '8px' }}>
          THE "MONEY MACHINE" YIELD CURVE
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Retail Volatility (Red) vs. Algorithmic Consistency (Green)
        </p>
      </div>
      <div className="equity-svg-wrapper">
        <svg viewBox="0 0 800 300" preserveAspectRatio="none" className="equity-svg">
          {/* Grid lines */}
          <line x1="0" y1="50" x2="800" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <line x1="0" y1="150" x2="800" y2="150" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <line x1="0" y1="250" x2="800" y2="250" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          
          {/* Retail Volatility (Jagged Red) */}
          <motion.path 
            d="M 0 250 L 50 210 L 100 280 L 150 180 L 200 240 L 250 120 L 300 260 L 350 150 L 400 220 L 450 90 L 500 270 L 550 160 L 600 280 L 650 130 L 700 250 L 750 100 L 800 280" 
            fill="none" 
            stroke="var(--color-ghost-sell)" 
            strokeWidth="2" 
            opacity="0.6"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 2, ease: "linear" }}
          />

          {/* Quant Algorithm (Smooth Green) */}
          <motion.path 
            d="M 0 250 Q 100 240 200 200 T 400 120 T 600 60 T 800 20" 
            fill="none" 
            stroke="var(--color-ghost-buy)" 
            strokeWidth="4" 
            style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' }}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        </svg>
      </div>
    </div>
  );
};

const SecuritySection = () => {
  return (
    <section className="about-section security-section">
      <div className="section-container">
        <div className="section-header text-center">
          <span className="section-tag scroll-reveal">CAPITAL PROTECTION</span>
          <h2 className="scroll-reveal delay-100">Military-Grade API Security</h2>
          <p className="scroll-reveal delay-200">GhostTrade operates on a strictly non-custodial architecture. Your funds never leave your exchange.</p>
        </div>
        <div className="security-grid">
          <div className="security-card scroll-reveal delay-100">
            <Shield size={24} className="icon-emerald" />
            <h4>Non-Custodial Design</h4>
            <p>Your capital remains secured within your personal exchange account. GhostTrade only transmits mathematical order signals.</p>
          </div>
          <div className="security-card scroll-reveal delay-200">
            <Lock size={24} className="icon-emerald" />
            <h4>Zero Withdrawal Permissions</h4>
            <p>The system actively rejects any API key that has withdrawal permissions enabled, guaranteeing absolute fund safety.</p>
          </div>
          <div className="security-card scroll-reveal delay-300">
            <Key size={24} className="icon-emerald" />
            <h4>AES-256 Encryption</h4>
            <p>All broker connections and API keys are heavily encrypted at rest and in transit using military-grade standards.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default function GhostAbout() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ledger');
  const [openFaq, setOpenFaq] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 640);
    checkMobile();
    window.addEventListener('resize', checkMobile, { passive: true });
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  useEffect(() => {
    const scrollContainer = document.querySelector('.main-area') || null;

    const observerCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    };

    const observerOptions = {
      root: scrollContainer,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.01
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach(el => observer.observe(el));

    const checkScrollPosition = () => {
      const containerHeight = window.innerHeight;
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < containerHeight - 50 && rect.bottom > 0) {
          el.classList.add('is-visible');
        }
      });
    };

    checkScrollPosition();
    const timer = setTimeout(checkScrollPosition, 50);

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', checkScrollPosition, { passive: true });
    } else {
      window.addEventListener('scroll', checkScrollPosition, { passive: true });
    }

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', checkScrollPosition);
      } else {
        window.removeEventListener('scroll', checkScrollPosition);
      }
    };
  }, [activeTab]);

  return (
    <PublicLayout onModeSwitch={(mode) => navigate('/connect', { state: { mode } })}>
      <div className="ghost-about-page">
        
        {/* ===================================================================
            0. GLOBAL LIVE ORDER FLOW TICKER
           =================================================================== */}
        <div className="global-ticker-container">
          <div className="global-ticker-scroll">
            <span className="ticker-item"><span className="ticker-symbol">BTC/USD</span> IMBALANCE +74.2% <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">ETH/USD</span> EXPECTANCY 2.8R <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">AAPL</span> SPREAD REJECTED <span className="status-dot yellow"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">SOL/USD</span> MOMENTUM +18% <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">EUR/USD</span> VOLUME CLUSTER DETECTED <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">TSLA</span> LIQUIDITY DRAIN <span className="status-dot red"></span></span>
            {/* Duplicate for infinite scroll loop */}
            <span className="ticker-item"><span className="ticker-symbol">BTC/USD</span> IMBALANCE +74.2% <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">ETH/USD</span> EXPECTANCY 2.8R <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">AAPL</span> SPREAD REJECTED <span className="status-dot yellow"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">SOL/USD</span> MOMENTUM +18% <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">EUR/USD</span> VOLUME CLUSTER DETECTED <span className="status-dot green"></span></span>
            <span className="ticker-item"><span className="ticker-symbol">TSLA</span> LIQUIDITY DRAIN <span className="status-dot red"></span></span>
          </div>
        </div>

        {/* FIXED BACKGROUND LOGO WATERMARK (Fixed in Center) */}
        <div className="ghost-about-bg-logo">
          <AnimatedProLogo size={750} color="#ffffff" isAnimating={true} />
        </div>
        
        {/* ===================================================================
            1. HERO SECTION
           =================================================================== */}
        <section className="about-hero-section">
          <div className="hero-content">
            <h1 className="scroll-reveal">
              TRADE SMARTER <span className="text-highlight">WITH AI</span>
            </h1>

            <p className="hero-subtext scroll-reveal delay-100">
              No more guessing. Our AI watches the markets 24/7, finds the best opportunities, and executes trades for you instantly.
            </p>

            <div className="hero-cta-group scroll-reveal delay-200">
              <button className="cta-btn primary" onClick={() => navigate('/connect')}>
                Start Scanning <ArrowRight size={16} />
              </button>
              <button className="cta-btn secondary" onClick={() => {
                const el = document.getElementById('architecture-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}>
                Explore Platform
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            1.5 EQUITY CURVE VISUALIZATION (Below Hero)
           =================================================================== */}
        <section className="about-section equity-section">
          <div className="section-container" style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: '900px' }}>
              <EquityCurveVisualization />
            </div>
          </div>
        </section>

        {/* ===================================================================
            2. INSTITUTIONAL TRADING PLATFORM SPECIFICATIONS
           =================================================================== */}
        <section id="architecture-section" className="about-section architecture-section">
          <div className="section-container">
            <div className="section-header text-center">

              <h2 className="scroll-reveal delay-100">Deterministic Execution & Quantitative Rigor</h2>
              <p className="scroll-reveal delay-200">Replacing emotional retail speculation with mathematical probability, automated risk control, and direct venue routing.</p>
            </div>

            <div className="arch-nav-tabs">
              <button 
                className={`tab-btn scroll-reveal delay-100 ${activeTab === 'ledger' ? 'active' : ''}`} 
                onClick={() => setActiveTab('ledger')}
              >
                <FileText size={18} /> Verified Ledger
              </button>
              <button 
                className={`tab-btn scroll-reveal delay-200 ${activeTab === 'engine' ? 'active' : ''}`} 
                onClick={() => setActiveTab('engine')}
              >
                <Cpu size={18} /> Quantitative Oracle
              </button>
              <button 
                className={`tab-btn scroll-reveal delay-300 ${activeTab === 'execution' ? 'active' : ''}`} 
                onClick={() => setActiveTab('execution')}
              >
                <Zap size={18} /> Direct Market Router
              </button>
              <button 
                className={`tab-btn scroll-reveal delay-400 ${activeTab === 'risk' ? 'active' : ''}`} 
                onClick={() => setActiveTab('risk')}
              >
                <Shield size={18} /> Capital Risk Sentinel
              </button>
            </div>

            <div className="arch-tab-content">
              <AnimatePresence mode="wait">
                {(isMobile || activeTab === 'ledger') && (
                  <motion.div 
                    key="ledger"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={tabContentVariants}
                    className="tab-pane mobile-stack-item"
                  >
                    <div className="mobile-step-header mobile-only">
                      <FileText size={18} /> 01. Verified Ledger
                    </div>
                    <div className="tab-grid">
                      <motion.div className="tab-info" variants={tabItemVariants}>
                        <h3>Cryptographically Verified Audit Ledger</h3>
                        <p>
                          Every trade signal generated by GhostTrade is recorded in an immutable ledger, allowing users to verify win rates, expectancy, and execution timestamps against live exchange data.
                        </p>
                        <ul className="spec-list">
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Immutable Hash Proof for Every Emitted Signal</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Transparent Win Rate and PnL Calculations</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Public Order Resolution Audit Engine</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Zero Cherry-Picking or Fake Log Alterations</span></motion.li>
                        </ul>
                      </motion.div>

                      {/* TRADING VISUAL (NO CODE) */}
                      <motion.div className="tab-visual-panel" variants={tabItemVariants}>
                        <div className="visual-panel-header">
                          <FileText size={14} />
                          <span>LIVE CRYPTOGRAPHIC LEDGER STREAM</span>
                        </div>
                        <CryptographicLedger />
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {(isMobile || activeTab === 'engine') && (
                  <motion.div 
                    key="engine"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={tabContentVariants}
                    className="tab-pane mobile-stack-item"
                  >
                    <div className="mobile-step-header mobile-only">
                      <Cpu size={18} /> 02. Quantitative Oracle
                    </div>
                    <div className="tab-grid">
                      <motion.div className="tab-info" variants={tabItemVariants}>
                        <h3>Statistical Market Oracle</h3>
                        <p>
                          The Oracle continuously analyzes global order book imbalances, volume profiles, and institutional liquidity clusters to trigger trades only when the mathematical expectancy heavily favors your portfolio.
                        </p>
                        <ul className="spec-list">
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Institutional Order Book Imbalance Detection</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Multi-Market Cointegration & Trend Analysis</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Automated Spread & Volatility Threshold Filtering</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Probability Density Scoring for Every Trade</span></motion.li>
                        </ul>
                      </motion.div>

                      {/* TRADING VISUAL (NO CODE) */}
                      <motion.div className="tab-visual-panel" variants={tabItemVariants}>
                        <div className="visual-panel-header">
                          <Activity size={14} />
                          <span>LIVE ORDER FLOW & MARKET SCANNER</span>
                        </div>
                        <div className="trading-widget">
                          <div className="widget-row header-row font-mono">
                            <span>ASSET</span>
                            <span>IMBALANCE</span>
                            <span>EXPECTANCY</span>
                            <span>SIGNAL STATUS</span>
                          </div>
                          <div className="widget-row font-mono">
                            <span className="ticker">BTC/USD</span>
                            <span className="text-emerald">+74.2% Buy</span>
                            <span className="text-emerald">2.84 R</span>
                            <span className="badge-tag green">CONFIRMED BUY</span>
                          </div>
                          <div className="widget-row font-mono">
                            <span className="ticker">ETH/USD</span>
                            <span className="text-muted">+12.0% Neutral</span>
                            <span className="text-muted">0.45 R</span>
                            <span className="badge-tag gray">SCANNING...</span>
                          </div>
                          <div className="widget-row font-mono">
                            <span className="ticker">AAPL</span>
                            <span className="text-rose">-68.5% Sell</span>
                            <span className="text-emerald">3.10 R</span>
                            <span className="badge-tag red">CONFIRMED SELL</span>
                          </div>
                          <div className="widget-row font-mono">
                            <span className="ticker">EUR/USD</span>
                            <span className="text-muted">-04.1% Spread</span>
                            <span className="text-muted">0.10 R</span>
                            <span className="badge-tag yellow">REJECTED (SPREAD)</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {(isMobile || activeTab === 'execution') && (
                  <motion.div 
                    key="execution"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={tabContentVariants}
                    className="tab-pane mobile-stack-item"
                  >
                    <div className="mobile-step-header mobile-only">
                      <Zap size={18} /> 03. Direct Market Router
                    </div>
                    <div className="tab-grid">
                      <motion.div className="tab-info" variants={tabItemVariants}>
                        <h3>Sub-Millisecond Direct Market Router</h3>
                        <p>
                          GhostTrade bypasses slow retail web interfaces by maintaining direct FIX protocol connections to prime broker liquidity centers, delivering instant order placement without slippage.
                        </p>
                        <ul className="spec-list">
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Direct FIX 4.4 Protocol Order Dispatch</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Smart Order Routing Across 14+ Exchange Venues</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Automated Fill Optimization & Zero Front-Running</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Sub-Millisecond Execution Processing</span></motion.li>
                        </ul>
                      </motion.div>

                      {/* TRADING VISUAL (NO CODE) */}
                      <motion.div className="tab-visual-panel" variants={tabItemVariants}>
                        <div className="visual-panel-header">
                          <Server size={14} />
                          <span>DIRECT VENUE EXECUTION PIPELINE</span>
                        </div>
                        <div className="trading-widget">
                          <div className="pipeline-step">
                            <div className="step-num">01</div>
                            <div className="step-details">
                              <span className="title">ORACLE SIGNAL TRIGGERED</span>
                              <span className="sub font-mono">BTC-USD Long @ $96,420.00</span>
                            </div>
                            <span className="step-badge">0.2ms</span>
                          </div>
                          <div className="pipeline-step">
                            <div className="step-num">02</div>
                            <div className="step-details">
                              <span className="title">SMART VENUE SELECTION</span>
                              <span className="sub font-mono">Optimal Depth: Venue Node #4</span>
                            </div>
                            <span className="step-badge">0.4ms</span>
                          </div>
                          <div className="pipeline-step active">
                            <div className="step-num">03</div>
                            <div className="step-details">
                              <span className="title">FIX PROTOCOL TRANSMISSION</span>
                              <span className="sub font-mono">Order Placed & Acknowledged</span>
                            </div>
                            <span className="step-badge success">1.1ms</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {(isMobile || activeTab === 'risk') && (
                  <motion.div 
                    key="risk"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={tabContentVariants}
                    className="tab-pane mobile-stack-item"
                  >
                    <div className="mobile-step-header mobile-only">
                      <Shield size={18} /> 04. Capital Risk Sentinel
                    </div>
                    <div className="tab-grid">
                      <motion.div className="tab-info" variants={tabItemVariants}>
                        <h3>Capital Protection Sentinel</h3>
                        <p>
                          Capital preservation is the foundation of institutional growth. The Risk Sentinel continuously calculates Value-at-Risk parameters and halts execution if portfolio thresholds are breached.
                        </p>
                        <ul className="spec-list">
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Real-Time Parametric Value-at-Risk (VaR) Checks</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Automatic Circuit Breakers on High Volatility</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Dynamic Stop-Loss & Target Management</span></motion.li>
                          <motion.li variants={tabItemVariants}><CheckCircle2 size={16} className="icon-emerald" /> <span>Hard Daily Drawdown Limit Enforcers</span></motion.li>
                        </ul>
                      </motion.div>

                      {/* TRADING VISUAL (NO CODE) */}
                      <motion.div className="tab-visual-panel" variants={tabItemVariants}>
                        <div className="visual-panel-header">
                          <ShieldAlert size={14} />
                          <span>RISK CONTROL DASHBOARD</span>
                        </div>
                        <div className="trading-widget risk-widget">
                          <div className="risk-metric-row">
                            <span className="label">DAILY DRAWDOWN LIMIT</span>
                            <span className="val font-mono">-3.00% Max</span>
                          </div>
                          <div className="progress-bar-wrap">
                            <div className="progress-fill" style={{ width: '22%' }}></div>
                          </div>
                          <div className="risk-status-footer font-mono">
                            <span>CURRENT DRAWDOWN: -0.66%</span>
                            <span className="text-emerald">SHIELD OK</span>
                          </div>

                          <div className="risk-metric-row margin-top">
                            <span className="label">VALUE-AT-RISK (VaR)</span>
                            <span className="val font-mono">1.15% (99% Conf)</span>
                          </div>
                          <div className="progress-bar-wrap">
                            <div className="progress-fill green" style={{ width: '38%' }}></div>
                          </div>
                          <div className="risk-status-footer font-mono">
                            <span>VAR BUDGET: 3.00%</span>
                            <span className="text-emerald">WITHIN BUDGET</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}


              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* ===================================================================
            3. INSTITUTIONAL COMPARISON MATRIX TABLE
           =================================================================== */}
        <section className="about-section matrix-section">
          <div className="section-container">
            <div className="section-header text-center">
              <span className="section-tag scroll-reveal">ENGINEERING COMPARISON</span>
              <h2 className="scroll-reveal delay-100">Retail Software vs. GhostTrade Engine</h2>
              <p className="scroll-reveal delay-200">Understanding the fundamental difference between standard retail trading tools and an institutional quant infrastructure.</p>
            </div>

            <div className="matrix-table-wrapper scroll-reveal delay-100">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>SYSTEM CAPABILITY</th>
                    <th>TYPICAL RETAIL PLATFORM</th>
                    <th className="highlight-col">GHOSTTRADE QUANT ENGINE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="scroll-reveal delay-100">
                    <td className="spec-name"><Cpu size={14} /> Trade Generation</td>
                    <td className="retail-val">Subjective Indicators & Intuitive Guesswork</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> Mathematical Expectancy & Liquidity Models</td>
                  </tr>
                  <tr className="scroll-reveal delay-200">
                    <td className="spec-name"><Zap size={14} /> Order Execution Speed</td>
                    <td className="retail-val">Manual Mouse Clicks / Slow Web Latency</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> Sub-Millisecond Automated FIX Protocol Routing</td>
                  </tr>
                  <tr className="scroll-reveal delay-300">
                    <td className="spec-name"><Shield size={14} /> Risk Management</td>
                    <td className="retail-val">Emotional Manual Stop Loss</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> Automated Circuit Breakers & VaR Limits</td>
                  </tr>
                  <tr className="scroll-reveal delay-400">
                    <td className="spec-name"><FileText size={14} /> Track Record Verification</td>
                    <td className="retail-val">Unverified Screenshots & Selective Logs</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> Cryptographically Audited Signal Ledger</td>
                  </tr>
                  <tr className="scroll-reveal delay-500">
                    <td className="spec-name"><Globe size={14} /> Market Coverage</td>
                    <td className="retail-val">Single Asset Class / Single Exchange</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> Multi-Asset Real-Time Global Market Scanning</td>
                  </tr>
                  <tr className="scroll-reveal delay-600">
                    <td className="spec-name"><Activity size={14} /> Infrastructure Uptime</td>
                    <td className="retail-val">Desktop Application (Requires PC On)</td>
                    <td className="quant-val highlight-col"><CheckCircle2 size={14} /> 24/7 Co-located Cloud Infrastructure</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ===================================================================
            4. SYSTEM METRICS & PERFORMANCE STANDARDS
           =================================================================== */}
        <section className="about-section ghost-about-metrics-section">
          <div className="section-container">
            <div className="ghost-about-metrics-grid">
              <div className="ghost-about-metric-card scroll-reveal delay-100">
                <div className="ghost-about-metric-header">
                  <BarChart2 size={18} />
                  <span>MATHEMATICAL EXPECTANCY</span>
                </div>
                <div className="ghost-about-metric-val">+0.84 R</div>
                <div className="ghost-about-metric-sub">Average return per risk unit across all verified signals.</div>
              </div>

              <div className="ghost-about-metric-card scroll-reveal delay-200">
                <div className="ghost-about-metric-header">
                  <Activity size={18} />
                  <span>WIN RATE CONSISTENCY</span>
                </div>
                <div className="ghost-about-metric-val">64.2%</div>
                <div className="ghost-about-metric-sub">Statistically verified win rate over 12,000+ evaluated setups.</div>
              </div>

              <div className="ghost-about-metric-card scroll-reveal delay-300">
                <div className="ghost-about-metric-header">
                  <Zap size={18} />
                  <span>AVG EXECUTION SPEED</span>
                </div>
                <div className="ghost-about-metric-val">&lt; 2.5ms</div>
                <div className="ghost-about-metric-sub">End-to-end signal trigger to exchange order acknowledgement.</div>
              </div>

              <div className="ghost-about-metric-card scroll-reveal delay-400">
                <div className="ghost-about-metric-header">
                  <Shield size={18} />
                  <span>MAX DRAWDOWN LOCK</span>
                </div>
                <div className="ghost-about-metric-val">-3.0%</div>
                <div className="ghost-about-metric-sub">Strict daily risk ceiling enforced by automated Sentinel.</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            5. API SECURITY SECTION
           =================================================================== */}
        <SecuritySection />

        {/* ===================================================================
            6. FREQUENTLY ASKED TECHNICAL QUESTIONS (FAQ)
           =================================================================== */}
        <section className="about-section faq-section">
          <div className="section-container">
            <div className="section-header text-center">
              <span className="section-tag scroll-reveal">PLATFORM FAQ</span>
              <h2 className="scroll-reveal delay-100">Frequently Asked Questions</h2>
              <p className="scroll-reveal delay-200">Everything you need to know about system access, broker connections, and risk execution protocols.</p>
            </div>

            <div className="faq-list">
              {[
                {
                  q: "Does GhostTrade hold custody of my funds or assets?",
                  a: "No. GhostTrade operates on a strict non-custodial architecture. Your capital remains inside your regulated broker or exchange account. GhostTrade executes orders on your behalf strictly via encrypted API keys with withdrawal permissions disabled."
                },
                {
                  q: "How does the system ensure trades are executed without emotional bias?",
                  a: "All execution directives originate from deterministic algorithms programmed with fixed statistical parameters. When market conditions satisfy mathematical expectancy criteria, orders are dispatched automatically with predefined stop loss and take profit targets."
                },
                {
                  q: "Can I connect multiple broker accounts simultaneously?",
                  a: "Yes. GhostTrade supports multi-account routing. You can manage multiple exchange connections across supported venues and distribute order execution according to custom portfolio allocation policies."
                },
                {
                  q: "What happens during extreme market volatility or unexpected news events?",
                  a: "The Risk Sentinel continuously monitors market volatility indices. If bid-ask spreads widen beyond safe limits or market depth collapses, the Sentinel automatically triggers a circuit breaker, holding new executions until normal liquidity resumes."
                },
                {
                  q: "How is signal performance audited for accuracy?",
                  a: "Every signal generated is immediately assigned a cryptographic hash and stored in our public audit ledger. Signal outcomes are automatically resolved against real exchange tick data and published in real time on the Performance Ledger."
                }
              ].map((faq, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px -50px 0px" }}
                  transition={{ duration: 0.7, delay: (idx + 1) * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className={`faq-item ${openFaq === idx ? 'open' : ''}`}
                >
                  <button className="faq-question" onClick={() => toggleFaq(idx)}>
                    <span>{faq.q}</span>
                    <ChevronDown size={18} className="faq-chevron" />
                  </button>
                  <AnimatePresence>
                    {openFaq === idx && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="faq-answer">
                          <p>{faq.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================================================================
            6. FINAL ENTRY CTA
           =================================================================== */}
        <section className="about-section final-cta-section">
          <div className="section-container text-center">
            <h2 className="scroll-reveal">Ready to Trade with Quantitative Precision?</h2>
            <p className="scroll-reveal delay-100">Connect your environment and start executing with institutional-grade edge today.</p>
            <div className="cta-action-row scroll-reveal delay-200">
              <button className="cta-btn primary" onClick={() => navigate('/connect')}>
                Access Terminal <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            7. INSTITUTIONAL FOOTER
           =================================================================== */}
        <footer className="about-footer">
          <div className="footer-container">
            <div className="footer-top">
              <div className="footer-brand scroll-reveal">
                <div className="brand-header">
                  <AnimatedProLogo size={22} color="#ffffff" isAnimating={false} />
                  <span className="brand-title">GhostTrade</span>
                </div>
                <p className="brand-desc">
                  Institutional-grade quantitative analysis engine and automated order execution platform. Built for mathematical precision and zero-drawdown discipline.
                </p>
              </div>

              <div className="footer-links-grid">
                <div className="footer-col scroll-reveal delay-100">
                  <h4>ARCHITECTURE</h4>
                  <ul>
                    <li><a href="#architecture-section">Oracle Engine</a></li>
                    <li><a href="#architecture-section">Direct Market Router</a></li>
                    <li><a href="#architecture-section">Risk Sentinel</a></li>
                    <li><a href="#architecture-section">Verified Ledger</a></li>
                  </ul>
                </div>

                <div className="footer-col scroll-reveal delay-200">
                  <h4>PLATFORM</h4>
                  <ul>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); navigate('/connect'); }}>Terminal Access</a></li>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); navigate('/connect'); }}>API Documentation</a></li>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); navigate('/connect'); }}>Broker Integrations</a></li>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); navigate('/connect'); }}>Status Dashboard</a></li>
                  </ul>
                </div>

                <div className="footer-col scroll-reveal delay-300">
                  <h4>LEGAL & COMPLIANCE</h4>
                  <ul>
                    <li><a href="#">Terms of Service</a></li>
                    <li><a href="#">Privacy Policy</a></li>
                    <li><a href="#">Risk Disclosure</a></li>
                    <li><a href="#">Master Service Agreement</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="footer-bottom">
              <div className="copyright scroll-reveal delay-400">
                &copy; {new Date().getFullYear()} GhostTrade Systems Inc. All rights reserved. High-Frequency Quantitative Execution Engine.
              </div>
              <div className="disclaimer scroll-reveal delay-500">
                Disclaimer: Quantitative trading involves substantial risk of loss and is not suitable for all investors. Past statistical performance is no guarantee of future results.
              </div>
            </div>
          </div>
        </footer>

      </div>
    </PublicLayout>
  );
}
