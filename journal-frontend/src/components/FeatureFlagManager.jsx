import React, { useState, useEffect } from 'react';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { useAuth } from '../context/AuthContext';
import { Settings, ToggleLeft, ToggleRight, Save, RefreshCw, Shield } from 'lucide-react';

const FeatureFlagManager = () => {
  const { isAdmin } = useAuth();
  const { featureFlags, refreshFeatureFlags, isLoading, hasLoadedFromBackend } = useFeatureFlags();
  const [localFlags, setLocalFlags] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Initialize local flags with current values from context
    if (featureFlags && Object.keys(featureFlags).length > 0) {
      setLocalFlags(featureFlags);
    }
  }, [featureFlags]);

  // Only show for admins
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">Admin privileges required to manage feature flags.</p>
        </div>
      </div>
    );
  }

  const handleToggleFeature = (featureName) => {
    setLocalFlags(prev => ({
      ...prev,
      [featureName]: !prev[featureName]
    }));
  };

  const handleToggleGroup = (groupName, enabled) => {
    const group = FEATURE_GROUPS[groupName];
    if (!group) return;

    const updatedFlags = { ...localFlags };
    group.forEach(feature => {
      updatedFlags[feature] = enabled;
    });
    setLocalFlags(updatedFlags);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage('');

    try {
      // Prepare flags data for backend
      const flagsData = Object.entries(localFlags).map(([name, enabled]) => ({
        name,
        enabled,
        category: getFeatureCategory(name)
      }));

      const response = await fetch('/api/feature-flags/bulk', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ flags: flagsData })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Refresh feature flags from backend
          await refreshFeatureFlags();
          setMessage('Feature flags updated successfully!');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('Error: ' + (result.error || 'Unknown error'));
        }
      } else {
        setMessage('Error saving feature flags: ' + response.statusText);
      }
    } catch (error) {
      setMessage('Error saving feature flags: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getFeatureCategory = (featureName) => {
    if (['DASHBOARD', 'JOURNAL', 'TRADES', 'SETTINGS'].includes(featureName)) {
      return 'core';
    } else if (featureName.startsWith('ANALYTICS')) {
      return 'analytics';
    } else if (['AI_DASHBOARD', 'STRATEGY_BUILDER', 'IMPORT_TRADES', 'NOTES', 'LEARN', 'PROFILE_MANAGEMENT'].includes(featureName)) {
      return 'advanced';
    } else if (featureName === 'ADMIN_PANEL') {
      return 'admin';
    } else if (featureName.startsWith('TEST')) {
      return 'test';
    }
    return 'other';
  };

  const handleReset = async () => {
    try {
      const response = await fetch('/api/feature-flags/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Refresh feature flags from backend
          await refreshFeatureFlags();
          setMessage('Feature flags reset to defaults');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('Error: ' + (result.error || 'Unknown error'));
        }
      } else {
        setMessage('Error resetting feature flags: ' + response.statusText);
      }
    } catch (error) {
      setMessage('Error resetting feature flags: ' + error.message);
    }
  };

  // Feature groups for easier management
  const FEATURE_GROUPS = {
    CORE: ['DASHBOARD', 'JOURNAL', 'TRADES', 'SETTINGS'],
    ANALYTICS: [
      'ANALYTICS',
      'ANALYTICS_OVERVIEW',
      'ANALYTICS_PERFORMANCE',
      'ANALYTICS_EQUITY',
      'ANALYTICS_CALENDAR',
      'ANALYTICS_EXIT_ANALYSIS',
      'ANALYTICS_PNL_DISTRIBUTION',
      'ANALYTICS_RECENT_TRADES',
      'ANALYTICS_SYMBOL_ANALYSIS',
      'ANALYTICS_STREAKS',
      'ANALYTICS_TRADE_DURATION',
      'ANALYTICS_VARIABLES',
      'ANALYTICS_ALL_METRICS'
    ],
    ADVANCED: ['AI_DASHBOARD', 'STRATEGY_BUILDER', 'IMPORT_TRADES', 'NOTES', 'LEARN', 'PROFILE_MANAGEMENT'],
    ADMIN: ['ADMIN_PANEL'],
    TEST: ['TEST_COMBINATIONS', 'TEST_FILTER']
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading feature flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Settings className="w-6 h-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Feature Flag Manager</h1>
                {hasLoadedFromBackend ? (
                  <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                    Backend Connected
                  </span>
                ) : (
                  <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded">
                    Using Defaults
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleReset}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
            {message && (
              <div className={`mt-3 p-3 rounded-md ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {message}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Feature Groups */}
            <div className="space-y-6">
              {Object.entries(FEATURE_GROUPS).map(([groupName, features]) => (
                <div key={groupName} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 capitalize">
                      {groupName.replace('_', ' ')} Features
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleGroup(groupName, true)}
                        className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200"
                      >
                        Enable All
                      </button>
                      <button
                        onClick={() => handleToggleGroup(groupName, false)}
                        className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {features.map(feature => (
                      <div key={feature} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div>
                          <p className="font-medium text-gray-900">
                            {feature.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-gray-500">
                            {localFlags[feature] ? 'Enabled' : 'Disabled'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleFeature(feature)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            localFlags[feature] ? 'bg-blue-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              localFlags[feature] ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Individual Features (not in groups) */}
            <div className="mt-8 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Other Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(localFlags)
                  .filter(([feature]) => !Object.values(FEATURE_GROUPS).flat().includes(feature))
                  .map(([feature, enabled]) => (
                    <div key={feature} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div>
                        <p className="font-medium text-gray-900">
                          {feature.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleFeature(feature)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          enabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureFlagManager; 