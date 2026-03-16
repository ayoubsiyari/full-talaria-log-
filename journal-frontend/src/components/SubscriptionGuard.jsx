import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles, Check, ArrowRight, Crown } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function SubscriptionGuard({ children, feature = 'this feature' }) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    // Admins bypass subscription check — verify from JWT token, not localStorage
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.is_admin === true) {
        setHasAccess(true);
        setLoading(false);
        return;
      }
    } catch (e) {
      // Token decode failed, continue with normal subscription check
    }

    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/my-subscription`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
        // User has access if they have an active subscription or are in trial
        const hasActiveSubscription = data.has_subscription && 
          ['active', 'trialing'].includes(data.subscription?.status);
        setHasAccess(hasActiveSubscription);
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (hasAccess) {
    return children;
  }

  // Paywall UI
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Lock Icon */}
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl"></div>
          <div className="relative w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Message */}
        <h2 className="text-3xl font-bold text-white mb-4">
          Upgrade to Access {feature}
        </h2>
        <p className="text-white/60 text-lg mb-8 leading-relaxed">
          This is a premium feature. Upgrade your plan to unlock full access to all 
          journal features, advanced analytics, and AI insights.
        </p>

        {/* Features List */}
        <div className="bg-white/5 rounded-xl p-6 mb-8 border border-white/10 text-left">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-400" />
            Premium Features Include
          </h3>
          <ul className="space-y-3">
            {[
              'Unlimited trade journaling',
              'Advanced analytics & metrics',
              'AI-powered insights',
              'Calendar view & reports',
              'Strategy builder',
              'Priority support'
            ].map((item, idx) => (
              <li key={idx} className="flex items-center gap-3 text-white/80">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/pricing"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
          >
            <Sparkles className="w-5 h-5" />
            View Pricing Plans
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Trial Notice */}
        <p className="text-white/40 text-sm mt-6">
          Start with a 14-day free trial. No credit card required.
        </p>
      </div>
    </div>
  );
}
