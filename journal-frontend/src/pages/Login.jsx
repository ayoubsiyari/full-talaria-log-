import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo4.jpg';

/**
 * Login Page - Styled to match homepage design system
 * See DESIGN_SYSTEM.md for color and style reference
 */

export default function Login() {
  const [lang, setLang] = useState('en');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const formRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (shake) {
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [shake]);

  const t = {
    en: {
      titleMain: 'Journal',
      subtitle: 'Professional Trading Intelligence',
      signInTitle: 'Log in',
      signInSub: 'Enter your email and password to continue',
      emailLabel: 'Email',
      emailPlaceholder: 'you@example.com',
      passwordLabel: 'Password',
      passwordPlaceholder: '••••••••',
      signInButton: 'Log in',
      noAccount: "Don't have an account?",
      createAccount: 'Sign up',
      loginFailed: 'Login failed',
      networkError: 'Network error, please try again',
      forgotPassword: 'Forgot password?',
      forgotTitle: 'Reset Password',
      forgotSubtitle: 'Enter your email to receive a reset code',
      sendCode: 'Send Reset Code',
      enterCode: 'Enter the code sent to your email',
      resetCodeLabel: 'Reset Code',
      newPasswordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm Password',
      resetPassword: 'Reset Password',
      backToLogin: 'Back to Login',
      codeSent: 'Reset code sent! Check your email.',
      passwordReset: 'Password reset successfully! You can now login.',
      passwordMismatch: 'Passwords do not match',
      dir: 'ltr',
    },
    ar: {
      titleMain: 'سجل التداول',
      subtitle: 'ذكاء التداول الاحترافي',
      signInTitle: 'تسجيل الدخول',
      signInSub: 'أدخل بريدك الإلكتروني وكلمة المرور للمتابعة',
      emailLabel: 'البريد الإلكتروني',
      emailPlaceholder: 'مثال: you@example.com',
      passwordLabel: 'كلمة المرور',
      passwordPlaceholder: '••••••••',
      signInButton: 'تسجيل الدخول',
      noAccount: 'لا تملك حسابًا؟',
      createAccount: 'إنشاء حساب',
      loginFailed: 'فشل تسجيل الدخول',
      networkError: 'خطأ في الاتصال، حاول مرة أخرى',
      forgotPassword: 'نسيت كلمة المرور؟',
      forgotTitle: 'إعادة تعيين كلمة المرور',
      forgotSubtitle: 'أدخل بريدك الإلكتروني لاستلام رمز إعادة التعيين',
      sendCode: 'إرسال رمز إعادة التعيين',
      enterCode: 'أدخل الرمز المرسل إلى بريدك الإلكتروني',
      resetCodeLabel: 'رمز إعادة التعيين',
      newPasswordLabel: 'كلمة المرور الجديدة',
      confirmPasswordLabel: 'تأكيد كلمة المرور',
      resetPassword: 'إعادة تعيين كلمة المرور',
      backToLogin: 'العودة لتسجيل الدخول',
      codeSent: 'تم إرسال الرمز! تحقق من بريدك الإلكتروني.',
      passwordReset: 'تم إعادة تعيين كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.',
      passwordMismatch: 'كلمتا المرور غير متطابقتين',
      dir: 'rtl',
    },
  };

  const texts = t[lang];

  const { login } = useAuth();
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setMsg('');
    
    // Basic validation
    if (!email || !password) {
      setMsg('Please enter both email and password');
      setShake(true);
      return;
    }
    
    try {
      // Create the request body with proper JSON formatting
      const requestBody = JSON.stringify({
        email: email.trim(),
        password: password
      });
      
      console.log('Login request body:', requestBody); // Debug log
      
      const response = await fetch('/journal/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: requestBody,
        credentials: 'include' // Include cookies if needed
      });
      
      // Get response text first to handle both JSON and non-JSON responses
      const responseText = await response.text();
      let data;
      
      // Try to parse as JSON, but handle non-JSON responses gracefully
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (jsonError) {
        console.warn('Response is not valid JSON, but continuing with raw response');
        console.log('Raw response:', responseText);
        // If we can't parse as JSON, but the request was successful, try to proceed
        if (response.ok) {
          data = { success: true, message: 'Login successful' };
        } else {
          // For non-200 responses with non-JSON body, throw with the raw response
          throw new Error(`Server error: ${response.status} ${response.statusText}\n${responseText.substring(0, 200)}`);
        }
      }
      
      // Data is already parsed in the previous step
      
      if (response.ok) {
        if (data.user && !data.user.email_verified) {
          setMsg('Please verify your email address before logging in. Check your inbox for a verification link.');
          setShake(true);
        } else if (data.user && data.token) {
          login(data.user, data.token, data.user.is_admin);
          
          // Check subscription status before redirecting
          try {
            const subRes = await fetch('/journal/api/subscriptions/my-subscription', {
              headers: { 'Authorization': `Bearer ${data.token}` }
            });
            const subData = await subRes.json();
            
            // If user has no active subscription, redirect to pricing
            if (!subData.has_subscription || !['active', 'trialing'].includes(subData.subscription?.status)) {
              navigate('/pricing');
              return;
            }
          } catch (subErr) {
            console.warn('Could not check subscription, proceeding to app:', subErr);
          }
          
          // Check if user has an active profile, if so go to dashboard, otherwise to profile selection
          if (data.user.has_active_profile) {
            navigate('/dashboard');
          } else {
            navigate('/select-profile');
          }
        } else {
          throw new Error('Invalid response format from server');
        }
      } else {
        setMsg(data.error || data.message || texts.loginFailed);
        setShake(true);
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage = texts.networkError;
      
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMessage = 'Unable to connect to the server. Please check your internet connection.';
      } else if (err.message.includes('Server error')) {
        errorMessage = 'Server error occurred. Please try again later.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setMsg(errorMessage);
      setShake(true);
    }
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'ar' : 'en'));
  };

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

      const data = await response.json();

      if (response.ok) {
        setForgotStep(2);
        setForgotMsg(texts.codeSent);
        setForgotSuccess(true);
      } else {
        setForgotMsg(data.detail || 'Failed to send reset code');
        setForgotSuccess(false);
      }
    } catch (err) {
      setForgotMsg(texts.networkError);
      setForgotSuccess(false);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotMsg('');

    if (newPassword !== confirmPassword) {
      setForgotMsg(texts.passwordMismatch);
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

      const data = await response.json();

      if (response.ok) {
        setForgotMsg(texts.passwordReset);
        setForgotSuccess(true);
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotStep(1);
          setForgotEmail('');
          setResetCode('');
          setNewPassword('');
          setConfirmPassword('');
          setForgotMsg('');
        }, 2000);
      } else {
        setForgotMsg(data.detail || 'Failed to reset password');
        setForgotSuccess(false);
      }
    } catch (err) {
      setForgotMsg(texts.networkError);
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
    setConfirmPassword('');
    setForgotMsg('');
    setForgotSuccess(false);
  };

  return (
    <div
      dir={texts.dir}
      className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white"
    >
      {/* Custom CSS */}
      <style>{`
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shakeX 0.5s ease-in-out; }
      `}</style>

      {/* Main Card */}
      <div
        ref={formRef}
        className={`
          w-full max-w-[350px] mx-4 p-6
          bg-[#0f0f14] rounded-xl
          border border-[#1f1f2e]
          ${shake ? 'animate-shake' : ''}
        `}
      >
        {/* Logo & Heading */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 bg-[#0a0a12] rounded-xl flex items-center justify-center border border-[#1f1f2e]">
            <img src={logo} alt="Talaria" className="w-10 h-10 rounded-lg" />
          </div>
          <span className="text-xl font-bold text-white">Talaria</span>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {texts.signInTitle}
          </h1>
          <p className="text-[#71717a] text-sm">
            {texts.signInSub}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {msg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-center text-sm">
              {msg}
              {msg.includes('verify your email') && (
                <div className="mt-2">
                  <Link to="/resend-verification" className="text-blue-400 hover:text-blue-300 underline">
                    Resend verification email
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="email">
              {texts.emailLabel}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
              <input
                type="email"
                id="email"
                placeholder={texts.emailPlaceholder}
                className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="password">
              {texts.passwordLabel}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
              <input
                type="password"
                id="password"
                placeholder={texts.passwordPlaceholder}
                className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-blue-400 hover:underline text-xs"
              >
                {texts.forgotPassword}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{loading ? '...' : texts.signInButton}</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Sign Up Link */}
          <div className="text-center text-sm">
            <span className="text-[#71717a]">{texts.noAccount} </span>
            <Link to="/register" className="text-blue-400 hover:underline">
              {texts.createAccount}
            </Link>
          </div>
        </form>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div 
            dir={texts.dir}
            className="bg-[#0f0f14] rounded-xl p-6 w-full max-w-[350px] border border-[#1f1f2e]"
          >
            <h2 className="text-2xl font-bold text-white mb-2 text-center">{texts.forgotTitle}</h2>
            <p className="text-[#71717a] text-sm mb-6 text-center">
              {forgotStep === 1 ? texts.forgotSubtitle : texts.enterCode}
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
                  <label className="text-sm font-medium text-white">
                    {texts.emailLabel}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                    <input
                      type="email"
                      placeholder={texts.emailPlaceholder}
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
                  <span>{forgotLoading ? '...' : texts.sendCode}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  className="text-[#71717a] hover:text-white text-sm py-2 transition-colors"
                >
                  ← {texts.backToLogin}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">
                    {texts.resetCodeLabel}
                  </label>
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
                  <label className="text-sm font-medium text-white">
                    {texts.newPasswordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-white">
                    {texts.confirmPasswordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#27272a] text-white placeholder-[#52525b] text-sm focus:outline-none focus:bg-[#18181b] transition-colors"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="h-10 mt-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{forgotLoading ? '...' : texts.resetPassword}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  className="text-[#71717a] hover:text-white text-sm py-2 transition-colors"
                >
                  ← {texts.backToLogin}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
