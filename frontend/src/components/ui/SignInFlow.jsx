import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Terminal, BrainCircuit, Activity, LogIn, UserPlus } from 'lucide-react';
import AnimatedProLogo from '../AnimatedProLogo';
import './SignInFlow.css';

// 3D Canvas Background (Preserved from 21st.dev)
export const CanvasRevealEffect = ({ animationSpeed = 10, opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1], colors = [[0, 255, 255]], dotSize, showGradient = true, reverse = false }) => {
  return (
    <div className="canvas-bg-layer">
      <div className="canvas-container">
        <DotMatrix colors={colors ?? [[0, 255, 255]]} dotSize={dotSize ?? 3} opacities={opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]} shader={`${reverse ? 'u_reverse_active' : 'false'}_;animation_speed_factor_${animationSpeed.toFixed(1)}_;`} center={["x", "y"]} />
      </div>
      {showGradient && <div className="linear-gradient-bottom" />}
    </div>
  );
};

const DotMatrix = ({ colors = [[0, 0, 0]], opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14], totalSize = 20, dotSize = 2, shader = "", center = ["x", "y"] }) => {
  const uniforms = React.useMemo(() => {
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
    if (colors.length === 2) colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    else if (colors.length === 3) colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    return {
      u_colors: { value: colorsArray.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255]), type: "uniform3fv" },
      u_opacities: { value: opacities, type: "uniform1fv" },
      u_total_size: { value: totalSize, type: "uniform1f" },
      u_dot_size: { value: dotSize, type: "uniform1f" },
      u_reverse: { value: shader.includes("u_reverse_active") ? 1 : 0, type: "uniform1i" },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float; in vec2 fragCoord; uniform float u_time; uniform float u_opacities[10]; uniform vec3 u_colors[6]; uniform float u_total_size; uniform float u_dot_size; uniform vec2 u_resolution; uniform int u_reverse; out vec4 fragColor;
        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) { return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x); }
        void main() {
            vec2 st = fragCoord.xy;
            ${center.includes("x") ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));" : ""}
            ${center.includes("y") ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));" : ""}
            float opacity = step(0.0, st.x) * step(0.0, st.y);
            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));
            float show_offset = random(st2); 
            float rand = random(st2 * floor((u_time / 5.0) + show_offset + 5.0));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));
            vec3 color = u_colors[int(show_offset * 6.0)];
            float animation_speed_factor = 0.5; 
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);
            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);
            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }
            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a; 
        }`}
      uniforms={uniforms} maxFps={60}
    />
  );
};

const ShaderMaterial = ({ source, uniforms, maxFps = 60 }) => {
  const { size } = useThree(); const ref = useRef(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.material.uniforms.u_time.value = clock.getElapsedTime(); });
  const getUniforms = () => {
    const p = {};
    for (const k in uniforms) {
      if (uniforms[k].type === "uniform1f") p[k] = { value: uniforms[k].value, type: "1f" };
      else if (uniforms[k].type === "uniform1i") p[k] = { value: uniforms[k].value, type: "1i" };
      else if (uniforms[k].type === "uniform3f") p[k] = { value: new THREE.Vector3().fromArray(uniforms[k].value), type: "3f" };
      else if (uniforms[k].type === "uniform1fv") p[k] = { value: uniforms[k].value, type: "1fv" };
      else if (uniforms[k].type === "uniform3fv") p[k] = { value: uniforms[k].value.map((v) => new THREE.Vector3().fromArray(v)), type: "3fv" };
      else if (uniforms[k].type === "uniform2f") p[k] = { value: new THREE.Vector2().fromArray(uniforms[k].value), type: "2f" };
    }
    p["u_time"] = { value: 0, type: "1f" }; p["u_resolution"] = { value: new THREE.Vector2(size.width * 2, size.height * 2) };
    return p;
  };
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `precision mediump float; in vec2 coordinates; uniform vec2 u_resolution; out vec2 fragCoord; void main(){ gl_Position = vec4(position.x, position.y, 0.0, 1.0); fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution; fragCoord.y = u_resolution.y - fragCoord.y; }`,
    fragmentShader: source, uniforms: getUniforms(), glslVersion: THREE.GLSL3, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  }), [size.width, size.height, source]);
  return <mesh ref={ref}><planeGeometry args={[2, 2]} /><primitive object={material} attach="material" /></mesh>;
};

const Shader = ({ source, uniforms, maxFps = 60 }) => <Canvas className="canvas-container"><ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} /></Canvas>;

// Animated Top Navbar
const AnimatedNavLink = ({ href, children }) => (
  <a href={href} className="nav-link"><div className="nav-link-inner"><span>{children}</span><span>{children}</span></div></a>
);

function MiniNavbar({ onModeSwitch }) {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState('rounded-full');

  useEffect(() => {
    if (isOpen) setHeaderShapeClass('rounded-xl');
    else setTimeout(() => setHeaderShapeClass('rounded-full'), 300);
  }, [isOpen]);

  return (
    <header className={`mini-navbar ${headerShapeClass}`}>
      <div className="navbar-inner">
        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AnimatedProLogo size={48} color="#ffffff" isAnimating={true} />
        </div>
        <nav className="desktop-nav">
          <AnimatedNavLink href="#">About</AnimatedNavLink>
          <AnimatedNavLink href="#">Features</AnimatedNavLink>
          <AnimatedNavLink href="#">Pricing</AnimatedNavLink>
        </nav>
        <div className="auth-buttons">
          <button className="login-btn" onClick={() => onModeSwitch('login')}>Sign In</button>
          <div className="signup-container">
            <div className="signup-glow"></div>
            <button className="signup-btn" onClick={() => onModeSwitch('signup')}>Create Account</button>
          </div>
        </div>
        <button className="mobile-menu-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? (
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          ) : (
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          )}
        </button>
      </div>

      <div className={`mobile-menu ${isOpen ? 'open' : 'closed'}`}>
        <nav className="mobile-nav-links">
          <a href="#"><Terminal size={18} /><span>About</span></a>
          <a href="#"><Activity size={18} /><span>Features</span></a>
          <a href="#"><BrainCircuit size={18} /><span>Pricing</span></a>
        </nav>
        <div className="mobile-auth-buttons">
          <button className="login-btn mobile-action-btn" onClick={() => { setIsOpen(false); onModeSwitch('login'); }}>
            <LogIn size={16} /><span>Sign In</span>
          </button>
          <button className="signup-btn mobile-action-btn" onClick={() => { setIsOpen(false); onModeSwitch('signup'); }}>
            <UserPlus size={16} /><span>Create Account</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// MAIN COMPONENT (Merging 21st.dev animations with GhostTrade Logic)
export const SignInPage = ({ onLoginSuccess }) => {
  const [step, setStep] = useState("login"); // 'login' | 'signup' | 'success'
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  // Original AuthGateway State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password Strength
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { label: '', color: 'transparent' };
    if (pwd.length < 6) return { label: 'Weak', color: '#ef4444' };
    if (pwd.length < 10 || !/\d/.test(pwd)) return { label: 'Medium', color: '#f59e0b' };
    return { label: 'Strong', color: '#10b981' };
  };
  const strength = getPasswordStrength(signupPassword);

  const triggerSuccessAnimation = () => {
    setReverseCanvasVisible(true);
    setTimeout(() => setInitialCanvasVisible(false), 50);
    setTimeout(() => setStep("success"), 2000);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!loginEmail || !loginPassword) return setErrorMsg('Please provide both email and password.');

    setIsLoading(true);
    const result = await onLoginSuccess({ isSignup: false, email: loginEmail, password: loginPassword });
    setIsLoading(false);

    if (result.success) triggerSuccessAnimation();
    else setErrorMsg(result.message || 'Authentication failed. Please check credentials.');
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!signupName || !signupEmail || !signupPassword) return setErrorMsg('Please complete all required fields.');
    if (signupPassword !== signupConfirmPassword) return setErrorMsg('Passwords do not match.');
    if (signupPassword.length < 6) return setErrorMsg('Password must be at least 6 characters.');

    setIsLoading(true);
    const result = await onLoginSuccess({ isSignup: true, name: signupName, email: signupEmail, password: signupPassword });
    setIsLoading(false);

    if (result.success) triggerSuccessAnimation();
    else setErrorMsg(result.message || 'Account creation failed. Email may already exist.');
  };

  const handleInstantDemo = async () => {
    setIsLoading(true);
    setErrorMsg('');
    const result = await onLoginSuccess({ isSignup: false, email: 'trader@ghosttrade.io', password: 'whalesonly' });
    setIsLoading(false);

    if (result.success) triggerSuccessAnimation();
    else setErrorMsg(result.message || 'Demo backend is unreachable.');
  };

  return (
    <div className="signin-wrapper">
      <div className="canvas-bg-layer">
        {initialCanvasVisible && <CanvasRevealEffect animationSpeed={3} colors={[[255, 255, 255], [255, 255, 255]]} dotSize={6} reverse={false} />}
        {reverseCanvasVisible && <CanvasRevealEffect animationSpeed={4} colors={[[255, 255, 255], [255, 255, 255]]} dotSize={6} reverse={true} />}
        <div className="radial-gradient-overlay" />
        <div className="linear-gradient-top" />
      </div>

      <div className="content-layer">
        <MiniNavbar onModeSwitch={(mode) => { setStep(mode); setErrorMsg(''); }} />

        <div className="main-area">
          <div className="form-container" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.05, pointerEvents: 'none', zIndex: 0 }}>
              <AnimatedProLogo size={800} color="#ffffff" isAnimating={true} />
            </div>
            <div className="form-inner" style={{ position: 'relative', zIndex: 1, transform: 'translateY(-40px)' }}>
              <AnimatePresence mode="wait">
                {step === "login" ? (
                  <motion.div key="login" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="step-wrapper">
                    <div>
                      <h1 className="hero-welcome">Welcome Back Trader</h1>
                    </div>

                    {errorMsg && <div className="auth-alert error">{errorMsg}</div>}

                    <form onSubmit={handleLoginSubmit} className="auth-form-modern">
                      <div className="input-group">
                        <input type="text" placeholder="Enter your email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="email-input text-left" />
                      </div>
                      <div className="input-group">
                        <input type={showLoginPassword ? 'text' : 'password'} placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="email-input text-left" />
                        <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="pwd-toggle">
                          {showLoginPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>

                      <div className="auth-options-row">
                        <label className="auth-checkbox-label">
                          <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                          Remember session
                        </label>
                        <span className="auth-link">Forgot Password?</span>
                      </div>

                      <button type="submit" disabled={isLoading} className="google-btn justify-center mt-4">
                        {isLoading ? 'Authenticating...' : 'Sign In to Terminal'}
                      </button>
                    </form>
                  </motion.div>
                ) : step === "signup" ? (
                  <motion.div key="signup" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="step-wrapper">
                    <div>
                      <h1 className="hero-title">Create Account</h1>
                    </div>

                    {errorMsg && <div className="auth-alert error">{errorMsg}</div>}

                    <form onSubmit={handleSignupSubmit} className="auth-form-modern">
                      <div className="input-group">
                        <input type="text" placeholder="Full Name" value={signupName} onChange={e => setSignupName(e.target.value)} className="email-input text-left" />
                      </div>
                      <div className="input-group">
                        <input type="email" placeholder="Work Email Address" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} className="email-input text-left" />
                      </div>
                      <div className="input-group">
                        <input type={showSignupPassword ? 'text' : 'password'} placeholder="Create Password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} className="email-input text-left" />
                        {strength.label && <span className="pwd-strength" style={{ color: strength.color }}>{strength.label}</span>}
                      </div>
                      <div className="input-group">
                        <input type="password" placeholder="Confirm Password" value={signupConfirmPassword} onChange={e => setSignupConfirmPassword(e.target.value)} className="email-input text-left" />
                      </div>

                      <button type="submit" disabled={isLoading} className="google-btn justify-center mt-4" style={{ background: '#fff', color: '#000' }}>
                        {isLoading ? 'Creating Account...' : 'Create Quant Account'}
                      </button>
                    </form>
                    <p className="legal-text">
                      By creating an account, you agree to the <Link to="#">MSA</Link>, <Link to="#">Product Terms</Link>, <Link to="#">Policies</Link>.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="success" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="step-wrapper">
                    <div>
                      <h1 className="hero-title">Terminal Unlocked</h1>
                      <p className="hero-subtitle">Connection established</p>
                    </div>
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, delay: 0.5 }} style={{ padding: '2.5rem 0' }}>
                      <div className="success-icon-wrapper">
                        <svg xmlns="http://www.w3.org/2000/svg" className="success-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </motion.div>
                    {/* The Success animation handles the state transition, no button needed, but we keep it for user interaction if they want */}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
