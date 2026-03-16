// src/App.jsx
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from './components/ui/tooltip';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import PerformanceAnalysis from './pages/analytics/PerformanceAnalysis';
import StreakAnalyzer from './pages/analytics/StreakAnalyzer';
import TradeDuration from './pages/analytics/TradeDuration';
import TradeDurationSimple from './pages/analytics/TradeDurationSimple';

import Home      from './pages/Home';
import Sidebar   from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Journal   from './pages/Journal';
import Analytics from './pages/Analytics';
import Trades    from './pages/Trades';
import Settings  from './pages/Settings';
import Learn     from './pages/Learn';
import Notes from './pages/Notes';
import StrategyBuilder from './pages/StrategyBuilder';

import SymbolAnalysis from './pages/analytics/SymbolAnalysis';
import ExitAnalysisPage from './pages/analytics/ExitAnalysis';
import ExitAnalysisAmelioration from './pages/analytics/ExitAnalysisAmelioration';
import PnlDistribution from './pages/analytics/PnlDistribution';
import DailyLimitOptimization from './pages/analytics/DailyLimitOptimization';
import AllMetrics from './pages/analytics/AllMetrics';


import Equity from './pages/analytics/Equity';
import Calendar from './pages/analytics/Calendar';




import RecentTrades from './pages/analytics/RecentTrades';
import VariablesAnalysis from './pages/analytics/VariablesAnalysis';
import TopCombinationsView from './pages/analytics/TopCombinationsView';

import CombinationFilterTest from './components/CombinationFilterTest';
import FilterTest from './components/FilterTest';
import AIDashboard from './pages/AIDashboard';

import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';
import ImportTrades from './pages/ImportTrades';
import PrivacyPolicy from './pages/PrivacyPolicy';
import RefundPolicy from './pages/RefundPolicy';
import TermsOfService from './pages/TermsOfService';
import CookiePolicy from './pages/CookiePolicy';
import Disclaimer from './pages/Disclaimer';
import Legal from './pages/Legal';
import ProfileSelectionPage from './pages/ProfileSelectionPage';
import ManageProfilePage from './pages/ManageProfilePage';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import Onboarding from './pages/Onboarding';
import SubscriptionGuard from './components/SubscriptionGuard';

// Import filter components
import { FilterProvider, useFilter } from './context/FilterContext';
import { BalanceProvider } from './context/BalanceContext';
import AdvancedFilter from './components/AdvancedFilter';
import FilterToggle from './components/FilterToggle';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';
import { ProfileProvider } from './context/ProfileContext';
import { useProfile } from './context/ProfileContext';
import { Menu, Brain, Check, X, AlertCircle } from 'lucide-react';
import UnifiedHeader from './components/UnifiedHeader';

// Import feature flag components
import ProtectedRoute from './components/ProtectedRoute';
import FeatureDisabled from './components/FeatureDisabled';
import FeatureFlagManager from './components/FeatureFlagManager';
import { isFeatureEnabled, logFeatureFlags } from './config/featureFlags';



/**
 * Layout that wraps all "protected" pages (i.e. those that should show the Sidebar).
 */
function LayoutWithSidebar() {
  const { isFilterVisible, updateFilters, toggleFilterVisibility } = useFilter();
  const { toggleSidebar } = useSidebar();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <UnifiedHeader />
        {/* Top bar with Sidebar Toggle and Filter Toggle */}
        <div className="px-4 py-3 border-b border-blue-200/60 bg-white shadow-sm flex justify-between items-center">
          <button 
            onClick={toggleSidebar} 
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors duration-200"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-[#040028]" />
          </button>
          <div className="flex justify-end">
            <FilterToggle />
          </div>
        </div>
        <AdvancedFilter
          isVisible={isFilterVisible}
          onFilterChange={updateFilters}
          onToggleVisibility={toggleFilterVisibility}
        />
        
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <Routes>
            {/* Core Features */}
            <Route path="/dashboard" element={
              <ProtectedRoute feature="DASHBOARD">
                <SubscriptionGuard feature="Dashboard">
                  <Dashboard />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/journal" element={
              <ProtectedRoute feature="JOURNAL">
                <SubscriptionGuard feature="Journal">
                  <Journal />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/trades" element={
              <ProtectedRoute feature="TRADES">
                <SubscriptionGuard feature="Trades">
                  <Trades />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute feature="SETTINGS">
                <SubscriptionGuard feature="Settings">
                  <Settings />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            
            {/* Advanced Features */}
            <Route path="/ai-dashboard" element={
              <ProtectedRoute feature="AI_DASHBOARD" fallbackComponent={
                <FeatureDisabled featureName="AI Dashboard" />
              }>
                <SubscriptionGuard feature="AI Dashboard">
                  <AIDashboard />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/import-trades" element={
              <ProtectedRoute feature="IMPORT_TRADES" fallbackComponent={
                <FeatureDisabled featureName="Import Trades" />
              }>
                <SubscriptionGuard feature="Import Trades">
                  <ImportTrades />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/strategy-builder" element={
              <ProtectedRoute feature="STRATEGY_BUILDER" fallbackComponent={
                <FeatureDisabled featureName="Strategy Builder" />
              }>
                <SubscriptionGuard feature="Strategy Builder">
                  <StrategyBuilder />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/notes" element={
              <ProtectedRoute feature="NOTES" fallbackComponent={
                <FeatureDisabled featureName="Notes" />
              }>
                <Notes />
              </ProtectedRoute>
            } />
            <Route path="/learn" element={
              <ProtectedRoute feature="LEARN" fallbackComponent={
                <FeatureDisabled featureName="Learn" />
              }>
                <Learn />
              </ProtectedRoute>
            } />
            <Route path="/manage-profiles" element={
              <ProtectedRoute feature="PROFILE_MANAGEMENT" fallbackComponent={
                <FeatureDisabled featureName="Profile Management" />
              }>
                <ManageProfilePage />
              </ProtectedRoute>
            } />
            
            {/* Analytics Features */}
            <Route path="/analytics" element={
              <ProtectedRoute feature="ANALYTICS" fallbackComponent={
                <FeatureDisabled featureName="Analytics" />
              }>
                <SubscriptionGuard feature="Analytics">
                  <Analytics />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/variables" element={
              <ProtectedRoute feature="ANALYTICS_VARIABLES" fallbackComponent={
                <FeatureDisabled featureName="Variables Analysis" />
              }>
                <SubscriptionGuard feature="Variables Analysis">
                  <VariablesAnalysis />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/top-combinations" element={
              <ProtectedRoute feature="ANALYTICS_VARIABLES" fallbackComponent={
                <FeatureDisabled featureName="Top Combinations Analysis" />
              }>
                <SubscriptionGuard feature="Top Combinations">
                  <TopCombinationsView />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/exitanalysis" element={
              <ProtectedRoute feature="ANALYTICS_EXIT_ANALYSIS" fallbackComponent={
                <FeatureDisabled featureName="Exit Analysis" />
              }>
                <SubscriptionGuard feature="Exit Analysis">
                  <ExitAnalysisPage />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/exitanalysis-amelioration" element={
              <ProtectedRoute feature="ANALYTICS_EXIT_ANALYSIS" fallbackComponent={
                <FeatureDisabled featureName="Exit Analysis Amelioration" />
              }>
                <SubscriptionGuard feature="Exit Analysis">
                  <ExitAnalysisAmelioration />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />

            <Route path="/analytics/pnl-distribution" element={
              <ProtectedRoute feature="ANALYTICS_PNL_DISTRIBUTION" fallbackComponent={
                <FeatureDisabled featureName="PNL Distribution" />
              }>
                <SubscriptionGuard feature="PnL Distribution">
                  <PnlDistribution />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/daily-limit-optimization" element={
              <ProtectedRoute feature="ANALYTICS_PNL_DISTRIBUTION" fallbackComponent={
                <FeatureDisabled featureName="Daily Limit Optimization" />
              }>
                <SubscriptionGuard feature="Daily Limit Optimization">
                  <DailyLimitOptimization />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/equity" element={
              <ProtectedRoute feature="ANALYTICS_EQUITY" fallbackComponent={
                <FeatureDisabled featureName="Equity Analysis" />
              }>
                <SubscriptionGuard feature="Equity Analysis">
                  <Equity />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/calendar" element={
              <ProtectedRoute feature="ANALYTICS_CALENDAR" fallbackComponent={
                <FeatureDisabled featureName="Calendar Analysis" />
              }>
                <SubscriptionGuard feature="Calendar">
                  <Calendar />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/recent-trades" element={
              <ProtectedRoute feature="ANALYTICS_RECENT_TRADES" fallbackComponent={
                <FeatureDisabled featureName="Recent Trades" />
              }>
                <SubscriptionGuard feature="Recent Trades">
                  <RecentTrades />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/symbols" element={
              <ProtectedRoute feature="ANALYTICS_SYMBOL_ANALYSIS" fallbackComponent={
                <FeatureDisabled featureName="Symbol Analysis" />
              }>
                <SubscriptionGuard feature="Symbol Analysis">
                  <SymbolAnalysis />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/performance-analysis" element={
              <ProtectedRoute feature="ANALYTICS_PERFORMANCE" fallbackComponent={
                <FeatureDisabled featureName="Performance Analysis" />
              }>
                <SubscriptionGuard feature="Performance Analysis">
                  <PerformanceAnalysis />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/streaks" element={
              <ProtectedRoute feature="ANALYTICS_STREAKS" fallbackComponent={
                <FeatureDisabled featureName="Streak Analysis" />
              }>
                <SubscriptionGuard feature="Streak Analysis">
                  <StreakAnalyzer />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/trade-duration" element={
              <ProtectedRoute feature="ANALYTICS_TRADE_DURATION" fallbackComponent={
                <FeatureDisabled featureName="Trade Duration Analysis" />
              }>
                <SubscriptionGuard feature="Trade Duration">
                  <TradeDuration />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/trade-duration-simple" element={
              <ProtectedRoute feature="ANALYTICS_TRADE_DURATION" fallbackComponent={
                <FeatureDisabled featureName="Trade Duration Analysis" />
              }>
                <SubscriptionGuard feature="Trade Duration">
                  <TradeDurationSimple />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            <Route path="/analytics/all-metrics" element={
              <ProtectedRoute feature="ANALYTICS_ALL_METRICS" fallbackComponent={
                <FeatureDisabled featureName="All Metrics" />
              }>
                <SubscriptionGuard feature="All Metrics">
                  <AllMetrics />
                </SubscriptionGuard>
              </ProtectedRoute>
            } />
            
            {/* Test/Development Features */}
            <Route path="/test-combinations" element={
              <ProtectedRoute feature="TEST_COMBINATIONS" fallbackComponent={
                <FeatureDisabled featureName="Test Combinations" />
              }>
                <CombinationFilterTest />
              </ProtectedRoute>
            } />
            <Route path="/test-filter" element={
              <ProtectedRoute feature="TEST_FILTER" fallbackComponent={
                <FeatureDisabled featureName="Test Filter" />
              }>
                <FilterTest />
              </ProtectedRoute>
            } />
            
            {/* Admin Features */}
            <Route path="/admin/feature-flags" element={
              <ProtectedRoute feature="ADMIN_PANEL" fallbackComponent={
                <FeatureDisabled featureName="Admin Panel" />
              }>
                <FeatureFlagManager />
              </ProtectedRoute>
            } />
            
            {/* If none of the above match under "protected," redirect to /dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

/**
 * Decides which layout to render based on the current path.
 * - "public" routes (/, /login, /register) show only the Navbar + page (no Sidebar).
 * - All other routes render LayoutWithSidebar (sidebar + their respective pages).
 */
function ProtectedLayout() {
  const { token, isInitialized } = useAuth();
  const { activeProfile, loading, error } = useProfile();
  
  // Check if this is an admin login session
  const isAdminLoginSession = localStorage.getItem('admin_login_session') === 'true';

  console.log('🔍 ProtectedLayout - token:', !!token, 'isInitialized:', isInitialized, 'loading:', loading, 'activeProfile:', !!activeProfile, 'error:', error, 'isAdminLoginSession:', isAdminLoginSession);

  if (!isInitialized || loading) {
    console.log('🔄 ProtectedLayout - Showing loading screen (auth initializing or profiles loading)');
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-[#040028] font-medium">Loading...</div>
      </div>
    );
  }

  // If there's an error and no active profile, show the profile selection page
  if (error && !activeProfile) {
    console.log('⚠️ ProtectedLayout - Error loading profiles, showing profile selection');
    return (
      <Routes>
        <Route path="/select-profile" element={<ProfileSelectionPage />} />
        <Route path="*" element={<Navigate to="/select-profile" replace />} />
      </Routes>
    );
  }

  if (!token) {
    // Check if token exists in localStorage but not in state (timing issue)
    const localStorageToken = localStorage.getItem('token');
    if (localStorageToken && isAdminLoginSession) {
      console.log('🔄 ProtectedLayout - Token exists in localStorage but not in state, waiting for state update');
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="text-[#040028] font-medium">Initializing admin session...</div>
        </div>
      );
    }
    
    // If this is an admin login session, give it a bit more time to process
    if (isAdminLoginSession) {
      console.log('🔄 ProtectedLayout - Admin login session detected but no token yet, showing loading');
      console.log('🔍 ProtectedLayout - Checking localStorage for token:', !!localStorage.getItem('token'));
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="text-[#040028] font-medium">Initializing admin session...</div>
        </div>
      );
    }
    console.log('🔍 ProtectedLayout - No token, redirecting to homepage login');
    if (typeof window !== 'undefined') {
      window.location.replace('/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
    }
    return null;
  }

  if (!activeProfile) {
    // If no active profile, allow access only to the selection page.
    return (
      <Routes>
        <Route path="/select-profile" element={<ProfileSelectionPage />} />
        <Route path="*" element={<Navigate to="/select-profile" replace />} />
      </Routes>
    );
  }

  return <LayoutWithSidebar />;
}

function AppRoutes() {
  const location = useLocation();
  const { token, isInitialized } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();

  // Paths on which we do NOT want to render the Sidebar:
  const isPublicPath =
    // location.pathname === '/register' ||  // Temporarily disabled
    location.pathname === '/verify-email' ||
    location.pathname === '/resend-verification' ||
    location.pathname === '/features' ||
    location.pathname === '/pricing' ||
    location.pathname === '/subscription/success' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/contact' ||
    location.pathname === '/privacy-policy' ||
    location.pathname === '/refund-policy' ||
    location.pathname === '/terms' ||
    location.pathname === '/cookie-policy' ||
    location.pathname === '/disclaimer' ||
    location.pathname === '/legal'

  // Handle authenticated users visiting the home page or login page
  if (isInitialized && token && (location.pathname === '/' || location.pathname === '/login')) {
    console.log('🔍 AppRoutes - Authenticated user on home/login page, redirecting based on profile status');
    if (activeProfile) {
      console.log('🔍 AppRoutes - User has active profile, redirecting to dashboard');
      return <Navigate to="/dashboard" replace />;
    } else {
      console.log('🔍 AppRoutes - User has no active profile, redirecting to profile selection');
      return <Navigate to="/select-profile" replace />;
    }
  }

  // /login redirects to homepage login (no separate journal login page)
  if (location.pathname === '/login') {
    const dest = new URLSearchParams(location.search).get('next') || '/journal/dashboard';
    if (typeof window !== 'undefined') {
      window.location.replace('/login/?next=' + encodeURIComponent(dest));
    }
    return null;
  }

  return (
    <TooltipProvider>
      {isPublicPath || location.pathname === '/' ? (
        <div className="min-h-screen bg-slate-50">
          <div className="pt-4 px-4 bg-white shadow-sm">
            <Routes>
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/resend-verification" element={<ResendVerification />} />
              <Route path="/features" element={<Features />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/subscription/success" element={<SubscriptionSuccess />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/disclaimer" element={<Disclaimer />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/" element={<Home />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      ) : (
        <SidebarProvider>
          <ProtectedLayout />
        </SidebarProvider>
      )}
    </TooltipProvider>
  );

}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  // Log feature flags on app startup
  React.useEffect(() => {
    logFeatureFlags();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router basename="/journal">
        <TooltipProvider>
          <AuthProvider>
            <FeatureFlagsProvider>
              <ProfileProvider>
                <FilterProvider>
                  <BalanceProvider>
                    <AppRoutes />
                  </BalanceProvider>
                </FilterProvider>
              </ProfileProvider>
            </FeatureFlagsProvider>
          </AuthProvider>
        </TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
}