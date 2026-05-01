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
  Clock,
} from 'lucide-react';
import { useProfile } from '../context/ProfileContext';
import NewProfileSelector from './NewProfileSelector';

export default function Sidebar() {
  const [profileImage, setProfileImage] = useState('');
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const { activeProfile } = useProfile();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const location = useLocation();

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
      className={`${isCollapsed ? 'w-16 shadow-lg shadow-cyan-950/50' : 'w-64 shadow-xl shadow-cyan-950/50'} sidebar-gradient border-r border-cyan-500/20 min-h-screen flex flex-col transition-[width] duration-300 ease-in-out`}
    >
      
      {!isCollapsed && (
        <div className="text-center mb-4 pt-6">
          <div className="relative inline-block">
            <div className="w-32 h-32 rounded-full border-2 border-cyan-400/40 bg-cyan-950/60 flex items-center justify-center overflow-hidden shadow-[0_0_28px_-6px_rgba(34,211,238,0.35)]">
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
        <div className="px-4 mb-4 border-b border-cyan-500/15 pb-4">
          <p className="px-3 mb-2 text-xs font-semibold text-cyan-400/75 uppercase tracking-wider">Profile</p>
          <NewProfileSelector />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-cyan-400/75 uppercase tracking-wider">Main</p>}
          {/* Dashboard */}
          {isCollapsed ? (
            <Tooltip content="Dashboard" position="right">
              <NavLink to="/dashboard" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <Activity className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/dashboard" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <Activity className="h-5 w-5" />
              <span className="font-medium ml-3">Dashboard</span>
            </NavLink>
          )}

          {/* Journal */}
          {isCollapsed ? (
            <Tooltip content="Journal" position="right">
              <NavLink to="/journal" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <FileText className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/journal" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <FileText className="h-5 w-5" />
              <span className="font-medium ml-3">Journal</span>
            </NavLink>
          )}

          {/* AI Dashboard */}
          {isCollapsed ? (
            <Tooltip content="AI Assistant" position="right">
              <NavLink to="/ai-dashboard" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <Bot className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/ai-dashboard" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <Bot className="h-5 w-5" />
              <span className="font-medium ml-3">AI Assistant</span>
            </NavLink>
          )}

          {/* Analytics */}
          {!isCollapsed ? (
            <button
              onClick={() => setAnalyticsOpen(!analyticsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-cyan-100/55 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300"
            >
              <div className="flex items-center">
                <BarChart3 className="h-5 w-5" />
                <span className="font-medium ml-3">Analytics</span>
              </div>
              {analyticsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : (
            <Tooltip content="Analytics" position="right">
              <NavLink to="/analytics" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <BarChart3 className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          )}

          {analyticsOpen && !isCollapsed && (
            <div className="ml-8 space-y-1">
              <NavLink to="/analytics/equity" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <LineChart className="h-3 w-3 mr-2 text-cyan-400" />
                Equity Curve
              </NavLink>
              <NavLink to="/analytics/calendar" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Calendar className="h-3 w-3 mr-2 text-red-400" />
                Calendar
              </NavLink>
              <NavLink to="/analytics/performance-analysis" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <TrendingUp className="h-3 w-3 mr-2 text-green-400" />
                Performance Analysis
              </NavLink>
              <NavLink to="/analytics/streaks" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Zap className="h-3 w-3 mr-2 text-yellow-400" />
                Streak Analyzer
              </NavLink>
              <NavLink to="/analytics/trade-duration" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Clock className="h-3 w-3 mr-2 text-purple-400" />
                Trade Duration
              </NavLink>
              <NavLink to="/analytics/exitanalysis" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Target className="h-3 w-3 mr-2 text-[#353089]" />
                Exit Analysis
              </NavLink>
              <NavLink to="/analytics/exitanalysis-amelioration" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Target className="h-3 w-3 mr-2 text-emerald-400" />
                Exit Analysis Amelioration
              </NavLink>
              <NavLink to="/analytics/pnl-distribution" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <PieChart className="h-3 w-3 mr-2 text-emerald-400" />
                P&L Distribution
              </NavLink>
              <NavLink to="/analytics/daily-limit-optimization" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Target className="h-3 w-3 mr-2 text-orange-400" />
                Daily Limit Optimization
              </NavLink>
              <NavLink to="/analytics/symbols" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <TargetIcon className="h-3 w-3 mr-2 text-[#1e3a8a]" />
                Symbol Analysis
              </NavLink>
              <NavLink to="/analytics/variables" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <Database className="h-3 w-3 mr-2 text-cyan-400" />
                Variables Analysis
              </NavLink>
              <NavLink to="/analytics/all-metrics" className={({ isActive }) => `flex items-center text-sm py-1 hover:underline transition-colors ${isActive ? 'text-cyan-300 font-semibold' : 'text-cyan-100/55 hover:text-cyan-200'}`}>
                <BarChart2 className="h-3 w-3 mr-2 text-cyan-400" />
                All Metrics
              </NavLink>
            </div>
          )}
        </div>
          
        <div className="mt-8 space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-cyan-400/75 uppercase tracking-wider transition-all duration-500 ease-out opacity-100">Trades</p>}
          
          {/* Trades */}
          {isCollapsed ? (
            <Tooltip content="Trades" position="right">
              <NavLink to="/trades" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <DollarSign className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/trades" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <DollarSign className="h-5 w-5" />
              <span className="font-medium ml-3 transition-all duration-500 ease-out opacity-100">Trades</span>
            </NavLink>
          )}

          {/* Import Trades */}
          {isCollapsed ? (
            <Tooltip content="Import Trades" position="right">
              <NavLink to="/import-trades" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <Upload className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/import-trades" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <Upload className="h-5 w-5" />
              <span className="font-medium ml-3">Import Trades</span>
            </NavLink>
          )}

          {/* Learn */}
          {isCollapsed ? (
            <Tooltip content="Learn" position="right">
              <NavLink to="/learn" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <GraduationCap className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/learn" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <GraduationCap className="h-5 w-5" />
              <span className="font-medium ml-3">Learn</span>
            </NavLink>
          )}

          {/* Strategies Lab (main site — outside journal SPA) */}
          {isCollapsed ? (
            <Tooltip content="Strategies Lab" position="right">
              <a
                href="/strategies-lab/"
                className="text-cyan-100/55 flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300"
              >
                <ClipboardList className="h-5 w-5" />
              </a>
            </Tooltip>
          ) : (
            <a
              href="/strategies-lab/"
              className="text-cyan-100/55 flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300"
            >
              <ClipboardList className="h-5 w-5" />
              <span className="font-medium ml-3">Strategies Lab</span>
            </a>
          )}

          {/* Notes */}
          {isCollapsed ? (
            <Tooltip content="Notes" position="right">
              <NavLink to="/notes" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <FileText className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/notes" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <FileText className="h-5 w-5" />
              <span className="font-medium ml-3">Notes</span>
            </NavLink>
          )}
        </div>

        <div className="mt-8 space-y-1">
          {!isCollapsed && <p className="px-3 text-xs font-semibold text-cyan-400/75 uppercase tracking-wider">Profile</p>}

          {/* Manage Profiles */}
          {isCollapsed ? (
            <Tooltip content="Manage Profiles" position="right">
              <NavLink to="/manage-profiles" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center justify-center px-2 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 transition-all duration-300`}>
                <User className="h-5 w-5" />
              </NavLink>
            </Tooltip>
          ) : (
            <NavLink to="/manage-profiles" className={({ isActive }) => `${isActive ? 'bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50' : 'text-cyan-100/55'} flex items-center px-3 py-2 rounded-lg hover:bg-cyan-500/10 hover:text-cyan-50 hover:translate-x-1 transition-all duration-300`}>
              <User className="h-5 w-5" />
              <span className="font-medium ml-3">Manage Profiles</span>
            </NavLink>
          )}

        </div>
      </nav>

      <div className={`${isCollapsed ? 'px-2' : 'px-4'} py-6 border-t border-cyan-500/15`}>
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

