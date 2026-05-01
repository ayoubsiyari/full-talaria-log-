import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';

export const ProfileContext = createContext({
  activeProfile: null,
  profiles: [],
  loading: true,
  error: null,
  setActiveProfile: async () => {},
  refreshProfiles: async () => {},
  createProfile: async () => {},
  deleteProfile: async () => {},
  profileChanged: 0,
});

export function ProfileProvider({ children }) {
  const [activeProfile, setActiveProfileState] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profileChanged, setProfileChanged] = useState(0);
  const { isAuthenticated, isInitialized, user } = useAuth();

  // Use simple localStorage keys for profiles
  const getProfileKey = () => {
    return 'talaria_activeProfile';
  };

  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  const setActiveProfile = useCallback(async (profile) => {
    if (!profile || !profile.id) {
      console.warn('❌ setActiveProfile called with invalid profile');
      return;
    }

    setLoading(true);
    try {
      const token = getAuthToken();
      const endpoint = `${API_BASE_URL}/profile/profiles/${profile.id}/activate`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to activate profile.');
      }

      const updatedProfile = { ...profile, is_active: true };
      setActiveProfileState(updatedProfile);
      
      // Store profile with simple key
      const profileKey = getProfileKey();
      localStorage.setItem(profileKey, JSON.stringify(updatedProfile));
      
      setProfiles(prev => prev.map(p => ({ ...p, is_active: p.id === profile.id })));
      setProfileChanged(c => c + 1);
    } catch (err) {
      console.error('❌ Error in setActiveProfile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    console.log('🔄 ProfileContext - fetchProfiles STARTED');
    setLoading(true);
    setError(null);

    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ ProfileContext - fetchProfiles timeout, setting loading to false');
      setLoading(false);
      setError('Request timeout - please try again');
    }, 10000); // 10 second timeout

    try {
      const token = getAuthToken();
      console.log('🔍 ProfileContext - Token exists:', !!token);
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }

      const endpoint = `${API_BASE_URL}/profile/profiles`;
      console.log('🔍 ProfileContext - Fetching from endpoint:', endpoint);
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('🔍 ProfileContext - Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
        console.error('❌ ProfileContext - API Error:', errorData);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🔍 ProfileContext - Response data:', data);
      const userProfiles = data.profiles || [];

      console.log('✅ ProfileContext - Successfully fetched profiles:', userProfiles.length);
      setProfiles(userProfiles);

      const active = userProfiles.find(p => p.is_active);
      if (active) {
        console.log('✅ ProfileContext - Found active profile:', active.name);
        setActiveProfileState(active);
        const profileKey = getProfileKey();
        localStorage.setItem(profileKey, JSON.stringify(active));
      } else if (userProfiles.length > 0) {
        // If no profile is active, activate the first one
        console.log('🔄 ProfileContext - No active profile, activating first one:', userProfiles[0].name);
        await setActiveProfile(userProfiles[0]);
      } else {
        console.log('ℹ️ ProfileContext - No profiles found, setting activeProfile to null');
        setActiveProfileState(null);
        const profileKey = getProfileKey();
        localStorage.removeItem(profileKey);
      }
    } catch (err) {
      console.error('❌ Error in fetchProfiles:', err);
      setError(err.message);
      setProfiles([]);
      setActiveProfileState(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      console.log('🏁 ProfileContext - fetchProfiles FINISHED, loading set to false');
    }
  }, [setActiveProfile, user?.email]);

  const refreshProfiles = useCallback(async () => {
    await fetchProfiles();
  }, [fetchProfiles]);

  // Load user's profile when authentication state changes
  useEffect(() => {
    if (!isInitialized) return;

    if (isAuthenticated) {
      console.log('🔍 ProfileContext - User authenticated, fetching profiles');
      
      // Try to restore active profile from storage
      const profileKey = getProfileKey();
      const savedProfile = localStorage.getItem(profileKey);
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          setActiveProfileState(parsed);
          console.log('✅ ProfileContext - Restored saved profile');
        } catch (error) {
          console.warn('⚠️ ProfileContext - Error parsing saved profile, will fetch fresh');
          localStorage.removeItem(profileKey);
        }
      }
      
      fetchProfiles();
    } else {
      console.log('ℹ️ ProfileContext - User not authenticated, clearing profiles');
      setProfiles([]);
      setActiveProfileState(null);
      setLoading(false);
    }
  }, [isAuthenticated, isInitialized, fetchProfiles]);

  const createProfile = async (profileData) => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/profile/profiles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });
      if (!response.ok) throw new Error('Failed to create profile.');
      await refreshProfiles();
    } catch (err) {
      console.error('❌ Error in createProfile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteProfile = async (profileId) => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/profile/profiles/${profileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete profile.');
      await refreshProfiles();
    } catch (err) {
      console.error('❌ Error in deleteProfile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    activeProfile,
    profiles,
    loading,
    error,
    setActiveProfile,
    refreshProfiles,
    createProfile,
    deleteProfile,
    profileChanged,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};