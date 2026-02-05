import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

const FeatureFlagsContext = createContext(null);

// Default flags - fallback when API is not available
const getDefaultFlags = () => {
  const isDev = process.env.NODE_ENV === 'development';
  
  return {
    // Core Features
    DASHBOARD: false,
    JOURNAL: false,
    TRADES: false,
    SETTINGS: false,
    
    // Analytics Features
    ANALYTICS: false,
    ANALYTICS_OVERVIEW: false,
    ANALYTICS_PERFORMANCE: false,
    ANALYTICS_EQUITY: false,
    ANALYTICS_CALENDAR: false,
    ANALYTICS_EXIT_ANALYSIS: false,
    ANALYTICS_PNL_DISTRIBUTION: false,
    ANALYTICS_RECENT_TRADES: false,
    ANALYTICS_SYMBOL_ANALYSIS: false,
    ANALYTICS_STREAKS: false,
    ANALYTICS_TRADE_DURATION: false,
    ANALYTICS_VARIABLES: true,
    ANALYTICS_ALL_METRICS: false,
    
    // Advanced Features
    AI_DASHBOARD: false,
    STRATEGY_BUILDER: false,
    IMPORT_TRADES: false,
    NOTES: false,
    LEARN: false,
    PROFILE_MANAGEMENT: false,
    
    // Test/Development Features
    TEST_COMBINATIONS: isDev,
    TEST_FILTER: isDev,
    
    // Admin Features
    ADMIN_PANEL: true,
  };
};

export const FeatureFlagsProvider = ({ children }) => {
  const [featureFlags, setFeatureFlags] = useState(getDefaultFlags());
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [hasLoadedFromBackend, setHasLoadedFromBackend] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userInfo, setUserInfo] = useState({ isAdmin: false, groupId: null });

  // Fetch feature flags from backend (user-specific)
  const fetchFeatureFlags = useCallback(async () => {
    try {
      console.log('🔄 Fetching user-specific feature flags from backend...');
      
      // Get auth token
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('⚠️ No auth token, using public endpoint');
        // Fallback to public endpoint if no token
        const response = await fetch(`${API_BASE_URL}/feature-flags/public`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.flags) {
            const defaultFlags = getDefaultFlags();
            const mergedFlags = { ...defaultFlags, ...data.flags };
            setFeatureFlags(mergedFlags);
            setHasLoadedFromBackend(true);
            setLastUpdated(new Date());
            console.log('✅ Feature flags loaded from public endpoint:', mergedFlags);
            return mergedFlags;
          }
        }
        throw new Error('No auth token available');
      }
      
      // Use user-specific endpoint
      const response = await fetch(`${API_BASE_URL}/feature-flags/user`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.flags) {
          // Merge with defaults to ensure all features are covered
          const defaultFlags = getDefaultFlags();
          const mergedFlags = { ...defaultFlags, ...data.flags };
          setFeatureFlags(mergedFlags);
          setHasLoadedFromBackend(true);
          setLastUpdated(new Date());
          setUserInfo({
            isAdmin: data.is_admin || false,
            groupId: data.group_id || null
          });
          console.log('✅ User-specific feature flags loaded:', mergedFlags);
          console.log('👤 User info:', { isAdmin: data.is_admin, groupId: data.group_id });
          return mergedFlags;
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch user-specific feature flags, using defaults:', error);
    }
    
    // Fallback to defaults
    const defaultFlags = getDefaultFlags();
    setFeatureFlags(defaultFlags);
    setHasLoadedFromBackend(false);
    setUserInfo({ isAdmin: false, groupId: null });
    console.log('⚠️ Using default feature flags');
    return defaultFlags;
  }, []);

  // Initial load
  useEffect(() => {
    const loadFlags = async () => {
      setIsLoading(true);
      await fetchFeatureFlags();
      setIsLoading(false);
    };
    loadFlags();
  }, [fetchFeatureFlags]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isLoading) {
        await fetchFeatureFlags();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [fetchFeatureFlags, isLoading]);

  // Helper function to check if a feature is enabled
  const isFeatureEnabled = useCallback((featureName) => {
    // During loading or before backend flags are loaded, be more restrictive
    if (isLoading || !hasLoadedFromBackend) {
      // Only allow core features during loading
      const coreFeatures = ['DASHBOARD', 'JOURNAL', 'TRADES', 'SETTINGS'];
      return coreFeatures.includes(featureName);
    }
    
    // After backend flags are loaded, use the actual flags
    return featureFlags[featureName] === true;
  }, [featureFlags, isLoading, hasLoadedFromBackend]);

  // Helper function to get all enabled features
  const getEnabledFeatures = useCallback(() => {
    // During loading or before backend flags are loaded, only return core features
    if (isLoading || !hasLoadedFromBackend) {
      return ['DASHBOARD', 'JOURNAL', 'TRADES', 'SETTINGS'];
    }
    
    return Object.keys(featureFlags).filter(key => featureFlags[key] === true);
  }, [featureFlags, isLoading, hasLoadedFromBackend]);

  // Helper function to get all disabled features
  const getDisabledFeatures = useCallback(() => {
    // During loading or before backend flags are loaded, return all non-core features
    if (isLoading || !hasLoadedFromBackend) {
      const coreFeatures = ['DASHBOARD', 'JOURNAL', 'TRADES', 'SETTINGS'];
      return Object.keys(featureFlags).filter(key => !coreFeatures.includes(key));
    }
    
    return Object.keys(featureFlags).filter(key => featureFlags[key] === false);
  }, [featureFlags, isLoading, hasLoadedFromBackend]);

  // Manual refresh function for admin use
  const refreshFeatureFlags = useCallback(async () => {
    console.log('🔄 Manually refreshing feature flags...');
    setIsRefreshing(true);
    const flags = await fetchFeatureFlags();
    setIsRefreshing(false);
    return flags;
  }, [fetchFeatureFlags]);

  const value = {
    featureFlags,
    isLoading,
    lastUpdated,
    hasLoadedFromBackend,
    isRefreshing,
    userInfo,
    isFeatureEnabled,
    getEnabledFeatures,
    getDisabledFeatures,
    refreshFeatureFlags,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
};

export default FeatureFlagsContext;