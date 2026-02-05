// Sidebar.jsx - with hover-based expansion and Talaria-Log brand styling
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import DarkModeToggle from './DarkModeToggle';
import { useSidebar } from '../context/SidebarContext';
import { API_BASE_URL } from '../config';
import { Tooltip } from './ui/tooltip';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Zap,
  GraduationCap,
  Upload,
  Settings,
  LogOut,
  User,
  Bot,
  PieChart,
  Calendar,
  Target,
  FileText,
  ClipboardList,
  Database,
  Activity,
  DollarSign,
  BarChart2,
  LineChart,
  Target as TargetIcon,
  Clock
} from 'lucide-react';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import NewProfileSelector from './NewProfileSelector';

export default function Sidebar() {
  const [profileImage, setProfileImage] = useState('');
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const { activeProfile } = useProfile();
  const { isAdmin } = useAuth();
  const { isFeatureEnabled, isLoading, hasLoadedFromBackend } = useFeatureFlags();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const location = useLocation();

  // Helper function to check if feature should be shown (admins bypass feature restrictions)
  const shouldShowFeature = (featureName) => {
    return isAdmin || isFeatureEnabled(featureName);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`${API_BASE_URL}/profile/profiles`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (data.profile_image) setProfileImage(data.profile_image);
      } catch (err) {
        console.error('❌ Error fetching profile:', err);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    // Auto-open Analytics if on a subpage
    if (location.pathname.startsWith('/analytics')) {
      setAnalyticsOpen(true);
    }
  }, [location.pathname]);

  return (
    <div 
      className={`${isCollapsed ? 'w-16 shadow-lg' : 'w-64 shadow-xl'} sidebar-gradient border-r border-[#3090FF]/10 min-h-screen flex flex-col transition-[width] duration-300 ease-in-out`}
    >
      
      {!isCollapsed && (
        <div className="text-center mb-4 pt-6">
          <div className="relative inline-block">
            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-[#3090FF] to-[#232CF4] flex items-center justify-center overflow-hidden shadow-[0_4px_15px_rgba(48,144,255,0.3)]">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" onError={() => setProfileImage('')} />
              ) : (
                <User className="w-16 h-16 text-white" />
              )}
            </div>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="px-4 mb-4 border-b border-[#3090FF]/10 pb-4">
          <p className="px-3 mb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">Profile</p>
          <NewProfileSelector />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-white/60 uppercase tracking-wider">Main</p>}
          {/* Dashboard */}
          {shouldShowFeature('DASHBOARD') && (
            isCollapsed ? (
              <Tooltip content="Dashboard" position="right">
                <NavLink to="/dashboard" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <Activity className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/dashboard" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <Activity className="h-5 w-5" />
                <span className="font-medium ml-3">Dashboard</span>
              </NavLink>
            )
          )}

          {/* Journal */}
          {shouldShowFeature('JOURNAL') && (
            isCollapsed ? (
              <Tooltip content="Journal" position="right">
                <NavLink to="/journal" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <FileText className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/journal" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <FileText className="h-5 w-5" />
                <span className="font-medium ml-3">Journal</span>
              </NavLink>
            )
          )}

          {/* AI Dashboard */}
          {shouldShowFeature('AI_DASHBOARD') && (
            isCollapsed ? (
              <Tooltip content="AI Assistant" position="right">
                <NavLink to="/ai-dashboard" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <Bot className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/ai-dashboard" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <Bot className="h-5 w-5" />
                <span className="font-medium ml-3">AI Assistant</span>
              </NavLink>
            )
          )}

          {/* Analytics */}
          {shouldShowFeature('ANALYTICS') && (
            !isCollapsed ? (
              <button
                onClick={() => setAnalyticsOpen(!analyticsOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-white/70 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300"
              >
                <div className="flex items-center">
                  <BarChart3 className="h-5 w-5" />
                  <span className="font-medium ml-3">Analytics</span>
                </div>
                {analyticsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            ) : (
              <Tooltip content="Analytics" position="right">
                <NavLink to="/analytics" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <BarChart3 className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            )
          )}

          {analyticsOpen && !isCollapsed && (
            <div className="ml-8 space-y-1">
              {shouldShowFeature('ANALYTICS_EQUITY') && (
                <NavLink to="/analytics/equity" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <LineChart className="h-3 w-3 mr-2 text-[#5FACF9]" />
                  Equity Curve
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_CALENDAR') && (
                <NavLink to="/analytics/calendar" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Calendar className="h-3 w-3 mr-2 text-red-400" />
                  Calendar
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_PERFORMANCE') && (
                <NavLink to="/analytics/performance-analysis" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <TrendingUp className="h-3 w-3 mr-2 text-green-400" />
                  Performance Analysis
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_STREAKS') && (
                <NavLink to="/analytics/streaks" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Zap className="h-3 w-3 mr-2 text-yellow-400" />
                  Streak Analyzer
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_TRADE_DURATION') && (
                <NavLink to="/analytics/trade-duration" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Clock className="h-3 w-3 mr-2 text-purple-400" />
                  Trade Duration
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_EXIT_ANALYSIS') && (
                <NavLink to="/analytics/exitanalysis" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Target className="h-3 w-3 mr-2 text-[#353089]" />
                  Exit Analysis
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_EXIT_ANALYSIS') && (
                <NavLink to="/analytics/exitanalysis-amelioration" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Target className="h-3 w-3 mr-2 text-emerald-400" />
                  Exit Analysis Amelioration
                </NavLink>
              )}

              {shouldShowFeature('ANALYTICS_PNL_DISTRIBUTION') && (
                <NavLink to="/analytics/pnl-distribution" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <PieChart className="h-3 w-3 mr-2 text-emerald-400" />
                  P&L Distribution
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_PNL_DISTRIBUTION') && (
                <NavLink to="/analytics/daily-limit-optimization" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Target className="h-3 w-3 mr-2 text-orange-400" />
                  Daily Limit Optimization
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_SYMBOL_ANALYSIS') && (
                <NavLink to="/analytics/symbols" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <TargetIcon className="h-3 w-3 mr-2 text-[#232CF4]" />
                  Symbol Analysis
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_VARIABLES') && (
                <NavLink to="/analytics/variables" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <Database className="h-3 w-3 mr-2 text-cyan-400" />
                  Variables Analysis
                </NavLink>
              )}
              {shouldShowFeature('ANALYTICS_ALL_METRICS') && (
                <NavLink to="/analytics/all-metrics" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-[#3090FF] font-semibold' : 'text-white/70 hover:text-[#5FACF9]'}`}>
                  <BarChart2 className="h-3 w-3 mr-2 text-[#3090FF]" />
                  All Metrics
                </NavLink>
              )}
            </div>
          )}
        </div>
          
        <div className="mt-8 space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-white/60 uppercase tracking-wider transition-all duration-500 ease-out opacity-100">Trades</p>}
          
          {/* Trades */}
          {shouldShowFeature('TRADES') && (
            isCollapsed ? (
              <Tooltip content="Trades" position="right">
                <NavLink to="/trades" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <DollarSign className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/trades" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <DollarSign className="h-5 w-5" />
                <span className="font-medium ml-3 transition-all duration-500 ease-out opacity-100">Trades</span>
              </NavLink>
            )
          )}

          {/* Import Trades */}
          {shouldShowFeature('IMPORT_TRADES') && (
            isCollapsed ? (
              <Tooltip content="Import Trades" position="right">
                <NavLink to="/import-trades" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <Upload className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/import-trades" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <Upload className="h-5 w-5" />
                <span className="font-medium ml-3">Import Trades</span>
              </NavLink>
            )
          )}

          {/* Learn */}
          {shouldShowFeature('LEARN') && (
            isCollapsed ? (
              <Tooltip content="Learn" position="right">
                <NavLink to="/learn" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <GraduationCap className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/learn" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <GraduationCap className="h-5 w-5" />
                <span className="font-medium ml-3">Learn</span>
              </NavLink>
            )
          )}

          {/* Strategy Builder */}
          {shouldShowFeature('STRATEGY_BUILDER') && (
            isCollapsed ? (
              <Tooltip content="Strategy Builder" position="right">
                <NavLink to="/strategy-builder" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <ClipboardList className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/strategy-builder" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <ClipboardList className="h-5 w-5" />
                <span className="font-medium ml-3">Strategy Builder</span>
              </NavLink>
            )
          )}

          {/* Notes */}
          {shouldShowFeature('NOTES') && (
            isCollapsed ? (
              <Tooltip content="Notes" position="right">
                <NavLink to="/notes" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <FileText className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/notes" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <FileText className="h-5 w-5" />
                <span className="font-medium ml-3">Notes</span>
              </NavLink>
            )
          )}
        </div>

        <div className="mt-8 space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-white/60 uppercase tracking-wider">Settings</p>}
          
          {/* Settings */}
          {shouldShowFeature('SETTINGS') && (
            isCollapsed ? (
              <Tooltip content="Settings" position="right">
                <NavLink to="/settings" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <Settings className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/settings" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <Settings className="h-5 w-5" />
                <span className="font-medium ml-3">Settings</span>
              </NavLink>
            )
          )}

          {/* Manage Profiles */}
          {shouldShowFeature('PROFILE_MANAGEMENT') && (
            isCollapsed ? (
              <Tooltip content="Manage Profiles" position="right">
                <NavLink to="/manage-profiles" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white transition-all duration-300`}>
                  <User className="h-5 w-5" />
                </NavLink>
              </Tooltip>
            ) : (
              <NavLink to="/manage-profiles" className={({ isActive }) => `${isActive ? 'bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white' : 'text-white/70'} flex items-center px-3 py-2 rounded-lg hover:bg-[#3090FF]/10 hover:text-white hover:translate-x-1 transition-all duration-300`}>
                <User className="h-5 w-5" />
                <span className="font-medium ml-3">Manage Profiles</span>
              </NavLink>
            )
          )}

        </div>
      </nav>

      <div className={`${isCollapsed ? 'px-2' : 'px-4'} py-6 border-t border-[#3090FF]/10`}>
        {isCollapsed ? (
          <Tooltip content="Logout" position="right">
            <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }} className="flex items-center justify-center w-full px-2 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
              <LogOut className="h-5 w-5" />
            </button>
          </Tooltip>
        ) : (
          <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }} className="flex items-center w-full px-3 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
            <LogOut className="h-5 w-5" />
            <span className="font-medium ml-3">Logout</span>
          </button>
        )}
      </div>
    </div>
  );
}

