/**
 * SecuritySettings Component
 * 
 * Handles security-related settings:
 * - Password change
 * - Two-factor authentication (future)
 * - Session management
 */

import React, { useState } from 'react';
import { API_BASE_URL } from '../../config';
import {
  Lock,
  Eye,
  EyeOff,
  Save,
  Shield,
  Check,
  AlertCircle,
  LogOut
} from 'lucide-react';

export default function SecuritySettings({ userData }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    if (newPassword !== confirmPassword) {
      setMsg('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setMsg('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMsg('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMsg(data.error || 'Failed to change password');
      }
    } catch (error) {
      setMsg('Error changing password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('is_admin');
      localStorage.removeItem('talaria_current_user');
      window.location.href = '/journal/login';
    }
  };

  const getMessageType = () => {
    if (msg.includes('successfully')) return 'success';
    if (msg.includes('Failed') || msg.includes('Error') || msg.includes('match') || msg.includes('least')) return 'error';
    return 'info';
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <Shield className="w-5 h-5 text-cyan-400" />
        Security Settings
      </h2>

      <div className="space-y-8 max-w-xl">
        {/* Password Change Form */}
        <div className="bg-[#1e3a5f]/50 rounded-lg p-6 border border-gray-700/50">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-cyan-400" />
            Change Password
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#0f2744] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#0f2744] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#0f2744] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Message */}
            {msg && (
              <div className={`p-4 rounded-lg flex items-center gap-3 ${
                getMessageType() === 'success' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {getMessageType() === 'success' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                {msg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className={`
                w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all
                ${currentPassword && newPassword && confirmPassword
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:opacity-90'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Update Password
                </>
              )}
            </button>
          </form>
        </div>

        {/* Session Management */}
        <div className="bg-[#1e3a5f]/50 rounded-lg p-6 border border-gray-700/50">
          <h3 className="text-lg font-medium text-white mb-4">
            Session Management
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            End your current session and log out from this device.
          </p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
