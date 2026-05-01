import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Sparkles, Loader2, BarChart3, Brain, BookOpen, Shield } from 'lucide-react';
import { API_BASE_URL } from '../config';
import logo from '../assets/logo4.jpg';

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      verifySession(sessionId);
    } else {
      setLoading(false);
    }
  }, [sessionId]);

  // Auto-redirect to dashboard after verification
  useEffect(() => {
    if (!verified) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [verified, navigate]);

  const verifySession = async (sid) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/subscriptions/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sid })
      });
      const data = await res.json();
      if (data.success) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
          storedUser.has_journal_access = true;
          localStorage.setItem('talaria_current_user', JSON.stringify(storedUser));
        } catch (e) {}
        setVerified(true);
      }
    } catch (err) {
      console.error('Error verifying session:', err);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, label: 'Advanced analytics & 200+ metrics' },
    { icon: Brain, label: 'AI-powered trading insights' },
    { icon: BookOpen, label: 'Unlimited trade journaling' },
    { icon: Shield, label: 'Strategy builder & backtesting' },
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white relative overflow-hidden flex items-center justify-center">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/15 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBoMXYxaC0xek0zMCAwaDF2MWgtMXoiIGZpbGw9IiMxYTFhMmUiIGZpbGwtb3BhY2l0eT0iLjMiLz48L2c+PC9zdmc+')]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-6 py-20">
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center space-y-6"
          >
            <Loader2 className="w-12 h-12 text-cyan-300 animate-spin mx-auto" />
            <div>
              <h1 className="text-xl font-semibold text-white mb-2">Processing your subscription...</h1>
              <p className="text-white/35 text-sm">Please wait while we confirm your payment.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            {/* Success icon */}
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-3xl scale-150" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
                className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.3)]"
              >
                <CheckCircle className="w-10 h-10 text-white" strokeWidth={2} />
              </motion.div>
            </div>

            {/* Message */}
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
              Welcome to Talaria Pro!
            </h1>
            <p className="text-white/40 text-base leading-relaxed mb-10 max-w-sm mx-auto">
              Your subscription is active. Full access to all premium features is now unlocked.
            </p>

            {/* Features */}
            <div className="rounded-2xl p-[1px] bg-gradient-to-b from-white/[0.1] to-white/[0.03] mb-8">
              <div className="rounded-[15px] bg-[#08091a] p-5 sm:p-6">
                <div className="flex items-center justify-center gap-2 mb-5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-white/70">Features Unlocked</span>
                </div>
                <div className="space-y-3">
                  {features.map((f, idx) => (
                    <motion.div
                      key={f.label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.08 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cyan-950/40/[0.02]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <f.icon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-sm text-white/60">{f.label}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 via-indigo-600 to-cyan-500 hover:brightness-110 transition-all shadow-[0_0_24px_rgba(59,130,246,0.2)]"
              >
                Go to Dashboard Now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Countdown */}
            {verified && (
              <p className="text-white/30 text-sm mb-6">
                Redirecting to dashboard in <span className="text-white/60 font-medium">{countdown}s</span>...
              </p>
            )}

            {/* Help */}
            <p className="text-white/25 text-xs">
              A confirmation email has been sent to your address.{' '}
              <Link to="/contact" className="text-cyan-300/60 hover:text-cyan-300 transition-colors">Need help?</Link>
            </p>
          </motion.div>
        )}
      </div>

      {/* Logo watermark */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10">
        <a href="/" className="flex items-center gap-2 opacity-20 hover:opacity-40 transition-opacity">
          <img src={logo} alt="Talaria" className="w-5 h-5 rounded-md" />
          <span className="text-xs text-white font-medium">Talaria</span>
        </a>
      </div>
    </div>
  );
}
