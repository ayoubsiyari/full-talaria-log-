// Feature Flags Configuration
// This file controls which features and pages are visible to users

import { API_BASE_URL } from '../config';

// Default flags - fallback when API is not available
const getDefaultFlags = () => {
  const isDev = process.env.NODE_ENV === 'development';
  
  return {
    // Core Features
    DASHBOARD: true,
    JOURNAL: true,
    TRADES: true,
    SETTINGS: true,
    
    // Analytics Features
    ANALYTICS: true,
    ANALYTICS_OVERVIEW: true,
    ANALYTICS_PERFORMANCE: true,
    ANALYTICS_EQUITY: true,
    ANALYTICS_CALENDAR: true,
    ANALYTICS_EXIT_ANALYSIS: true,
    ANALYTICS_PNL_DISTRIBUTION: true,
    ANALYTICS_RECENT_TRADES: true,
    ANALYTICS_SYMBOL_ANALYSIS: true,
    ANALYTICS_STREAKS: true,
    ANALYTICS_TRADE_DURATION: true,
    ANALYTICS_VARIABLES: true,
    ANALYTICS_ALL_METRICS: true,
    
    // Advanced Features
    AI_DASHBOARD: true,
    STRATEGY_BUILDER: true,
    IMPORT_TRADES: true,
    NOTES: true,
    LEARN: true,
    PROFILE_MANAGEMENT: true,
    
    // Test/Development Features
    TEST_COMBINATIONS: isDev,
    TEST_FILTER: isDev,
    
    // Admin Features
    ADMIN_PANEL: true,
  };
};

// Initialize with default flags
let FEATURE_FLAGS = getDefaultFlags();

// Function to fetch feature flags from backend
export const fetchFeatureFlags = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/feature-flags/public`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.flags) {
        // Merge with defaults to ensure all features are covered
        const defaultFlags = getDefaultFlags();
        FEATURE_FLAGS = { ...defaultFlags, ...data.flags };
        console.log('🔧 Feature flags loaded from backend:', FEATURE_FLAGS);
        return FEATURE_FLAGS;
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not fetch feature flags from backend, using defaults:', error);
  }
  
  // Fallback to environment variables
  const envFlags = {
    DASHBOARD: process.env.REACT_APP_FEATURE_DASHBOARD !== 'false',
    JOURNAL: process.env.REACT_APP_FEATURE_JOURNAL !== 'false',
    TRADES: process.env.REACT_APP_FEATURE_TRADES !== 'false',
    SETTINGS: process.env.REACT_APP_FEATURE_SETTINGS !== 'false',
    ANALYTICS: process.env.REACT_APP_FEATURE_ANALYTICS !== 'false',
    AI_DASHBOARD: process.env.REACT_APP_FEATURE_AI_DASHBOARD !== 'false',
    STRATEGY_BUILDER: process.env.REACT_APP_FEATURE_STRATEGY_BUILDER !== 'false',
    IMPORT_TRADES: process.env.REACT_APP_FEATURE_IMPORT_TRADES !== 'false',
    NOTES: process.env.REACT_APP_FEATURE_NOTES !== 'false',
    LEARN: process.env.REACT_APP_FEATURE_LEARN !== 'false',
    PROFILE_MANAGEMENT: process.env.REACT_APP_FEATURE_PROFILE_MANAGEMENT !== 'false',
  };
  
  FEATURE_FLAGS = { ...getDefaultFlags(), ...envFlags };
  return FEATURE_FLAGS;
};

// Initialize feature flags on module load
fetchFeatureFlags();

// Helper function to check if a feature is enabled
export const isFeatureEnabled = (featureName) => {
  return FEATURE_FLAGS[featureName] === true;
};

// Helper function to get all enabled features
export const getEnabledFeatures = () => {
  return Object.keys(FEATURE_FLAGS).filter(key => FEATURE_FLAGS[key] === true);
};

// Helper function to get all disabled features
export const getDisabledFeatures = () => {
  return Object.keys(FEATURE_FLAGS).filter(key => FEATURE_FLAGS[key] === false);
};

// Feature groups for easier management
export const FEATURE_GROUPS = {
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

// Helper function to check if all features in a group are enabled
export const isFeatureGroupEnabled = (groupName) => {
  const group = FEATURE_GROUPS[groupName];
  if (!group) return false;
  return group.every(feature => isFeatureEnabled(feature));
};

// Helper function to enable/disable feature groups
export const setFeatureGroup = (groupName, enabled) => {
  const group = FEATURE_GROUPS[groupName];
  if (!group) return;
  
  group.forEach(feature => {
    FEATURE_FLAGS[feature] = enabled;
  });
};

// Debug function to log current feature flags
export const logFeatureFlags = () => {
  console.log('🔧 Current Feature Flags:', FEATURE_FLAGS);
  console.log('✅ Enabled Features:', getEnabledFeatures());
  console.log('❌ Disabled Features:', getDisabledFeatures());
};

// Export for use in components
export default FEATURE_FLAGS; 