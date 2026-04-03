import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  Crown,
  Zap,
  Shield,
  ChevronDown,
  BarChart3,
  Brain,
  BookOpen,
  Layers,
  Tag,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import logo from '../assets/logo4.jpg';

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
  const [couponResult, setCouponResult] = useState(null);  // { valid, discount, error }
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlans();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      try {
        const res = await fetch(`${API_BASE_URL}/subscriptions/my-subscription`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentSubscription(data);
        }
      } catch (err) {
        console.error('Error fetching subscription:', err);
      }
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/public/plans`);
      if (res.ok) {
        const data = await res.json();
        if (data.plans && data.plans.length > 0) {
          setPlans(data.plans.map(p => ({
            ...p,
            features: parseFeatures(p.features),
          })));
        }
      }
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    if (!isLoggedIn) {
      setCouponResult({ valid: false, error: 'Please log in first' });
      return;
    }
    setCouponValidating(true);
    setCouponResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/subscriptions/validate-coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code })
      });

      if (res.status === 429) {
        setCouponResult({ valid: false, error: 'Too many attempts. Please try again later.' });
        return;
      }

      const data = await res.json();
      if (data.valid) {
        setCouponResult({ valid: true, discount: data.discount });
      } else {
        setCouponResult({
          valid: false,
          error: data.error || 'Invalid coupon code',
          remaining: data.remaining_attempts
        });
      }
    } catch (e) {
      setCouponResult({ valid: false, error: 'Could not validate coupon' });
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponResult(null);
  };

  const handleSubscribe = async (planId) => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    if (currentSubscription?.has_subscription &&
      ['active', 'trialing'].includes(currentSubscription?.subscription?.status)) {
      navigate('/dashboard');
      return;
    }

    setCheckoutLoading(planId);
    try {
      const token = localStorage.getItem('token');
      const body = {
        plan_id: planId,
        success_url: window.location.origin + '/journal/onboarding',
        cancel_url: window.location.origin + '/journal/pricing'
      };
      if (couponResult?.valid && couponResult.discount?.code) {
        body.coupon_code = couponResult.discount.code;
      }
      const res = await fetch(`${API_BASE_URL}/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const displayPlans = plans;

  const getPrice = (plan) => {
    if (billingCycle === 'yearly') {
      const yearly = plan.price_yearly || plan.price * 10;
      return Math.round(yearly / 12);
    }
    return plan.price_monthly || plan.price;
  };

  const getTotalPrice = (plan) => {
    if (billingCycle === 'yearly') {
      return plan.price_yearly || plan.price * 10;
    }
    return plan.price_monthly || plan.price;
  };

  const getSavings = (plan) => {
    const monthly = plan.price_monthly || plan.price;
    const yearly = plan.price_yearly || plan.price * 10;
    if (monthly <= 0) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  };

  const planIcons = [Zap, Crown, Layers, Shield];

  const faqs = [
    {
      q: 'Can I change my plan at any time?',
      a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and are prorated.',
    },
    {
      q: 'Is there a free trial available?',
      a: 'Yes, we offer a free trial on all paid plans. No credit card required to start.',
    },
    {
      q: 'What payment methods do you accept?',
      a: 'We accept all major credit cards through Stripe. Enterprise plans also support bank transfers.',
    },
    {
      q: 'Can I cancel my subscription?',
      a: 'Yes, you can cancel anytime. You will keep access until the end of your billing period.',
    },
    {
      q: 'What happens to my data if I cancel?',
      a: 'Your data is safely stored and accessible if you resubscribe. We never delete your trading history.',
    },
  ];

  const highlights = [
    { icon: BarChart3, label: '200+ Metrics' },
    { icon: Brain, label: 'AI Insights' },
    { icon: BookOpen, label: 'Trade Journal' },
    { icon: Shield, label: 'Bank-level Security' },
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white relative overflow-x-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBoMXYxaC0xek0zMCAwaDF2MWgtMXoiIGZpbGw9IiMxYTFhMmUiIGZpbGwtb3BhY2l0eT0iLjMiLz48L2c+PC9zdmc+')]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/60 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5 group">
              <img src={logo} alt="Talaria" className="w-8 h-8 rounded-xl ring-1 ring-white/10" />
              <span className="text-white font-semibold text-lg hidden sm:inline tracking-tight">Talaria</span>
            </a>
            <div className="flex items-center gap-2 sm:gap-3">
              {isLoggedIn ? (
                <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="rounded-full border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 text-sm px-4 py-2 transition-all"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/login"
                    className="rounded-full text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:brightness-110 text-sm px-4 py-2 transition-all shadow-[0_0_24px_rgba(59,130,246,0.25)]"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-32 sm:pt-40 pb-6 sm:pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 bg-white/[0.04] backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/[0.08] mb-8">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-xs sm:text-sm text-white/50 font-medium tracking-wide">Simple, Transparent Pricing</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-5 tracking-tight leading-[1.1]">
              Choose your{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400">
                trading edge
              </span>
            </h1>

            <p className="text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
              From individual traders to institutional firms — the perfect plan for consistent profitability.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Billing toggle */}
      <section className="relative z-10 pb-8 sm:pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex items-center justify-center"
          >
            <div className="inline-flex items-center gap-3 bg-white/[0.04] rounded-full p-1.5 border border-white/[0.08]">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Yearly
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  SAVE 25%
                </span>
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Coupon code */}
      <section className="relative z-10 pb-8">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {couponResult?.valid ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
                <Tag className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-emerald-400">
                    {couponResult.discount.code}
                  </span>
                  <span className="text-xs text-emerald-400/60 ml-2">
                    {couponResult.discount.label}
                  </span>
                </div>
                <button onClick={handleRemoveCoupon} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      if (couponResult) setCouponResult(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleValidateCoupon()}
                    placeholder="Coupon code"
                    maxLength={50}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
                <button
                  onClick={handleValidateCoupon}
                  disabled={!couponCode.trim() || couponValidating}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white/60 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {couponValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Apply
                </button>
              </div>
            )}
            {couponResult && !couponResult.valid && (
              <p className="text-xs text-red-400/70 mt-2 pl-1">
                {couponResult.error}
                {couponResult.remaining != null && couponResult.remaining > 0 && (
                  <span className="text-white/20 ml-1">({couponResult.remaining} attempts left)</span>
                )}
              </p>
            )}
          </motion.div>
        </div>
      </section>

      {/* Plans */}
      <section className="relative z-10 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : displayPlans.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-5">
                <Sparkles className="w-7 h-7 text-white/20" />
              </div>
              <h3 className="text-lg font-semibold text-white/60 mb-2">No plans available yet</h3>
              <p className="text-sm text-white/30">Please check back soon. Plans are being configured.</p>
            </div>
          ) : (
            <div className={`grid gap-5 sm:gap-6 ${
              displayPlans.length === 1 ? 'max-w-md mx-auto' :
              displayPlans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' :
              displayPlans.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto' : ''
            }`}>
              {displayPlans.map((plan, index) => {
                const isCurrentPlan = currentSubscription?.plan?.id === plan.id;
                const isPro = plan.is_popular || plan.name.toLowerCase().includes('pro');
                const Icon = planIcons[index % planIcons.length];
                const price = getPrice(plan);
                const savings = getSavings(plan);

                return (
                  <motion.div
                    key={plan.id || index}
                    initial={{ opacity: 0, y: 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="relative group"
                  >
                    {/* Glow behind popular card */}
                    {isPro && (
                      <div className="absolute -inset-[1px] rounded-[28px] bg-gradient-to-b from-blue-500/30 via-indigo-500/20 to-cyan-500/10 blur-sm opacity-60 group-hover:opacity-80 transition-opacity" />
                    )}

                    <div className={`relative h-full rounded-[26px] p-[1px] overflow-hidden ${
                      isPro
                        ? 'bg-gradient-to-b from-blue-500/40 via-indigo-500/20 to-white/[0.06]'
                        : 'bg-gradient-to-b from-white/[0.1] to-white/[0.03]'
                    }`}>
                      <div className={`relative h-full rounded-[25px] p-6 sm:p-8 flex flex-col ${
                        isPro
                          ? 'bg-gradient-to-b from-[#0c1033] via-[#080b24] to-[#060817]'
                          : 'bg-[#08091a]'
                      }`}>
                        {/* Popular badge */}
                        {isPro && (
                          <div className="absolute top-0 right-6 -translate-y-1/2">
                            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide uppercase shadow-[0_0_20px_rgba(59,130,246,0.4)]">
                              <Sparkles className="w-3 h-3" />
                              Popular
                            </span>
                          </div>
                        )}

                        {/* Header */}
                        <div className="mb-6">
                          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${
                            isPro
                              ? 'bg-blue-500/15 ring-1 ring-blue-500/25'
                              : 'bg-white/[0.06] ring-1 ring-white/[0.08]'
                          }`}>
                            <Icon className={`w-5 h-5 ${isPro ? 'text-blue-400' : 'text-white/50'}`} />
                          </div>
                          <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                          <p className="text-sm text-white/35 leading-relaxed">{plan.description}</p>
                        </div>

                        {/* Price */}
                        <div className="mb-6">
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
                              {price === 0 ? 'Free' : `$${price}`}
                            </span>
                            {price > 0 && (
                              <span className="text-white/30 text-sm font-medium">/mo</span>
                            )}
                          </div>
                          {billingCycle === 'yearly' && price > 0 && (
                            <p className="text-white/30 text-xs mt-1.5">
                              ${getTotalPrice(plan)} billed yearly
                              {savings > 0 && (
                                <span className="text-emerald-400 ml-1 font-medium">· Save {savings}%</span>
                              )}
                            </p>
                          )}
                          {plan.trial_days > 0 && (
                            <p className="text-cyan-400/80 text-xs mt-2 font-medium">
                              {plan.trial_days}-day free trial included
                            </p>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/[0.06] mb-6" />

                        {/* Features */}
                        <ul className="space-y-3 mb-8 flex-1">
                          {(plan.features || []).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                                isPro ? 'bg-blue-500/15' : 'bg-white/[0.06]'
                              }`}>
                                <Check className={`w-3 h-3 ${isPro ? 'text-blue-400' : 'text-white/40'}`} />
                              </div>
                              <span className="text-sm text-white/60 leading-relaxed">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        {/* CTA */}
                        {isCurrentPlan ? (
                          <button
                            disabled
                            className="w-full py-3 px-6 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                          >
                            Current Plan
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSubscribe(plan.id)}
                            disabled={checkoutLoading === plan.id}
                            className={`w-full py-3 px-6 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                              isPro
                                ? 'text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:brightness-110 shadow-[0_0_32px_rgba(59,130,246,0.2)]'
                                : 'text-white/80 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] hover:text-white'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {checkoutLoading === plan.id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                {plan.trial_days > 0 ? 'Start Free Trial' : 'Get Started'}
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Current Subscription Banner */}
          {currentSubscription?.has_subscription && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-10 max-w-2xl mx-auto"
            >
              <div className="rounded-2xl p-[1px] bg-gradient-to-r from-emerald-500/30 via-blue-500/20 to-emerald-500/30">
                <div className="rounded-[15px] bg-[#080b1a] p-5 sm:p-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">
                          Subscribed to {currentSubscription.plan?.name}
                        </p>
                        <p className="text-white/35 text-xs mt-0.5">
                          {currentSubscription.subscription?.cancel_at_period_end
                            ? `Cancels ${new Date(currentSubscription.subscription.current_period_end).toLocaleDateString()}`
                            : `Renews ${new Date(currentSubscription.subscription?.current_period_end).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/settings"
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white/60 border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Highlights strip */}
      <section className="relative z-10 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"
          >
            {highlights.map((h, i) => (
              <div
                key={h.label}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors"
              >
                <h.icon className="w-4 h-4 text-blue-400/60 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-white/45 font-medium">{h.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 pb-20 sm:pb-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
              Frequently Asked{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
                Questions
              </span>
            </h2>
            <p className="text-white/30 text-sm">Everything you need to know</p>
          </motion.div>

          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full text-left rounded-xl px-5 py-4 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-all group"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                      {faq.q}
                    </h3>
                    <ChevronDown className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`} />
                  </div>
                  {openFaq === index && (
                    <p className="text-sm text-white/35 leading-relaxed mt-3 pr-8">
                      {faq.a}
                    </p>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Talaria" className="w-5 h-5 rounded-md" />
            <span className="text-xs text-white/20 font-medium">Talaria</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/terms" className="text-xs text-white/20 hover:text-white/40 transition-colors">Terms</a>
            <a href="/privacy-policy" className="text-xs text-white/20 hover:text-white/40 transition-colors">Privacy</a>
            <a href="/refund-policy" className="text-xs text-white/20 hover:text-white/40 transition-colors">Refunds</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
