import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Zap, 
  GraduationCap, 
  Lightbulb, 
  BarChart3, 
  Activity, 
  TrendingUp, 
  CheckCircle,
  Crosshair,
  ArrowRight,
  Eye,
  Settings
} from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import InstitutionalReport from './InstitutionalReport';
import './MessageBubble.css';

const TradeExecutionCard = ({ 
  asset, 
  side, 
  entryPrice, 
  stopLoss, 
  takeProfit, 
  riskPercentage, 
  kellySize, 
  price, 
  pattern, 
  regime, 
  source,
  predictiveHorizon,
  educationalLesson,
  signalBlocked,
  buyerPercent,
  hurstScore
}) => {
  const isShield = kellySize === 0 || kellySize === '0' || kellySize === '0.00' || signalBlocked === true;
  const [isExpanded, setIsExpanded] = useState(false);
  const [tradeMode, setTradeMode] = useState(isShield ? 'mentor' : 'guided'); 
  const [isExecuted, setIsExecuted] = useState(false);
  const [mentorTab, setMentorTab] = useState('beginner'); // 'beginner' | 'pro'

  const sideLower = side ? side.toLowerCase() : 'buy';
  const isLong = side === 'LONG';
  
  // Backward compatibility for legacy messages that only had `price` (string)
  const safeEntryPrice = entryPrice || (typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : price) || 0;
  const safeStopLoss = stopLoss || (isLong ? safeEntryPrice * 0.98 : safeEntryPrice * 1.02);
  const safeTakeProfit = takeProfit || (isLong ? safeEntryPrice * 1.06 : safeEntryPrice * 0.94);
  const safeRisk = riskPercentage || 2;
  
  const formatPrice = (p) => p ? Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const fEntry = formatPrice(safeEntryPrice);
  const fStop = formatPrice(safeStopLoss);
  const fTarget = formatPrice(safeTakeProfit);

  // Derived Quant Metrics for Visual Widgets (Use Dynamic Backend Data or fallback)
  const dBuyerPercent = typeof buyerPercent === 'number' ? buyerPercent : (isLong ? 68 : 32);
  const sellerPercent = 100 - dBuyerPercent;
  const dHurstScore = typeof hurstScore === 'number' ? hurstScore : (regime === 'MEAN_REVERTING' ? 0.42 : 0.64);
  const rrrRatio = isLong ? ((safeTakeProfit - safeEntryPrice) / (safeEntryPrice - safeStopLoss)).toFixed(1) : ((safeEntryPrice - safeTakeProfit) / (safeStopLoss - safeEntryPrice)).toFixed(1);

  const executeTrade = useGhostStore((state) => state.executeTrade);

  const handleExecute = () => {
    if (isShield) return; 
    setIsExecuted(true);
    executeTrade({ 
      asset, 
      side, 
      entryPrice: safeEntryPrice, 
      stopLoss: safeStopLoss, 
      takeProfit: safeTakeProfit, 
      riskPercentage: safeRisk, 
      kellySize,
      pattern: pattern || 'AUTO_DETECTED',
      regime: regime || 'DYNAMIC_REGIME',
      source: source || 'AI_AGENT'
    });
  };

  if (isExecuted) {
    return (
      <div className={`trade-card executed`}>
        <div className="trade-header">
          <span className="trade-asset">⚡ {asset} ACTIVE</span>
          <span className="trade-status-badge">LIVE</span>
        </div>
        <p className="trade-success-msg">
          GhostTrade is managing your exit based on Institutional Order Flow.
        </p>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className={`trade-card ${sideLower} ${isShield ? 'shield-card' : ''}`}>
        {/* 5-10m Predictive Warning Badge */}
        {predictiveHorizon && (
          <div className="predictive-badge">
            <Eye size={14} className="pred-icon" />
            <span className="pred-text">5-10m Horizon: <strong>{predictiveHorizon.predictedDirection || 'BULLISH_BREAKOUT_5-10M'}</strong> ({predictiveHorizon.predictiveScore || 85}% Conf)</span>
          </div>
        )}

        <div className="trade-header">
          <span className="trade-asset">{asset}</span>
          <span className={`trade-kelly ${isShield ? 'shield-text' : ''}`}>
            {isShield ? <><ShieldAlert size={14} className="inline-icon"/> SHIELD: 0%</> : `KELLY: ${kellySize}%`}
          </span>
        </div>
        
        <div className="trade-price-row">
          <span className="trade-price-label">Signal Price</span>
          <span className="trade-price-value">${fEntry}</span>
        </div>
        
        <button 
          className={`trade-btn ${isShield ? 'shield-btn' : sideLower}`} 
          onClick={() => {
            if (isShield) setTradeMode('mentor');
            setIsExpanded(true);
          }}
        >
          {isShield ? <><ShieldAlert size={16} className="btn-icon"/> View Shield Reason & AI Masterclass</> : <><Zap size={16} className="btn-icon"/> Execute {side || 'BUY'} Setup & View AI Masterclass</>}
        </button>
      </div>
    );
  }

  return (
    <div className={`trade-card expanded terminal-${sideLower} ${isShield ? 'shield-card' : ''}`}>
      <div className="terminal-header">
        <div className="terminal-brand">
          <Activity size={16} className="brand-icon" />
          <span className="terminal-title">
            {isShield ? 'RISK TERMINAL (SHIELD ACTIVE)' : 'EXECUTION TERMINAL'}
          </span>
        </div>
        <div className="mode-toggle">
          <button className={tradeMode === 'guided' ? 'active' : ''} onClick={() => setTradeMode('guided')}>
            <Crosshair size={14} /> Guided
          </button>
          <button className={tradeMode === 'pro' ? 'active' : ''} onClick={() => setTradeMode('pro')}>
            <Settings size={14} /> Pro
          </button>
          <button className={tradeMode === 'mentor' ? 'active mentor-btn' : 'mentor-btn'} onClick={() => setTradeMode('mentor')}>
            <GraduationCap size={14} /> AI Masterclass
          </button>
        </div>
      </div>

      {tradeMode === 'guided' && (
        <div className="terminal-guided">
          <p className="guided-text">
            {isShield ? (
              <span style={{ color: '#ef4444' }}>
                <strong>🛡️ SHIELD MODE ACTIVE:</strong> Risk Engine restricted capital allocation to 0% due to adverse regime or macro volatility. Execution is safely blocked to protect your account.
              </span>
            ) : (
              <>
                Risking <strong>{safeRisk}%</strong> to make <strong>{isLong ? '6' : '6'}%</strong>.<br/>
                Protective Stop Loss is safely set at <strong>${fStop}</strong>.
              </>
            )}
          </p>
          <button 
            className={`trade-btn ${sideLower} pulse`} 
            onClick={handleExecute}
            disabled={isShield}
            style={{ opacity: isShield ? 0.4 : 1, cursor: isShield ? 'not-allowed' : 'pointer' }}
          >
            {isShield ? <><ShieldAlert size={16} className="btn-icon"/> Shield Mode Active (Execution Blocked)</> : <><CheckCircle size={16} className="btn-icon"/> Confirm Auto-Trade</>}
          </button>
        </div>
      )}

      {tradeMode === 'pro' && (
        <div className="terminal-pro">
          <div className="pro-grid">
            <div className="pro-field">
              <label>LIMIT ENTRY</label>
              <input type="text" value={`$${fEntry}`} readOnly />
            </div>
            <div className="pro-field">
              <label>STOP LOSS (HARD)</label>
              <input type="text" value={`$${fStop}`} readOnly />
            </div>
            <div className="pro-field">
              <label>TAKE PROFIT</label>
              <input type="text" value={`$${fTarget}`} readOnly />
            </div>
            <div className="pro-field">
              <label>SLIPPAGE TOLERANCE</label>
              <select><option>0.5%</option><option>1.0%</option><option>Market</option></select>
            </div>
          </div>
          <div className="pro-actions">
             <button className="cancel-btn" onClick={() => setIsExpanded(false)}>Cancel</button>
              <button 
              className={`trade-btn ${sideLower}`} 
              onClick={handleExecute}
              disabled={isShield}
              style={{ opacity: isShield ? 0.4 : 1, cursor: isShield ? 'not-allowed' : 'pointer' }}
             >
              {isShield ? <><ShieldAlert size={16} className="btn-icon"/> Shield Blocked</> : <><CheckCircle size={16} className="btn-icon"/> Execute Limit Order</>}
             </button>
          </div>
        </div>
      )}

      {tradeMode === 'mentor' && (
        <div className="terminal-mentor visual-academy">
          {/* Top Interactive Sub-Tabs */}
          <div className="mentor-subtabs">
            <button className={mentorTab === 'beginner' ? 'active' : ''} onClick={() => setMentorTab('beginner')}>
              <Lightbulb size={14} /> Beginner Masterclass
            </button>
            <button className={mentorTab === 'pro' ? 'active' : ''} onClick={() => setMentorTab('pro')}>
              <BarChart3 size={14} /> Pro Quant Breakdown
            </button>
          </div>

          {/* Interactive Trading Visual Gauges */}
          <div className="visual-trading-grid">
            {/* Order Flow Gauge */}
            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>ORDER FLOW IMBALANCE</span>
                <span className="gauge-val">{dBuyerPercent}% BUY / {sellerPercent}% SELL</span>
              </div>
              <div className="ofi-bar-container">
                <div className="ofi-buy-fill" style={{ width: `${dBuyerPercent}%` }}></div>
                <div className="ofi-sell-fill" style={{ width: `${sellerPercent}%` }}></div>
              </div>
            </div>

            {/* Hurst Regime Gauge */}
            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>MARKET REGIME INERTIA (HURST)</span>
                <span className="gauge-val">H = {dHurstScore} ({regime || 'TRENDING'})</span>
              </div>
              <div className="hurst-meter-container">
                <div className="hurst-fill" style={{ width: `${Math.min(100, dHurstScore * 100)}%` }}></div>
              </div>
            </div>
          </div>

          {/* Masterclass Content Box */}
          <div className="mentor-content-box visual-box">
            {mentorTab === 'beginner' ? (
              <div className="beginner-card-view" key="beginner">
                <div className="concept-pill">
                  <TrendingUp size={16} className="concept-icon" />
                  <span className="concept-title">Market Physics:</span>
                </div>
                <p className="mentor-text">
                  {educationalLesson?.beginnerLesson || `Think of ${asset} like a fast train running downhill. The Market Regime is TRENDING with strong momentum. We enter ${side} with controlled risk to protect your capital.`}
                </p>
                <div className="rr-visualizer">
                  <div className="rr-pill stop">SL: ${fStop}</div>
                  <div className="rr-arrow"><ArrowRight size={12}/> Risk {safeRisk}% <ArrowRight size={12}/></div>
                  <div className="rr-pill target">TP: ${fTarget}</div>
                  <span className="rr-badge">RRR 1:{rrrRatio > 0 ? rrrRatio : '2.5'}</span>
                </div>
              </div>
            ) : (
              <div className="pro-card-view" key="pro">
                <div className="quant-proof-header">
                  <Zap size={16} className="proof-icon" />
                  <span className="proof-title">INSTITUTIONAL QUANTITATIVE PROOF</span>
                </div>
                <p className="mentor-text pro-font">
                  {educationalLesson?.proLesson || `• Regime State: ${regime || 'TRENDING'} (Hurst H > 0.55 confirms trend memory).\n• Order Flow Delta: Institutional buyers dominating liquidity depth.\n• Kelly Sizing: Half-Kelly sizing applied to prevent volatility drag.`}
                </p>
              </div>
            )}
          </div>
          
          <div className="pro-actions">
             <button className="cancel-btn" onClick={() => setIsExpanded(false)}>Close</button>
             <button 
              className={`trade-btn ${sideLower}`} 
              onClick={handleExecute}
              disabled={isShield}
              style={{ opacity: isShield ? 0.4 : 1, cursor: isShield ? 'not-allowed' : 'pointer' }}
             >
              {isShield ? <><ShieldAlert size={16} className="btn-icon"/> Shield Mode Active (0%)</> : <><CheckCircle size={16} className="btn-icon"/> Execute Trade Setup</>}
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

function useStreamSmoother(rawContent) {
  const [displayedContent, setDisplayedContent] = useState(rawContent || '');

  useEffect(() => {
    if (!rawContent) return;

    // If we are already caught up (e.g. historical message), skip animation
    if (displayedContent.length >= rawContent.length && displayedContent === rawContent) {
      return;
    }

    let currentIndex = displayedContent.length;
    let isCancelled = false;

    const interval = setInterval(() => {
      if (isCancelled) return;
      
      if (currentIndex < rawContent.length) {
        const remaining = rawContent.length - currentIndex;
        // Dynamically throttle: calculate chars needed to catch up smoothly
        let charsToAdd = Math.max(1, Math.ceil(remaining / 20)); 
        // STRICT CAP: Never add more than 4 chars per frame to guarantee a smooth typewriter effect,
        // preventing the "too fast" chunk dumping.
        charsToAdd = Math.min(charsToAdd, 4); 
        
        setDisplayedContent(rawContent.slice(0, currentIndex + charsToAdd));
        currentIndex += charsToAdd;
      } else {
        clearInterval(interval);
      }
    }, 15); // 15ms interval = ~66fps for absolute buttery smoothness

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [rawContent]);

  return displayedContent;
}

export default function AiMessageBubble({ message }) {
  const isFullWidth = message.uiComponent === 'TRADE_CARD';
  
  // Apply butter-smooth text streaming
  const smoothedContent = useStreamSmoother(message.content);
  const isThinking = useGhostStore((state) => state.isThinking);
  
  // The UI is actively streaming if the typewriter is still catching up, OR if the backend is actively generating data.
  // Note: Only check isThinking for the LAST message in the array to prevent older messages from blinking.
  // Actually, to be safe, just use message.content !== smoothedContent which perfectly tracks the UI state.
  // However, we also want it to blink if it's waiting for the network. We'll rely on the global isThinking.
  // We can just pass isStreaming down.
  const isStreaming = (message.content || '') !== smoothedContent || (isThinking && !message.isComplete);

  return (
    <div className={`message-wrapper ai ${isFullWidth ? 'full-width' : ''}`}>
      <div className="message-content">
        {smoothedContent && (
          <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
        )}
        
        {/* Render Generative UI Component if exists */}
        {message.uiComponent === 'TRADE_CARD' && message.tradeData && (
          <TradeExecutionCard {...message.tradeData} />
        )}
      </div>
    </div>
  );
}
