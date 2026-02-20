import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo4.jpg';

/**
 * Auth Page - Combined Login/Signup matching homepage auth-fuse style
 */

// Password input with show/hide toggle
function PasswordInput({ value, onChange, placeholder, id, name, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
      <input
        type={show ? 'text' : 'password'}
        id={id}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full h-10 pl-10 pr-10 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  
  const [isSignIn, setIsSignIn] = useState(initialMode === 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('error'); // 'error' or 'success'
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Verification state
  const [verificationEmail, setVerificationEmail] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  
  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const navigate = useNavigate();
  const formRef = useRef(null);
  const { login } = useAuth();

  useEffect(() => {
    if (shake) {
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [shake]);

  // Clear form when switching modes
  const toggleMode = () => {
    setIsSignIn(!isSignIn);
    setMsg('');
    setEmail('');
    setPassword('');
    setName('');
    setConfirmPassword('');
    setVerificationEmail(null);
  };

  // Validate email
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Validate password
  const validatePassword = (pwd) => {
    if (!pwd) return 'Password is required';
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    return null;
  };

  // Handle Sign In
  const handleSignIn = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      if (!email || !password) {
        setMsg('Please enter both email and password');
        setMsgType('error');
        setShake(true);
        return;
      }

      const response = await fetch('/journal/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        if (data.user && !data.user.email_verified) {
          setVerificationEmail(email.trim());
          setMsg('Please verify your email to continue');
          setMsgType('error');
        } else if (data.user && data.token) {
          login(data.user, data.token, data.user.is_admin);
          
          // Admins skip subscription check
          if (data.user.is_admin) {
            navigate(data.user.has_active_profile ? '/dashboard' : '/select-profile');
            return;
          }
          
          // Check subscription status before redirecting
          try {
            const subRes = await fetch('/journal/api/subscriptions/my-subscription', {
              headers: { 'Authorization': `Bearer ${data.token}` }
            });
            const subData = await subRes.json();
            
            if (!subData.has_subscription || !['active', 'trialing'].includes(subData.subscription?.status)) {
              navigate('/pricing');
              return;
            }
          } catch (subErr) {
            console.warn('Could not check subscription, redirecting to pricing:', subErr);
            navigate('/pricing');
            return;
          }
          
          navigate(data.user.has_active_profile ? '/dashboard' : '/select-profile');
        } else {
          throw new Error('Invalid response');
        }
      } else {
        setMsg(data.error || data.message || data.detail || 'Login failed');
        setMsgType('error');
        setShake(true);
      }
    } catch (err) {
      setMsg('Network error, please try again');
      setMsgType('error');
      setShake(true);
    } finally {
      setLoading(false);
    }
  };

  // Handle Sign Up
  const handleSignUp = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      // Validation
      if (!name.trim()) {
        setMsg('Name is required');
        setMsgType('error');
        setShake(true);
        return;
      }
      if (!isValidEmail(email.trim())) {
        setMsg('Please enter a valid email');
        setMsgType('error');
        setShake(true);
        return;
      }
      const pwdErr = validatePassword(password);
      if (pwdErr) {
        setMsg(pwdErr);
        setMsgType('error');
        setShake(true);
        return;
      }
      if (password !== confirmPassword) {
        setMsg('Passwords do not match');
        setMsgType('error');
        setShake(true);
        return;
      }

      const response = await fetch('/journal/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        if (data.requires_verification) {
          setVerificationEmail(email.trim());
          setMsg('Verification code sent to your email');
          setMsgType('success');
        } else {
          setMsg('Account created! Please sign in.');
          setMsgType('success');
          setIsSignIn(true);
          setEmail(email);
          setPassword('');
          setName('');
          setConfirmPassword('');
        }
      } else {
        setMsg(data.error || data.message || data.detail || 'Sign up failed');
        setMsgType('error');
        setShake(true);
      }
    } catch (err) {
      setMsg('Network error, please try again');
      setMsgType('error');
      setShake(true);
    } finally {
      setLoading(false);
    }
  };

  // Handle Email Verification
  const handleVerify = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);

    try {
      const response = await fetch('/journal/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationEmail,
          code: verificationCode.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setMsg('Email verified! Please sign in.');
        setMsgType('success');
        setVerificationEmail(null);
        setVerificationCode('');
        setIsSignIn(true);
      } else {
        setMsg(data.error || data.message || data.detail || 'Verification failed');
        setMsgType('error');
        setShake(true);
      }
    } catch (err) {
      setMsg('Network error, please try again');
      setMsgType('error');
      setShake(true);
    } finally {
      setLoading(false);
    }
  };

  // Resend verification code
  const handleResendCode = async () => {
    setLoading(true);
    try {
      const response = await fetch('/journal/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });

      if (response.ok) {
        setMsg('Verification code resent!');
        setMsgType('success');
      } else {
        const data = await response.json().catch(() => ({}));
        setMsg(data.detail || 'Failed to resend code');
        setMsgType('error');
      }
    } catch (err) {
      setMsg('Network error');
      setMsgType('error');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password handlers
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotMsg('');
    setForgotLoading(true);

    try {
      const response = await fetch('/journal/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setForgotStep(2);
        setForgotMsg('Reset code sent! Check your email.');
        setForgotSuccess(true);
      } else {
        setForgotMsg(data.detail || 'Failed to send reset code');
        setForgotSuccess(false);
      }
    } catch (err) {
      setForgotMsg('Network error');
      setForgotSuccess(false);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotMsg('');

    if (newPassword !== forgotConfirmPassword) {
      setForgotMsg('Passwords do not match');
      setForgotSuccess(false);
      return;
    }

    setForgotLoading(true);

    try {
      const response = await fetch('/journal/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          code: resetCode.trim(),
          new_password: newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setForgotMsg('Password reset! You can now sign in.');
        setForgotSuccess(true);
        setTimeout(() => closeForgotPassword(), 2000);
      } else {
        setForgotMsg(data.detail || 'Failed to reset password');
        setForgotSuccess(false);
      }
    } catch (err) {
      setForgotMsg('Network error');
      setForgotSuccess(false);
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotStep(1);
    setForgotEmail('');
    setResetCode('');
    setNewPassword('');
    setForgotConfirmPassword('');
    setForgotMsg('');
    setForgotSuccess(false);
  };

  // Render verification form
  if (verificationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
        <div className="w-full max-w-[350px] mx-4 p-6 bg-[#0f0f14] rounded-xl border border-[#1f1f2e]">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-14 h-14 bg-[#0a0a12] rounded-xl flex items-center justify-center border border-[#1f1f2e]">
              <img src={logo} alt="Talaria" className="w-10 h-10 rounded-lg" />
            </div>
            <span className="text-xl font-bold text-white">Talaria</span>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">Verify Email</h1>
            <p className="text-[#71717a] text-sm">Enter the 6-digit code sent to {verificationEmail}</p>
          </div>

          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            {msg && (
              <div className={`px-3 py-2 rounded-lg text-sm text-center ${
                msgType === 'success' 
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {msg}
              </div>
            )}

            <div className="grid gap-2">
              <label className="text-sm font-medium text-white">Verification Code</label>
              <input
                type="text"
                placeholder="123456"
                className="w-full h-10 px-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:bg-[#18181b] transition-colors"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? '...' : 'Verify'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading}
              className="text-blue-400 hover:underline text-sm disabled:opacity-50"
            >
              Resend code
            </button>

            <button
              type="button"
              onClick={() => setVerificationEmail(null)}
              className="text-[#71717a] hover:text-white text-sm transition-colors"
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
      <style>{`
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shakeX 0.5s ease-in-out; }
      `}</style>

      <div
        ref={formRef}
        className={`w-full max-w-[350px] mx-4 p-6 bg-[#0f0f14] rounded-xl border border-[#1f1f2e] ${shake ? 'animate-shake' : ''}`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 bg-[#0a0a12] rounded-xl flex items-center justify-center border border-[#1f1f2e]">
            <img src={logo} alt="Talaria" className="w-10 h-10 rounded-lg" />
          </div>
          <span className="text-xl font-bold text-white">Talaria</span>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {isSignIn ? 'Log in' : 'Create an account'}
          </h1>
          <p className="text-[#71717a] text-sm">
            {isSignIn ? 'Enter your email and password to continue' : 'Enter your details below to sign up'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="flex flex-col gap-4">
          {msg && (
            <div className={`px-3 py-2 rounded-lg text-sm text-center ${
              msgType === 'success' 
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {msg}
            </div>
          )}

          {/* Name field (signup only) */}
          {!isSignIn && (
            <div className="grid gap-2">
              <label className="text-sm font-medium text-white" htmlFor="name">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                <input
                  type="text"
                  id="name"
                  placeholder="John Doe"
                  autoComplete="name"
                  className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="email">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="••••••••"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!isSignIn && <div className="text-xs text-[#71717a]">Minimum 8 characters</div>}
            {isSignIn && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-blue-400 hover:underline text-xs"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {/* Confirm Password (signup only) */}
          {!isSignIn && (
            <div className="grid gap-2">
              <label className="text-sm font-medium text-white" htmlFor="confirmPassword">Confirm Password</label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{loading ? '...' : (isSignIn ? 'Log in' : 'Sign up')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Toggle Link */}
          <div className="text-center text-sm">
            <span className="text-[#71717a]">
              {isSignIn ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button type="button" onClick={toggleMode} className="text-blue-400 hover:underline">
              {isSignIn ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f0f14] rounded-xl p-6 w-full max-w-[350px] border border-[#1f1f2e]">
            <h2 className="text-2xl font-bold text-white mb-2 text-center">Reset Password</h2>
            <p className="text-[#71717a] text-sm mb-6 text-center">
              {forgotStep === 1 ? 'Enter your email to receive a reset code' : 'Enter the code and new password'}
            </p>

            {forgotMsg && (
              <div className={`px-3 py-2 rounded-lg text-sm mb-4 ${
                forgotSuccess 
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {forgotMsg}
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{forgotLoading ? '...' : 'Send Reset Code'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" onClick={closeForgotPassword} className="text-[#71717a] hover:text-white text-sm py-2 transition-colors">
                  ← Back to sign in
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">Reset Code</label>
                  <input
                    type="text"
                    placeholder="123456"
                    className="w-full h-10 px-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:bg-[#18181b] transition-colors"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">New Password</label>
                  <PasswordInput
                    id="newPassword"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">Confirm Password</label>
                  <PasswordInput
                    id="forgotConfirmPassword"
                    placeholder="••••••••"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{forgotLoading ? '...' : 'Reset Password'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" onClick={closeForgotPassword} className="text-[#71717a] hover:text-white text-sm py-2 transition-colors">
                  ← Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
