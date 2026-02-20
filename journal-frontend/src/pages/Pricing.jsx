import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  Check,
  ArrowRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import logo from '../assets/logo4.jpg';

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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
          setPlans(data.plans);
        }
      }
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    if (!isLoggedIn) {
      navigate(`/login`);
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
      const res = await fetch(`${API_BASE_URL}/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan_id: planId,
          success_url: window.location.origin + '/journal/onboarding',
          cancel_url: window.location.origin + '/journal/pricing'
        })
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

  const defaultPlans = [
    {
      id: 'pro-monthly',
      name: "Pro Trader",
      description: "For serious traders ready to level up",
      price: 29,
      interval: 'month',
      features: ["Unlimited trade journaling", "Full analytics & reports", "AI Trading Assistant", "Strategy Builder", "Backtesting tools", "Priority support"],
      is_popular: true
    },
    {
      id: 'pro-yearly',
      name: "Pro Trader Yearly",
      description: "Best value - save 25%",
      price: 261,
      interval: 'year',
      features: ["Everything in Pro Trader", "25% discount", "Early access to features"],
      is_popular: false
    },
    {
      id: 'enterprise',
      name: "Enterprise",
      description: "For trading teams & prop firms",
      price: 99,
      interval: 'month',
      features: ["Everything in Pro", "Multi-user team access", "Custom integrations", "Dedicated account manager", "White-label options", "API access"],
      is_popular: false
    }
  ];

  const displayPlans = plans.length > 0 ? plans : defaultPlans;

  return (
    <div className="min-h-screen bg-[#030014] text-white relative overflow-hidden">
      {/* Grid pattern overlay — matches homepage */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBoMXYxaC0xek0zMCAwaDF2MWgtMXoiIGZpbGw9IiMxYTFhMmUiIGZpbGwtb3BhY2l0eT0iLjMiLz48L2c+PC9zdmc+')] opacity-40 pointer-events-none z-0" />

      {/* Navigation — matches homepage nav */}
      <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <img src={logo} alt="Talaria" className="w-8 h-8 rounded-lg" />
              <span className="text-white font-bold text-lg hidden sm:inline">Talaria</span>
            </a>
            
            <div className="flex items-center gap-2 sm:gap-3">
              {isLoggedIn ? (
                <span className="text-sm text-neutral-400">
                  Select your plan
                </span>
              ) : (
                <>
                  <Link to="/login" className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 transition-all">
                    Login
                  </Link>
                  <Link to="/login" className="rounded-full text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_14px_40px_rgba(59,130,246,0.25)] text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 transition-all">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-28 sm:pt-36 pb-16 sm:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center space-x-2 bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 mb-8">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm text-neutral-400">Simple, Transparent Pricing</span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6">
            Choose your{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400">
              trading edge
            </span>
          </h1>
          
          <p className="text-sm sm:text-base md:text-lg text-neutral-400 max-w-2xl mx-auto mb-10">
            From individual traders to institutional firms, we have the perfect plan to help you achieve 
            consistent profitability and professional growth.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center space-x-4 mb-12">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white' : 'text-neutral-400'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                billingCycle === 'yearly' ? 'bg-gradient-to-r from-blue-600 to-cyan-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white' : 'text-neutral-400'}`}>
              Yearly
              <span className="ml-1 text-cyan-400 font-medium">Save 25%</span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative z-10 pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className={`grid gap-6 sm:gap-8 max-w-5xl mx-auto ${
              displayPlans.length === 1 ? 'md:grid-cols-1 max-w-md' :
              displayPlans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
              'md:grid-cols-2 lg:grid-cols-3'
            }`}>
              {displayPlans.map((plan, index) => {
                const isCurrentPlan = currentSubscription?.plan?.id === plan.id;
                const isPro = plan.is_popular || plan.name.toLowerCase().includes('pro');
                
                return (
                  <div
                    key={plan.id || index}
                    className={`relative rounded-2xl p-6 sm:p-8 border transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_60px_rgba(59,130,246,0.15)] ${
                      isPro
                        ? 'border-blue-500/40 bg-gradient-to-b from-blue-600/15 via-indigo-600/5 to-transparent shadow-[0_0_40px_rgba(59,130,246,0.1)]'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white text-xs font-medium px-4 py-1 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                      <p className="text-neutral-400 text-sm">{plan.description}</p>
                    </div>

                    <div className="text-center mb-8">
                      <div className="flex items-baseline justify-center">
                        <span className="text-5xl font-bold text-white">
                          {plan.price === 0 ? 'Free' : `$${plan.price}`}
                        </span>
                        {plan.price > 0 && (
                          <span className="text-neutral-400 ml-2">/{plan.interval}</span>
                        )}
                      </div>
                      {plan.trial_days > 0 && (
                        <p className="text-cyan-400 text-sm mt-2 font-medium">
                          {plan.trial_days}-day free trial
                        </p>
                      )}
                    </div>

                    <ul className="space-y-3 mb-8">
                      {(plan.features || []).map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <span className="text-neutral-300 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {isCurrentPlan ? (
                      <button
                        disabled
                        className="w-full py-3 px-6 rounded-full bg-green-500/20 text-green-400 font-medium border border-green-500/30"
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={checkoutLoading === plan.id}
                        className={`w-full py-3 px-6 rounded-full font-medium transition-all flex items-center justify-center gap-2 ${
                          isPro
                            ? 'text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_14px_40px_rgba(59,130,246,0.25)]'
                            : 'text-white border border-white/10 bg-white/5 hover:bg-white/10'
                        } disabled:opacity-50`}
                      >
                        {checkoutLoading === plan.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            {plan.trial_days > 0 ? 'Start Free Trial' : 'Subscribe Now'}
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Current Subscription Banner */}
          {currentSubscription?.has_subscription && (
            <div className="mt-12 max-w-2xl mx-auto">
              <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-2xl p-6 border border-green-500/20">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-white font-medium">
                      You're subscribed to {currentSubscription.plan?.name}
                    </p>
                    <p className="text-neutral-400 text-sm">
                      {currentSubscription.subscription?.cancel_at_period_end
                        ? `Cancels on ${new Date(currentSubscription.subscription.current_period_end).toLocaleDateString()}`
                        : `Renews on ${new Date(currentSubscription.subscription?.current_period_end).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Link
                    to="/settings"
                    className="px-4 py-2 rounded-full text-white text-sm border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Manage Subscription
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              Frequently Asked{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400">
                Questions
              </span>
            </h2>
          </div>
          
          <div className="space-y-4">
            {[
              {
                question: "Can I change my plan at any time?",
                answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and are prorated."
              },
              {
                question: "Is there a free trial available?",
                answer: "Yes, we offer a free trial on all paid plans. No credit card required to start."
              },
              {
                question: "What payment methods do you accept?",
                answer: "We accept all major credit cards, PayPal, and bank transfers for enterprise plans."
              },
              {
                question: "Can I cancel my subscription?",
                answer: "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white/[0.03] backdrop-blur-sm rounded-xl p-5 sm:p-6 border border-white/10 hover:border-white/20 transition-all">
                <h3 className="text-base sm:text-lg font-semibold mb-2 text-white">{faq.question}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom gradient fade — matches homepage */}
      <div className="fixed bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#030014] via-[#030014]/80 to-transparent pointer-events-none z-0" />
    </div>
  );
}
