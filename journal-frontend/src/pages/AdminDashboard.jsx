// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchWithAuth } from '../utils/fetchUtils';
import { Users, User, Crown, FileText, BarChart3, Activity, TrendingUp, PieChart, Shield, CheckCircle, Mail, Phone, MapPin, Calendar, Clock, Settings, Send } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend as ReLegend } from 'recharts';
import GroupFeatureFlagManager from '../components/GroupFeatureFlagManager';

const AdminDashboard = () => {
  const { user, token, isAdmin } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pagination, setPagination] = useState({ page: 1, per_page: 20, total: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [adminActivity, setAdminActivity] = useState([]);

  // Check if user is admin
  useEffect(() => {
    if (!isAdmin) {
      setError('Access denied. Admin privileges required.');
      setLoading(false);
      return;
    }
    
    // If admin, fetch dashboard data
    fetchDashboardData();
    fetchUsers();
    fetchLogs();
    fetchSystemHealth();
    setLoading(false);
  }, [isAdmin]);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setDashboardData(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch users with pagination and search
  const fetchUsers = async (page = 1, search = '') => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: pagination.per_page.toString()
      });
      
      if (search) {
        params.append('search', search);
      }

      const response = await fetchWithAuth(`/api/admin/users?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch admin logs
  const fetchLogs = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/logs?limit=50', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.logs);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch system health
  const fetchSystemHealth = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/system/health', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch system health');
      }

      const data = await response.json();
      setSystemHealth(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch recent admin activity for dashboard
  useEffect(() => {
    if (activeTab === 'dashboard' && user?.is_admin) {
      const fetchActivity = async () => {
        try {
          const response = await fetchWithAuth('/api/admin/activity?limit=10', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (response.ok) {
            const data = await response.json();
            setAdminActivity(data.activities || []);
          } else {
            setAdminActivity([]);
          }
        } catch {
          setAdminActivity([]);
        }
      };
      fetchActivity();
    }
  }, [activeTab, user, token]);

  // Load data based on active tab
  useEffect(() => {
    if (!user?.is_admin) return;

    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        switch (activeTab) {
          case 'dashboard':
            await fetchDashboardData();
            break;
          case 'users':
            await fetchUsers(1, searchTerm);
            break;
          case 'logs':
            await fetchLogs();
            break;
          case 'health':
            await fetchSystemHealth();
            break;
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeTab, user, token, searchTerm]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers(1, searchTerm);
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    fetchUsers(newPage, searchTerm);
  };

  // Create new user
  const createUser = async (userData) => {
    try {
      const response = await fetchWithAuth('/api/admin/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      // Refresh users list
      await fetchUsers(pagination.page, searchTerm);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Delete user
  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      // Refresh users list
      await fetchUsers(pagination.page, searchTerm);
    } catch (err) {
      setError(err.message);
    }
  };

  // Login as user


  if (!user?.is_admin) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="max-w-md w-full bg-[#1e3a5f] rounded-xl shadow-2xl p-8 border border-[#2d4a6f]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-gray-300">You need admin privileges to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628]">
      {/* Header */}
      <div className="bg-[#1e3a5f] border-b border-[#2d4a6f]">
        <div className="w-full px-6">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 bg-[#0a1628] px-4 py-2 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">{user.email?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-sm text-gray-300">{user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-[#0f2744] border-b border-[#2d4a6f]">
        <div className="w-full px-6">
          <nav className="flex space-x-1 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" /> },
              { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
              { id: 'logs', label: 'Logs', icon: <FileText className="h-4 w-4" /> },
              { id: 'health', label: 'System Health', icon: <Shield className="h-4 w-4" /> },
              { id: 'feature-flags', label: 'Feature Flags', icon: <Settings className="h-4 w-4" /> },
              { id: 'bulk-email', label: 'Bulk Email', icon: <Send className="h-4 w-4" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 font-medium text-sm flex items-center gap-2 rounded-t-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#1e3a5f] text-white border-t-2 border-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-[#1e3a5f]/50'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full px-6 py-6">
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-500/50 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-300">Error</h3>
                <div className="mt-2 text-sm text-red-400">{error}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && dashboardData && (
              <div className="space-y-6">
                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {Object.entries(dashboardData.statistics).map(([key, value]) => (
                    <div key={key} className="bg-[#1e3a5f] overflow-hidden rounded-xl border border-[#2d4a6f] hover:border-blue-400/50 transition-all">
                      <div className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </p>
                            <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            {key === 'total_users' && <User className="h-6 w-6 text-blue-400" />}
                            {key === 'total_profiles' && <FileText className="h-6 w-6 text-green-400" />}
                            {key === 'total_trades' && <TrendingUp className="h-6 w-6 text-yellow-400" />}
                            {key === 'total_journals' && <FileText className="h-6 w-6 text-purple-400" />}
                            {key === 'active_users_30d' && <Activity className="h-6 w-6 text-cyan-400" />}
                            {key === 'admin_users_count' && <Crown className="h-6 w-6 text-orange-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {dashboardData.statistics && (
                  <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f] p-6 flex flex-col items-center max-w-md mx-auto mb-8">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-blue-400" /> User Roles</h3>
                    <ResponsiveContainer width={250} height={200}>
                      <RePieChart>
                        <Pie
                          data={[
                            { name: 'Admins', value: dashboardData.statistics.admin_users_count },
                            { name: 'Users', value: dashboardData.statistics.total_users - dashboardData.statistics.admin_users_count }
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label
                        >
                          <Cell key="Admins" fill="#3b82f6" />
                          <Cell key="Users" fill="#1e3a5f" />
                        </Pie>
                        <ReTooltip />
                        <ReLegend />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent Activity */}
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f] p-6 max-w-4xl mx-auto mb-8">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" /> Recent Admin Activity</h3>
                  {adminActivity.length === 0 ? (
                    <div className="text-gray-400 text-sm">No recent admin activity found.</div>
                  ) : (
                    <ul className="divide-y divide-[#2d4a6f]">
                      {adminActivity.map((act, idx) => (
                        <li key={idx} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between">
                          <div className="flex-1">
                            <span className="font-semibold text-blue-400">{act.user}</span> <span className="text-gray-300">{act.action}</span>
                            <span className="text-gray-400 ml-2">{act.details}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1 md:mt-0 md:ml-4">{new Date(act.timestamp).toLocaleString()}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Recent Users */}
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                  <div className="px-6 py-5">
                    <h3 className="text-lg leading-6 font-medium text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" /> Recent Users</h3>
                    <div className="space-y-3">
                      {dashboardData.recent_users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-[#0a1628] rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-white">{user.email}</p>
                            <p className="text-xs text-gray-400">ID: {user.id}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {user.is_admin && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                                Admin
                              </span>
                            )}
                            <span className="text-sm text-gray-400">
                              {new Date(user.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Trades */}
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                  <div className="px-6 py-5">
                    <h3 className="text-lg leading-6 font-medium text-white mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-400" /> Recent Trades</h3>
                    <div className="space-y-3">
                      {dashboardData.recent_trades.map((trade) => (
                        <div key={trade.id} className="flex items-center justify-between p-3 bg-[#0a1628] rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-white">{trade.symbol}</p>
                            <p className="text-xs text-gray-400">
                              Entry: ${trade.entry_price} | Exit: ${trade.exit_price}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${
                              trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              ${trade.pnl?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(trade.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                {/* Search and Create User */}
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f] p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <form onSubmit={handleSearch} className="flex-1 max-w-lg">
                      <div className="flex">
                        <input
                          type="text"
                          placeholder="Search users by email..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="flex-1 rounded-l-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          type="submit"
                          className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600 transition-colors"
                        >
                          Search
                        </button>
                      </div>
                    </form>
                    <CreateUserModal onCreateUser={createUser} />
                  </div>
                </div>

                {/* Users List */}
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                  <div className="px-6 py-5">
                    <h3 className="text-lg leading-6 font-medium text-white mb-4">Users</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[#2d4a6f]">
                        <thead className="bg-[#0a1628]">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2d4a6f]">
                          {users.map((user) => (
                            <tr key={user.id} className="hover:bg-[#0a1628]/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                {user.profile_image ? (
                                  <img src={user.profile_image} alt={user.email} className="w-10 h-10 rounded-full object-cover border-2 border-blue-400" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
                                    {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                {user.email}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {user.is_admin ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-300">
                                    User
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button
                                  onClick={() => deleteUser(user.id)}
                                  className="text-red-400 hover:text-red-300 transition-colors"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-gray-400">
                          Showing page {pagination.page} of {pagination.pages}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={!pagination.has_prev}
                            className="px-3 py-1 border border-[#2d4a6f] rounded-lg text-sm text-gray-300 hover:bg-[#0a1628] disabled:opacity-50 transition-colors"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={!pagination.has_next}
                            className="px-3 py-1 border border-[#2d4a6f] rounded-lg text-sm text-gray-300 hover:bg-[#0a1628] disabled:opacity-50 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                <div className="px-6 py-5">
                  <h3 className="text-lg leading-6 font-medium text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> Admin Action Logs</h3>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm text-gray-300 font-mono bg-[#0a1628] p-3 rounded-lg border border-[#2d4a6f]">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Feature Flags Tab */}
            {activeTab === 'feature-flags' && (
              <GroupFeatureFlagManager />
            )}

            {/* Bulk Email Tab */}
            {activeTab === 'bulk-email' && (
              <BulkEmailManager token={token} />
            )}

            {/* System Health Tab */}
            {activeTab === 'health' && systemHealth && (
              <div className="space-y-6">
                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                  <div className="px-6 py-5">
                    <h3 className="text-lg leading-6 font-medium text-white mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-blue-400" /> System Health</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Status</h4>
                        <p className="mt-1 text-lg font-medium text-white">{systemHealth.status}</p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Environment</h4>
                        <p className="mt-1 text-lg font-medium text-white">{systemHealth.environment}</p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Database Status</h4>
                        <p className={`mt-1 text-lg font-medium ${
                          systemHealth.database.status === 'healthy' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {systemHealth.database.status}
                        </p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Debug Mode</h4>
                        <p className="mt-1 text-lg font-medium text-white">
                          {systemHealth.debug_mode ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f]">
                  <div className="px-6 py-5">
                    <h3 className="text-lg leading-6 font-medium text-white mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" /> Database Statistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Total Users</h4>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {systemHealth.database.total_users.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d4a6f]">
                        <h4 className="text-xs font-medium text-gray-400 uppercase">Total Trades</h4>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {systemHealth.database.total_trades.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Create User Modal Component
const CreateUserModal = ({ onCreateUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    is_admin: false
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const success = await onCreateUser(formData);
    if (success) {
      setFormData({ email: '', password: '', is_admin: false });
      setIsOpen(false);
    }

    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
      >
        Create User
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/70 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative mx-auto p-6 border border-[#2d4a6f] w-96 shadow-2xl rounded-xl bg-[#1e3a5f]">
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Create New User</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full rounded-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 block w-full rounded-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_admin"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                    className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-[#2d4a6f] rounded bg-[#0a1628]"
                  />
                  <label htmlFor="is_admin" className="ml-2 block text-sm text-gray-300">
                    Admin privileges
                  </label>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 border border-[#2d4a6f] rounded-lg text-sm font-medium text-gray-300 hover:bg-[#0a1628] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Bulk Email Manager Component
const BulkEmailManager = ({ token }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch all users on mount
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const response = await fetch('/api/admin/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setAllUsers(data.users || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllUsers();
  }, [token]);

  // Filter users based on search
  const filteredUsers = allUsers.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Toggle user selection
  const toggleUser = (email) => {
    setSelectedEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  // Select all filtered users
  const selectAll = () => {
    const filteredEmails = filteredUsers.map(u => u.email);
    setSelectedEmails(prev => {
      const newSelection = new Set([...prev, ...filteredEmails]);
      return Array.from(newSelection);
    });
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedEmails([]);
  };

  // Select users with journal access
  const selectJournalUsers = () => {
    const journalEmails = allUsers.filter(u => u.has_journal_access).map(u => u.email);
    setSelectedEmails(journalEmails);
  };

  // Send bulk email
  const handleSendEmail = async () => {
    if (selectedEmails.length === 0) {
      setResult({ success: false, message: 'Please select at least one user' });
      return;
    }
    if (!subject.trim()) {
      setResult({ success: false, message: 'Please enter a subject' });
      return;
    }
    if (!content.trim()) {
      setResult({ success: false, message: 'Please enter email content' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails: selectedEmails,
          subject: subject,
          content: content
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully sent ${data.sent} emails`,
          details: data
        });
        // Clear form after success
        setSubject('');
        setContent('');
        setSelectedEmails([]);
      } else {
        setResult({
          success: false,
          message: data.detail || 'Failed to send emails'
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Network error: ' + err.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Email Composer */}
      <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f] p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-400" />
          Compose Bulk Email
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
              className="w-full rounded-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Content (HTML supported)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="<p>Enter your email content here...</p>"
              rows={8}
              className="w-full rounded-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d4a6f]">
            <p className="text-sm text-gray-300">
              <strong className="text-blue-400">Selected:</strong> {selectedEmails.length} user(s)
            </p>
          </div>

          <button
            onClick={handleSendEmail}
            disabled={sending || selectedEmails.length === 0}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Email to {selectedEmails.length} User(s)
              </>
            )}
          </button>

          {result && (
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-900/30 border border-green-500/50' : 'bg-red-900/30 border border-red-500/50'}`}>
              <p className={result.success ? 'text-green-400' : 'text-red-400'}>
                {result.message}
              </p>
              {result.details && result.details.failed > 0 && (
                <p className="text-sm text-red-400 mt-2">
                  Failed: {result.details.failed} emails
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Selection */}
      <div className="bg-[#1e3a5f] rounded-xl border border-[#2d4a6f] p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Select Recipients
        </h3>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
          >
            Select All Visible
          </button>
          <button
            onClick={selectJournalUsers}
            className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
          >
            Select Journal Users
          </button>
          <button
            onClick={deselectAll}
            className="px-3 py-1.5 bg-gray-500/20 text-gray-300 rounded-lg text-sm hover:bg-gray-500/30 transition-colors"
          >
            Deselect All
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by email or name..."
            className="w-full rounded-lg bg-[#0a1628] border-[#2d4a6f] text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto border border-[#2d4a6f] rounded-lg divide-y divide-[#2d4a6f]">
            {filteredUsers.map((user) => (
              <label
                key={user.id}
                className={`flex items-center p-3 cursor-pointer hover:bg-[#0a1628]/50 transition-colors ${
                  selectedEmails.includes(user.email) ? 'bg-blue-500/10' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(user.email)}
                  onChange={() => toggleUser(user.email)}
                  className="h-4 w-4 text-blue-500 focus:ring-blue-500 border-[#2d4a6f] rounded bg-[#0a1628]"
                />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-white">{user.email}</p>
                  {user.name && (
                    <p className="text-xs text-gray-400">{user.name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {user.has_journal_access && (
                    <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                      Journal
                    </span>
                  )}
                  {user.is_admin && (
                    <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                      Admin
                    </span>
                  )}
                </div>
              </label>
            ))}
            {filteredUsers.length === 0 && (
              <div className="p-4 text-center text-gray-400">
                No users found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
