import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import TalariaLogo from '../components/TalariaLogo';

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      verifySession(sessionId);
    } else {
      setLoading(false);
    }
  }, [sessionId]);

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
        console.log('✅ Subscription verified:', data.message);
      }
    } catch (err) {
      console.error('Error verifying session:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        {loading ? (
          <div className="space-y-6">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto" />
            <h1 className="text-2xl font-semibold">Processing your subscription...</h1>
            <p className="text-white/60">Please wait while we confirm your payment.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Success Icon */}
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-green-500/20 rounded-full blur-2xl"></div>
              <div className="relative w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>

            {/* Success Message */}
            <div>
              <h1 className="text-4xl font-bold mb-4">Welcome to Talaria Pro!</h1>
              <p className="text-white/60 text-lg leading-relaxed">
                Your subscription is now active. You have full access to all premium features.
              </p>
            </div>

            {/* Features Unlocked */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-medium mb-4 flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                Features Unlocked
              </h3>
              <ul className="space-y-3 text-left">
                {[
                  'Unlimited trade logging',
                  'Advanced AI insights',
                  'Premium analytics dashboard',
                  'Priority support',
                  'API access'
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/80">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/settings"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-all border border-white/20"
              >
                Manage Subscription
              </Link>
            </div>

            {/* Help Text */}
            <p className="text-white/40 text-sm">
              A confirmation email has been sent to your registered email address.
              <br />
              Need help? <Link to="/contact" className="text-blue-400 hover:text-blue-300">Contact support</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
