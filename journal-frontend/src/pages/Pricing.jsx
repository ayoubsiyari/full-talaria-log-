import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Tag,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../config';

function parseFeatures(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { fetchPlans(); checkAuth(); }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      try {
        const res = await fetch(`${API_BASE_URL}/subscriptions/my-subscription`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setCurrentSubscription(await res.json());
      } catch (e) { /* silent */ }
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/public/plans`);
      if (res.ok) {
        const data = await res.json();
        if (data.plans?.length > 0) {
          setPlans(data.plans.map(p => ({ ...p, features: parseFeatures(p.features) })));
        }
      }
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    if (!isLoggedIn) { setCouponResult({ valid: false, error: 'Please log in first' }); return; }
    setCouponValidating(true);
    setCouponResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/subscriptions/validate-coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code })
      });
      if (res.status === 429) { setCouponResult({ valid: false, error: 'Too many attempts. Try again later.' }); return; }
      const data = await res.json();
      if (data.valid) {
        setCouponResult({ valid: true, discount: data.discount });
      } else {
        setCouponResult({ valid: false, error: data.error || 'Invalid coupon', remaining: data.remaining_attempts });
      }
    } catch (e) {
      setCouponResult({ valid: false, error: 'Could not validate coupon' });
    } finally { setCouponValidating(false); }
  };

  const handleRemoveCoupon = () => { setCouponCode(''); setCouponResult(null); };

  const handleSubscribe = async (planId) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (currentSubscription?.has_subscription && ['active', 'trialing'].includes(currentSubscription?.subscription?.status)) {
      navigate('/dashboard'); return;
    }
    setCheckoutLoading(planId);
    try {
      const token = localStorage.getItem('token');
      const body = {
        plan_id: planId,
        success_url: window.location.origin + '/journal/onboarding',
        cancel_url: window.location.origin + '/journal/pricing'
      };
      if (couponResult?.valid && couponResult.discount?.code) body.coupon_code = couponResult.discount.code;
      const res = await fetch(`${API_BASE_URL}/subscriptions/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.checkout_url) { window.location.href = data.checkout_url; }
      else { alert(data.error || 'Failed to start checkout'); }
    } catch (e) {
      alert('Failed to start checkout. Please try again.');
    } finally { setCheckoutLoading(null); }
  };

  const getPrice = (plan) => {
    if (billingCycle === 'yearly') {
      const yearly = plan.price_yearly || plan.price * 10;
      return Math.round(yearly / 12);
    }
    return plan.price_monthly || plan.price;
  };

  const getTotalPrice = (plan) => billingCycle === 'yearly' ? (plan.price_yearly || plan.price * 10) : (plan.price_monthly || plan.price);

  const getSavings = (plan) => {
    const monthly = plan.price_monthly || plan.price;
    const yearly = plan.price_yearly || plan.price * 10;
    if (monthly <= 0) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  };

  const faqs = [
    { q: 'Can I change my plan at any time?', a: 'Yes. Upgrade or downgrade whenever you like. Changes are prorated and take effect immediately.' },
    { q: 'Is there a free trial?', a: 'Paid plans include a free trial period. No credit card required to start exploring.' },
    { q: 'What payment methods do you accept?', a: 'All major credit and debit cards through Stripe. Enterprise plans also support bank transfers.' },
    { q: 'Can I cancel anytime?', a: 'Absolutely. Cancel with one click and keep access until the end of your billing period.' },
    { q: 'What happens to my data if I cancel?', a: 'Your data stays safe. Resubscribe anytime and pick up right where you left off.' },
  ];

  return (
    <div className="min-h-screen bg-[#060611] text-white antialiased">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/[0.07] rounded-full blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#060611]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <a href="/" className="text-white font-semibold text-base tracking-tight">Talaria</a>
          {isLoggedIn ? (
            <Link to="/dashboard" className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Log in</Link>
              <Link to="/login" className="text-[13px] font-medium text-white bg-white/[0.08] hover:bg-white/[0.12] px-3.5 py-1.5 rounded-lg transition-all">Sign up</Link>
            </div>
          )}
        </div>
      </nav>

      {/* Header */}
      <div className="relative z-10 pt-16 sm:pt-24 pb-10 text-center px-5">
        <p className="text-[13px] font-medium text-blue-400/80 tracking-wide uppercase mb-4">Pricing</p>
        <h1 className="text-3xl sm:text-4xl md:text-[44px] font-bold text-white tracking-tight leading-[1.15] mb-4">
          Simple plans,<br className="hidden sm:block" /> powerful tools
        </h1>
        <p className="text-[15px] text-white/35 max-w-md mx-auto leading-relaxed">
          Everything you need to analyze, journal, and backtest your trades. No hidden fees.
        </p>
      </div>

      {/* Billing toggle + Coupon */}
      <div className="relative z-10 max-w-sm mx-auto px-5 mb-10 space-y-4">
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center bg-white/[0.04] rounded-lg p-0.5">
            {['monthly', 'yearly'].map(cycle => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                  billingCycle === cycle
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                {cycle === 'yearly' && <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">-25%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Coupon */}
        {couponResult?.valid ? (
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
            <Tag className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-emerald-400">{couponResult.discount.code}</span>
              <span className="text-[11px] text-emerald-400/50 ml-2">{couponResult.discount.label}</span>
            </div>
            <button onClick={handleRemoveCoupon} className="text-white/20 hover:text-white/50 transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponResult) setCouponResult(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleValidateCoupon()}
                placeholder="Coupon code"
                maxLength={50}
                className="w-full px-3.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[13px] text-white placeholder:text-white/15 focus:outline-none focus:border-white/15 transition-colors"
              />
            </div>
            <button
              onClick={handleValidateCoupon}
              disabled={!couponCode.trim() || couponValidating}
              className="px-3.5 py-2 rounded-lg text-[12px] font-medium text-white/40 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {couponValidating && <Loader2 className="w-3 h-3 animate-spin" />}
              Apply
            </button>
          </div>
        )}
        {couponResult && !couponResult.valid && (
          <p className="text-[11px] text-red-400/60 -mt-1">
            {couponResult.error}
            {couponResult.remaining != null && couponResult.remaining > 0 && (
              <span className="text-white/15 ml-1">({couponResult.remaining} left)</span>
            )}
          </p>
        )}
      </div>

      {/* Plans */}
      <section className="relative z-10 pb-20 sm:pb-28 px-5">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-white/20 animate-spin" /></div>
          ) : plans.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm text-white/30">No plans available yet. Check back soon.</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${
              plans.length === 1 ? 'max-w-sm mx-auto' :
              plans.length === 2 ? 'sm:grid-cols-2 max-w-2xl mx-auto' :
              'sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {plans.map((plan, index) => {
                const isCurrentPlan = currentSubscription?.plan?.id === plan.id;
                const isPro = plan.is_popular || plan.name.toLowerCase().includes('pro');
                const price = getPrice(plan);
                const savings = getSavings(plan);

                return (
                  <div
                    key={plan.id || index}
                    className={`relative rounded-2xl flex flex-col transition-all duration-300 ${
                      isPro
                        ? 'bg-[#0d1025] ring-1 ring-blue-500/20 shadow-[0_0_40px_-12px_rgba(59,130,246,0.15)]'
                        : 'bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.1]'
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
                    )}

                    <div className="p-6 sm:p-7 flex flex-col flex-1">
                      {/* Plan label */}
                      <div className="flex items-center justify-between mb-5">
                        <span className={`text-[13px] font-semibold tracking-wide uppercase ${isPro ? 'text-blue-400' : 'text-white/30'}`}>
                          {plan.name}
                        </span>
                        {isPro && (
                          <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                            Popular
                          </span>
                        )}
                      </div>

                      {/* Price */}
                      <div className="mb-1">
                        <span className="text-4xl font-bold text-white tabular-nums tracking-tight">
                          {price === 0 ? 'Free' : `$${price}`}
                        </span>
                        {price > 0 && <span className="text-white/20 text-sm ml-1">/mo</span>}
                      </div>
                      {billingCycle === 'yearly' && price > 0 ? (
                        <p className="text-[12px] text-white/20 mb-6">
                          ${getTotalPrice(plan)}/yr{savings > 0 && <span className="text-emerald-400/80 ml-1">save {savings}%</span>}
                        </p>
                      ) : (
                        <p className="text-[12px] text-white/20 mb-6">{plan.description || 'billed monthly'}</p>
                      )}

                      {/* CTA */}
                      {isCurrentPlan ? (
                        <button disabled className="w-full py-2.5 rounded-lg text-[13px] font-medium bg-emerald-500/8 text-emerald-400/70 border border-emerald-500/15 cursor-default mb-6">
                          Current plan
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={checkoutLoading === plan.id}
                          className={`w-full py-2.5 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 mb-6 disabled:opacity-40 ${
                            isPro
                              ? 'bg-blue-600 hover:bg-blue-500 text-white'
                              : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white'
                          }`}
                        >
                          {checkoutLoading === plan.id ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                          ) : (
                            <>{plan.trial_days > 0 ? 'Start free trial' : 'Get started'} <ArrowRight className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      )}

                      {plan.trial_days > 0 && (
                        <p className="text-[11px] text-white/20 text-center -mt-4 mb-5">{plan.trial_days}-day free trial</p>
                      )}

                      {/* Features */}
                      <div className="border-t border-white/[0.05] pt-5">
                        <ul className="space-y-2.5">
                          {(plan.features || []).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                              <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isPro ? 'text-blue-400/70' : 'text-white/20'}`} />
                              <span className="text-[13px] text-white/45 leading-snug">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Current sub banner */}
          {currentSubscription?.has_subscription && (
            <div className="mt-8 max-w-lg mx-auto rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/80">{currentSubscription.plan?.name}</p>
                  <p className="text-[11px] text-white/25">
                    {currentSubscription.subscription?.cancel_at_period_end
                      ? `Cancels ${new Date(currentSubscription.subscription.current_period_end).toLocaleDateString()}`
                      : `Renews ${new Date(currentSubscription.subscription?.current_period_end).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Link to="/settings" className="text-[12px] text-white/30 hover:text-white/60 border border-white/[0.06] rounded-lg px-3 py-1.5 transition-colors">
                Manage
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 pb-20 sm:pb-28 px-5">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">Questions</h2>
            <p className="text-[13px] text-white/25">Everything you need to know before subscribing.</p>
          </div>
          <div className="space-y-1">
            {faqs.map((faq, index) => (
              <button
                key={index}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full text-left rounded-lg px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-[13px] font-medium text-white/60 group-hover:text-white/80 transition-colors">{faq.q}</h3>
                  <ChevronDown className={`w-3.5 h-3.5 text-white/15 flex-shrink-0 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} />
                </div>
                {openFaq === index && (
                  <p className="text-[13px] text-white/25 leading-relaxed mt-2.5 pr-8">{faq.a}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6 px-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-[11px] text-white/15">Talaria</span>
          <div className="flex items-center gap-4">
            <a href="/terms" className="text-[11px] text-white/15 hover:text-white/30 transition-colors">Terms</a>
            <a href="/privacy-policy" className="text-[11px] text-white/15 hover:text-white/30 transition-colors">Privacy</a>
            <a href="/refund-policy" className="text-[11px] text-white/15 hover:text-white/30 transition-colors">Refunds</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
