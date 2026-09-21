import LearningModeBubble from "./learning/LearningModeBubble";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, 
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
import TradingViewChart from './TradingViewChart';
import './MessageBubble.css';
import './AiMessageBubble.css';

// =====================================================
// SIGNAL SCORE CARD — 5-Factor Deterministic Breakdown
// Renders the Signal Generator's quantitative vote breakdown
// as visual bar gauges. All data comes from the backend engine.
// =====================================================
const FACTOR_META = {
  regime:     { label: 'Fractal Regime',   color: '#34d399', icon: <Crosshair size={14}/> },
  confluence: { label: 'Tech Confluence', color: '#60a5fa', icon: <Zap size={14}/> },
  orderFlow:  { label: 'Order Flow & L2', color: '#f59e0b', icon: <Activity size={14}/> },
  volume:     { label: 'Volume & CVD', color: '#a78bfa', icon: <BarChart3 size={14}/> },
  winRate:    { label: 'Hist. Win Rate', color: '#38bdf8', icon: <TrendingUp size={14}/> },
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

  // Exact deterministic factor scores directly from the backend Signal Generator Engine
  const factors = [
    {
      key: 'regime',
      rawScore: scoreBreakdown?.regimePoints ?? (scoreBreakdown?.regimeAlignment ? Math.round(scoreBreakdown.regimeAlignment * 0.25) : 0),
      maxScore: 25,
      pctVal: scoreBreakdown?.regimeAlignment ?? 0
    },
    {
      key: 'confluence',
      rawScore: scoreBreakdown?.confluencePoints ?? (scoreBreakdown?.technicalConfluence ? Math.round(scoreBreakdown.technicalConfluence * 0.25) : 0),
      maxScore: 25,
      pctVal: scoreBreakdown?.technicalConfluence ?? 0
    },
    {
      key: 'orderFlow',
      rawScore: scoreBreakdown?.orderFlowPoints ?? (scoreBreakdown?.orderFlow ? Math.round(scoreBreakdown.orderFlow * 0.20) : 0),
      maxScore: 20,
      pctVal: scoreBreakdown?.orderFlow ?? 0
    },
    {
      key: 'volume',
      rawScore: scoreBreakdown?.volumePoints ?? (scoreBreakdown?.volumeConfirmation ? Math.round(scoreBreakdown.volumeConfirmation * 0.15) : 0),
      maxScore: 15,
      pctVal: scoreBreakdown?.volumeConfirmation ?? 0
    },
    {
      key: 'winRate',
      rawScore: scoreBreakdown?.winRatePoints ?? (scoreBreakdown?.historicalWinRate ? Math.round(scoreBreakdown.historicalWinRate * 0.15) : 0),
      maxScore: 15,
      pctVal: scoreBreakdown?.historicalWinRate ?? 0
    },
  ];

  const safeTotal = totalScore ?? (scoreBreakdown?.totalScore ?? factors.reduce((s, f) => s + f.rawScore, 0));
  const grade = safeTotal >= 80 ? { label: 'A+ (Institutional Edge)', color: '#34d399' }
              : safeTotal >= 65 ? { label: 'A (High Probability)',  color: '#60a5fa' }
              : safeTotal >= 55 ? { label: 'B (Quantitative Edge)', color: '#a78bfa' }
              : safeTotal >= 40 ? { label: 'C (Shield Blocked)',    color: '#f59e0b' }
              :                   { label: 'D (High Risk - Blocked)', color: '#f87171' };

  return (
    <div className="score-card">
      <div className="score-card-header">
        <span className="score-card-title">
          <Brain size={14} style={{ display: 'inline', marginRight: 6 }} />
          ENGINE BREAKDOWN
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

const SetupTrackerCard = ({ 
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
  shieldReason,     // real forensic reason from engine
  expectedValue,    // mathematical EV per $100
  isParentStreaming,
  isNewMessage
}) => {
  const isShield = signalBlocked === true;
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
    
    if (step === 1) timer = setTimeout(() => { setStep(2); }, 400); // Wait for headers
    else if (step === 3) timer = setTimeout(() => { setStep(4); }, 800); // Wait for gauges
    else if (step === 4) timer = setTimeout(() => { setStep(5); }, 300); // Wait for concept pill
    else if (step === 6) timer = setTimeout(() => { setStep(7); }, 400); // Wait for RR visualizer
    else if (step === 7) timer = setTimeout(() => { setStep(8); }, 600); // Wait for score card
    else if (step === 9) timer = setTimeout(() => { setStep(10); }, 300); // Wait for actions
    
    return () => clearTimeout(timer);
  }, [step, isNewMessage]);

  const onGuidedComplete = useCallback(() => setStep(prev => Math.max(prev, 3)), []);
  const onBeginnerComplete = useCallback(() => setStep(prev => Math.max(prev, 6)), []);
  const onProComplete = useCallback(() => setStep(prev => Math.max(prev, 9)), []);

  const sideLower = side ? side.toLowerCase() : 'buy';
  const isLong = side === 'LONG';
  
  const parsedPrice = typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : Number(price);
  const safeEntryPrice = (!isNaN(entryPrice) && entryPrice > 0) ? entryPrice : (!isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : 0);
  const safeStopLoss = stopLoss || (safeEntryPrice > 0 ? (isLong ? safeEntryPrice * 0.98 : safeEntryPrice * 1.02) : 0);
  const safeTakeProfit = takeProfit || (safeEntryPrice > 0 ? (isLong ? safeEntryPrice * 1.04 : safeEntryPrice * 0.96) : 0);
  
  const formatPrice = (p) => {
    const n = Number(p);
    return (!isNaN(n) && n > 0) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00';
  };
  const fEntry = formatPrice(safeEntryPrice);
  const fStop = formatPrice(safeStopLoss);
  const fTarget = formatPrice(safeTakeProfit);

  const dBuyerPercent = typeof buyerPercent === 'number' ? buyerPercent : 50;
  const sellerPercent = 100 - dBuyerPercent;
  const dHurstScore = typeof hurstScore === 'number' ? hurstScore : 0.50;

  const riskDist = Math.abs(safeEntryPrice - safeStopLoss);
  const rewardDist = Math.abs(safeTakeProfit - safeEntryPrice);
  const actualRiskPct = safeEntryPrice > 0 ? ((riskDist / safeEntryPrice) * 100).toFixed(2) : '2.00';
  const actualRewardPct = safeEntryPrice > 0 ? ((rewardDist / safeEntryPrice) * 100).toFixed(2) : '4.00';
  const rrrRatio = riskDist > 0 ? (rewardDist / riskDist).toFixed(1) : '2.0';

  const beginnerText = educationalLesson?.beginnerLesson || (
    isShield
      ? `Capital Preservation is active for ${asset}. The market regime (${regime || 'RANDOM_WALK'}) lacks statistical edge. Zero capital is deployed to protect your balance.`
      : `High-probability ${side} setup detected on ${asset}. Observed entry around $${fEntry} with Risk Invalidation at $${fStop} reference resistance $${fTarget} (1:${rrrRatio} RRR).`
  );

  const proText = educationalLesson?.proLesson || (
    `• Regime State: ${regime || 'ACTIVE'} | Hurst Exponent (H): ${dHurstScore}\n• Order Flow Delta: ${dBuyerPercent}% Buyers / ${sellerPercent}% Sellers\n• Mathematical Expectancy: ${isShield ? 'Negative (< $0.00) — Blocked' : 'Positive Edge Confirmed (1:2.0 RRR)'}`
  );

  const shieldReasonText = shieldReason || (
    "Capital deployment restricted to 0% (Negative EV / Random Walk). Capital preserved."
  );

  const guidedRiskText = `Modeled Risk: ${actualRiskPct}% | Modeled Reward: ${actualRewardPct}% (Strict 1:${rrrRatio} RRR).\nRisk Reference (Invalidation): $${fStop} | Reference Target: $${fTarget}.`;
  
  const smoothedShieldReason = useControlledTypewriter(shieldReasonText, step === 2, step > 2, !isNewMessage, isShield ? onGuidedComplete : null);
  const smoothedGuidedRisk = useControlledTypewriter(guidedRiskText, step === 2, step > 2, !isNewMessage, !isShield ? onGuidedComplete : null);
  const smoothedBeginner = useControlledTypewriter(beginnerText, step === 5, step > 5, !isNewMessage, onBeginnerComplete);
  const smoothedPro = useControlledTypewriter(proText, step === 8, step > 8, !isNewMessage, onProComplete);

  const currentMode = useGhostStore((state) => state.executionMode) || 'PAPER';
  const executeTrade = useGhostStore((state) => state.executeTrade);
  const isLiveMode = currentMode !== 'PAPER';
  const safeRisk = riskPercentage || 2.0;

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
        <div className={`setup-card executed`}>
          <div className="trade-header">
            <span className="trade-asset"> {asset} PROCESSING...</span>
          </div>
          <p className="trade-success-msg">Saving setup to dashboard for tracking...</p>
        </div>
      );
    }

    // Trade was blocked by risk control
    if (!tradeResult.success) {
      return (
        <div className={`setup-card executed`} style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div className="trade-header">
            <span className="trade-asset"> {asset}RISK BLOCKED</span>
            <span className="trade-status-badge" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
              BLOCKED
            </span>
          </div>
          <p className="trade-success-msg" style={{ color: '#f87171' }}>
            SETUP REJECTED: {tradeResult.reason || 'Portfolio risk limit exceeded'}. Capital preserved.
          </p>
        </div>
      );
    }

    // Trade succeeded
    return (
      <div className={`setup-card executed`}>
        <div className="trade-header">
          <span className="trade-asset"> {asset} ACTIVE</span>
          <span className="trade-status-badge" style={{ background: isLiveMode ? 'rgba(239,68,68,0.2)' : 'rgba(148,163,184,0.2)', color: isLiveMode ? '#ef4444' : '#94a3b8' }}>
            {isLiveMode ? ' LIVE (DUAL)' : ' PAPER'}
          </span>
        </div>
        <p className="trade-success-msg">
          {isLiveMode
            ? `Setup saved to broker/portfolio for tracking. View on Performance Dashboard.`
            : 'Signal logged to the Performance Dashboard for real-time tracking and verification.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className={`trade-card expanded terminal-${sideLower} ${isShield ? 'shield-card' : ''}`}>
      {step >= 1 && predictiveHorizon && (
        <div className="predictive-badge ghostrade-seq-step-anim" style={{ marginBottom: 12 }}>
          <Eye size={14} className="pred-icon" />
          <span className="pred-text">5-10m Horizon: <strong>{predictiveHorizon.observedDirection || 'BULLISH_BREAKOUT_5-10M'}</strong> ({predictiveHorizon.predictiveScore || 85}% Conf)</span>
        </div>
      )}

      {step >= 1 && (
        <div className="terminal-header ghostrade-seq-step-anim">
          <div className="terminal-brand">
            <Activity size={16} className="brand-icon" />
            <span className="terminal-title">
              {isShield ? 'RISK ENGINE' : 'AI ANALYSIS'}
            </span>
          </div>
          <div className="trade-header-info" style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: 'bold' }}>
             <span className="trade-asset" style={{ color: '#fff' }}>{asset}</span>
             <span className={`trade-kelly ${isShield ? 'shield-text' : ''}`}>
               {isShield ? `SHIELD: 0%` : `KELLY: ${kellySize}%`}
             </span>
             <span style={{ color: '#9ca3af' }}>|</span>
             <span style={{ color: '#fff' }}>${fEntry}</span>
          </div>
        </div>
      )}
      {step >= 2 && !isShield && (
        <div className="ghostrade-seq-step-anim" style={{ margin: "15px 0" }}>
          <TradingViewChart ticker={asset} height={300} />
        </div>
      )}

      {step >= 2 && (
        <div className="terminal-guided" style={{ paddingBottom: '0' }}>
          <p className="guided-text">
            {isShield ? (
              <span style={{ color: '#ef4444', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <Shield size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ flex: 1, overflowWrap: 'break-word', wordBreak: 'normal', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  <strong>SHIELD ACTIVE:</strong> {smoothedShieldReason}
                </span>
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
          <div className="visual-trading-grid ghostrade-seq-step-anim">
            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>ORDER FLOW</span>
                <span className="gauge-val">{dBuyerPercent}% BUY / {sellerPercent}% SELL</span>
              </div>
              <div className="ofi-bar-container">
                <div className="ofi-buy-fill" style={{ width: gaugesFilled ? `${dBuyerPercent}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
                <div className="ofi-sell-fill" style={{ width: gaugesFilled ? `${sellerPercent}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
              </div>
            </div>

            <div className="visual-gauge-card">
              <div className="gauge-label">
                <span>REGIME INERTIA (HURST)</span>
                <span className="gauge-val">H = {dHurstScore} ({regime || 'TRENDING'})</span>
              </div>
              <div className="hurst-meter-container">
                <div className="hurst-fill" style={{ width: gaugesFilled ? `${Math.min(100, dHurstScore * 100)}%` : '0%', transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
              </div>
            </div>
          </div>

          {step >= 4 && (
            <div className="mentor-content-box visual-box ghostrade-seq-step-anim" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
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
                {step >= 6 && !isShield && (
                  <div className="rr-visualizer ghostrade-seq-step-anim">
                    <div className="rr-pill stop">INV: ${fStop}</div>
                    <div className="rr-arrow"><ArrowRight size={12}/> Risk {safeRisk}% <ArrowRight size={12}/></div>
                    <div className="rr-pill target">REF: ${fTarget}</div>
                    <span className="rr-badge">RRR 1:{rrrRatio > 0 ? rrrRatio : '2.5'}</span>
                  </div>
                )}
              </div>

              {step >= 7 && (
                <>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} className="ghostrade-seq-step-anim"></div>

                  <div className="pro-card-view">
                    <div className="quant-proof-header ghostrade-seq-step-anim">
                      <Zap size={16} className="proof-icon" />
                      <span className="proof-title">QUANTITATIVE PROOF</span>
                    </div>

                    <SignalScoreCard
                      scoreBreakdown={scoreBreakdown}
                      totalScore={signalScore}
                      direction={side}
                      regime={regime}
                      isAnimating={step >= 7}
                    />

                    {ofiSource && (
                      <div className="ofi-source-badge ghostrade-seq-step-anim" style={{
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
          
        </div>
      )}
    </div>
  );

};

// =====================================================
// DEEP SCAN RESULTS CARD — Premium Deep Think Visualization
// Renders real-time scan results: profitable trades or honest "no opportunity" state.
// Zero hardcoded data — all values from the quantitative scanner engine.
// =====================================================
const DeepScanResultsCard = ({ scanData, isNewMessage }) => {
  const [step, setStep] = useState(isNewMessage ? 0 : 10);

  useEffect(() => {
    if (!isNewMessage) return;
    const t1 = setTimeout(() => setStep(1), 200);
    const t2 = setTimeout(() => setStep(2), 600);
    const t3 = setTimeout(() => setStep(3), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isNewMessage]);

  if (!scanData) return null;

  const fPrice = (p) => {
    if (p === undefined || p === null) return 'N/A';
    if (typeof p !== 'number') return p;
    return p > 100 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p.toFixed(4);
  };

  // === NO OPPORTUNITIES STATE ===
  if (!scanData.found || scanData.assets.length === 0) {
    return (
      <div className="deep-scan-card no-opportunities" style={{
        background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
        border: '1px solid rgba(251,191,36,0.2)',
        borderRadius: 16,
        padding: '28px 24px',
        marginTop: 16,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
          opacity: 0.7
        }} />

        {step >= 1 && (
          <div className="ghostrade-seq-step-anim" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Shield size={24} color="#fbbf24" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fbbf24', letterSpacing: '0.5px' }}>
                CAPITAL PRESERVATION ACTIVE
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                No profitable opportunities at this time
              </div>
            </div>
          </div>
        )}

        {step >= 2 && (
          <div className="ghostrade-seq-step-anim" style={{
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.12)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 16
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Scan Time</span></div>
              <div style={{ color: '#fbbf24', fontWeight: 500, textAlign: 'right' }}>{scanData.scanTime}</div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Market</span></div>
              <div style={{ color: '#e2e8f0', fontWeight: 500, textAlign: 'right' }}>{scanData.market}</div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Assets Scanned</span></div>
              <div style={{ color: '#e2e8f0', fontWeight: 500, textAlign: 'right' }}>{scanData.totalScanned}</div>
              {scanData.dataAge !== null && (
                <>
                  <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Data Age</span></div>
                  <div style={{ color: '#e2e8f0', fontWeight: 500, textAlign: 'right' }}>{scanData.dataAge}s</div>
                </>
              )}
            </div>
          </div>
        )}

        {step >= 3 && (
          <div className="ghostrade-seq-step-anim" style={{
            fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6
          }}>
            Every asset is currently in Shield Mode — the mathematical expectancy is negative or neutral.
            This is the system protecting your capital. Run Deep Think again when market conditions shift.
          </div>
        )}
      </div>
    );
  }

  // === PROFITABLE ASSETS FOUND STATE ===
  return (
    <div className="deep-scan-card has-opportunities" style={{
      marginTop: 16,
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      {/* Header Card */}
      {step >= 1 && (
        <div className="ghostrade-seq-step-anim" style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,78,59,0.2))',
          border: '1px solid rgba(52,211,153,0.25)',
          borderRadius: 14, padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={20} color="#34d399" />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#34d399', letterSpacing: '0.3px' }}>
              {scanData.assets.length} PROFITABLE {scanData.assets.length === 1 ? 'TRADE' : 'TRADES'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            {scanData.scanTime} · {scanData.totalScanned} scanned
          </div>
        </div>
      )}

      {/* Individual Trade Cards */}
      {step >= 2 && scanData.assets.map((asset, idx) => {
        const isBull = asset.direction === 'BULLISH';
        const accentColor = isBull ? '#34d399' : '#f87171';
        const accentBg = isBull ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)';
        const accentBorder = isBull ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)';
        const dirIcon = isBull ? '▲' : '▼';

        return (
          <div key={asset.ticker} className="ghostrade-seq-step-anim" style={{
            background: 'linear-gradient(135deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95))',
            border: `1px solid ${accentBorder}`,
            borderRadius: 14, padding: '20px',
            position: 'relative', overflow: 'hidden',
            animationDelay: `${idx * 150}ms`
          }}>
            {/* Top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: accentColor, opacity: 0.6
            }} />

            {/* Ticker + Score Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.5px' }}>
                  {dirIcon} {asset.ticker}
                </span>
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: accentBg, color: accentColor, fontWeight: 600,
                  border: `1px solid ${accentBorder}`
                }}>
                  {asset.direction}
                </span>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700, color: accentColor,
                background: accentBg, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${accentBorder}`
              }}>
                {asset.score}/100
              </div>
            </div>

            {/* Trade Levels Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px', textAlign: 'center'
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.5px' }}>Entry</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>${fPrice(asset.entry)}</div>
              </div>
              <div style={{
                background: 'rgba(52,211,153,0.06)', borderRadius: 8, padding: '10px 12px', textAlign: 'center',
                border: '1px solid rgba(52,211,153,0.1)'
              }}>
                <div style={{ fontSize: 10, color: 'rgba(52,211,153,0.6)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.5px' }}>Target</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>
                  ${fPrice(asset.takeProfit)}
                  {asset.tpPercent !== null && <span style={{ fontSize: 11, opacity: 0.7 }}> +{asset.tpPercent}%</span>}
                </div>
              </div>
              <div style={{
                background: 'rgba(248,113,113,0.06)', borderRadius: 8, padding: '10px 12px', textAlign: 'center',
                border: '1px solid rgba(248,113,113,0.1)'
              }}>
                <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.6)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.5px' }}>Stop</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                  ${fPrice(asset.stopLoss)}
                  {asset.slPercent !== null && <span style={{ fontSize: 11, opacity: 0.7 }}> -{asset.slPercent}%</span>}
                </div>
              </div>
            </div>

            {/* Bottom Meta Row */}
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'
            }}>
              {asset.kellySize > 0 && (
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.2)'
                }}>
                  Kelly {asset.kellySize}%
                </span>
              )}
              {asset.expectedValue !== undefined && asset.expectedValue !== null && (
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: asset.expectedValue >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                  color: asset.expectedValue >= 0 ? '#34d399' : '#f87171',
                  border: `1px solid ${asset.expectedValue >= 0 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`
                }}>
                  EV: {asset.expectedValue >= 0 ? '+' : ''}${typeof asset.expectedValue === 'number' ? asset.expectedValue.toFixed(2) : asset.expectedValue}
                </span>
              )}
              <span style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                {asset.side}
              </span>
              {asset.macroRegime && (
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  {asset.macroRegime}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function AiMessageBubble({ message }) {
  const { isSimpleMode } = useGhostStore();
  const isFullWidth = message.uiComponent === 'TRADE_CARD' || message.uiComponent === 'DEEP_SCAN_RESULTS' || message.uiComponent === 'LEARNING_MODE' || isSimpleMode;
  
  const [isNewMessage] = useState(message.isGenerating === true);
  const smoothedContent = useStreamSmoother(message.content, !isNewMessage);
  const isStreaming = (message.content || '') !== smoothedContent || message.isGenerating;

  return (
    <div className={`message-wrapper ai ${isFullWidth ? 'full-width' : ''}`}>
      <div className="message-content">
        {isSimpleMode ? (
           <LearningModeBubble tradeData={message.tradeData} content={smoothedContent} isGenerating={isStreaming} />
        ) : (
          <>
            {smoothedContent && message.uiComponent !== 'DEEP_SCAN_RESULTS' && (
              <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
            )}
            
            {message.uiComponent === 'TRADE_CARD' && message.tradeData && (
              <SetupTrackerCard {...message.tradeData} isParentStreaming={isStreaming} isNewMessage={isNewMessage} />
            )}

            {message.uiComponent === 'DEEP_SCAN_RESULTS' && message.scanData && (
              <DeepScanResultsCard scanData={message.scanData} isNewMessage={isNewMessage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
