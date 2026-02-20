import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Gift,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Download
} from 'lucide-react';

export default function SubscriptionManager() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Plan form state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: 0,
    interval: 'month',
    trial_days: 0,
    features: []
  });
  
  // Coupon form state
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponForm, setCouponForm] = useState({
    name: '',
    code: '',
    percent_off: 0,
    duration: 'once',
    max_redemptions: null
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchStats();
    fetchPlans();
  }, []);

  useEffect(() => {
    if (activeTab === 'subscriptions') fetchSubscriptions();
    if (activeTab === 'payments') fetchPayments();
    if (activeTab === 'coupons') fetchCoupons();
    if (activeTab === 'webhooks') fetchWebhookLogs();
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
    }
  };

  const fetchPayments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
    }
  };

  const fetchCoupons = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/coupons`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
      }
    } catch (err) {
      console.error('Error fetching coupons:', err);
    }
  };

  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/webhooks/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching webhook logs:', err);
    }
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(planForm)
      });
      if (res.ok) {
        setShowPlanModal(false);
        setPlanForm({ name: '', description: '', price: 0, interval: 'month', trial_days: 0, features: [] });
        fetchPlans();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create plan');
      }
    } catch (err) {
      setError('Error creating plan');
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(couponForm)
      });
      if (res.ok) {
        setShowCouponModal(false);
        setCouponForm({ name: '', code: '', percent_off: 0, duration: 'once', max_redemptions: null });
        fetchCoupons();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create coupon');
      }
    } catch (err) {
      setError('Error creating coupon');
    }
  };

  const handleRefund = async (paymentId) => {
    if (!window.confirm('Are you sure you want to refund this payment?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/subscriptions/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchPayments();
        fetchStats();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to refund');
      }
    } catch (err) {
      setError('Error processing refund');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
      past_due: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      succeeded: 'bg-green-500/20 text-green-400 border-green-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'plans', label: 'Plans', icon: CreditCard },
    { id: 'subscriptions', label: 'Subscriptions', icon: Users },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'coupons', label: 'Coupons', icon: Gift },
    { id: 'webhooks', label: 'Webhooks', icon: FileText }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-400" />
          Subscription & Payments
        </h2>
        <button
          onClick={() => { fetchStats(); fetchPlans(); }}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">MRR</p>
                  <p className="text-white text-xl font-bold">{formatCurrency(stats?.mrr || 0)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">ARR</p>
                  <p className="text-white text-xl font-bold">{formatCurrency(stats?.arr || 0)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Active Subs</p>
                  <p className="text-white text-xl font-bold">{stats?.active_subscriptions || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Churn Rate</p>
                  <p className="text-white text-xl font-bold">{stats?.churn_rate || 0}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <p className="text-gray-400 text-xs mb-1">Monthly Revenue</p>
              <p className="text-white text-lg font-semibold">{formatCurrency(stats?.monthly_revenue || 0)}</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <p className="text-gray-400 text-xs mb-1">Total Revenue</p>
              <p className="text-white text-lg font-semibold">{formatCurrency(stats?.total_revenue || 0)}</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <p className="text-gray-400 text-xs mb-1">Trialing</p>
              <p className="text-white text-lg font-semibold">{stats?.trialing_subscriptions || 0}</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
              <p className="text-gray-400 text-xs mb-1">Failed Payments (30d)</p>
              <p className="text-white text-lg font-semibold">{stats?.failed_payments_30d || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-white">Subscription Plans</h3>
            <button
              onClick={() => setShowPlanModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Plan
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => (
              <div key={plan.id} className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-white font-medium">{plan.name}</h4>
                    <p className="text-gray-400 text-sm">{plan.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${plan.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-bold text-white">{formatCurrency(plan.price)}</span>
                  <span className="text-gray-400 text-sm">/{plan.interval}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <span>{plan.subscriber_count} subscribers</span>
                  {plan.trial_days > 0 && <span>{plan.trial_days} day trial</span>}
                </div>
              </div>
            ))}
            {plans.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400">
                No plans created yet. Click "New Plan" to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-white">Active Subscriptions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Period End</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.id} className="border-b border-gray-700/50">
                    <td className="py-3">
                      <div>
                        <p className="text-white">{sub.user_name}</p>
                        <p className="text-gray-400 text-xs">{sub.user_email}</p>
                      </div>
                    </td>
                    <td className="py-3 text-white">{sub.plan_name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${getStatusBadge(sub.status)}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400">
                      {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3">
                      <button className="text-gray-400 hover:text-red-400 transition-colors">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-gray-400">
                      No subscriptions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-white">Payment History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id} className="border-b border-gray-700/50">
                    <td className="py-3 text-gray-400">
                      {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 text-white">{payment.user_email}</td>
                    <td className="py-3 text-white font-medium">{formatCurrency(payment.amount)}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${getStatusBadge(payment.status)}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {payment.status === 'succeeded' && !payment.refunded && (
                        <button
                          onClick={() => handleRefund(payment.id)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors text-xs"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-gray-400">
                      No payments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Coupons Tab */}
      {activeTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-white">Coupons</h3>
            <button
              onClick={() => setShowCouponModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Coupon
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {coupons.map(coupon => (
              <div key={coupon.id} className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-white font-medium">{coupon.name || coupon.id}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs ${coupon.valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {coupon.valid ? 'Valid' : 'Expired'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-blue-400 mb-2">
                  {coupon.percent_off ? `${coupon.percent_off}% OFF` : formatCurrency(coupon.amount_off / 100)}
                </p>
                {coupon.promotion_codes && coupon.promotion_codes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {coupon.promotion_codes.map((code, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">
                        {code}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-sm text-gray-400">
                  <p>Duration: {coupon.duration}</p>
                  <p>Used: {coupon.times_redeemed} / {coupon.max_redemptions || '∞'}</p>
                </div>
              </div>
            ))}
            {coupons.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-400">
                No coupons found. {!stats?.stripe_configured && 'Configure Stripe to create coupons.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-white">Webhook Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Event Type</th>
                  <th className="pb-2 font-medium">Event ID</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {webhookLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-700/50">
                    <td className="py-3 text-gray-400">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="py-3 text-white">{log.event_type}</td>
                    <td className="py-3 text-gray-400 font-mono text-xs">{log.event_id?.slice(0, 20)}...</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${getStatusBadge(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {webhookLogs.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-gray-400">
                      No webhook events yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Plan</h3>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Price ($)</label>
                  <input
                    type="number"
                    value={planForm.price}
                    onChange={(e) => setPlanForm({ ...planForm, price: parseFloat(e.target.value) })}
                    className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Interval</label>
                  <select
                    value={planForm.interval}
                    onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })}
                    className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Trial Days</label>
                <input
                  type="number"
                  value={planForm.trial_days}
                  onChange={(e) => setPlanForm({ ...planForm, trial_days: parseInt(e.target.value) })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  min="0"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0a1628] rounded-lg border border-[#2d4a6f] p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Coupon</h3>
            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Coupon Name</label>
                <input
                  type="text"
                  value={couponForm.name}
                  onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Promotion Code (what customers type at checkout)</label>
                <input
                  type="text"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white uppercase"
                  placeholder="e.g. SAVE20, WELCOME50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Percent Off</label>
                <input
                  type="number"
                  value={couponForm.percent_off}
                  onChange={(e) => setCouponForm({ ...couponForm, percent_off: parseInt(e.target.value) })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  min="1"
                  max="100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Duration</label>
                <select
                  value={couponForm.duration}
                  onChange={(e) => setCouponForm({ ...couponForm, duration: e.target.value })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                >
                  <option value="once">Once</option>
                  <option value="repeating">Repeating</option>
                  <option value="forever">Forever</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Redemptions (leave empty for unlimited)</label>
                <input
                  type="number"
                  value={couponForm.max_redemptions || ''}
                  onChange={(e) => setCouponForm({ ...couponForm, max_redemptions: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full bg-[#1e3a5f] border border-[#2d4a6f] rounded-lg px-3 py-2 text-white"
                  min="1"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Create Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
