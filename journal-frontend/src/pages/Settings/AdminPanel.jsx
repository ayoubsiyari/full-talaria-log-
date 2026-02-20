/**
 * AdminPanel Component
 * 
 * Main admin panel container that houses all admin functionality.
 * This is a placeholder that references the existing admin components.
 * 
 * For now, this redirects to the existing AdminDashboard page.
 * Future refactoring should move admin functionality here.
 */

import React, { useState } from 'react';
import { 
  Users, 
  BarChart3, 
  Settings as SettingsIcon, 
  Mail,
  Shield,
  Activity
} from 'lucide-react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('overview');

  const adminTabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'emails', label: 'Emails', icon: Mail },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System', icon: Activity },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-cyan-400" />
          Admin Panel
        </h2>
        <a 
          href="/admin"
          className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          Open Full Admin Dashboard →
        </a>
      </div>

      {/* Admin Sub-tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-4">
        {adminTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all
                ${isActive 
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
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

      {/* Quick Stats */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1e3a5f]/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Users</p>
                <p className="text-white text-xl font-bold">-</p>
              </div>
            </div>
          </div>
          <div className="bg-[#1e3a5f]/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Active Today</p>
                <p className="text-white text-xl font-bold">-</p>
              </div>
            </div>
          </div>
          <div className="bg-[#1e3a5f]/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Emails Sent</p>
                <p className="text-white text-xl font-bold">-</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placeholder content */}
      <div className="bg-[#1e3a5f]/30 rounded-lg p-8 border border-dashed border-gray-600 text-center">
        <p className="text-gray-400">
          Admin functionality is available in the{' '}
          <a href="/admin" className="text-cyan-400 hover:underline">
            full Admin Dashboard
          </a>
        </p>
        <p className="text-gray-500 text-sm mt-2">
          This panel will be enhanced with inline admin features in future updates.
        </p>
      </div>
    </div>
  );
}
