import { toast } from "react-toastify";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import OtpInputBoxes from "./OtpInputBoxes";

export default function ForgotPasswordFlow({ onCancel }) {
  const [step, setStep] = useState("email"); // "email" | "verify-otp" | "new-password"
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // STEP 1: Send Recovery Email
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success("Recovery code sent to your email!");
        setStep("verify-otp");
      } else {
        toast.error(data.error || "Failed to send recovery email. Please check the email.");
      }
    } catch (err) {
      toast.error("Network error while sending request.");
    }
    setIsLoading(false);
  };

  // STEP 2: Verify Recovery OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 8) {
      toast.error("Please enter a valid 8-digit OTP.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/auth/verify-recovery-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpCode })
      });
      const data = await res.json();
      
      if (res.ok && data.recoveryToken) {
        toast.success("OTP verified! Create your new password.");
        setRecoveryToken(data.recoveryToken);
        setStep("new-password");
      } else {
        toast.error(data.error || "Invalid or expired OTP code.");
      }
    } catch (err) {
      toast.error("Network error while verifying OTP.");
    }
    setIsLoading(false);
  };

  // STEP 3: Update Password
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!recoveryToken) {
      toast.error("Missing recovery token. Please restart the process.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/auth/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, recoveryToken, newPassword })
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success("Password reset successfully! You can now log in.");
        setTimeout(() => {
          onCancel();
        }, 1500);
      } else {
        toast.error(data.error || "Failed to update password.");
      }
    } catch (err) {
      toast.error("Network error while resetting password.");
    }
    setIsLoading(false);
  };

  const handleBack = () => {
    if (step === "email") {
      onCancel();
    } else if (step === "verify-otp") {
      setStep("email");
    } else if (step === "new-password") {
      setStep("verify-otp");
    }
  };

  return (
    <>


      <AnimatePresence mode="wait">
        {/* STEP 1: REQUEST EMAIL */}
        {step === "email" && (
          <motion.div 
            key="email" 
            initial={{ opacity: 0, x: -16 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 16 }} 
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="step-wrapper"
          >
            <div>
              <h1 className="hero-title" style={{ fontSize: "28px", marginBottom: "8px" }}>
                Reset Password
              </h1>
              <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "14px", marginBottom: "24px", lineHeight: "1.5" }}>
                Enter your email address to receive an 8-digit verification code.
              </p>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSendEmail} className="auth-form-modern">
              <div className="input-group">
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="email-input text-left" 
                />
              </div>

              <button 
                type="submit" 
                disabled={isLoading} 
                className="google-btn justify-center mt-4" 
                style={{ background: "#fff", color: "#000" }}
              >
                {isLoading ? "Sending Code..." : "Send Code"}
              </button>
            </form>

            <div className="auth-options-row" style={{ justifyContent: "center", marginTop: "1.5rem", flexDirection: "row" }}>
              <span 
                className="auth-link" 
                style={{ color: "rgba(255, 255, 255, 0.7)", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }} 
                onClick={onCancel}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </span>
            </div>
          </motion.div>
        )}

        {/* STEP 2: VERIFY OTP */}
        {step === "verify-otp" && (
          <motion.div 
            key="verify-otp" 
            initial={{ opacity: 0, x: 16 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -16 }} 
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="step-wrapper signup-wrapper-adjust"
          >
            <div>
              <h1 className="hero-title" style={{ fontSize: "28px", marginBottom: "8px" }}>
                Verify Code
              </h1>
              <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "14px", marginBottom: "24px", lineHeight: "1.5" }}>
                We sent an 8-digit code to <strong style={{ color: "#fff" }}>{email}</strong>.
              </p>
            </div>

            {/* OTP Form */}
            <form onSubmit={handleVerifyOtp} className="auth-form-modern">
              <OtpInputBoxes 
                value={otpCode} 
                onChange={setOtpCode} 
                length={8} 
                disabled={isLoading} 
              />

              <button 
                type="submit" 
                disabled={isLoading} 
                className="google-btn justify-center mt-2" 
                style={{ background: "#fff", color: "#000" }}
              >
                {isLoading ? "Verifying..." : "Verify Code"}
              </button>
            </form>

            <div className="auth-options-row" style={{ justifyContent: "space-between", marginTop: "1.5rem", flexDirection: "row" }}>
              <span 
                className="auth-link" 
                style={{ color: "rgba(255, 255, 255, 0.7)", fontWeight: "500", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }} 
                onClick={() => setStep("email")}
              >
                <ArrowLeft size={14} /> Change Email
              </span>
              <span 
                className="auth-link" 
                style={{ color: "#fff", fontWeight: "500", cursor: "pointer" }} 
                onClick={handleSendEmail}
              >
                Resend Code
              </span>
            </div>
          </motion.div>
        )}

        {/* STEP 3: SET NEW PASSWORD */}
        {step === "new-password" && (
          <motion.div 
            key="new-password" 
            initial={{ opacity: 0, x: 16 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -16 }} 
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="step-wrapper signup-wrapper-adjust"
          >
            <div>
              <h1 className="hero-title" style={{ fontSize: "28px", marginBottom: "8px" }}>
                Set New Password
              </h1>
              <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "14px", marginBottom: "24px", lineHeight: "1.5" }}>
                Code verified. Choose a strong new password for your account.
              </p>
            </div>

            {/* New Password Form */}
            <form onSubmit={handleUpdatePassword} className="auth-form-modern">
              <div className="input-group">
                <input 
                  type={showNewPassword ? "text" : "password"} 
                  placeholder="New Password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  className="email-input text-left" 
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="pwd-toggle"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="input-group">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="Confirm Password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  className="email-input text-left" 
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="pwd-toggle"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button 
                type="submit" 
                disabled={isLoading} 
                className="google-btn justify-center mt-6" 
                style={{ background: "#fff", color: "#000" }}
              >
                {isLoading ? "Saving..." : "Save Password"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
