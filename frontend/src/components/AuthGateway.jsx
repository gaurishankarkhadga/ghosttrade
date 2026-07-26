import React, { useState } from 'react';

export default function AuthGateway({ onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'
  
  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Sign Up Form State
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Status & Telemetry
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Calculate password strength
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { label: '', color: 'transparent', score: 0 };
    if (pwd.length < 6) return { label: 'Weak', color: '#ef4444', score: 1 };
    if (pwd.length < 10 || !/\d/.test(pwd)) return { label: 'Medium', color: '#f59e0b', score: 2 };
    return { label: 'Strong (Institutional)', color: '#10b981', score: 3 };
  };

  const strength = getPasswordStrength(signupPassword);

  // Handle Login Submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!loginEmail || !loginPassword) {
      setErrorMsg('Please provide both email/username and password.');
      return;
    }

    setIsLoading(true);
    
    // Call the deep backend auth route via Zustand store
    const result = await onLoginSuccess({ 
      isSignup: false,
      email: loginEmail, 
      password: loginPassword 
    });

    setIsLoading(false);

    if (result.success) {
      setSuccessMsg('Authentication successful! Launching workspace...');
    } else {
      setErrorMsg(result.message || 'Authentication failed. Please check credentials.');
    }
  };

  // Handle Sign Up Submit
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!signupName || !signupEmail || !signupPassword) {
      setErrorMsg('Please complete all required sign-up fields.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password.');
      return;
    }

    if (signupPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    
    // Call the deep backend auth route via Zustand store
    const result = await onLoginSuccess({
      isSignup: true,
      name: signupName,
      email: signupEmail,
      password: signupPassword
    });

    setIsLoading(false);

    if (result.success) {
      setSuccessMsg('Account created successfully! Redirecting to workspace...');
    } else {
      setErrorMsg(result.message || 'Account creation failed. Email may already exist.');
    }
  };

  // Instant Demo Access Handler
  const handleInstantDemo = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('Authenticating instant demo pass...');
    
    const result = await onLoginSuccess({ 
      isSignup: false,
      email: 'trader@ghosttrade.io', 
      password: 'whalesonly' // Using the hardcoded demo password from backend
    });

    setIsLoading(false);
    
    if (result.success) {
      setSuccessMsg('Demo access granted! Launching...');
    } else {
      setErrorMsg(result.message || 'Demo backend is unreachable.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-app)',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-lg)',
        padding: '36px',
        boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
        transition: 'var(--transition-smooth)'
      }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.25rem',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            GT
          </div>
          <div>
            <h1 className="font-orbitron font-bold" style={{ fontSize: '1.35rem', color: '#f8fafc', lineHeight: 1.1 }}>
              GhostTrade <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: 600 }}>Quant v3</span>
            </h1>
            <p className="font-sans text-xs" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
              Institutional Quantitative Terminal
            </p>
          </div>
        </div>

        {/* Tab Switcher: Login vs Sign Up */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-input)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          gap: '6px',
          marginBottom: '24px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
            className="font-orbitron"
            style={{
              padding: '10px 0',
              border: activeTab === 'login' ? '1px solid var(--border-accent)' : 'none',
              background: activeTab === 'login' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'login' ? '#38bdf8' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('signup'); setErrorMsg(''); setSuccessMsg(''); }}
            className="font-orbitron"
            style={{
              padding: '10px 0',
              border: activeTab === 'signup' ? '1px solid var(--border-accent)' : 'none',
              background: activeTab === 'signup' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'signup' ? '#38bdf8' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Create Account
          </button>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="badge-flat badge-flat-red font-sans" style={{ display: 'block', padding: '10px 14px', marginBottom: '18px', width: '100%', borderRadius: 'var(--radius-sm)' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="badge-flat badge-flat-green font-sans" style={{ display: 'block', padding: '10px 14px', marginBottom: '18px', width: '100%', borderRadius: 'var(--radius-sm)' }}>
            {successMsg}
          </div>
        )}

        {/* Tab 1: Sign In Form */}
        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Email Address or Username
              </label>
              <input
                type="text"
                placeholder="trader@ghosttrade.io"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#2563eb' }}
                />
                Remember this session
              </label>

              <span style={{ fontSize: '0.8rem', color: '#38bdf8', cursor: 'pointer' }}>
                Forgot Password?
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary font-orbitron"
              style={{ width: '100%', padding: '14px 0', fontSize: '0.9rem', marginTop: '4px' }}
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Terminal'}
            </button>
          </form>
        ) : (
          /* Tab 2: Create Account / Sign Up Form */
          <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Full Name
              </label>
              <input
                type="text"
                placeholder="Alex Mercer"
                value={signupName}
                onChange={e => setSignupName(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '11px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Work Email Address
              </label>
              <input
                type="email"
                placeholder="alex@fund.com"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '11px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Password
                </label>
                {strength.label && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: strength.color }}>
                    {strength.label}
                  </span>
                )}
              </div>
              <input
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="Create password"
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '11px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label className="font-sans text-xs font-semibold" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={signupConfirmPassword}
                onChange={e => setSignupConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '11px 14px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary font-orbitron"
              style={{ width: '100%', padding: '14px 0', fontSize: '0.9rem', marginTop: '6px' }}
            >
              {isLoading ? 'Creating Account...' : 'Create Quant Account'}
            </button>
          </form>
        )}

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '22px 0 16px 0',
          color: 'var(--text-muted)',
          fontSize: '0.75rem'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
          <span>OR QUICK ACCESS</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
        </div>

        {/* Instant 1-Click Demo Pass Button */}
        <button
          type="button"
          onClick={handleInstantDemo}
          disabled={isLoading}
          className="btn-outline font-orbitron"
          style={{
            width: '100%',
            padding: '12px 0',
            fontSize: '0.85rem',
            color: '#38bdf8',
            borderColor: 'rgba(56, 189, 248, 0.3)'
          }}
        >
          Explore Demo Terminal (Instant 1-Click Entry)
        </button>
      </div>
    </div>
  );
}
