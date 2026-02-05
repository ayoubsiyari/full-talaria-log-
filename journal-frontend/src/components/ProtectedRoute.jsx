import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';

/**
 * ProtectedRoute component that checks both authentication and feature flags
 * Administrators bypass feature flag restrictions and can access all features
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - The component to render if authorized
 * @param {string} props.feature - The feature flag to check
 * @param {string} props.fallbackPath - Path to redirect to if feature is disabled
 * @param {boolean} props.requireAuth - Whether authentication is required (default: true)
 * @param {React.ReactNode} props.fallbackComponent - Component to render if feature is disabled
 */
const ProtectedRoute = ({ 
  children, 
  feature, 
  fallbackPath = '/journal', 
  requireAuth = true,
  fallbackComponent = null 
}) => {
  const { token, isInitialized, isAdmin } = useAuth();
  const { isFeatureEnabled, isLoading, hasLoadedFromBackend } = useFeatureFlags();

  // Show loading while auth or feature flags are initializing
  // TEMPORARILY DISABLED: Only check auth initialization
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-[#040028] font-medium">Loading...</div>
      </div>
    );
  }

  // Original logic (commented out for now)
  // // Also wait for feature flags to be loaded from backend to prevent race conditions
  // if (!isInitialized || isLoading || !hasLoadedFromBackend) {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen bg-slate-50">
  //       <div className="text-[#040028] font-medium">Loading...</div>
  //     </div>
  //   );
  // }

  // Check authentication if required
  if (requireAuth && !token) {
    return <Navigate to="/login" replace />;
  }

  // Check feature flag if specified (admins bypass feature restrictions)
  // TEMPORARILY DISABLED: Allow all features
  // if (feature && !isAdmin && !isFeatureEnabled(feature)) {
  //   console.log(`🚫 Feature "${feature}" is disabled for non-admin user`);
    
  //   // If custom fallback component is provided, render it
  //   if (fallbackComponent) {
  //     return fallbackComponent;
  //   }
    
  //   // Redirect to fallback path with state to show message
  //   return <Navigate to={fallbackPath} replace state={{ 
  //     featureLocked: true, 
  //     featureName: getFeatureDisplayName(feature) 
  //   }} />;
  // }

  // All checks passed, render the children
  return children;
};

// Helper function to get user-friendly feature names
const getFeatureDisplayName = (feature) => {
  const featureNames = {
    'DASHBOARD': 'Dashboard',
    'ANALYTICS': 'Analytics',
    'AI_DASHBOARD': 'AI Dashboard', 
    'TRADES': 'Trades',
    'IMPORT_TRADES': 'Import Trades',
    'ANALYTICS_OVERVIEW': 'Analytics Overview',
    'ANALYTICS_PERFORMANCE': 'Performance Analysis',
    'ANALYTICS_EQUITY': 'Equity Analysis',
    'ANALYTICS_CALENDAR': 'Calendar View',
    'ANALYTICS_EXIT_ANALYSIS': 'Exit Analysis',
    'ANALYTICS_PNL_DISTRIBUTION': 'P&L Distribution',
    'ANALYTICS_RECENT_TRADES': 'Recent Trades',
    'ANALYTICS_SYMBOL_ANALYSIS': 'Symbol Analysis',
    'ANALYTICS_STREAKS': 'Streak Analysis',
    'ANALYTICS_TRADE_DURATION': 'Trade Duration',
    'ANALYTICS_VARIABLES': 'Variables Analysis',
    'ANALYTICS_ALL_METRICS': 'All Metrics'
  };
  
  return featureNames[feature] || 'This feature';
};

export default ProtectedRoute; 