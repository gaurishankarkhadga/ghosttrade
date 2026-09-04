import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Activity, ShieldAlert, Cpu, Zap, Lock, Crosshair, Image as ImageIcon, BookOpen, LineChart, Globe } from 'lucide-react';
import { PublicLayout } from './ui/SignInFlow';
import './WhyGhostTrade.css';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } 
  }
};

const PILLARS = [
  {
    icon: <Zap size={28} />,
    title: "Sub-Millisecond Execution",
    description: "Direct API routing for ultra-low latency trade execution, bypassing standard retail bottlenecks.",
    metric: "0.8ms",
    metricLabel: "AVG LATENCY"
  },
  {
    icon: <ImageIcon size={28} />,
    title: "Direct Chart-to-AI Vision",
    description: "Upload any chart. Our institutional vision models instantly extract price action and generate quantitative setups.",
    metric: "Multi-Modal",
    metricLabel: "AI ENGINE"
  },
  {
    icon: <BookOpen size={28} />,
    title: "Explainable Learning Mode",
    description: "The AI doesn't just give signals. It mathematically explains the order flow logic and Hurst Exponent behind every trade.",
    metric: "Whitebox",
    metricLabel: "TRANSPARENCY"
  },
  {
    icon: <Cpu size={28} />,
    title: "Regime Detection",
    description: "Mathematical classification of market states (trending vs. ranging) to dynamically optimize strategy deployment.",
    metric: "94%",
    metricLabel: "ACCURACY"
  },
  {
    icon: <Activity size={28} />,
    title: "Order Flow Parsing",
    description: "Real-time analysis of L2/L3 order books and cryptographic ledgers to identify hidden institutional liquidity.",
    metric: "L2/L3",
    metricLabel: "DATA DEPTH"
  },
  {
    icon: <ShieldAlert size={28} />,
    title: "Quantitative Discipline",
    description: "Strict execution driven by statistical metrics, entirely eliminating the psychological bias of fear and greed.",
    metric: "100%",
    metricLabel: "ALGORITHMIC"
  },
  {
    icon: <Crosshair size={28} />,
    title: "Multi-Broker Routing",
    description: "Unified execution architecture allowing seamless trade routing across multiple accounts and global exchanges.",
    metric: "API",
    metricLabel: "INTEGRATION"
  },
  {
    icon: <LineChart size={28} />,
    title: "Immutable Audit Dashboards",
    description: "Every AI-generated signal is cryptographically logged and tracked for performance, proving long-term expectancy.",
    metric: "Public",
    metricLabel: "LEDGER"
  },
  {
    icon: <Globe size={28} />,
    title: "Global Market Scanning",
    description: "Continuously monitors thousands of crypto, stock, and forex pairs 24/7 to detect high-probability setups.",
    metric: "24/7",
    metricLabel: "COVERAGE"
  }
];

export function WhyGhostTrade() {
  const navigate = useNavigate();

  return (
    <PublicLayout onModeSwitch={(mode) => navigate('/connect', { state: { mode } })}>
      <div className="why-page-wrapper">
        <div className="why-container">
          {/* HERO SECTION */}
          <motion.div 
            className="why-hero"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <motion.h1 variants={itemVariants} className="why-title">
              <span className="nowrap-mobile">Algorithmic Precision.</span><br />
              <span className="text-highlight">Zero Emotion.</span>
            </motion.h1>
            <motion.p variants={itemVariants} className="why-subtitle">
              Professional-grade quantitative signals, deep order flow parsing, and sub-millisecond execution. Built for traders who rely on math, not intuition.
            </motion.p>
          </motion.div>

          {/* PILLARS GRID */}
          <motion.div 
            className="pillars-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {PILLARS.map((pillar, idx) => (
              <motion.div key={idx} variants={itemVariants} className="pillar-card">
                <div className="pillar-icon">{pillar.icon}</div>
                <h3 className="pillar-title">{pillar.title}</h3>
                <p className="pillar-description">{pillar.description}</p>
                <div className="pillar-metric-box">
                  <span className="pillar-metric font-mono">{pillar.metric}</span>
                  <span className="pillar-metric-label font-mono">{pillar.metricLabel}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* BOTTOM CTA */}
          <motion.div 
            className="why-cta-section"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            <motion.div variants={itemVariants} className="cta-content">
              <h2>Deploy Your Algorithmic Edge</h2>
              <p>Initialize your terminal and access institutional-grade order flow analytics.</p>
              <button className="cta-btn primary" onClick={() => navigate('/connect', { state: { mode: 'signup' } })}>
                Initialize Terminal <Crosshair size={18} style={{ marginLeft: '8px' }} />
              </button>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </PublicLayout>
  );
}
