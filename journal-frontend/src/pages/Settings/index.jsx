/**
 * Settings Page - Refactored Structure
 * 
 * This file serves as the main entry point for the Settings page.
 * The settings functionality has been split into smaller, focused components.
 * 
 * Structure:
 * - Settings/index.jsx (this file) - Main container and routing
 * - Settings/ProfileSettings.jsx - User profile management
 * - Settings/SecuritySettings.jsx - Password and security options
 * - Settings/AdminDashboard.jsx - Admin dashboard overview
 * - Settings/AdminUsers.jsx - User management
 * - Settings/AdminSettings.jsx - Admin-only settings
 * - Settings/FeatureFlagSettings.jsx - Feature flag management
 * - Settings/hooks/useSettingsData.js - Shared data fetching logic
 * - Settings/components/ - Shared UI components
 */

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { useFeatureFlags } from '../../context/FeatureFlagsContext';
import ProfileSettings from './ProfileSettings';
import SecuritySettings from './SecuritySettings';
import AdminPanel from './AdminPanel';
import {
  User,
  Lock,
  Shield,
  Settings as SettingsIcon
} from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setUserData(data);
          setIsAdmin(data.is_admin || data.role === 'admin');
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Panel', icon: Shield }] : [])
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-cyan-400" />
            Settings
          </h1>
          <p className="text-gray-400 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-700 pb-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                  ${isActive 
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-[#0f2744] rounded-xl border border-gray-700/50 p-6">
          {activeTab === 'profile' && (
            <ProfileSettings userData={userData} setUserData={setUserData} />
          )}
          {activeTab === 'security' && (
            <SecuritySettings userData={userData} />
          )}
          {activeTab === 'admin' && isAdmin && (
            <AdminPanel />
          )}
        </div>
      </div>
    </div>
  );
}
