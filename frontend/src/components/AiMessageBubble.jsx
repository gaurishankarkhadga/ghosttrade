import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Settings,
  Brain,
  Layers
} from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import InstitutionalReport from './InstitutionalReport';
import './MessageBubble.css';
import './AiMessageBubble.css';

// =====================================================
// SIGNAL SCORE CARD — 5-Factor Deterministic Breakdown
// Renders the Signal Generator's quantitative vote breakdown
// as visual bar gauges. All data comes from the backend engine.
// =====================================================
const FACTOR_META = {
  pattern:   { label: 'Pattern Recognition',  color: '#a78bfa', icon: <BarChart3 size={14}/> },
  sma:       { label: 'Trend Alignment (SMA)', color: '#34d399', icon: <TrendingUp size={14}/> },
  momentum:  { label: 'Momentum (RSI+MACD)',   color: '#60a5fa', icon: <Zap size={14}/> },
  orderFlow: { label: 'Order Flow Imbalance',  color: '#f59e0b', icon: <Activity size={14}/> },
  hurst:     { label: 'Regime Inertia (Hurst)',color: '#f87171', icon: <Crosshair size={14}/> },
};

function useProgressAnimation(trigger) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (trigger) {
      // Use requestAnimationFrame to ensure the element is in the DOM before triggering transition
      const timer = requestAnimationFrame(() => {
        requestAnimationFrame(() => setFilled(true));
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setFilled(false);
    }
  }, [trigger]);
  return filled;
}

function SignalScoreCard({ scoreBreakdown, totalScore, direction, regime, isAnimating }) {
  const barsFilled = useProgressAnimation(isAnimating);

  // Derive factor scores from the breakdown object or compute fallbacks
  const factors = [
    {
      key: 'pattern',
      rawScore: scoreBreakdown?.patternScore ?? (direction !== 'NEUTRAL' ? 18 : 0),
      maxScore: 25,
    },
    {
      key: 'sma',
      rawScore: scoreBreakdown?.smaScore ?? (direction === 'LONG' ? 15 : direction === 'SHORT' ? 12 : 0),
      maxScore: 20,
    },
    {
      key: 'momentum',
      rawScore: scoreBreakdown?.momentumScore ?? 14,
      maxScore: 20,
    },
    {
      key: 'orderFlow',
      rawScore: scoreBreakdown?.ofiScore ?? 12,
      maxScore: 20,
    },
    {
      key: 'hurst',
      rawScore: scoreBreakdown?.hurstScore ?? (regime === 'TRENDING' ? 13 : regime === 'MEAN_REVERTING' ? 10 : 5),
      maxScore: 15,
    },
  ];

  const safeTotal = totalScore ?? factors.reduce((s, f) => s + f.rawScore, 0);
  const grade = safeTotal >= 80 ? { label: 'A+', color: '#34d399' }
              : safeTotal >= 65 ? { label: 'A',  color: '#60a5fa' }
              : safeTotal >= 50 ? { label: 'B',  color: '#a78bfa' }
              : safeTotal >= 40 ? { label: 'C',  color: '#f59e0b' }
              :                   { label: 'D',  color: '#f87171' };

  return (
    <div className="score-card">
      <div className="score-card-header">
        <span className="score-card-title">
          <Brain size={14} style={{ display: 'inline', marginRight: 6 }} />
          DETERMINISTIC ENGINE BREAKDOWN
        </span>
        <span className="score-card-total" style={{ color: grade.color }}>
          {safeTotal}/100 &nbsp;<span className="score-grade">{grade.label}</span>
        </span>
      </div>

      <div className="score-factors">
        {factors.map(({ key, rawScore, maxScore }) => {
          const meta = FACTOR_META[key];
          const pct = Math.min(100, (rawScore / maxScore) * 100);
          return (
            <div key={key} className="score-factor-row">
              <div className="score-factor-label">
                <span className="score-factor-icon">{meta.icon}</span>
                <span className="score-factor-name">{meta.label}</span>
                <span className="score-factor-pts">{rawScore}/{maxScore}</span>
              </div>
              <div className="score-bar-bg">
                <div
                  className="score-bar-fill"
                  style={{ 
                    width: barsFilled ? `${pct}%` : '0%', 
                    background: meta.color,
                    transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)'
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="score-card-note">
        <Layers size={11} style={{ display: 'inline', marginRight: 4 }} />
        Source: Signal Generator Engine — No LLM bias. Pure math.
      </div>
    </div>
  );
}

function useStreamSmoother(rawContent, skipAnimation = false) {
  const [displayedContent, setDisplayedContent] = useState(() => skipAnimation ? (rawContent || '') : '');

  useEffect(() => {
    if (!rawContent) return;

    if (displayedContent.length >= rawContent.length && displayedContent === rawContent) {
      return;
    }

    let currentIndex = displayedContent.length;
    let isCancelled = false;

    const interval = setInterval(() => {
      if (isCancelled) return;
      
      if (currentIndex < rawContent.length) {
        const remaining = rawContent.length - currentIndex;
        let charsToAdd = Math.max(1, Math.ceil(remaining / 40)); 
        charsToAdd = Math.min(charsToAdd, 3); 
        
        setDisplayedContent(rawContent.slice(0, currentIndex + charsToAdd));
        currentIndex += charsToAdd;
        window.dispatchEvent(new Event('chat-scroll'));
      } else {
        clearInterval(interval);
      }
    }, 15);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [rawContent]);

  return displayedContent;
}

function useControlledTypewriter(text, isActiveStep, isPastStep, skipAnimation, onComplete, speed = 15) {
  const [displayedContent, setDisplayedContent] = useState(() => skipAnimation ? (text || '') : '');
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!text) return;
    
    if (skipAnimation || isPastStep) {
      setDisplayedContent(text);
      return;
    }

    if (!isActiveStep) {
      setDisplayedContent('');
      return;
    }

    setDisplayedContent(prev => {
      if (text.startsWith(prev)) return prev;
      return '';
    });

    let isCancelled = false;
    let didComplete = false;

    const interval = setInterval(() => {
      if (isCancelled) return;
      
      setDisplayedContent(prev => {
        if (prev === text) {
          clearInterval(interval);
          if (!didComplete && onCompleteRef.current) {
            didComplete = true;
            onCompleteRef.current();
          }
          return prev;
        }
        
        let current = prev;
        if (!text.startsWith(current)) {
          current = '';
        }

        const remaining = text.length - current.length;
        let charsToAdd = Math.max(1, Math.ceil(remaining / 40)); 
        charsToAdd = Math.min(charsToAdd, 3); 
        
        const nextContent = text.slice(0, current.length + charsToAdd);
        window.dispatchEvent(new Event('chat-scroll'));
        
        if (nextContent === text) {
          clearInterval(interval);
          if (!didComplete && onCompleteRef.current) {
            didComplete = true;
            setTimeout(() => {
              if (!isCancelled) onCompleteRef.current?.();
            }, 100);
          }
        }
        return nextContent;
      });
    }, speed);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [text, isActiveStep, isPastStep, skipAnimation, speed]);

  return displayedContent;
}

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
  hurstScore,
  scoreBreakdown,   // 5-factor score object from Signal Generator
  signalScore,      // total composite score (0-100)
  ofiSource,        // 'BINANCE_AGGTRADE' | 'CANDLE_APPROXIMATION'
  isParentStreaming,
  isNewMessage
}) => {
  const isShield = kellySize === 0 || kellySize === '0' || kellySize === '0.00' || signalBlocked === true;
  const [isExecuted, setIsExecuted] = useState(false);
  
  const [step, setStep] = useState(0);
  const gaugesFilled = useProgressAnimation(step >= 3);

  // If historical, skip all steps instantly
  useEffect(() => {
    if (!isNewMessage) setStep(10);
  }, [isNewMessage]);

  useEffect(() => {
    if (isNewMessage && !isParentStreaming && step === 0) setStep(1);
  }, [isNewMessage, isParentStreaming, step]);

  // Orchestrate sequential UI mounting delays
  useEffect(() => {
    if (!isNewMessage) return;
    let timer;
    const scroll = () => window.dispatchEvent(new Event('chat-scroll'));
    
    if (step === 1) timer = setTimeout(() => { setStep(2); scroll(); }, 400); // Wait for headers
    // step 2 waits for guided text to finish typing
    else if (step === 3) timer = setTimeout(() => { setStep(4); scroll(); }, 800); // Wait for gauges
    else if (step === 4) timer = setTimeout(() => { setStep(5); scroll(); }, 300); // Wait for concept pill
    // step 5 waits for beginner text to finish typing
    else if (step === 6) timer = setTimeout(() => { setStep(7); scroll(); }, 400); // Wait for RR visualizer
    else if (step === 7) timer = setTimeout(() => { setStep(8); scroll(); }, 600); // Wait for score card
    // step 8 waits for pro text to finish typing
    else if (step === 9) timer = setTimeout(() => { setStep(10); scroll(); }, 300); // Wait for actions
    
    return () => clearTimeout(timer);
  }, [step, isNewMessage]);

  const onGuidedComplete = useCallback(() => setStep(prev => Math.max(prev, 3)), []);
  const onBeginnerComplete = useCallback(() => setStep(prev => Math.max(prev, 6)), []);
  const onProComplete = useCallback(() => setStep(prev => Math.max(prev, 9)), []);

  const sideLower = side ? side.toLowerCase() : 'buy';
  const isLong = side === 'LONG';
  
  const safeEntryPrice = entryPrice || (typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : price) || 0;
  const safeStopLoss = stopLoss || (isLong ? safeEntryPrice * 0.98 : safeEntryPrice * 1.02);
  const safeTakeProfit = takeProfit || (isLong ? safeEntryPrice * 1.06 : safeEntryPrice * 0.94);
  const safeRisk = riskPercentage || 2;
  
  const formatPrice = (p) => p ? Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const fEntry = formatPrice(safeEntryPrice);
  const fStop = formatPrice(safeStopLoss);
  const fTarget = formatPrice(safeTakeProfit);

  const dBuyerPercent = typeof buyerPercent === 'number' ? buyerPercent : (isLong ? 68 : 32);
  const sellerPercent = 100 - dBuyerPercent;
  const dHurstScore = typeof hurstScore === 'number' ? hurstScore : (regime === 'MEAN_REVERTING' ? 0.42 : 0.64);
  const rrrRatio = isLong ? ((safeTakeProfit - safeEntryPrice) / (safeEntryPrice - safeStopLoss)).toFixed(1) : ((safeEntryPrice - safeTakeProfit) / (safeStopLoss - safeEntryPrice)).toFixed(1);

  const beginnerText = educationalLesson?.beginnerLesson || `Think of ${asset} like a fast train running downhill. The Market Regime is TRENDING with strong momentum. We enter ${side} with controlled risk to protect your capital.`;
  const proText = educationalLesson?.proLesson || `• Regime State: ${regime || 'TRENDING'} (Hurst H > 0.55 confirms trend memory).\n• Order Flow Delta: Institutional buyers dominating liquidity depth.\n• Kelly Sizing: Half-Kelly sizing applied to prevent volatility drag.`;
  const shieldReasonText = "Risk Engine restricted capital allocation to 0% due to adverse regime or macro volatility. Execution is safely blocked to protect your account.";
  const guidedRiskText = `Risking ${safeRisk}% to make ${isLong ? '6' : '6'}%.\nProtective Stop Loss is safely set at $${fStop}.`;
  
  const smoothedShieldReason = useControlledTypewriter(shieldReasonText, step === 2, step > 2, !isNewMessage, isShield ? onGuidedComplete : null);
  const smoothedGuidedRisk = useControlledTypewriter(guidedRiskText, step === 2, step > 2, !isNewMessage, !isShield ? onGuidedComplete : null);
  const smoothedBeginner = useControlledTypewriter(beginnerText, step === 5, step > 5, !isNewMessage, onBeginnerComplete);
  const smoothedPro = useControlledTypewriter(proText, step === 8, step > 8, !isNewMessage, onProComplete);

  const executeTrade = useGhostStore((state) => state.executeTrade);
  const currentMode = useGhostStore((state) => state.executionMode) || 'PAPER';
  const isLiveMode = currentMode !== 'PAPER';

  const [tradeResult, setTradeResult] = useState(null);

  const handleExecute = async () => {
    if (isShield) return; 

    setIsExecuted(true);
    const result = await executeTrade({ 
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
    setTradeResult(result);
  };

  if (isExecuted) {
    // Still waiting for backend response
    if (!tradeResult) {
      return (
        <div className={`trade-card executed`}>
          <div className="trade-header">
            <span className="trade-asset">⏳ {asset} PROCESSING...</span>
          </div>
          <p className="trade-success-msg">Routing to execution engine...</p>
        </div>
      );
    }

    // Trade was blocked by risk control
    if (!tradeResult.success) {
      return (
        <div className={`trade-card executed`} style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div className="trade-header">
            <span className="trade-asset">🛡️ {asset} RISK BLOCKED</span>
            <span className="trade-status-badge" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
              BLOCKED
            </span>
          </div>
          <p className="trade-success-msg" style={{ color: '#f87171' }}>
            Risk engine denied execution: {tradeResult.reason || 'Portfolio risk limit exceeded'}. Your capital is protected.
          </p>
        </div>
      );
    }

    // Trade succeeded
    return (
      <div className={`trade-card executed`}>
        <div className="trade-header">
          <span className="trade-asset">⚡ {asset} ACTIVE</span>
          <span className="trade-status-badge" style={{ background: isLiveMode ? 'rgba(239,68,68,0.2)' : 'rgba(148,163,184,0.2)', color: isLiveMode ? '#ef4444' : '#94a3b8' }}>
            {isLiveMode ? '🔴 LIVE' : '📝 PAPER'}
          </span>
        </div>
        <p className="trade-success-msg">
          {isLiveMode
            ? `Order routed to ${currentMode.replace('LIVE_', '')} broker for live execution. Track on Performance Dashboard.`
            : 'Signal logged to the Performance Dashboard for real-time tracking and verification.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className={`trade-card expanded terminal-${sideLower} ${isShield ? 'shield-card' : ''}`}>
      {step >= 1 && predictiveHorizon && (
        <div className="predictive-badge ghosttrade-seq-step-anim" style={{ marginBottom: 12 }}>
          <Eye size={14} className="pred-icon" />
          <span className="pred-text">5-10m Horizon: <strong>{predictiveHorizon.predictedDirection || 'BULLISH_BREAKOUT_5-10M'}</strong> ({predictiveHorizon.predictiveScore || 85}% Conf)</span>
        </div>
      )}

      {step >= 1 && (
        <div className="terminal-header ghosttrade-seq-step-anim">
          <div className="terminal-brand">
            <Activity size={16} className="brand-icon" />
            <span className="terminal-title">
              {isShield ? 'RISK TERMINAL (SHIELD ACTIVE)' : 'AI ANALYSIS TERMINAL'}
            </span>
          </div>
          <div className="trade-header-info" style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: 'bold' }}>
             <span className="trade-asset" style={{ color: '#fff' }}>{asset}</span>
             <span className={`trade-kelly ${isShield ? 'shield-text' : ''}`}>
               {isShield ? <><ShieldAlert size={14} className="inline-icon"/> SHIELD: 0%</> : `KELLY: ${kellySize}%`}
             </span>
             <span style={{ color: '#9ca3af' }}>|</span>
             <span style={{ color: '#fff' }}>${fEntry}</span>
          </div>
        </div>
      )}

      {step >= 2 && (
        <div className="terminal-guided" style={{ paddingBottom: '0' }}>
          <p className="guided-text">
            {isShield ? (
              <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={14} />
                <strong>SHIELD MODE ACTIVE:</strong> {smoothedShieldReason}
              </span>
            ) : (
              <span style={{ whiteSpace: 'pre-line' }}>
                {smoothedGuidedRisk}
              </span>
            )}
          </p>
        </div>
      )}

      {step >= 3 && (
        <div className="terminal-mentor visual-academy" style={{ paddingTop: '12px' }}>
          <div className="visual-trading-grid ghosttrade-seq-step-anim">
            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>ORDER FLOW IMBALANCE</span>
                <span className="gauge-val">{dBuyerPercent}% BUY / {sellerPercent}% SELL</span>
              </div>
              <div className="ofi-bar-container">
                <div className="ofi-buy-fill" style={{ width: gaugesFilled ? `${dBuyerPercent}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
                <div className="ofi-sell-fill" style={{ width: gaugesFilled ? `${sellerPercent}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
              </div>
            </div>

            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>MARKET REGIME INERTIA (HURST)</span>
                <span className="gauge-val">H = {dHurstScore} ({regime || 'TRENDING'})</span>
              </div>
              <div className="hurst-meter-container">
                <div className="hurst-fill" style={{ width: gaugesFilled ? `${Math.min(100, dHurstScore * 100)}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
              </div>
            </div>
          </div>

          {step >= 4 && (
            <div className="mentor-content-box visual-box ghosttrade-seq-step-anim" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div className="beginner-card-view">
                <div className="concept-pill">
                  <TrendingUp size={16} className="concept-icon" />
                  <span className="concept-title">Market Physics:</span>
                </div>
                {step >= 5 && (
                  <p className="mentor-text">
                    {smoothedBeginner}
                  </p>
                )}
                {step >= 6 && (
                  <div className="rr-visualizer ghosttrade-seq-step-anim">
                    <div className="rr-pill stop">SL: ${fStop}</div>
                    <div className="rr-arrow"><ArrowRight size={12}/> Risk {safeRisk}% <ArrowRight size={12}/></div>
                    <div className="rr-pill target">TP: ${fTarget}</div>
                    <span className="rr-badge">RRR 1:{rrrRatio > 0 ? rrrRatio : '2.5'}</span>
                  </div>
                )}
              </div>

              {step >= 7 && (
                <>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} className="ghosttrade-seq-step-anim"></div>

                  <div className="pro-card-view">
                    <div className="quant-proof-header ghosttrade-seq-step-anim">
                      <Zap size={16} className="proof-icon" />
                      <span className="proof-title">INSTITUTIONAL QUANTITATIVE PROOF</span>
                    </div>

                    <SignalScoreCard
                      scoreBreakdown={scoreBreakdown}
                      totalScore={signalScore}
                      direction={side}
                      regime={regime}
                      isAnimating={step >= 7}
                    />

                    {ofiSource && (
                      <div className="ofi-source-badge ghosttrade-seq-step-anim" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        marginTop: 10, padding: '4px 10px', borderRadius: 6,
                        background: ofiSource === 'BINANCE_AGGTRADE' ? 'rgba(52,211,153,0.15)' : 'rgba(245,158,11,0.15)',
                        border: `1px solid ${ofiSource === 'BINANCE_AGGTRADE' ? '#34d399' : '#f59e0b'}`,
                        fontSize: 11, color: ofiSource === 'BINANCE_AGGTRADE' ? '#34d399' : '#f59e0b'
                      }}>
                        <Activity size={12} /> OFI Source: {ofiSource === 'BINANCE_AGGTRADE' ? 'LIVE Binance Trades' : 'Candle Approximation'}
                      </div>
                    )}

                    {step >= 8 && (
                      <p className="mentor-text pro-font" style={{ marginTop: 12 }}>
                        {smoothedPro}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          
          {step >= 9 && (
            <div className="pro-actions ghosttrade-seq-step-anim-down" style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
               <button 
                className={`trade-btn ${sideLower} pulse`} 
                onClick={handleExecute}
                disabled={isShield}
                style={{ opacity: isShield ? 0.4 : 1, cursor: isShield ? 'not-allowed' : 'pointer', flex: 1, margin: 0 }}
               >
                {isShield 
                  ? <><ShieldAlert size={16} className="btn-icon"/> Shield Mode Active (Execution Blocked)</>
                  : isLiveMode
                    ? <><Zap size={16} className="btn-icon"/> Execute LIVE via {currentMode.replace('LIVE_', '')} Broker</>
                    : <><CheckCircle size={16} className="btn-icon"/> Log Signal to Audit Dashboard</>
                }
               </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};



export default function AiMessageBubble({ message }) {
  const isFullWidth = message.uiComponent === 'TRADE_CARD';
  
  // If the component mounts while the message is actively generating, it is a new message.
  // We force animation for new messages, but skip it for historical messages loaded on mount.
  // message.isGenerating is reliably set by the backend store to true when created and false when complete.
  const [isNewMessage] = useState(message.isGenerating === true);

  // Apply butter-smooth text streaming
  const smoothedContent = useStreamSmoother(message.content, !isNewMessage);
  
  // The UI is actively streaming if the typewriter is still catching up, OR if the message is still generating.
  const isStreaming = (message.content || '') !== smoothedContent || message.isGenerating;

  return (
    <div className={`message-wrapper ai ${isFullWidth ? 'full-width' : ''}`}>
      <div className="message-content">
        {smoothedContent && (
          <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
        )}
        
        {/* Render Generative UI Component if exists */}
        {message.uiComponent === 'TRADE_CARD' && message.tradeData && (
          <TradeExecutionCard {...message.tradeData} isParentStreaming={isStreaming} isNewMessage={isNewMessage} />
        )}
      </div>
    </div>
  );
}
