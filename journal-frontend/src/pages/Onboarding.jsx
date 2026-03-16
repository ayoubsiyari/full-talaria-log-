import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Globe, DollarSign, BarChart3, ChevronRight, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import logo from '../assets/logo4.jpg';

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
];

const CURRENCIES = [
  { value: 'USD', label: 'US Dollar ($)', symbol: '$' },
  { value: 'EUR', label: 'Euro (€)', symbol: '€' },
  { value: 'GBP', label: 'British Pound (£)', symbol: '£' },
  { value: 'JPY', label: 'Japanese Yen (¥)', symbol: '¥' },
  { value: 'AUD', label: 'Australian Dollar (A$)', symbol: 'A$' },
  { value: 'CAD', label: 'Canadian Dollar (C$)', symbol: 'C$' },
  { value: 'CHF', label: 'Swiss Franc (CHF)', symbol: 'CHF' },
];

const MARKET_TYPES = [
  { value: 'forex', label: 'Forex', description: 'Currency pairs trading' },
  { value: 'crypto', label: 'Crypto', description: 'Cryptocurrency markets' },
  { value: 'stocks', label: 'Stocks', description: 'Equities and ETFs' },
  { value: 'futures', label: 'Futures', description: 'Futures contracts' },
  { value: 'options', label: 'Options', description: 'Options trading' },
];

const ACCOUNT_TYPES = [
  { value: 'real', label: 'Real Account', description: 'Live trading with real money' },
  { value: 'demo', label: 'Demo Account', description: 'Practice with virtual funds' },
  { value: 'prop', label: 'Prop Firm', description: 'Funded trading account' },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Profile settings
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('USD');
  const [marketType, setMarketType] = useState('forex');

  // Trading account
  const [accountName, setAccountName] = useState('My Trading Account');
  const [broker, setBroker] = useState('');
  const [accountType, setAccountType] = useState('real');
  const [startingBalance, setStartingBalance] = useState('10000');

  const totalSteps = 3;

  // Verify checkout session on mount (after Stripe redirect)
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      verifyCheckoutSession(sessionId);
    }
  }, []);

  const verifyCheckoutSession = async (sessionId) => {
    setVerifying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/subscriptions/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (data.success) {
        console.log('✅ Subscription verified:', data.message);
      } else {
        console.warn('⚠️ Session verification:', data.error);
      }
    } catch (err) {
      console.error('Error verifying checkout session:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Create trading profile
      const profileRes = await fetch(`${API_BASE_URL}/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: accountName,
          broker: broker || 'Not specified',
          account_type: accountType,
          starting_balance: parseFloat(startingBalance) || 10000,
          currency: currency,
          timezone: timezone,
          market_type: marketType,
          is_default: true
        })
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        throw new Error(data.error || 'Failed to create profile');
      }

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding error:', err);
      setError(err.message || 'Failed to complete setup. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center border border-white/10">
              <img src={logo} alt="Talaria" className="w-12 h-12 rounded-lg" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Talaria</h1>
          <p className="text-white/60">Let's set up your trading environment</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                s < step ? 'bg-green-500 text-white' :
                s === step ? 'bg-blue-500 text-white' :
                'bg-white/10 text-white/40'
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 mx-2 rounded ${s < step ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          {/* Step 1: Profile Settings */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Globe className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                <h2 className="text-xl font-semibold">Profile Settings</h2>
                <p className="text-white/60 text-sm">Configure your preferences</p>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value} className="bg-gray-900">{tz.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Base Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-gray-900">{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Primary Market</label>
                <div className="grid grid-cols-2 gap-2">
                  {MARKET_TYPES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMarketType(m.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        marketType === m.value
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-white/20 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-xs text-white/50">{m.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Trading Account */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <BarChart3 className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                <h2 className="text-xl font-semibold">Trading Account</h2>
                <p className="text-white/60 text-sm">Set up your first trading account</p>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Account Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g., Main Trading Account"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Broker (Optional)</label>
                <input
                  type="text"
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  placeholder="e.g., Interactive Brokers"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Account Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setAccountType(t.value)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        accountType === t.value
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-white/20 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-medium text-sm">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">Starting Balance</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="number"
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(e.target.value)}
                    placeholder="10000"
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Ready */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="mb-6">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold">You're All Set!</h2>
                <p className="text-white/60 text-sm">Your trading environment is ready</p>
              </div>

              <div className="bg-white/5 rounded-lg p-4 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Timezone</span>
                  <span className="text-white">{TIMEZONES.find(t => t.value === timezone)?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Currency</span>
                  <span className="text-white">{currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Market</span>
                  <span className="text-white capitalize">{marketType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Account</span>
                  <span className="text-white">{accountName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Starting Balance</span>
                  <span className="text-white">{CURRENCIES.find(c => c.value === currency)?.symbol}{startingBalance}</span>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="px-6 py-2 text-white/60 hover:text-white transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < totalSteps ? (
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Go to Dashboard
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
