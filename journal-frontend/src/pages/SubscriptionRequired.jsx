import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { API_BASE_URL } from '../config';

/**
 * Full-page billing / access state (TradingView / SaaS style) when the user
 * is signed in but no longer entitled — not a generic marketing pricing dump.
 */
export default function SubscriptionRequired() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/my-subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Could not load your account status. Please try again.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      const active =
        (json.has_subscription &&
          ['active', 'trialing'].includes(json.subscription?.status)) ||
        json.has_journal_access === true;
      if (active) {
        navigate('/dashboard', { replace: true });
        return;
      }
    } catch (e) {
      setError('Connection error. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const openBillingPortal = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setPortalLoading(true);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/journal/dashboard`;
      const res = await fetch(`${API_BASE_URL}/subscriptions/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ return_url: returnUrl }),
      });
      const json = await res.json();
      if (res.ok && json.portal_url) {
        window.location.href = json.portal_url;
        return;
      }
      setError(json.error || 'Could not open the billing portal.');
    } catch (e) {
      setError('Could not open the billing portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };

  const reason = data?.access_denial_reason;
  const billingIssue = data?.billing_issue;
  const hasStripe = data?.has_stripe_customer;
  const periodEnd = data?.lapsed_subscription?.current_period_end;

  const copy = (() => {
    if (billingIssue || reason === 'payment_required') {
      return {
        title: "We couldn't process your payment",
        subtitle:
          'Your Talaria Log access is paused until the latest invoice is paid. Update your card or billing details in a secure Stripe window — the same flow used by major trading platforms.',
        primary: hasStripe
          ? { label: 'Update payment method', show: true, action: 'portal' }
          : { label: 'View plans & pricing', to: '/pricing', show: true, action: 'link' },
        secondary: hasStripe ? { label: 'View plans & pricing', to: '/pricing' } : null,
        icon: AlertTriangle,
      };
    }
    if (reason === 'subscription_ended') {
      return {
        title: 'Your subscription has ended',
        subtitle:
          periodEnd
            ? `Your plan ended after ${new Date(periodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}. Resubscribe to restore full journal and analytics access.`
            : 'Resubscribe to restore full journal and analytics access.',
        primary: { label: 'View plans & resubscribe', to: '/pricing', show: true, action: 'link' },
        secondary: hasStripe
          ? { label: 'Billing history & invoices', show: true, action: 'portal' }
          : null,
        icon: RefreshCw,
      };
    }
    if (reason === 'subscription_inactive' && hasStripe) {
      return {
        title: 'Subscription needs attention',
        subtitle:
          'Your account is no longer in an active billing state. Open the customer portal to review your plan, or choose a new plan below.',
        primary: { label: 'Manage subscription', show: hasStripe, action: 'portal' },
        secondary: { label: 'Compare plans', to: '/pricing' },
        icon: CreditCard,
      };
    }
    return {
      title: 'Subscription required',
      subtitle:
        'Talaria Log journal, analytics, and pro tools are available on a paid plan. Choose a plan to continue — you can use secure checkout in seconds.',
      primary: { label: 'View plans & subscribe', to: '/pricing', show: true, action: 'link' },
      secondary: null,
      icon: Sparkles,
    };
  })();

  const Icon = copy.icon;

  if (loading) {
    return (
      <div className="min-h-screen bg-jf-bg flex items-center justify-center">
        <div className="w-9 h-9 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!localStorage.getItem('token')) {
    return (
      <div className="min-h-screen bg-jf-bg flex flex-col items-center justify-center px-4 text-center">
        <p className="text-cyan-100/80 mb-6">Sign in to manage your subscription.</p>
        <a
          href={`/login/?next=${encodeURIComponent('/journal/subscription-status')}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 transition-colors"
        >
          Sign in
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jf-bg text-slate-100 flex flex-col">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
      <header className="relative z-10 border-b border-cyan-500/10 bg-[#050a10]/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/pricing" className="text-sm font-medium text-cyan-200/90 hover:text-cyan-100">
            ← Plans & pricing
          </Link>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('talaria_current_user');
              window.location.href = '/login/?next=' + encodeURIComponent('/journal/pricing');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-cyan-500/20 bg-[#0a1219]/90 backdrop-blur-xl shadow-2xl shadow-cyan-900/20 p-8 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/20 mb-6">
              <Icon className="w-8 h-8 text-cyan-300" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-3">
              {copy.title}
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8">
              {copy.subtitle}
            </p>

            {error && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200/90">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {copy.primary?.show && copy.primary.action === 'portal' && (
                <button
                  type="button"
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-cyan-900/30"
                >
                  {portalLoading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      {copy.primary.label}
                    </>
                  )}
                </button>
              )}
              {copy.primary?.action === 'link' && copy.primary.to && (
                <Link
                  to={copy.primary.to}
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-900/30"
                >
                  {copy.primary.label}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}

              {copy.secondary?.to && (
                <Link
                  to={copy.secondary.to}
                  className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl font-medium border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 transition-colors"
                >
                  {copy.secondary.label}
                </Link>
              )}
              {copy.secondary?.action === 'portal' && copy.secondary.show && (
                <button
                  type="button"
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl font-medium border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 transition-colors"
                >
                  {copy.secondary.label}
                </button>
              )}
            </div>

            <p className="mt-8 text-xs text-slate-500">
              Payments are processed securely by Stripe. You can update your card, download invoices, and
              manage your plan from the billing portal.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
