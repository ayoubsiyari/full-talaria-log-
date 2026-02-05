// src/pages/Admin.jsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { Crown, Users, Trash2, Plus, Shield, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import BulkUserImport from '../components/BulkUserImport';

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null);

  // Check admin status
  useEffect(() => {
    const token = localStorage.getItem('token');
    const isAdmin = localStorage.getItem('is_admin') === "true";
    
    if (!token || !isAdmin) {
      navigate('/login');
      return;
    }
  }, [navigate]);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/admin/users`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Status ${res.status}`);
        }
        setUsers(data.users || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load user list: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [refreshFlag]);

  // Create user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!newEmail || !newPassword) {
      setError("Email and password are required.");
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          full_name: newFullName,
          is_admin: newIsAdmin
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Status ${res.status}`);
      }
      
      setSuccess("User created successfully!");
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewIsAdmin(false);
      setRefreshFlag(f => !f);
    } catch (err) {
      console.error(err);
      setError("Error creating user: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Delete user
  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;

    setIsDeleting(userId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Status ${res.status}`);
      }
      setSuccess("User deleted successfully!");
      setRefreshFlag(f => !f);
    } catch (err) {
      console.error(err);
      setError("Error deleting user: " + err.message);
    } finally {
      setIsDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-yellow-400" />
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 text-yellow-400">
            <Shield className="w-5 h-5" />
            <span className="font-medium">Administrator Access</span>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 lg:grid-cols-2 gap-8">
          {/* Create User Form */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-2 mb-6">
              <UserPlus className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-semibold text-white">Create New User</h2>
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  placeholder="user@example.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                  placeholder="Secure password"
                  required
                />
              </div>
              
              <div className="flex items-center">
                <input
                  id="is_admin_checkbox"
                  type="checkbox"
                  checked={newIsAdmin}
                  onChange={e => setNewIsAdmin(e.target.checked)}
                  className="h-4 w-4 text-yellow-400 bg-gray-800 border-gray-600 rounded focus:ring-yellow-400"
                />
                <label htmlFor="is_admin_checkbox" className="ml-2 text-sm text-gray-300">
                  Grant admin rights
                </label>
              </div>
              
              <button
                type="submit"
                disabled={isCreating}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create User
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Users List */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-semibold text-white">Existing Users ({users.length})</h2>
            </div>
            
            {users.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No users found.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {users.map(user => (
                  <div key={user.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">{user.email}</span>
                          {user.is_admin && (
                            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <Crown className="w-3 h-3" />
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">
                          ID: {user.id} • Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={isDeleting === user.id}
                        className="text-red-400 hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                        title="Delete user"
                      >
                        {isDeleting === user.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bulk User Import */}
          <div className="xl:col-span-1 lg:col-span-2">
            <BulkUserImport />
          </div>
        </div>
      </div>
    </div>
  );
}
