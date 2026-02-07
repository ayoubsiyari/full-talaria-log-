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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
            <p className="text-gray-600">You need admin privileges to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Welcome, {user.email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-5 w-5 text-indigo-600" /> },
              { id: 'users', label: 'Users', icon: <Users className="h-5 w-5 text-indigo-600" /> },
              { id: 'logs', label: 'Logs', icon: <FileText className="h-5 w-5 text-indigo-600" /> },
              { id: 'health', label: 'System Health', icon: <Shield className="h-5 w-5 text-indigo-600" /> },
              { id: 'feature-flags', label: 'Feature Flags', icon: <Settings className="h-5 w-5 text-indigo-600" /> },
              { id: 'bulk-email', label: 'Bulk Email', icon: <Send className="h-5 w-5 text-indigo-600" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && dashboardData && (
              <div className="space-y-6">
                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {Object.entries(dashboardData.statistics).map(([key, value]) => (
                    <div key={key} className="bg-white overflow-hidden shadow rounded-lg">
                      <div className="p-5">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <span className="text-2xl">
                              {key === 'total_users' && <User className="h-6 w-6 text-indigo-600" />}
                              {key === 'total_profiles' && <FileText className="h-6 w-6 text-indigo-600" />}
                              {key === 'total_trades' && <TrendingUp className="h-6 w-6 text-indigo-600" />}
                              {key === 'total_journals' && <FileText className="h-6 w-6 text-indigo-600" />}
                              {key === 'active_users_30d' && <Activity className="h-6 w-6 text-indigo-600" />}
                              {key === 'admin_users_count' && <Crown className="h-6 w-6 text-indigo-600" />}
                            </span>
                          </div>
                          <div className="ml-5 w-0 flex-1">
                            <dl>
                              <dt className="text-sm font-medium text-gray-500 truncate">
                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </dt>
                              <dd className="text-lg font-medium text-gray-900">{value.toLocaleString()}</dd>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {dashboardData.statistics && (
                  <div className="bg-white shadow rounded-lg p-6 flex flex-col items-center max-w-md mx-auto mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-indigo-600" /> User Roles</h3>
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
                          <Cell key="Admins" fill="#a78bfa" />
                          <Cell key="Users" fill="#6366f1" />
                        </Pie>
                        <ReTooltip />
                        <ReLegend />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent Activity */}
                <div className="bg-white shadow rounded-lg p-6 max-w-2xl mx-auto mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600" /> Recent Admin Activity</h3>
                  {adminActivity.length === 0 ? (
                    <div className="text-gray-500 text-sm">No recent admin activity found.</div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {adminActivity.map((act, idx) => (
                        <li key={idx} className="py-2 flex flex-col md:flex-row md:items-center md:justify-between">
                          <div className="flex-1">
                            <span className="font-semibold text-indigo-700">{act.user}</span> <span className="text-gray-700">{act.action}</span>
                            <span className="text-gray-500 ml-2">{act.details}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1 md:mt-0 md:ml-4">{new Date(act.timestamp).toLocaleString()}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Recent Users */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Users</h3>
                    <div className="space-y-3">
                      {dashboardData.recent_users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{user.email}</p>
                            <p className="text-sm text-gray-500">ID: {user.id}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {user.is_admin && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                Admin
                              </span>
                            )}
                            <span className="text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Trades */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Trades</h3>
                    <div className="space-y-3">
                      {dashboardData.recent_trades.map((trade) => (
                        <div key={trade.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{trade.symbol}</p>
                            <p className="text-sm text-gray-500">
                              Entry: ${trade.entry_price} | Exit: ${trade.exit_price}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${
                              trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              ${trade.pnl?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-sm text-gray-500">
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
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                    <form onSubmit={handleSearch} className="flex-1 max-w-lg">
                      <div className="flex">
                        <input
                          type="text"
                          placeholder="Search users by email..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="flex-1 rounded-l-md border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          className="bg-indigo-600 text-white px-4 py-2 rounded-r-md hover:bg-indigo-700"
                        >
                          Search
                        </button>
                      </div>
                    </form>
                    <CreateUserModal onCreateUser={createUser} />
                  </div>
                </div>

                {/* Users List */}
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Users</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {users.map((user) => (
                            <tr key={user.id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {user.profile_image ? (
                                  <img src={user.profile_image} alt={user.email} className="w-10 h-10 rounded-full object-cover border-2 border-indigo-200" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                    {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {user.email}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {user.is_admin ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    User
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button
                                  onClick={() => deleteUser(user.id)}
                                  className="text-red-600 hover:text-red-900"
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
                        <div className="text-sm text-gray-700">
                          Showing page {pagination.page} of {pagination.pages}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={!pagination.has_prev}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={!pagination.has_next}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
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
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Admin Action Logs</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded">
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
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">System Health</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Status</h4>
                        <p className="mt-1 text-lg font-medium text-gray-900">{systemHealth.status}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Environment</h4>
                        <p className="mt-1 text-lg font-medium text-gray-900">{systemHealth.environment}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Database Status</h4>
                        <p className={`mt-1 text-lg font-medium ${
                          systemHealth.database.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {systemHealth.database.status}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Debug Mode</h4>
                        <p className="mt-1 text-lg font-medium text-gray-900">
                          {systemHealth.debug_mode ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Database Statistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Total Users</h4>
                        <p className="mt-1 text-lg font-medium text-gray-900">
                          {systemHealth.database.total_users.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500">Total Trades</h4>
                        <p className="mt-1 text-lg font-medium text-gray-900">
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
        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
      >
        Create User
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New User</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_admin"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_admin" className="ml-2 block text-sm text-gray-900">
                    Admin privileges
                  </label>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
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
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-600" />
          Compose Bulk Email
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content (HTML supported)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="<p>Enter your email content here...</p>"
              rows={8}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm"
            />
          </div>

          <div className="bg-gray-50 rounded-md p-3">
            <p className="text-sm text-gray-600">
              <strong>Selected:</strong> {selectedEmails.length} user(s)
            </p>
          </div>

          <button
            onClick={handleSendEmail}
            disabled={sending || selectedEmails.length === 0}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className={`p-4 rounded-md ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={result.success ? 'text-green-800' : 'text-red-800'}>
                {result.message}
              </p>
              {result.details && result.details.failed > 0 && (
                <p className="text-sm text-red-600 mt-2">
                  Failed: {result.details.failed} emails
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Selection */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          Select Recipients
        </h3>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={selectAll}
            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-md text-sm hover:bg-indigo-200"
          >
            Select All Visible
          </button>
          <button
            onClick={selectJournalUsers}
            className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm hover:bg-green-200"
          >
            Select Journal Users
          </button>
          <button
            onClick={deselectAll}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
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
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto border rounded-md divide-y">
            {filteredUsers.map((user) => (
              <label
                key={user.id}
                className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 ${
                  selectedEmails.includes(user.email) ? 'bg-indigo-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(user.email)}
                  onChange={() => toggleUser(user.email)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">{user.email}</p>
                  {user.name && (
                    <p className="text-xs text-gray-500">{user.name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {user.has_journal_access && (
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                      Journal
                    </span>
                  )}
                  {user.is_admin && (
                    <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                      Admin
                    </span>
                  )}
                </div>
              </label>
            ))}
            {filteredUsers.length === 0 && (
              <div className="p-4 text-center text-gray-500">
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
