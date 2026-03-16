import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, CheckCircle, RefreshCw, ChevronRight } from 'lucide-react';
import logo from '../assets/logo4.jpg';
import { API_BASE_URL } from '../config';

export default function VerifyEmail() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    
    const userEmail = localStorage.getItem('pendingVerificationEmail');
    if (userEmail) {
      setEmail(userEmail);
    }
  }, []);

  const handleVerification = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setMsg('Please enter the verification code');
      return;
    }

    setIsLoading(true);
    setMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      
      const data = await res.json();

      if (res.ok) {
        setVerified(true);
        localStorage.removeItem('pendingVerificationEmail');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setMsg(data.error || 'Verification failed');
      }
    } catch (err) {
      console.error('Network error:', err);
      setMsg('Network error, please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setMsg('Please enter your email address first');
      return;
    }

    setIsResending(true);
    setMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();

      if (res.ok) {
        setMsg('Verification code sent successfully! Please check your email.');
      } else {
        setMsg(data.error || 'Failed to resend verification code');
      }
    } catch (err) {
      console.error('Network error:', err);
      setMsg('Network error, please try again');
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!email) {
      setMsg('Please enter your email address');
      return;
    }

    setIsLoading(true);
    setMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/check-email-verified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();

      if (res.ok && data.verified) {
        setVerified(true);
        localStorage.removeItem('pendingVerificationEmail');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setMsg('Email not verified yet. Please enter the verification code.');
      }
    } catch (err) {
      console.error('Network error:', err);
      setMsg('Network error, please try again');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white overflow-hidden relative">
      {/* Subtle animated background grid */}
      <div className="fixed inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `\n            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),\n            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)\n          `,
          backgroundSize: '50px 50px',
          animation: 'grid-move 20s linear infinite'
        }} />
      </div>

      {/* Gradient orb background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle, #8b5cf6 0%, transparent 70%)`,
            animation: 'float 8s ease-in-out infinite'
          }}
        />
        <div 
          className="absolute top-3/4 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl"
          style={{
            background: `radial-gradient(circle, #06b6d4 0%, transparent 70%)`,
            animation: 'float 12s ease-in-out infinite reverse'
          }}
        />
      </div>

      {/* Custom CSS animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
      `}</style>

      <div className={`w-full max-w-md transition-all duration-1000 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Header */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/10">
                <img src={logo} alt="Journal Logo" className="w-8 h-8 rounded-sm" />
              </div>
              <span className="text-2xl font-semibold text-white">Journal</span>
            </Link>
            <h1 className="text-3xl font-semibold text-white mb-2 animate-fade-in-up">
              Verify your email
            </h1>
            <p className="text-white/60 text-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              Enter the 6-digit code sent to your email address
            </p>
          </div>

          {/* Form */}
          {!verified ? (
            <form onSubmit={handleVerification} className="space-y-4">
              {/* Email Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Verification Code Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="code">
                  Verification Code
                </label>
                <input
                  type="text"
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm text-center tracking-widest"
                  maxLength={6}
                  required
                />
              </div>

              {/* Message */}
              {msg && (
                <div className={`px-4 py-3 rounded-md text-center text-sm ${
                  msg.includes('successfully') || msg.includes('verified')
                    ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                    : 'bg-red-500/20 border border-red-500/50 text-red-300'
                }`}>
                  {msg}
                </div>
              )}

              {/* Action Buttons */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-white text-black py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors flex items-center justify-center space-x-2"
              >
                <span>{isLoading ? 'Verifying...' : 'Verify Code'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isLoading}
                  className="w-full bg-white/10 text-white/70 py-2 rounded-md text-sm font-medium hover:bg-white/20 transition-colors"
                >
                  Check Status
                </button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isResending}
                  className="w-full bg-white/10 text-white/70 py-2 rounded-md text-sm font-medium hover:bg-white/20 transition-colors flex items-center justify-center space-x-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
                  <span>Resend Code</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4 py-8">
              <div className="flex justify-center mb-2">
                <CheckCircle className="w-12 h-12 text-green-400 animate-bounce" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Email Verified!</h2>
              <p className="text-white/60 text-sm">Redirecting to login...</p>
            </div>
          )}

          {/* Back to Login Link */}
          <div className="mt-6 text-center">
            <p className="text-white/60 text-sm">
              <Link 
                to="/login" 
                className="text-blue-400 hover:underline"
              >
                Back to Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}