import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { Settings, Users, ToggleLeft, ToggleRight, Save, RefreshCw, Shield, ChevronDown, ChevronRight } from 'lucide-react';

const GroupFeatureFlagManager = () => {
  const { isAdmin } = useAuth();
  const { refreshFeatureFlags } = useFeatureFlags();
  const [groups, setGroups] = useState([]);
  const [groupFlags, setGroupFlags] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => {
    if (isAdmin) {
      fetchGroups();
    }
  }, [isAdmin]);

  const fetchGroups = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/groups`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
        
        // Fetch feature flags for each group
        for (const group of data.groups || []) {
          await fetchGroupFeatureFlags(group.id);
        }
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGroupFeatureFlags = async (groupId) => {
    try {
      const response = await fetch(`/api/feature-flags/group/${groupId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setGroupFlags(prev => ({
          ...prev,
          [groupId]: data.flags || []
        }));
      }
    } catch (error) {
      console.error(`Error fetching flags for group ${groupId}:`, error);
    }
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleToggleFeature = (groupId, featureName, enabled) => {
    setGroupFlags(prev => ({
      ...prev,
      [groupId]: prev[groupId]?.map(flag => 
        flag.feature_name === featureName 
          ? { ...flag, enabled: !enabled }
          : flag
      ) || []
    }));
  };

  const handleSaveGroup = async (groupId) => {
    setIsSaving(true);
    setMessage('');

    try {
      const flags = groupFlags[groupId] || [];
      const flagsData = flags.map(flag => ({
        feature_name: flag.feature_name,
        enabled: flag.enabled
      }));

      const response = await fetch(`/api/feature-flags/group/${groupId}/bulk`, {
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
          setMessage(`Group feature flags updated successfully!`);
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('Error: ' + (result.error || 'Unknown error'));
        }
      } else {
        setMessage('Error saving group feature flags: ' + response.statusText);
      }
    } catch (error) {
      setMessage('Error saving group feature flags: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Only show for admins
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">Admin privileges required to manage group feature flags.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading groups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Users className="w-6 h-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Group Feature Flag Manager</h1>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={fetchGroups}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
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
            {groups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Groups Found</h3>
                <p className="text-gray-600">Create groups first to manage their feature flags.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map(group => (
                  <div key={group.id} className="border border-gray-200 rounded-lg">
                    {/* Group Header */}
                    <div 
                      className="px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleToggleGroup(group.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {expandedGroups.has(group.id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                            {group.description && (
                              <p className="text-sm text-gray-600">{group.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">
                            {groupFlags[group.id]?.length || 0} features
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveGroup(group.id);
                            }}
                            disabled={isSaving}
                            className="flex items-center px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Group Features */}
                    {expandedGroups.has(group.id) && (
                      <div className="p-4">
                        {groupFlags[group.id]?.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groupFlags[group.id].map(flag => (
                              <div key={flag.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {flag.feature_name.replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {flag.enabled ? 'Enabled' : 'Disabled'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleToggleFeature(group.id, flag.feature_name, flag.enabled)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    flag.enabled ? 'bg-blue-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      flag.enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-gray-500">No feature flags configured for this group.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupFeatureFlagManager; 