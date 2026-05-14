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

import Sidebar   from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Journal   from './pages/Journal';
import Analytics from './pages/Analytics';
import Trades    from './pages/Trades';
import Settings  from './pages/Settings';
import Learn     from './pages/Learn';
import Notes from './pages/Notes';

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
import AIDashboard from './pages/AIDashboard';
import StrategyBuilder from './pages/StrategyBuilder';
import Pricing from './pages/Pricing';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';
import ImportTrades from './pages/ImportTrades';
import CookiePolicy from './pages/CookiePolicy';
import ProfileSelectionPage from './pages/ProfileSelectionPage';
import ManageProfilePage from './pages/ManageProfilePage';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import Onboarding from './pages/Onboarding';
import SubscriptionRequired from './pages/SubscriptionRequired';
import SubscriptionGuard from './components/SubscriptionGuard';

// Import filter components
import { FilterProvider, useFilter } from './context/FilterContext';
import { BalanceProvider } from './context/BalanceContext';
import AdvancedFilter from './components/AdvancedFilter';
import FilterToggle from './components/FilterToggle';
import { AuthProvider, useAuth } from './context/AuthContext';
import { API_BASE_URL } from './config';
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

/** Unauthenticated users visiting /journal/ are sent to the main homepage. */
function GuestHomeRedirect() {
  useEffect(() => { window.location.replace('/'); }, []);
  return null;
}

/**
 * Layout that wraps all "protected" pages (i.e. those that should show the Sidebar).
 */
function LayoutWithSidebar() {
  const { isFilterVisible, updateFilters, toggleFilterVisibility } = useFilter();
  const { toggleSidebar } = useSidebar();
  return (
    <div className="flex min-h-screen bg-jf-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <UnifiedHeader />
        <div className="px-4 py-3 border-b border-cyan-500/15 bg-[#050a10]/90 backdrop-blur-xl flex justify-between items-center">
          <button 
            onClick={toggleSidebar} 
            className="p-2 rounded-lg border border-cyan-500/20 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-500/10 hover:border-cyan-400/35 transition-colors duration-200"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
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
        
        <div className="flex-1 overflow-y-auto bg-jf-bg relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(34,211,238,0.08),transparent_55%)]" aria-hidden />
          <div className="relative">
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
            <Route path="/strategy-builder" element={
              <ProtectedRoute feature="STRATEGY_BUILDER" fallbackComponent={
                <FeatureDisabled featureName="Strategy Builder" />
              }>
                <SubscriptionGuard feature="Strategy Builder">
                  <StrategyBuilder />
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
            <Route path="/analytics/all-metrics" element={
              <ProtectedRoute feature="ANALYTICS_ALL_METRICS" fallbackComponent={
                <FeatureDisabled featureName="All Metrics" />
              }>
                <SubscriptionGuard feature="All Metrics">
                  <AllMetrics />
                </SubscriptionGuard>
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
  const [subChecked, setSubChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  /** Bumped when the page is restored from bfcache so subscription is re-verified (avoids Back-button bypass). */
  const [accessRecheckNonce, setAccessRecheckNonce] = useState(0);

  const isAdminLoginSession = localStorage.getItem('admin_login_session') === 'true';

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted && token) setAccessRecheckNonce((n) => n + 1);
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setHasAccess(false);
      setSubChecked(false);
      return;
    }

    // Admin bypass via JWT payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.is_admin === true || payload.role === 'admin') {
        setHasAccess(true);
        setSubChecked(true);
        return;
      }
    } catch (e) { /* continue */ }

    try {
      const cu = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
      if (cu.role === 'admin') {
        setHasAccess(true);
        setSubChecked(true);
        return;
      }
    } catch (e) { /* ignore */ }

    // Do not trust localStorage for journal access — verify with the server (stale flags allowed bypass after Back).
    setHasAccess(false);
    setSubChecked(false);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/subscriptions/my-subscription`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const active = (data.has_subscription && ['active', 'trialing'].includes(data.subscription?.status)) || data.has_journal_access === true;
          setHasAccess(active);
          try {
            const cu = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
            cu.has_journal_access = active;
            localStorage.setItem('talaria_current_user', JSON.stringify(cu));
          } catch (e) { /* ignore */ }
        } else {
          setHasAccess(false);
          try {
            const cu = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
            cu.has_journal_access = false;
            localStorage.setItem('talaria_current_user', JSON.stringify(cu));
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        if (!cancelled) {
          setHasAccess(false);
          try {
            const cu = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
            cu.has_journal_access = false;
            localStorage.setItem('talaria_current_user', JSON.stringify(cu));
          } catch (err) { /* ignore */ }
        }
      } finally {
        if (!cancelled) setSubChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, accessRecheckNonce]);

  if (!isInitialized || loading || (token && !subChecked)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-jf-bg">
        <div className="text-cyan-200/45 text-sm">Loading...</div>
      </div>
    );
  }

  if (error && !activeProfile) {
    return (
      <Routes>
        <Route path="/select-profile" element={<ProfileSelectionPage />} />
        <Route path="*" element={<Navigate to="/select-profile" replace />} />
      </Routes>
    );
  }

  if (!token) {
    const localStorageToken = localStorage.getItem('token');
    if ((localStorageToken && isAdminLoginSession) || isAdminLoginSession) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-jf-bg">
          <div className="text-cyan-200/45 text-sm">Initializing session...</div>
        </div>
      );
    }
    if (typeof window !== 'undefined') {
      window.location.replace('/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
    }
    return null;
  }

  if (!activeProfile) {
    return (
      <Routes>
        <Route path="/select-profile" element={<ProfileSelectionPage />} />
        <Route path="*" element={<Navigate to="/select-profile" replace />} />
      </Routes>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/subscription-status" replace />;
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
    location.pathname === '/verify-email' ||
    location.pathname === '/resend-verification' ||
    location.pathname === '/pricing' ||
    location.pathname === '/subscription/success' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/cookie-policy' ||
    location.pathname === '/subscription-status'

  // Authenticated users on root or login → send to dashboard (ProtectedLayout handles access check)
  if (isInitialized && token && (location.pathname === '/' || location.pathname === '/login')) {
    if (activeProfile) {
      return <Navigate to="/dashboard" replace />;
    } else {
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
        <div className="min-h-screen bg-jf-bg">
          <Routes>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/resend-verification" element={<ResendVerification />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/subscription/success" element={<SubscriptionSuccess />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/subscription-status" element={<SubscriptionRequired />} />
            <Route path="/" element={<GuestHomeRedirect />} />
            <Route path="*" element={<GuestHomeRedirect />} />
          </Routes>
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