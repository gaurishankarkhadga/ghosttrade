import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Link, useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import useGhostStore from "../../store/ghostStore";
import AnimatedProLogo from '../AnimatedProLogo';
import ForgotPasswordFlow from './ForgotPasswordFlow';
import OtpInputBoxes from './OtpInputBoxes';
import { toast } from 'react-toastify';
import './AuthModal.css';


// ─── LiveChart: Fully dynamic streaming candlestick chart ───────────────────
function LiveChart() {
  const CANDLE_COUNT = 18;
  const CHART_W = 440;
  const CHART_H = 330;
  const VOL_TOP = 360;
  const VOL_H = 60;
  const CANDLE_W = 11;
  const CANDLE_GAP = 8;
  const LEFT_PAD = 10;

  const genPrice = (base, spread) => base + (Math.random() - 0.5) * spread;

  const makeCandle = (prevClose, basePrice) => {
    const open = prevClose ?? genPrice(basePrice, 60);
    const move = (Math.random() - 0.42) * 80;
    const close = Math.max(basePrice - 300, Math.min(basePrice + 300, open + move));
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    const vol = 15 + Math.random() * 55;
    return { open, high, low, close, vol, isBull: close >= open };
  };

  const initCandles = (basePrice) => {
    const arr = [];
    let prev = null;
    for (let i = 0; i < CANDLE_COUNT; i++) {
      const c = makeCandle(prev, basePrice);
      arr.push(c);
      prev = c.close;
    }
    return arr;
  };

  const PAIRS = [
    { symbol: 'BTC/USDT', base: 64400, tickSize: 0.5 },
    { symbol: 'ETH/USDT', base: 3420, tickSize: 0.05 },
    { symbol: 'SOL/USDT', base: 178, tickSize: 0.01 },
    { symbol: 'BNB/USDT', base: 612, tickSize: 0.1 },
  ];
  const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'];

  const [pairIdx, setPairIdx] = useState(() => Math.floor(Math.random() * PAIRS.length));
  const [tfIdx, setTfIdx] = useState(2);
  const pair = PAIRS[pairIdx];

  const [candles, setCandles] = useState(() => initCandles(pair.base));
  const [livePrice, setLivePrice] = useState(pair.base);
  const [liveCandle, setLiveCandle] = useState(() => makeCandle(pair.base, pair.base));
  const [change24h, setChange24h] = useState(() => ((Math.random() - 0.4) * 6).toFixed(2));
  const [vol24h, setVol24h] = useState(() => (Math.random() * 2 + 0.5).toFixed(2));

  const tickRef = useRef(null);

  // Tick: update live candle price every 600ms
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setLivePrice(prev => {
        const drift = (Math.random() - 0.48) * pair.tickSize * 8;
        return parseFloat((prev + drift).toFixed(pair.tickSize < 0.1 ? 2 : pair.tickSize < 1 ? 2 : 1));
      });
      setLiveCandle(prev => {
        const newClose = parseFloat((prev.close + (Math.random() - 0.48) * pair.tickSize * 12).toFixed(2));
        return {
          ...prev,
          close: newClose,
          high: Math.max(prev.high, newClose),
          low: Math.min(prev.low, newClose),
          isBull: newClose >= prev.open,
          vol: prev.vol + Math.random() * 2
        };
      });
    }, 600);
    return () => clearInterval(tickRef.current);
  }, [pair]);

  // Every 8s: close live candle, push new one, shift left
  useEffect(() => {
    const candleClose = setInterval(() => {
      setCandles(prev => {
        const next = [...prev.slice(1), liveCandle];
        return next;
      });
      setLiveCandle(c => makeCandle(c.close, pair.base));
    }, 8000);
    return () => clearInterval(candleClose);
  }, [liveCandle, pair]);

  // Every 30s: switch pair for full chart refresh
  useEffect(() => {
    const switcher = setInterval(() => {
      const next = (pairIdx + 1) % PAIRS.length;
      setPairIdx(next);
      const newPair = PAIRS[next];
      const newCandles = initCandles(newPair.base);
      setCandles(newCandles);
      setLivePrice(newPair.base);
      setLiveCandle(makeCandle(newPair.base, newPair.base));
      setChange24h(((Math.random() - 0.4) * 6).toFixed(2));
      setVol24h((Math.random() * 2 + 0.5).toFixed(2));
    }, 30000);
    return () => clearInterval(switcher);
  }, [pairIdx]);

  // Compute price scale
  const allPrices = [...candles.flatMap(c => [c.high, c.low]), liveCandle.high, liveCandle.low];
  const pMin = Math.min(...allPrices);
  const pMax = Math.max(...allPrices);
  const pRange = pMax - pMin || 1;
  const toY = (p) => CHART_H - ((p - pMin) / pRange) * (CHART_H - 24) - 4;

  const maxVol = Math.max(...candles.map(c => c.vol), liveCandle.vol) || 1;
  const toVolH = (v) => (v / maxVol) * (VOL_H - 4);

  const candleX = (i) => LEFT_PAD + i * (CANDLE_W + CANDLE_GAP);
  const midX = (i) => candleX(i) + CANDLE_W / 2;

  // EMA helper
  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let e = data[0];
    return data.map(v => { e = v * k + e * (1 - k); return e; });
  };
  const closePrices = [...candles.map(c => c.close), liveCandle.close];
  const ema20 = ema(closePrices, 20);
  const ema50 = ema(closePrices, 50);

  const emaPoints = (eArr) =>
    eArr.map((v, i) => `${midX(i)},${toY(v)}`).join(' ');

  // Grid price levels
  const gridLevels = 5;
  const gridPrices = Array.from({ length: gridLevels }, (_, i) =>
    pMin + (pRange * i) / (gridLevels - 1)
  ).reverse();

  const isBull24 = parseFloat(change24h) >= 0;
  const liveBull = liveCandle.isBull;
  const BUY = 'var(--color-ghost-buy)';
  const SELL = 'var(--color-ghost-sell)';
  const liveColor = liveBull ? BUY : SELL;

  const fmt = (p) => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (p >= 100) return p.toFixed(2);
    return p.toFixed(3);
  };

  return (
    <div className="auth-modal-right">
      {/* Top Bar */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(17,20,29,0.4)',
        padding: '14px 18px 10px'
      }}>
        {/* Symbol row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '34px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
                {pair.symbol}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: BUY, background: 'rgba(16,185,129,0.12)', padding: '2px 5px', borderRadius: '2px', fontWeight: '600' }}>
                PERP
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <motion.span
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                style={{ width: '5px', height: '5px', borderRadius: '50%', background: BUY, display: 'inline-block' }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>LIVE</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <motion.span
              key={livePrice}
              initial={{ opacity: 0.6, y: liveBull ? 2 : -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700', color: liveColor }}
            >
              {fmt(livePrice)}
            </motion.span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: '600',
              color: isBull24 ? BUY : SELL,
              background: isBull24 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              padding: '2px 5px', borderRadius: '2px'
            }}>
              {isBull24 ? '+' : ''}{change24h}%
            </span>
          </div>
        </div>

        {/* Timeframe + Indicators */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            {TIMEFRAMES.map((tf, i) => (
              <span key={tf} onClick={() => setTfIdx(i)} style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px',
                fontWeight: i === tfIdx ? '700' : '400',
                color: i === tfIdx ? 'var(--text-primary)' : 'var(--text-muted)',
                background: i === tfIdx ? 'var(--color-ghost-surface-hover)' : 'transparent',
                padding: '2px 5px', borderRadius: '2px', cursor: 'pointer'
              }}>
                {tf}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', fontFamily: 'var(--font-mono)', fontSize: '8.5px' }}>
            <span style={{ color: '#38bdf8' }}>EMA20 <strong style={{ color: 'var(--text-secondary)' }}>{fmt(ema20[ema20.length - 1])}</strong></span>
            <span style={{ color: '#a855f7' }}>EMA50 <strong style={{ color: 'var(--text-secondary)' }}>{fmt(ema50[ema50.length - 1])}</strong></span>
            <span style={{ color: 'var(--text-muted)' }}>VOL <strong style={{ color: 'var(--text-secondary)' }}>{vol24h}B</strong></span>
          </div>
        </div>
      </div>

      {/* Chart SVG */}
      <div style={{ flex: 1, position: 'relative', width: '100%', padding: '8px 12px 4px' }}>
        <svg width="100%" height="100%" viewBox="0 0 440 450" preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
          {/* Horizontal grid */}
          {gridPrices.map((gp, i) => {
            const gy = toY(gp);
            return (
              <g key={i}>
                <line x1="0" y1={gy} x2="372" y2={gy} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                <text x="376" y={gy + 3.5} fill="var(--text-dim)" fontSize="8.5" fontFamily="var(--font-mono)">{fmt(gp)}</text>
              </g>
            );
          })}

          {/* Vertical grid */}
          {[0, 4, 9, 14, 18].map((ci, i) => (
            <line key={i} x1={midX(ci)} y1="0" x2={midX(ci)} y2={CHART_H} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
          ))}

          {/* EMA 50 purple */}
          <polyline points={emaPoints(ema50)} fill="none" stroke="#a855f7" strokeWidth="1.4" opacity="0.7" />
          {/* EMA 20 cyan */}
          <polyline points={emaPoints(ema20)} fill="none" stroke="#38bdf8" strokeWidth="1.4" opacity="0.85" />

          {/* Historical candles */}
          {candles.map((c, i) => {
            const x = candleX(i);
            const mx = midX(i);
            const col = c.isBull ? BUY : SELL;
            const rY = toY(Math.max(c.open, c.close));
            const rH = Math.abs(toY(c.close) - toY(c.open)) || 2;
            const vH = toVolH(c.vol);
            return (
              <g key={i}>
                <line x1={mx} y1={toY(c.high)} x2={mx} y2={toY(c.low)} stroke={col} strokeWidth="1.2" />
                <rect x={x} y={rY} width={CANDLE_W} height={rH} fill={col} rx="1" />
                <rect x={x} y={VOL_TOP + VOL_H - vH} width={CANDLE_W} height={vH} fill={col} opacity="0.32" rx="1" />
              </g>
            );
          })}

          {/* Live candle */}
          {(() => {
            const i = CANDLE_COUNT;
            const x = candleX(i);
            const mx = midX(i);
            const rY = toY(Math.max(liveCandle.open, liveCandle.close));
            const rH = Math.abs(toY(liveCandle.close) - toY(liveCandle.open)) || 2;
            const vH = toVolH(liveCandle.vol);
            return (
              <g>
                <motion.line
                  x1={mx} x2={mx}
                  animate={{ y1: toY(liveCandle.high), y2: toY(liveCandle.low) }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  stroke={liveColor} strokeWidth="1.2"
                />
                <motion.rect
                  x={x} width={CANDLE_W} rx="1"
                  animate={{ y: rY, height: rH }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  fill={liveColor}
                />
                <motion.rect
                  x={x} width={CANDLE_W} rx="1"
                  animate={{ y: VOL_TOP + VOL_H - vH, height: vH }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  fill={liveColor} opacity="0.45"
                />
                {/* Pulsing dot at live price */}
                <motion.circle
                  cx={mx}
                  animate={{ cy: rY, opacity: [1, 0.35, 1] }}
                  transition={{ cy: { duration: 0.5, ease: 'easeOut' }, opacity: { repeat: Infinity, duration: 1.0 } }}
                  r="3" fill="var(--color-ghost-accent)" stroke={liveColor} strokeWidth="1.5"
                />
              </g>
            );
          })()}

          {/* Live price crosshair */}
          <motion.line
            x1="0" x2="372"
            animate={{ y1: toY(liveCandle.close), y2: toY(liveCandle.close) }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            stroke={liveColor} strokeWidth="0.8" strokeDasharray="3 4" opacity="0.7"
          />

          {/* Volume divider */}
          <line x1="0" y1={VOL_TOP} x2="372" y2={VOL_TOP} stroke="var(--border-subtle)" strokeWidth="1" opacity="0.4" />
          <text x="4" y={VOL_TOP + 10} fill="var(--text-dim)" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="0.5">VOLUME</text>

          {/* Live price badge on Y-axis */}
          <motion.g
            animate={{ transform: `translateY(${toY(liveCandle.close) - 9}px)` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <rect x="370" y="0" width="68" height="18" fill={liveColor} rx="2" />
            <text x="374" y="12.5" fill="#090b10" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">
              {fmt(livePrice)}
            </text>
          </motion.g>

          {/* Time axis */}
          {[0, 4, 9, 13, 17].map((ci, i) => (
            <text key={i} x={midX(ci)} y="445" fill="var(--text-dim)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle">
              {String(12 + i * 30).padStart(2,'0')}:00
            </text>
          ))}
        </svg>
      </div>

      {/* Bottom bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 18px', borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(17,20,29,0.5)', fontFamily: 'var(--font-mono)', fontSize: '9.5px'
      }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          <span style={{ color: 'var(--text-muted)' }}>DMA <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>ACTIVE</span></span>
          <span style={{ color: 'var(--text-muted)' }}>PING <span style={{ color: BUY, fontWeight: 600 }}>0.8ms</span></span>
        </div>
        <span style={{ color: 'var(--text-muted)' }}>24H VOL <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${vol24h}B</span></span>
      </div>
    </div>
  );
}

export default function AuthModal() {
  const navigate = useNavigate();
  const { 
    isAuthModalOpen, 
    authModalStep, 
    setAuthModalStep, 
    closeAuthModal, 
    login 
  } = useGhostStore();

  const [isLoading, setIsLoading] = useState(false);

  
  const [errorMsg, setErrorMsg] = useState("");

  // Login State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Signup State
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");


  const getPasswordStrength = (pwd) => {
    if (!pwd) return { label: '', color: 'transparent' };
    let strengthScore = 0;
    if (pwd.length >= 8) strengthScore++;
    if (/[a-z]/.test(pwd)) strengthScore++;
    if (/[A-Z]/.test(pwd)) strengthScore++;
    if (/\d/.test(pwd)) strengthScore++;
    if (/[^A-Za-z0-9]/.test(pwd)) strengthScore++;

    if (strengthScore < 3) return { label: 'Weak', color: '#ef4444' };
    if (strengthScore === 3 || strengthScore === 4) return { label: 'Medium', color: '#f59e0b' };
    return { label: 'Strong', color: '#10b981' };
  };
  const strength = getPasswordStrength(signupPassword);

  const triggerSuccessAnimation = () => {
    setAuthModalStep("success");
    setTimeout(() => {
      closeAuthModal();
      navigate('/terminal');
    }, 2000);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!loginEmail || !loginPassword) {
      const msg = 'Please provide both email and password.';
      toast.error(msg);
      return setErrorMsg(msg);
    }

    setIsLoading(true);
    const result = await login({ isSignup: false, email: loginEmail, password: loginPassword });
    setIsLoading(false);

    if (result.success) {
      toast.success('Welcome back! Signing in...');
      triggerSuccessAnimation();
    } else {
      const msg = result.message || 'Authentication failed. Please check credentials.';
      toast.error(msg);
      setErrorMsg(msg);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!signupName || !signupEmail || !signupPassword) {
      const msg = 'Please complete all required fields.';
      toast.error(msg);
      return setErrorMsg(msg);
    }
    if (signupPassword !== signupConfirmPassword) {
      const msg = 'Passwords do not match.';
      toast.error(msg);
      return setErrorMsg(msg);
    }
    
    if (signupPassword.length < 8) {
      const msg = 'Password must be at least 8 characters.';
      toast.error(msg);
      return setErrorMsg(msg);
    }
    if (!/[a-z]/.test(signupPassword)) {
      const msg = 'Password must contain at least one lowercase letter.';
      toast.error(msg);
      return setErrorMsg(msg);
    }
    if (!/[A-Z]/.test(signupPassword)) {
      const msg = 'Password must contain at least one uppercase letter.';
      toast.error(msg);
      return setErrorMsg(msg);
    }
    if (!/\d/.test(signupPassword)) {
      const msg = 'Password must contain at least one number.';
      toast.error(msg);
      return setErrorMsg(msg);
    }

    setIsLoading(true);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail })
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success(`Verification OTP sent to ${signupEmail}!`);
        setAuthModalStep('verify-otp');
      } else {
        const msg = data.error || 'Failed to send OTP. Please try again.';
        toast.error(msg);
        setErrorMsg(msg);
      }
    } catch (err) {
      const msg = 'Network error while sending OTP.';
      toast.error(msg);
      setErrorMsg(msg);
    }
    
    setIsLoading(false);
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!otpCode || otpCode.length < 8) {
      const msg = 'Please enter a valid 8-digit OTP.';
      toast.error(msg);
      return setErrorMsg(msg);
    }

    setIsLoading(true);
    const result = await login({ 
      isSignup: true, 
      name: signupName, 
      email: signupEmail, 
      password: signupPassword,
      otp: otpCode 
    });
    setIsLoading(false);

    if (result.success) {
      toast.success('Account verified! Signing you in...');
      triggerSuccessAnimation();
    } else {
      const msg = result.message || 'OTP Verification failed.';
      toast.error(msg);
      setErrorMsg(msg);
    }
  };

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <motion.div 
          className="auth-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAuthModal();
          }}
        >
          <motion.div 
            className="auth-modal-container"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
        
        <button className="auth-modal-close-btn" onClick={closeAuthModal}>
          <X size={16} strokeWidth={2.2} />
        </button>

        {/* LEFT SIDE: FORM */}
        <div className="auth-modal-left">
          <div className="auth-modal-body">
            <AnimatePresence mode="wait">
            {authModalStep === "login" ? (
              <motion.div 
                key="login" 
                initial={{ opacity: 0, x: -16 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 16 }} 
                transition={{ duration: 0.25 }} 
                className="step-wrapper"
              >
                <h2 className="auth-title">Welcome Back</h2>

                <form onSubmit={handleLoginSubmit} className="auth-form-modern">
                  <div className="input-group">
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      value={loginEmail} 
                      onChange={e => setLoginEmail(e.target.value)} 
                      className="email-input text-left" 
                    />
                  </div>
                  <div className="input-group">
                    <input 
                      type={showLoginPassword ? 'text' : 'password'} 
                      placeholder="Password" 
                      value={loginPassword} 
                      onChange={e => setLoginPassword(e.target.value)} 
                      className="email-input text-left" 
                    />
                    <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="pwd-toggle">
                      {showLoginPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <div className="auth-options-row">
                    <label className="auth-checkbox-label">
                      <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                      Remember me
                    </label>
                    <span className="auth-link" onClick={() => { setAuthModalStep("forgot-password"); setErrorMsg(""); }}>Forgot Password?</span>
                  </div>

                  <button type="submit" disabled={isLoading} className="google-btn justify-center mt-2">
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>

                <div className="divider" style={{ margin: '14px 0' }}>
                  <div className="divider-line"></div>
                  <span className="divider-text" style={{ fontSize: '10px', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>DON'T HAVE AN ACCOUNT?</span>
                  <div className="divider-line"></div>
                </div>

                <button type="button" onClick={() => { setAuthModalStep('signup'); setErrorMsg(''); }} className="google-btn justify-center outline-btn mobile-solid-btn">
                  Create Account
                </button>
              </motion.div>

            ) : authModalStep === "signup" ? (
              <motion.div 
                key="signup" 
                initial={{ opacity: 0, x: 16 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -16 }} 
                transition={{ duration: 0.25 }} 
                className="step-wrapper"
              >
                <h2 className="auth-title">Create Account</h2>

                <form onSubmit={handleSignupSubmit} className="auth-form-modern">
                  <div className="input-group">
                    <input type="text" placeholder="Full Name" value={signupName} onChange={e => setSignupName(e.target.value)} className="email-input text-left" />
                  </div>
                  <div className="input-group">
                    <input type="email" placeholder="Email Address" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} className="email-input text-left" />
                  </div>
                  <div className="input-group">
                    <input type={showSignupPassword ? 'text' : 'password'} placeholder="Password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} className="email-input text-left" />
                    {strength.label && <span className="pwd-strength" style={{ color: strength.color }}>{strength.label}</span>}
                  </div>
                  <div className="input-group">
                    <input type="password" placeholder="Confirm Password" value={signupConfirmPassword} onChange={e => setSignupConfirmPassword(e.target.value)} className="email-input text-left" />
                  </div>

                  <button type="submit" disabled={isLoading} className="google-btn justify-center mt-2">
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </form>

                <div className="auth-options-row" style={{ justifyContent: 'center', marginTop: '12px', flexDirection: 'row' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px' }}>
                    Already have an account?{' '}
                    <span className="auth-link" style={{ color: '#fff', fontWeight: '600' }} onClick={() => { setAuthModalStep('login'); setErrorMsg(''); }}>
                      Sign In
                    </span>
                  </span>
                </div>
              </motion.div>

            ) : authModalStep === "forgot-password" ? (
              <ForgotPasswordFlow onCancel={() => setAuthModalStep('login')} />

            ) : authModalStep === "verify-otp" ? (
              <motion.div 
                key="verify-otp" 
                initial={{ opacity: 0, x: 16 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -16 }} 
                transition={{ duration: 0.25 }} 
                className="step-wrapper"
              >
                <h2 className="auth-title">Verify Email</h2>
                <p className="auth-subtitle">
                  We sent an 8-digit code to <strong style={{color: '#fff'}}>{signupEmail}</strong>.
                </p>

                <form onSubmit={handleVerifyOtpSubmit} className="auth-form-modern">
                  <OtpInputBoxes 
                    value={otpCode} 
                    onChange={setOtpCode} 
                    length={8} 
                    disabled={isLoading} 
                  />

                  <button type="submit" disabled={isLoading} className="google-btn justify-center mt-2">
                    {isLoading ? 'Verifying...' : 'Verify Email'}
                  </button>
                </form>

                <div className="auth-options-row" style={{ justifyContent: 'center', marginTop: '12px', flexDirection: 'row' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px' }}>
                    Didn't receive it?{' '}
                    <span className="auth-link" style={{ color: '#fff', fontWeight: '600', cursor: 'pointer' }} onClick={handleSignupSubmit}>
                      Resend Code
                    </span>
                  </span>
                </div>
              </motion.div>

            ) : (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="step-wrapper" style={{ alignItems: 'center', textAlign: 'center' }}>
                <h2 className="auth-title">Welcome to Ghostrade</h2>
                <p className="auth-subtitle">Redirecting to terminal...</p>
                <div style={{ padding: '1.5rem 0' }}>
                  <div className="success-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" className="success-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Legal Related Links (No white line, 10px font size) */}
          <footer className="auth-legal-footer" style={{
            paddingTop: "6px",
            borderTop: "none",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            fontSize: "10px",
            fontFamily: "var(--font-sans)",
            color: "var(--text-muted)",
            userSelect: "none"
          }}>
            <Link 
              to="/terms" 
              onClick={closeAuthModal} 
              style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "10px", transition: "color 0.15s ease" }}
              onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.target.style.color = "var(--text-muted)"}
            >
              Terms of Service
            </Link>
            <span style={{ opacity: 0.35 }}>•</span>
            <Link 
              to="/privacy" 
              onClick={closeAuthModal} 
              style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "10px", transition: "color 0.15s ease" }}
              onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.target.style.color = "var(--text-muted)"}
            >
              Privacy Policy
            </Link>
            <span style={{ opacity: 0.35 }}>•</span>
            <Link 
              to="/risk" 
              onClick={closeAuthModal} 
              style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "10px", transition: "color 0.15s ease" }}
              onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.target.style.color = "var(--text-muted)"}
            >
              Risk Disclosure
            </Link>
          </footer>
        </div>

        {/* RIGHT SIDE: LIVE DYNAMIC CHART */}
        <LiveChart />

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
