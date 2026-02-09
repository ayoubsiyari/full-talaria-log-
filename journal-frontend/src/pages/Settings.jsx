import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { countries } from '../data/countries';
import { colors, colorUtils } from '../config/colors';
import { isFeatureEnabled, FEATURE_GROUPS } from '../config/featureFlags';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import FEATURE_FLAGS from '../config/featureFlags';
import {
  User,
  Mail,
  Lock,
  Image,
  Save,
  LogOut,
  Eye,
  EyeOff,
  Camera,
  Check,
  X,
  AlertCircle,
  Crown,
  Users,
  Trash2,
  UserPlus,
  BarChart3,
  Activity,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings as SettingsIcon,
  Server,
  TrendingUp,
  RefreshCw,
  Download,
  Bell,
  Shield,
  Database,
  Plus,
  Filter,
  MoreHorizontal,
  Edit,
  Copy,
  ExternalLink,
  Zap,
  Star,
  Award,
  Target,
  Calendar,
  Clock,
  Globe,
  Wifi,
  Power,
  HardDrive,
  Cpu,
  Server as MemoryIcon,
  Phone,
  MapPin,
  CheckCircle,
  UserCheck
} from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend as ReLegend } from 'recharts';
import BulkUserImport from '../components/BulkUserImport';
import BulkEmailManager from '../components/BulkEmailManager';

export default function Settings() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState({ email: '', profileImage: '' });
  
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newSelectedCountry, setNewSelectedCountry] = useState(null);
  const [newSelectedPhoneCode, setNewSelectedPhoneCode] = useState(null);
  const [newShowCountryDropdown, setNewShowCountryDropdown] = useState(false);
  const [newShowPhoneCodeDropdown, setNewShowPhoneCodeDropdown] = useState(false);
  const [newProfileImage, setNewProfileImage] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null);
  
  // Enhanced admin state
  const [activeAdminTab, setActiveAdminTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({ page: 1, per_page: 10000, total: 0 });
  
  // Advanced admin features
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  
  // Feature flags state
  const [localFeatureFlags, setLocalFeatureFlags] = useState({});
  const [isSavingFlags, setIsSavingFlags] = useState(false);
  const [flagsMessage, setFlagsMessage] = useState('');
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all'); // 'all', 'journal', 'mentorship'
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exportFormat, setExportFormat] = useState('csv');
  const [bulkActions, setBulkActions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    uptime: 0,
    loadAverage: [0, 0, 0]
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Add state for editing user
  const [editUser, setEditUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Email count state
  const [emailPrefix, setEmailPrefix] = useState('');
  const [emailCountResult, setEmailCountResult] = useState(null);
  const [emailCountLoading, setEmailCountLoading] = useState(false);

  // Server monitoring state
  const [serverMonitoring, setServerMonitoring] = useState(null);
  const [serverMonitoringLoading, setServerMonitoringLoading] = useState(false);

  // Feature flags context
  const { refreshFeatureFlags } = useFeatureFlags();

  // Handler to open edit modal
  const handleEditUser = (user) => {
    setEditUser({ ...user });
    setShowEditModal(true);
    setEditError('');
  };

  // Handler to save user edits
  const handleSaveEditUser = async () => {
    if (!editUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: editUser.email,
          full_name: editUser.full_name,
          country: editUser.country,
          is_admin: editUser.is_admin,
          email_verified: editUser.email_verified
        })
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchUsers();
      } else {
        const data = await res.json();
        setEditError(data.error || 'Failed to update user');
      }
    } catch (err) {
      setEditError('Error updating user');
    } finally {
      setEditLoading(false);
    }
  };

  // ─── 1. On mount: fetch current profile ────────────────────────────────────────
  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setMsg('You are not logged in.');
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/auth/profile`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (res.status === 401 || res.status === 422) {
          setMsg('Invalid or expired token. Please log in again.');
          setTimeout(() => (window.location.href = '/login'), 2000);
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        setEmail(data.email || '');
        setProfileImage(data.profile_image || '');
        setPreviewImage(data.profile_image || '');
        setOriginalData({
          email: data.email || '',
          profileImage: data.profile_image || ''
        });
        
        // Check if user is admin
        const adminStatus = localStorage.getItem('is_admin') === 'true';
        setIsAdmin(adminStatus);
        
        // If admin, fetch users and admin data
        if (adminStatus) {
          fetchUsers();
          fetchDashboardData();
          fetchLogs();
          fetchSystemHealth();
          fetchServerMonitoring();
        }
        
        setMsg('');
      } catch (err) {
        console.error('Settings.jsx: fetchProfile error →', err);
        setMsg('Failed to load profile. Please try again.');
      }
    };

    fetchProfile();
  }, []);

  // ─── 2. Track "unsaved changes" ───────────────────────────────────────────────
  useEffect(() => {
    const changed =
      email !== originalData.email ||
      password.trim() !== '' ||
      profileImage !== originalData.profileImage;
    setHasChanges(changed);
  }, [email, password, profileImage, originalData]);

  // ─── 3. Handle form submission (update profile) ───────────────────────────────
  const handleSave = async (e) => {
    console.log('🔴 handleSave called');
    e.preventDefault();
    setMsg('');
    setLoading(true);

    const token = localStorage.getItem('token');
    if (!token) {
      setMsg('You must be logged in.');
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setMsg('Email cannot be empty.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        email: email.trim().toLowerCase(),
        ...(password.trim() ? { password: password.trim() } : {}),
        ...(profileImage.trim() ? { profile_image: profileImage.trim() } : {})
      };

      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        setMsg('Profile updated successfully!');
        if (payload.profile_image) {
          setPreviewImage(payload.profile_image);
        }
        setPassword('');
        setOriginalData({
          email: payload.email,
          profileImage: payload.profile_image || originalData.profileImage
        });
        // Clear success message after 3 seconds
        setTimeout(() => setMsg(''), 3000);
      } else {
        setMsg(data.error || data.msg || 'Failed to update profile.');
      }
    } catch (err) {
      console.error('Settings.jsx: update error →', err);
      setMsg('Server error while saving. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 4. Handle image URL change ───────────────────────────────────────────────
  const handleImageChange = (e) => {
    const url = e.target.value;
    setProfileImage(url);
    setPreviewImage(url);
  };

  // ─── 5. Handle logout ─────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (hasChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to logout?')) {
        return;
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('is_admin');
    window.location.href = '/login';
  };

  // ─── 6. Admin functions ───────────────────────────────────────────────────────
  const fetchUsers = async (page = 1, search = '') => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('token');
      
      // Build query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: pagination.per_page.toString()
      });
      
      if (search) {
        params.append('search', search);
      }
      
      const res = await fetch(`${API_BASE_URL}/admin/users?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        // Update pagination state from API response
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        console.error('Failed to fetch users');
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg('');

    if (!newEmail || !newPassword) {
      setMsg('Email and password are required.');
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          full_name: newFullName,
          phone: getNewPhoneWithCode(),
          country: newCountry,
          profile_image: newProfileImage,
          is_admin: newIsAdmin
        })
      });
      
      const data = await res.json();

      if (res.ok) {
        setMsg('User created successfully!');
        setNewEmail('');
        setNewPassword('');
        setNewFullName('');
        setNewPhone('');
        setNewCountry('');
        setNewSelectedCountry(null);
        setNewSelectedPhoneCode(null);
        setNewProfileImage('');
        setNewIsAdmin(false);
        fetchUsers(); // Refresh user list
      } else {
        setMsg(data.error || 'Failed to create user');
      }
    } catch (err) {
      console.error('Error creating user:', err);
      setMsg('Error creating user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    setIsDeleting(userId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        setMsg('User deleted successfully!');
        fetchUsers(); // Refresh user list
      } else {
        const data = await res.json();
        setMsg(data.error || 'Failed to delete user');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      setMsg('Error deleting user');
    } finally {
      setIsDeleting(null);
    }
  };

  const loginAsUser = async (userId) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to login as ${targetUser.email}?\n\nThis will open a new window where you can act as this user. You can close the window to return to your admin session.`
    );
    
    if (!confirmed) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/login-as`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate login token');
      }

      const data = await response.json();
      
      // Store the tokens in localStorage for the new window
      const loginData = {
        token: data.token,
        refresh_token: data.refresh_token,
        user: data.user
      };
      
      // Create a unique key for this login session
      const sessionKey = `admin_login_${Date.now()}`;
      localStorage.setItem(sessionKey, JSON.stringify(loginData));
      
      // Open new private window with the login data
      const newWindow = window.open(
        `${window.location.origin}?admin_login=${sessionKey}`,
        '_blank',
        'width=1200,height=800,scrollbars=yes,resizable=yes'
      );
      
                 if (newWindow) {
             // Clear the session key after a longer delay to ensure the new window has time to process it
             setTimeout(() => {
               localStorage.removeItem(sessionKey);
             }, 10000);
           }
      
    } catch (err) {
      setMsg(err.message);
    }
  };

  const getMessageType = () => {
    if (msg.includes('successfully')) return 'success';
    if (msg.includes('Invalid') || msg.includes('Failed') || msg.includes('error')) return 'error';
    return 'info';
  };

  // Enhanced admin functions
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/dashboard/enhanced`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/logs?limit=50`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchSystemHealth = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/system/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (err) {
      console.error('Error fetching system health:', err);
    }
  };

  const fetchServerMonitoring = async () => {
    setServerMonitoringLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/monitoring/overview`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setServerMonitoring(data);
      }
    } catch (err) {
      console.error('Error fetching server monitoring:', err);
    } finally {
      setServerMonitoringLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers(1, searchTerm);
  };

  const handlePageChange = (newPage) => {
    fetchUsers(newPage, searchTerm);
  };

  // Advanced admin functions
  const fetchSystemMetrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/system/metrics`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSystemMetrics(data);
      }
    } catch (err) {
      console.error('Error fetching system metrics:', err);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/activity?limit=10`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setRecentActivity(data.activities || []);
      }
    } catch (err) {
      console.error('Error fetching recent activity:', err);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedUsers.length === 0) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action,
          user_ids: selectedUsers
        })
      });
      
      if (res.ok) {
        setMsg(`Bulk ${action} completed successfully!`);
        setSelectedUsers([]);
        fetchUsers();
      } else {
        const data = await res.json();
        setMsg(data.error || `Failed to perform bulk ${action}`);
      }
    } catch (err) {
      setMsg(`Error performing bulk ${action}`);
    }
  };

  const exportUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/export?format=${exportFormat}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setMsg('Error exporting users');
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    setSelectedUsers(users.map(user => user.id));
  };

  const clearUserSelection = () => {
    setSelectedUsers([]);
  };

  const handleNewCountrySelect = (countryData) => {
    setNewSelectedCountry(countryData);
    setNewCountry(countryData.name);
    setNewShowCountryDropdown(false);
  };

  const handleNewPhoneCodeSelect = (countryData) => {
    setNewSelectedPhoneCode(countryData);
    setNewShowPhoneCodeDropdown(false);
  };

  const getNewPhoneWithCode = () => {
    if (newSelectedPhoneCode && newPhone) {
      return `${newSelectedPhoneCode.phoneCode}${newPhone.replace(/^0+/, '')}`;
    }
    return newPhone;
  };

  // Feature flags functions
  const handleToggleFeature = (featureName) => {
    console.log('🔄 Toggling feature:', featureName);
    console.log('📊 Current state before toggle:', localFeatureFlags);
    console.log('🔍 Feature exists in state:', featureName in localFeatureFlags);
    console.log('🔍 Current value:', localFeatureFlags[featureName]);
    
    setLocalFeatureFlags(prev => {
      const newValue = !prev[featureName];
      console.log('🔄 New value will be:', newValue);
      const newState = {
        ...prev,
        [featureName]: newValue
      };
      console.log('📊 New state after toggle:', newState);
      return newState;
    });
  };

  const handleToggleFeatureGroup = (groupName, enabled) => {
    const group = FEATURE_GROUPS[groupName];
    if (!group) return;

    const updatedFlags = { ...localFeatureFlags };
    group.forEach(feature => {
      updatedFlags[feature] = enabled;
    });
    setLocalFeatureFlags(updatedFlags);
  };

  const handleSaveFeatureFlags = async () => {
    setIsSavingFlags(true);
    setFlagsMessage('');

    try {
      console.log('💾 Saving feature flags...');
      console.log('📊 Current localFeatureFlags state:', localFeatureFlags);
      
      // Prepare flags data for backend
      const flagsData = Object.entries(localFeatureFlags).map(([name, enabled]) => ({
        name,
        enabled,
        category: getFeatureCategory(name)
      }));
      
      console.log('📤 Sending flags data to backend:', flagsData);

      const response = await fetch(`${API_BASE_URL}/feature-flags/bulk`, {
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
          // Refresh global feature flags for users
          await refreshFeatureFlags();
          
          // Reload admin feature flags to ensure UI stays in sync
          const flagsResponse = await fetch(`${API_BASE_URL}/feature-flags`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (flagsResponse.ok) {
            const flagsData = await flagsResponse.json();
            if (flagsData.success && flagsData.flags) {
              // Convert array of flag objects to simple object format
              const flagsObject = {};
              flagsData.flags.forEach(flag => {
                flagsObject[flag.name] = flag.enabled;
              });
              setLocalFeatureFlags(flagsObject);
              console.log('✅ Admin feature flags reloaded after save:', flagsObject);
            }
          }
          
          setFlagsMessage('Feature flags updated successfully!');
          setTimeout(() => setFlagsMessage(''), 3000);
        } else {
          setFlagsMessage('Error: ' + (result.error || 'Unknown error'));
        }
      } else {
        setFlagsMessage('Error saving feature flags: ' + response.statusText);
      }
    } catch (error) {
      setFlagsMessage('Error saving feature flags: ' + error.message);
    } finally {
      setIsSavingFlags(false);
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

  const handleResetFeatureFlags = async () => {
    try {
      setFlagsMessage('');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/feature-flags/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Convert array of flag objects to simple object format
          const flagsObject = {};
          data.flags.forEach(flag => {
            flagsObject[flag.name] = flag.enabled;
          });
          setLocalFeatureFlags(flagsObject);
          setFlagsMessage('✅ Feature flags reset to defaults successfully!');
        } else {
          setFlagsMessage('❌ Error resetting feature flags: ' + (data.error || 'Unknown error'));
        }
      } else {
        setFlagsMessage('❌ Error resetting feature flags: ' + res.statusText);
      }
    } catch (error) {
      console.error('Error resetting feature flags:', error);
      setFlagsMessage('❌ Error resetting feature flags: ' + error.message);
    }
  };

  // Initialize feature flags
  useEffect(() => {
    if (isAdmin) {
      const initializeFlags = async () => {
        console.log('🚀 Initializing feature flags for admin...');
        try {
          // Fetch current flags from backend API
          const response = await fetch(`${API_BASE_URL}/feature-flags`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          console.log('📡 Response status:', response.status);
          
          if (response.ok) {
            const data = await response.json();
            console.log('📥 Received data:', data);
            if (data.success && data.flags) {
              // Convert array of flag objects to simple object format
              const flagsObject = {};
              data.flags.forEach(flag => {
                flagsObject[flag.name] = flag.enabled;
              });
              console.log('🔄 Converting to object format:', flagsObject);
              setLocalFeatureFlags(flagsObject);
              console.log('✅ Admin feature flags loaded from backend:', flagsObject);
            } else {
              console.warn('⚠️ No feature flags found in backend response');
              // Fall back to fetching from the static config as backup
              await refreshFeatureFlags();
              const { default: currentFlags } = await import('../config/featureFlags');
              setLocalFeatureFlags(currentFlags);
            }
          } else {
            console.warn('⚠️ Failed to fetch admin feature flags, using fallback');
            // Fall back to fetching from the static config as backup
            await refreshFeatureFlags();
            const { default: currentFlags } = await import('../config/featureFlags');
            setLocalFeatureFlags(currentFlags);
          }
        } catch (error) {
          console.error('❌ Error loading feature flags:', error);
          // Fall back to fetching from the static config as backup
          await refreshFeatureFlags();
          const { default: currentFlags } = await import('../config/featureFlags');
          setLocalFeatureFlags(currentFlags);
        }
      };
      
      initializeFlags();
    }
  }, [isAdmin]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!isAdmin || !autoRefresh) return;

    const refreshData = async () => {
      if (activeAdminTab === 'dashboard') {
        fetchDashboardData();
        fetchSystemMetrics();
      } else if (activeAdminTab === 'users') {
        fetchUsers();
      } else if (activeAdminTab === 'logs') {
        fetchLogs();
      } else if (activeAdminTab === 'health') {
        fetchSystemHealth();
      } else if (activeAdminTab === 'feature-flags') {
        // Refresh feature flags from backend
        try {
          await refreshFeatureFlags();
          // Reload admin feature flags to ensure UI stays in sync
          const flagsResponse = await fetch(`${API_BASE_URL}/feature-flags`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (flagsResponse.ok) {
            const flagsData = await flagsResponse.json();
            if (flagsData.success && flagsData.flags) {
              // Convert array of flag objects to simple object format
              const flagsObject = {};
              flagsData.flags.forEach(flag => {
                flagsObject[flag.name] = flag.enabled;
              });
              setLocalFeatureFlags(flagsObject);
            }
          }
        } catch (error) {
          console.error('Error refreshing feature flags:', error);
        }
      }
      fetchRecentActivity();
    };

    const interval = setInterval(refreshData, refreshInterval);

    return () => clearInterval(interval);
  }, [isAdmin, autoRefresh, activeAdminTab, refreshInterval]);

  // Email count function
  const handleEmailCount = async (prefix = null) => {
    const searchPrefix = prefix || emailPrefix;
    if (!searchPrefix.trim()) return;
    
    setEmailCountLoading(true);
    setEmailCountResult(null);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/admin/users/count-email-prefix?prefix=${encodeURIComponent(searchPrefix)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setEmailCountResult(data);
      } else {
        const errorData = await res.json();
        setEmailCountResult({
          prefix: searchPrefix,
          count: 0,
          sample_emails: [],
          message: `Error: ${errorData.error || res.statusText}`
        });
      }
    } catch (error) {
      console.error('Error counting users by email prefix:', error);
      setEmailCountResult({
        prefix: searchPrefix,
        count: 0,
        sample_emails: [],
        message: `Error: ${error.message}`
      });
    } finally {
      setEmailCountLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur-lg opacity-30 animate-pulse"></div>
            <div className="relative inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-2xl">
              <SettingsIcon className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mt-6 mb-3">Account Settings</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Manage your profile, security settings, and system preferences in one centralized location
          </p>
          {isAdmin && (
            <div className="mt-6 inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full text-sm font-semibold shadow-lg">
              <Crown className="w-5 h-5" />
              Administrator Dashboard Access
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            </div>
          )}
        </div>

        {/* Status Message */}
        {msg && (
          <div className="mb-8 max-w-4xl mx-auto">
            <div
              className={`p-5 rounded-2xl flex items-center gap-4 shadow-lg border-l-4 backdrop-blur-sm ${
                getMessageType() === 'success'
                  ? 'bg-emerald-50/90 border-emerald-500 text-emerald-800'
                  : getMessageType() === 'error'
                  ? 'bg-red-50/90 border-red-500 text-red-800'
                  : 'bg-blue-50/90 border-blue-500 text-blue-800'
              }`}
            >
              <div className={`p-2 rounded-full ${
                getMessageType() === 'success' ? 'bg-emerald-100' :
                getMessageType() === 'error' ? 'bg-red-100' : 'bg-blue-100'
              }`}>
                {getMessageType() === 'success' && <Check className="w-5 h-5 text-emerald-600" />}
                {getMessageType() === 'error' && <X className="w-5 h-5 text-red-600" />}
                {getMessageType() === 'info' && <AlertCircle className="w-5 h-5 text-blue-600" />}
              </div>
              <span className="font-semibold text-lg">{msg}</span>
            </div>
          </div>
        )}

        {/* Administrator Dashboard Section - Now below Profile Information */}
        {isAdmin && (
          <div className="space-y-8">
            
            {/* Admin Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-3xl shadow-2xl overflow-hidden">
              <div className="px-8 py-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/30 rounded-2xl blur-sm"></div>
                      <div className="relative bg-white/20 backdrop-blur-sm rounded-2xl p-4">
                        <Crown className="w-10 h-10 text-white" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-2">Administrator Dashboard</h2>
                      <p className="text-indigo-100 text-lg">Complete system management and monitoring</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="relative bg-white/20 backdrop-blur-sm rounded-xl p-3 text-white hover:bg-white/30 transition-all duration-300 hover:scale-110"
                    >
                      <Bell className="w-6 h-6" />
                      {notifications.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold animate-bounce">
                          {notifications.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                        autoRefresh 
                          ? 'bg-green-500/30 text-green-100 hover:bg-green-500/40' 
                          : 'bg-gray-500/30 text-gray-100 hover:bg-gray-500/40'
                      }`}
                    >
                      <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
                      {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Tabs */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
              {/* Tab Navigation */}
              <div className="flex overflow-x-auto border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                {[
                  { id: 'dashboard', label: 'Overview', icon: BarChart3, color: 'blue' },
                  { id: 'users', label: 'Users', icon: Users, color: 'green' },
                  { id: 'logs', label: 'Logs', icon: FileText, color: 'purple' },
                  { id: 'health', label: 'Health', icon: Activity, color: 'orange' },
                  { id: 'analytics', label: 'Analytics', icon: TrendingUp, color: 'indigo' },
                  { id: 'feature-flags', label: 'Feature Flags', icon: Zap, color: 'yellow' },
                  { id: 'bulk-email', label: 'Bulk Email', icon: Mail, color: 'pink' },
                  { id: 'settings', label: 'Settings', icon: SettingsIcon, color: 'gray' }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeAdminTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveAdminTab(tab.id)}
                      className={`flex items-center gap-3 px-6 py-5 text-sm font-semibold transition-all duration-300 relative whitespace-nowrap ${
                        isActive
                          ? `text-${tab.color}-600 bg-white shadow-lg border-b-4 border-${tab.color}-600`
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className={activeAdminTab === 'bulk-email' ? 'p-0' : 'p-8'}>
                {/* Dashboard Tab */}
                {activeAdminTab === 'dashboard' && (
                  <div className="space-y-8">
                    {/* Enhanced Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-blue-100 text-sm font-semibold">Total Users</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.total_users || users.length}</p>
                            <p className="text-blue-200 text-sm mt-2 flex items-center gap-1">
                              <TrendingUp className="w-4 h-4" />
                              {dashboardData?.total_users ? `${Math.round((dashboardData.total_users / Math.max(users.length, 1)) * 100)}%` : '100%'} accuracy
                            </p>
                          </div>
                          <div className="bg-blue-400/30 rounded-2xl p-4">
                            <Users className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-green-100 text-sm font-semibold">Active Users (30d)</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.active_users || 0}</p>
                            <p className="text-green-200 text-sm mt-2 flex items-center gap-1">
                              <Activity className="w-4 h-4" />
                              {dashboardData?.active_users ? `${Math.round((dashboardData.active_users / Math.max(dashboardData.total_users, 1)) * 100)}%` : '0%'} of total
                            </p>
                          </div>
                          <div className="bg-green-400/30 rounded-2xl p-4">
                            <Activity className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-purple-100 text-sm font-semibold">Total Trades</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.total_trades || 0}</p>
                            <p className="text-purple-200 text-sm mt-2 flex items-center gap-1">
                              <BarChart3 className="w-4 h-4" />
                              {dashboardData?.total_trades ? `${Math.round(dashboardData.total_trades / Math.max(dashboardData.total_users, 1))}` : '0'} per user
                            </p>
                          </div>
                          <div className="bg-purple-400/30 rounded-2xl p-4">
                            <BarChart3 className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-orange-100 text-sm font-semibold">Admin Users</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.admin_users_count || 0}</p>
                            <p className="text-orange-200 text-sm mt-2 flex items-center gap-1">
                              <Shield className="w-4 h-4" />
                              {dashboardData?.admin_users_count ? `${Math.round((dashboardData.admin_users_count / Math.max(dashboardData.total_users, 1)) * 100)}%` : '0%'} of total
                            </p>
                          </div>
                          <div className="bg-orange-400/30 rounded-2xl p-4">
                            <Shield className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Metrics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-indigo-100 text-sm font-semibold">Total Profiles</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.total_profiles || 0}</p>
                            <p className="text-indigo-200 text-sm mt-2 flex items-center gap-1">
                              <UserCheck className="w-4 h-4" />
                              {dashboardData?.total_profiles ? `${Math.round(dashboardData.total_profiles / Math.max(dashboardData.total_users, 1))}` : '0'} per user
                            </p>
                          </div>
                          <div className="bg-indigo-400/30 rounded-2xl p-4">
                            <UserCheck className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-pink-100 text-sm font-semibold">Total Journals</p>
                            <p className="text-4xl font-bold mt-2">{dashboardData?.total_journals || 0}</p>
                            <p className="text-pink-200 text-sm mt-2 flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              {dashboardData?.total_journals ? `${Math.round(dashboardData.total_journals / Math.max(dashboardData.total_users, 1))}` : '0'} per user
                            </p>
                          </div>
                          <div className="bg-pink-400/30 rounded-2xl p-4">
                            <FileText className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-teal-100 text-sm font-semibold">System Status</p>
                            <p className="text-4xl font-bold mt-2">{systemHealth?.status || 'Healthy'}</p>
                            <p className="text-teal-200 text-sm mt-2 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              {systemHealth?.database?.status || 'Connected'}
                            </p>
                          </div>
                          <div className="bg-teal-400/30 rounded-2xl p-4">
                            <CheckCircle className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-cyan-100 text-sm font-semibold">Feature Flags</p>
                            <p className="text-4xl font-bold mt-2">{Object.keys(localFeatureFlags).length}</p>
                            <p className="text-cyan-200 text-sm mt-2 flex items-center gap-1">
                              <Zap className="w-4 h-4" />
                              {Object.values(localFeatureFlags).filter(Boolean).length} enabled
                            </p>
                          </div>
                          <div className="bg-cyan-400/30 rounded-2xl p-4">
                            <Zap className="w-8 h-8" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* System Status & Quick Actions */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                      {/* System Status */}
                      <div className="xl:col-span-2 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-8">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <Activity className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">System Status</h3>
                          </div>
                          <button
                            onClick={() => {
                              fetchSystemHealth();
                              fetchSystemMetrics();
                            }}
                            className="text-blue-600 hover:text-blue-700 transition-colors p-2 rounded-lg hover:bg-blue-50"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { name: 'Database', status: 'Connected', color: 'green' },
                            { name: 'Email Service', status: 'Active', color: 'green' },
                            { name: 'API Server', status: 'Running', color: 'blue' },
                            { name: 'Frontend', status: 'Online', color: 'blue' }
                          ].map((service, index) => (
                            <div key={index} className={`flex items-center gap-4 p-4 bg-${service.color}-50 rounded-xl border border-${service.color}-100`}>
                              <div className={`w-4 h-4 bg-${service.color}-500 rounded-full ${service.color === 'green' ? 'animate-pulse' : ''}`}></div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                                <p className="text-xs text-gray-600">{service.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-8">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-3 bg-blue-100 rounded-xl">
                            <Zap className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900">Quick Actions</h3>
                        </div>
                        <div className="space-y-4">
                          {[
                            { action: () => setActiveAdminTab('users'), icon: UserPlus, label: 'Add User', desc: 'Create new account', color: 'blue' },
                            { action: exportUsers, icon: Download, label: 'Export Users', desc: 'Download user data', color: 'green' },
                            { action: () => setActiveAdminTab('logs'), icon: FileText, label: 'View Logs', desc: 'System activity', color: 'purple' },
                            { action: () => setActiveAdminTab('health'), icon: Activity, label: 'System Health', desc: 'Monitor performance', color: 'orange' },
                            { action: () => setActiveAdminTab('feature-flags'), icon: Zap, label: 'Feature Flags', desc: 'Manage features', color: 'yellow' },
                            { action: () => setActiveAdminTab('bulk-import'), icon: UserPlus, label: 'Bulk Import', desc: 'Import multiple users', color: 'indigo' },
                            { action: () => setActiveAdminTab('email-count'), icon: Mail, label: 'Email Count', desc: 'Count users by email prefix', color: 'red' }
                          ].map((item, index) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={index}
                                onClick={item.action}
                                className={`w-full flex items-center gap-4 p-4 text-left bg-${item.color}-50 hover:bg-${item.color}-100 rounded-xl transition-all duration-300 border border-${item.color}-100 hover:border-${item.color}-200 hover:scale-105`}
                              >
                                <Icon className={`w-6 h-6 text-${item.color}-600`} />
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                                  <p className="text-xs text-gray-600">{item.desc}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Real-time Monitoring Section */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      {/* System Performance */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-8">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 rounded-xl">
                              <Activity className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">System Performance</h3>
                          </div>
                          <button
                            onClick={() => {
                              fetchSystemHealth();
                              fetchSystemMetrics();
                            }}
                            className="text-blue-600 hover:text-blue-700 transition-colors p-2 rounded-lg hover:bg-blue-50"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                        </div>
                        
                        {systemMetrics ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white rounded-xl p-4 border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-600">CPU Usage</span>
                                  <span className="text-sm font-bold text-gray-900">{systemMetrics.cpu?.percent || 0}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                    style={{ width: `${systemMetrics.cpu?.percent || 0}%` }}
                                  ></div>
                                </div>
                              </div>
                              
                              <div className="bg-white rounded-xl p-4 border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-600">Memory Usage</span>
                                  <span className="text-sm font-bold text-gray-900">{systemMetrics.memory?.percent || 0}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                                    style={{ width: `${systemMetrics.memory?.percent || 0}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-white rounded-xl p-4 border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600">Disk Usage</span>
                                <span className="text-sm font-bold text-gray-900">{Math.round(systemMetrics.disk?.percent || 0)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                                  style={{ width: `${systemMetrics.disk?.percent || 0}%` }}
                                ></div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="bg-white rounded-xl p-4 border border-gray-200">
                                <div className="text-gray-600">Uptime</div>
                                <div className="font-bold text-gray-900">{systemMetrics.uptime?.formatted || 'N/A'}</div>
                              </div>
                              <div className="bg-white rounded-xl p-4 border border-gray-200">
                                <div className="text-gray-600">Load Average</div>
                                <div className="font-bold text-gray-900">
                                  {systemMetrics.load_average ? systemMetrics.load_average[0].toFixed(2) : 'N/A'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">Click refresh to load system metrics</p>
                          </div>
                        )}
                      </div>

                      {/* Recent Activity */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-8">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <Clock className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
                          </div>
                          <button
                            onClick={fetchRecentActivity}
                            className="text-green-600 hover:text-green-700 transition-colors p-2 rounded-lg hover:bg-green-50"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="space-y-4 max-h-80 overflow-y-auto">
                          {recentActivity && recentActivity.length > 0 ? (
                            recentActivity.slice(0, 10).map((activity, index) => (
                              <div key={index} className="bg-white rounded-xl p-4 border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-semibold text-gray-900">
                                        {activity.action.replace(/_/g, ' ')}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {new Date(activity.timestamp).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600">{activity.details}</p>
                                    <p className="text-xs text-gray-500 mt-1">User: {activity.user}</p>
                                  </div>
                                  <div className="ml-4">
                                    <div className={`w-2 h-2 rounded-full ${
                                      activity.action.includes('CREATE') ? 'bg-green-500' :
                                      activity.action.includes('UPDATE') ? 'bg-blue-500' :
                                      activity.action.includes('DELETE') ? 'bg-red-500' :
                                      'bg-gray-500'
                                    }`}></div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8">
                              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                              <p className="text-gray-500">No recent activity</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Create User Form */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-4 bg-blue-100 rounded-2xl">
                          <UserPlus className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900">Create New User</h3>
                          <p className="text-gray-600 text-lg">Add a new user to the system</p>
                        </div>
                      </div>
                      <form onSubmit={handleCreateUser} className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <Mail className="w-4 h-4 inline mr-2" />
                              Email Address
                            </label>
                            <input
                              type="email"
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-white"
                              placeholder="user@example.com"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <User className="w-4 h-4 inline mr-2" />
                              Full Name
                            </label>
                            <input
                              type="text"
                              value={newFullName}
                              onChange={(e) => setNewFullName(e.target.value)}
                              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-white"
                              placeholder="John Doe"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Phone Code Dropdown */}
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <Phone className="w-4 h-4 inline mr-2" />
                              Phone Code
                            </label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setNewShowPhoneCodeDropdown(!newShowPhoneCodeDropdown)}
                                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-lg bg-white hover:border-blue-500 transition-colors flex items-center justify-between"
                              >
                                <span className="text-gray-600">
                                  {newSelectedPhoneCode ? newSelectedPhoneCode.phoneCode : 'Select Code'}
                                </span>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              </button>
                              {newShowPhoneCodeDropdown && (
                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-b-xl max-h-60 overflow-y-auto shadow-lg">
                                  <div className="p-2">
                                    <input
                                      type="text"
                                      placeholder="Search codes..."
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                      onClick={e => e.stopPropagation()}
                                    />
                                  </div>
                                  {countries.map((countryData) => (
                                    <button
                                      key={countryData.code}
                                      type="button"
                                      onClick={() => handleNewPhoneCodeSelect(countryData)}
                                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-colors"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">{countryData.name}</span>
                                        <span className="text-blue-500 text-sm">{countryData.phoneCode}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Phone Number Input */}
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <Phone className="w-4 h-4 inline mr-2" />
                              Phone Number
                            </label>
                            <input
                              type="tel"
                              value={newPhone}
                              onChange={e => setNewPhone(e.target.value)}
                              className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-white"
                              placeholder="(555) 123-4567"
                            />
                          </div>
                          {/* Country Dropdown (separate) */}
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <MapPin className="w-4 h-4 inline mr-2" />
                              Country
                            </label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setNewShowCountryDropdown(!newShowCountryDropdown)}
                                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-lg bg-white hover:border-blue-500 transition-colors flex items-center justify-between"
                              >
                                <span className="text-gray-600">
                                  {newSelectedCountry ? newSelectedCountry.name : 'Select Country'}
                                </span>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              </button>
                              {newShowCountryDropdown && (
                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-b-xl max-h-60 overflow-y-auto shadow-lg">
                                  <div className="p-2">
                                    <input
                                      type="text"
                                      placeholder="Search countries..."
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                      onClick={e => e.stopPropagation()}
                                    />
                                  </div>
                                  {countries.map((countryData) => (
                                    <button
                                      key={countryData.code}
                                      type="button"
                                      onClick={() => handleNewCountrySelect(countryData)}
                                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-colors"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">{countryData.name}</span>
                                        <span className="text-blue-500 text-sm">{countryData.phoneCode}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-3">
                              <Lock className="w-4 h-4 inline mr-2" />
                              Password
                            </label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-white"
                              placeholder="Secure password"
                              required
                            />
                          </div>
                          <div className="flex items-center justify-center">
                            <div className="flex items-center gap-4 p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-yellow-300 transition-colors">
                              <input
                                id="is_admin_checkbox"
                                type="checkbox"
                                checked={newIsAdmin}
                                onChange={(e) => setNewIsAdmin(e.target.checked)}
                                className="h-6 w-6 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <label htmlFor="is_admin_checkbox" className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                                <Crown className="w-5 h-5 text-yellow-500" />
                                Grant admin privileges
                              </label>
                            </div>
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={isCreating}
                          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 px-8 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4 shadow-2xl text-lg"
                        >
                          {isCreating ? (
                            <>
                              <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent"></div>
                              Creating User...
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-6 h-6" />
                              Create New User
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* Users Tab */}
                {activeAdminTab === 'users' && (
                  <div className="space-y-6">
                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <form onSubmit={handleSearch} className="flex-1 flex gap-3">
                        <div className="flex-1 relative">
                          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search users by email..."
                            className="w-full pl-12 pr-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-white"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
                        >
                          Search
                        </button>
                      </form>
                      <div className="flex gap-3">
                        <button
                          onClick={exportUsers}
                          className="flex items-center gap-2 px-4 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold"
                        >
                          <Download className="w-5 h-5" />
                          Export
                        </button>
                        <button
                          onClick={() => setShowBulkActions(!showBulkActions)}
                          className="flex items-center gap-2 px-4 py-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-semibold"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                          Bulk
                        </button>
                      </div>
                    </div>

                    {/* User Type Filter Tabs */}
                    <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                      <button
                        onClick={() => setUserTypeFilter('all')}
                        className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                          userTypeFilter === 'all'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        All Users ({users.length})
                      </button>
                      <button
                        onClick={() => setUserTypeFilter('journal')}
                        className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                          userTypeFilter === 'journal'
                            ? 'bg-white text-green-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <FileText className="w-4 h-4" />
                          Journal ({users.filter(u => u.has_journal_access).length})
                        </span>
                      </button>
                      <button
                        onClick={() => setUserTypeFilter('mentorship')}
                        className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                          userTypeFilter === 'mentorship'
                            ? 'bg-white text-purple-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <Award className="w-4 h-4" />
                          2026 Mentorship ({users.filter(u => !u.has_journal_access).length})
                        </span>
                      </button>
                    </div>

                    {/* Users List */}
                    {loadingUsers ? (
                      <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-6"></div>
                        <p className="text-gray-500 text-lg">Loading users...</p>
                      </div>
                    ) : users.length === 0 ? (
                      <div className="text-center py-16">
                        <Users className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                        <p className="text-gray-500 text-lg">No users found.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[700px] overflow-y-auto">
                        {users
                          .filter(user => {
                            if (userTypeFilter === 'journal') return user.has_journal_access;
                            if (userTypeFilter === 'mentorship') return !user.has_journal_access;
                            return true;
                          })
                          .map(user => (
                          <div key={user.id} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-4 flex-1">
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.includes(user.id)}
                                  onChange={() => toggleUserSelection(user.id)}
                                  className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
                                />
                                
                                {/* User Avatar */}
                                <div className="flex-shrink-0">
                                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                    {user.profile_image ? (
                                      <img
                                        src={user.profile_image}
                                        alt={user.full_name || user.email}
                                        className="w-full h-full rounded-full object-cover"
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                          e.target.nextSibling.style.display = 'flex';
                                        }}
                                      />
                                    ) : null}
                                    <span className="text-lg">
                                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* User Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                                      {user.full_name || 'No Name'}
                                    </h3>
                                    {user.is_admin && (
                                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                        <Crown className="w-3 h-3" />
                                        Admin
                                      </span>
                                    )}
                                    {user.email_verified && (
                                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        Verified
                                      </span>
                                    )}
                                    {user.has_journal_access ? (
                                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        Journal
                                      </span>
                                    ) : (
                                      <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                        <Award className="w-3 h-3" />
                                        2026 Mentorship
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                                    <div className="flex items-center gap-2">
                                      <Mail className="w-4 h-4 text-gray-400" />
                                      <button
                                        onClick={() => loginAsUser(user.id)}
                                        className="text-indigo-600 hover:text-indigo-900 font-medium hover:underline truncate text-left"
                                        title="Click to login as this user"
                                      >
                                        {user.email}
                                      </button>
                                    </div>
                                    {user.phone && (
                                      <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-gray-400" />
                                        <span>{user.phone}</span>
                                      </div>
                                    )}
                                    {user.country && (
                                      <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-gray-400" />
                                        <span>{user.country}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span>Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {user.profiles_count || 0} profiles
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <TrendingUp className="w-3 h-3" />
                                      {user.trades_count || 0} trades
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Last active: {user.last_activity ? new Date(user.last_activity).toLocaleDateString() : 'Unknown'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => loginAsUser(user.id)}
                                  className="text-indigo-500 hover:text-indigo-700 transition-colors p-3 rounded-xl hover:bg-indigo-50"
                                  title="Login as user"
                                >
                                  <User className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="text-blue-500 hover:text-blue-700 transition-colors p-3 rounded-xl hover:bg-blue-50"
                                  title="Edit user"
                                >
                                  <Edit className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={isDeleting === user.id}
                                  className="text-red-500 hover:text-red-700 transition-colors p-3 rounded-xl hover:bg-red-50 disabled:opacity-50"
                                  title="Delete user"
                                >
                                  {isDeleting === user.id ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-500 border-t-transparent"></div>
                                  ) : (
                                    <Trash2 className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pagination */}
                    {pagination.total > pagination.per_page && (
                      <div className="flex items-center justify-between mt-6 p-4 bg-gray-50 rounded-xl">
                        <div className="text-sm text-gray-600">
                          Showing {((pagination.page - 1) * pagination.per_page) + 1} to {Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total} users
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="p-3 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page >= Math.ceil(pagination.total / pagination.per_page)}
                            className="p-3 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bulk Import Tab */}
                {activeAdminTab === 'bulk-import' && (
                  <div className="space-y-8">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-8 border border-indigo-200">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-4 bg-indigo-100 rounded-2xl">
                          <UserPlus className="w-8 h-8 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900">Bulk User Import</h3>
                          <p className="text-gray-600 text-lg">Import multiple users with group support</p>
                        </div>
                      </div>
                      <BulkUserImport />
                    </div>
                  </div>
                )}

                {/* Logs Tab */}
                {activeAdminTab === 'logs' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 rounded-xl">
                          <FileText className="w-6 h-6 text-purple-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">Recent Admin Logs</h3>
                      </div>
                      <button
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-semibold"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto space-y-3">
                      {logs.length === 0 ? (
                        <div className="text-center py-16">
                          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                          <p className="text-gray-500 text-lg">No logs found.</p>
                        </div>
                      ) : (
                        logs.map((log, index) => (
                          <div key={index} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-gray-900 mb-1">{log.action}</div>
                                <div className="text-xs text-gray-500">{log.timestamp}</div>
                                {log.details && (
                                  <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-100 rounded-lg">{log.details}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* System Health Tab */}
                {activeAdminTab === 'health' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-orange-100 rounded-xl">
                          <Server className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Server Monitoring</h3>
                          <p className="text-sm text-gray-500">Real-time VPS health & security</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { fetchSystemHealth(); fetchServerMonitoring(); }}
                        disabled={serverMonitoringLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${serverMonitoringLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>

                    {/* Overall Health Status */}
                    {serverMonitoring && (
                      <div className={`rounded-xl p-6 border-2 ${
                        serverMonitoring.health_status === 'healthy' ? 'bg-green-50 border-green-300' :
                        serverMonitoring.health_status === 'warning' ? 'bg-yellow-50 border-yellow-300' :
                        'bg-red-50 border-red-300'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-full ${
                              serverMonitoring.health_status === 'healthy' ? 'bg-green-200' :
                              serverMonitoring.health_status === 'warning' ? 'bg-yellow-200' :
                              'bg-red-200'
                            }`}>
                              {serverMonitoring.health_status === 'healthy' ? 
                                <CheckCircle className="w-8 h-8 text-green-600" /> :
                                <AlertCircle className="w-8 h-8 text-red-600" />
                              }
                            </div>
                            <div>
                              <p className="text-2xl font-bold capitalize">{serverMonitoring.health_status}</p>
                              <p className="text-sm text-gray-600">Last updated: {new Date(serverMonitoring.timestamp).toLocaleTimeString()}</p>
                            </div>
                          </div>
                          {serverMonitoring.issues && serverMonitoring.issues.length > 0 && (
                            <div className="text-right">
                              <p className="text-sm font-semibold text-red-600">{serverMonitoring.issues.length} Issue(s)</p>
                              {serverMonitoring.issues.map((issue, idx) => (
                                <p key={idx} className="text-xs text-red-500">{issue}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* System Resources */}
                    {serverMonitoring?.system && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Cpu className="w-5 h-5" /> System Resources
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* CPU */}
                          <div className={`rounded-xl p-5 border ${
                            serverMonitoring.system.cpu?.status === 'ok' ? 'bg-green-50 border-green-200' :
                            serverMonitoring.system.cpu?.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-gray-700">CPU</span>
                              <Cpu className="w-5 h-5 text-gray-500" />
                            </div>
                            <p className="text-3xl font-bold">{serverMonitoring.system.cpu?.percent?.toFixed(1) || 0}%</p>
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  serverMonitoring.system.cpu?.percent > 90 ? 'bg-red-500' :
                                  serverMonitoring.system.cpu?.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${serverMonitoring.system.cpu?.percent || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Memory */}
                          <div className={`rounded-xl p-5 border ${
                            serverMonitoring.system.memory?.status === 'ok' ? 'bg-green-50 border-green-200' :
                            serverMonitoring.system.memory?.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-gray-700">Memory</span>
                              <MemoryIcon className="w-5 h-5 text-gray-500" />
                            </div>
                            <p className="text-3xl font-bold">{serverMonitoring.system.memory?.percent?.toFixed(1) || 0}%</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {serverMonitoring.system.memory?.used_mb || 0} / {serverMonitoring.system.memory?.total_mb || 0} MB
                            </p>
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  serverMonitoring.system.memory?.percent > 90 ? 'bg-red-500' :
                                  serverMonitoring.system.memory?.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${serverMonitoring.system.memory?.percent || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Disk */}
                          <div className={`rounded-xl p-5 border ${
                            serverMonitoring.system.disk?.status === 'ok' ? 'bg-green-50 border-green-200' :
                            serverMonitoring.system.disk?.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-gray-700">Disk</span>
                              <HardDrive className="w-5 h-5 text-gray-500" />
                            </div>
                            <p className="text-3xl font-bold">{serverMonitoring.system.disk?.percent || '0%'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {serverMonitoring.system.disk?.used || '0'} / {serverMonitoring.system.disk?.total || '0'}
                            </p>
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  parseInt(serverMonitoring.system.disk?.percent) > 90 ? 'bg-red-500' :
                                  parseInt(serverMonitoring.system.disk?.percent) > 70 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: serverMonitoring.system.disk?.percent || '0%' }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Uptime & Load */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="w-5 h-5 text-blue-600" />
                              <span className="font-semibold text-blue-800">Uptime</span>
                            </div>
                            <p className="text-xl font-bold text-blue-900">{serverMonitoring.system.uptime || 'N/A'}</p>
                          </div>
                          <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className="w-5 h-5 text-purple-600" />
                              <span className="font-semibold text-purple-800">Load Average</span>
                            </div>
                            <p className="text-xl font-bold text-purple-900">{serverMonitoring.system.load_average || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Security Status */}
                    {serverMonitoring?.security && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Shield className="w-5 h-5" /> Security Status
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Fail2Ban */}
                          <div className={`rounded-xl p-5 border ${
                            serverMonitoring.security.fail2ban?.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-gray-700">Fail2Ban</span>
                              <Shield className={`w-5 h-5 ${serverMonitoring.security.fail2ban?.status === 'active' ? 'text-green-600' : 'text-red-600'}`} />
                            </div>
                            <p className={`text-xl font-bold capitalize ${serverMonitoring.security.fail2ban?.status === 'active' ? 'text-green-700' : 'text-red-700'}`}>
                              {serverMonitoring.security.fail2ban?.status || 'Unknown'}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                              <span className="font-semibold">{serverMonitoring.security.fail2ban?.banned_count || 0}</span> IPs banned
                            </p>
                            {serverMonitoring.security.fail2ban?.banned_ips?.length > 0 && (
                              <div className="mt-3 space-y-1">
                                {serverMonitoring.security.fail2ban.banned_ips.slice(0, 5).map((item, idx) => (
                                  <div key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                    {item.ip} ({item.jail})
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Firewall */}
                          <div className={`rounded-xl p-5 border ${
                            serverMonitoring.security.firewall?.ufw_status?.includes('active') ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-semibold text-gray-700">Firewall (UFW)</span>
                              <Wifi className={`w-5 h-5 ${serverMonitoring.security.firewall?.ufw_status?.includes('active') ? 'text-green-600' : 'text-yellow-600'}`} />
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                              {serverMonitoring.security.firewall?.ufw_status || 'Unknown'}
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                              Nginx errors today: <span className="font-semibold">{serverMonitoring.security.nginx_errors_today || 0}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Services Status */}
                    {serverMonitoring?.services && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Power className="w-5 h-5" /> Services
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {serverMonitoring.services.services?.map((service, idx) => (
                            <div key={idx} className={`rounded-xl p-4 border text-center ${
                              service.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                            }`}>
                              <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${service.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                              <p className="font-semibold text-gray-900 capitalize">{service.name}</p>
                              <p className={`text-xs ${service.ok ? 'text-green-600' : 'text-red-600'}`}>{service.status}</p>
                            </div>
                          ))}
                        </div>

                        {/* Docker Containers */}
                        {serverMonitoring.services.docker_containers?.length > 0 && (
                          <div className="mt-4">
                            <h5 className="font-semibold text-gray-700 mb-2">Docker Containers</h5>
                            <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 max-h-40 overflow-y-auto">
                              {serverMonitoring.services.docker_containers.map((container, idx) => (
                                <div key={idx}>{container}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* App Health (existing) */}
                    {systemHealth && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Database className="w-5 h-5" /> Application Health
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-green-50 rounded-xl p-5 border border-green-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className="w-5 h-5 text-green-600" />
                              <span className="font-semibold text-green-800">API Status</span>
                            </div>
                            <p className="text-xl font-bold text-green-900">{systemHealth.status || 'Healthy'}</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="w-5 h-5 text-blue-600" />
                              <span className="font-semibold text-blue-800">App Uptime</span>
                            </div>
                            <p className="text-xl font-bold text-blue-900">{systemHealth.uptime || 'N/A'}</p>
                          </div>
                          {systemHealth.database && (
                            <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Database className="w-5 h-5 text-purple-600" />
                                <span className="font-semibold text-purple-800">Database</span>
                              </div>
                              <p className="text-xl font-bold text-purple-900">{systemHealth.database.status || 'Connected'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Loading/Empty State */}
                    {!serverMonitoring && !systemHealth && (
                      <div className="text-center py-16">
                        <Server className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                        <p className="text-gray-500 text-lg">Click Refresh to load server monitoring data</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Analytics Tab */}
                {activeAdminTab === 'analytics' && (
                  <div className="text-center py-16">
                    <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Analytics Dashboard</h3>
                    <p className="text-gray-500 text-lg">Advanced analytics and reporting features coming soon.</p>
                  </div>
                )}

                {/* Email Count Tab */}
                {activeAdminTab === 'email-count' && (
                  <div className="space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Prefix Counter</h3>
                        <p className="text-gray-600">Count users whose email addresses start with specific prefixes</p>
                      </div>
                    </div>

                    {/* Email Count Form */}
                    <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-2xl p-8 border border-red-200">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-4 bg-red-100 rounded-2xl">
                          <Mail className="w-8 h-8 text-red-600" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900">Count Users by Email Prefix</h3>
                          <p className="text-gray-600 text-lg">Enter an email prefix to count matching users</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-gray-700 mb-3">
                            <Mail className="w-4 h-4 inline mr-2" />
                            Email Prefix
                          </label>
                          <input
                            type="text"
                            value={emailPrefix}
                            onChange={(e) => setEmailPrefix(e.target.value)}
                            className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 transition-all duration-300 text-lg bg-white"
                            placeholder="Enter prefix (e.g., 'w', 'test', 'admin')"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={handleEmailCount}
                            disabled={!emailPrefix.trim()}
                            className="w-full px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold text-lg"
                          >
                            Count Users
                          </button>
                        </div>
                      </div>

                      {/* Results */}
                      {emailCountResult && (
                        <div className="mt-8 bg-white rounded-xl p-6 border border-gray-200">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-green-100 rounded-xl">
                              <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                              <h4 className="text-lg font-bold text-gray-900">Count Results</h4>
                              <p className="text-gray-600">Results for prefix: <span className="font-semibold">"{emailCountResult.prefix}"</span></p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                              <div className="text-center">
                                <p className="text-green-100 text-sm font-semibold">Total Count</p>
                                <p className="text-5xl font-bold mt-2">{emailCountResult.count}</p>
                                <p className="text-green-200 text-sm mt-2">users found</p>
                              </div>
                            </div>
                            
                            <div className="bg-gray-50 rounded-xl p-6">
                              <h5 className="font-semibold text-gray-900 mb-3">Sample Emails</h5>
                              <div className="space-y-2">
                                {emailCountResult.sample_emails && emailCountResult.sample_emails.length > 0 ? (
                                  emailCountResult.sample_emails.map((email, index) => (
                                    <div key={index} className="text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border">
                                      {email}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">No sample emails available</p>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-blue-800 font-medium">{emailCountResult.message}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Count Examples */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 border border-gray-200">
                      <h4 className="text-lg font-bold text-gray-900 mb-6">Quick Count Examples</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {['w', 'test', 'admin', 'user'].map((prefix) => (
                          <button
                            key={prefix}
                            onClick={() => {
                              setEmailPrefix(prefix);
                              handleEmailCount(prefix);
                            }}
                            className="p-4 bg-white rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-all duration-300 text-center"
                          >
                            <Mail className="w-6 h-6 text-red-600 mx-auto mb-2" />
                            <p className="font-semibold text-gray-900">"{prefix}"</p>
                            <p className="text-sm text-gray-600">prefix</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Feature Flags Tab */}
                {activeAdminTab === 'feature-flags' && (
                  <div className="space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Feature Flags Management</h3>
                        <p className="text-gray-600">Control which features are visible to users</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleResetFeatureFlags}
                          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reset
                        </button>
                        <button
                          onClick={handleSaveFeatureFlags}
                          disabled={isSavingFlags}
                          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {isSavingFlags ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>

                    {/* Status Message */}
                    {flagsMessage && (
                      <div className={`p-4 rounded-lg ${
                        flagsMessage.includes('Error') 
                          ? 'bg-red-50 text-red-700 border border-red-200' 
                          : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {flagsMessage}
                      </div>
                    )}

                    {/* Feature Flags Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                        <div className="text-center">
                          <p className="text-blue-100 text-sm font-semibold">Total Flags</p>
                          <p className="text-3xl font-bold mt-2">{Object.keys(localFeatureFlags).length}</p>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                        <div className="text-center">
                          <p className="text-green-100 text-sm font-semibold">Enabled</p>
                          <p className="text-3xl font-bold mt-2">{Object.values(localFeatureFlags).filter(Boolean).length}</p>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
                        <div className="text-center">
                          <p className="text-red-100 text-sm font-semibold">Disabled</p>
                          <p className="text-3xl font-bold mt-2">{Object.values(localFeatureFlags).filter(f => !f).length}</p>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                        <div className="text-center">
                          <p className="text-purple-100 text-sm font-semibold">Groups</p>
                          <p className="text-3xl font-bold mt-2">{Object.keys(FEATURE_GROUPS).length}</p>
                        </div>
                      </div>
                    </div>

                    {/* Feature Groups */}
                    <div className="space-y-6">
                      {Object.entries(FEATURE_GROUPS).map(([groupName, features]) => (
                        <div key={groupName} className="border border-gray-200 rounded-xl p-6 bg-white/50">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-semibold text-gray-900 capitalize">
                              {groupName.replace('_', ' ')} Features
                            </h4>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleToggleFeatureGroup(groupName, true)}
                                className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200"
                              >
                                Enable All
                              </button>
                              <button
                                onClick={() => handleToggleFeatureGroup(groupName, false)}
                                className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                              >
                                Disable All
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {features.map(feature => (
                              <div key={feature} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {feature.replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {localFeatureFlags[feature] ? 'Enabled' : 'Disabled'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleToggleFeature(feature)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    localFeatureFlags[feature] ? 'bg-blue-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      localFeatureFlags[feature] ? 'translate-x-6' : 'translate-x-1'
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
                    <div className="border border-gray-200 rounded-xl p-6 bg-white/50">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Other Features</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(localFeatureFlags)
                          .filter(([feature]) => !Object.values(FEATURE_GROUPS).flat().includes(feature))
                          .map(([feature, enabled]) => (
                            <div key={feature} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
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
                )}

                {/* Bulk Email Tab */}
                {activeAdminTab === 'bulk-email' && (
                  <BulkEmailManager users={users} />
                )}

                {/* Settings Tab */}
                {activeAdminTab === 'settings' && (
                  <div className="text-center py-16">
                    <SettingsIcon className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Admin Settings</h3>
                    <p className="text-gray-500 text-lg">System configuration and admin preferences coming soon.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile Information Section - Hidden when bulk-email tab is active */}
        {!(isAdmin && activeAdminTab === 'bulk-email') && (
        <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
              {/* Card Header */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-b border-gray-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <User className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Profile Information</h2>
                      <p className="text-gray-600">Update your personal details and preferences</p>
                    </div>
                  </div>
                  {hasChanges && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                      <AlertCircle className="w-4 h-4" />
                      Unsaved Changes
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 space-y-8">
                {/* Profile Image Section */}
                <div className="text-center pb-8 border-b border-gray-100">
                  <div className="relative inline-block group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
                    <div className="relative w-40 h-40 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center justify-center overflow-hidden shadow-2xl group-hover:scale-105 transition-transform duration-300">
                      {previewImage ? (
                        <img
                          src={previewImage}
                          alt="Profile"
                          className="w-full h-full object-cover"
                          onError={() => setPreviewImage('')}
                        />
                      ) : (
                        <User className="w-20 h-20 text-white" />
                      )}
                    </div>
                    <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <p className="text-gray-500 mt-4 text-lg">Upload a photo to personalize your account</p>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Profile Image URL */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Image className="w-4 h-4 text-purple-600" />
                        </div>
                        Profile Image URL
                      </label>
                      <input
                        type="url"
                        value={profileImage}
                        onChange={handleImageChange}
                        className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-gray-50/50"
                        placeholder="https://example.com/your-photo.jpg"
                      />
                      <p className="text-sm text-gray-500 ml-1">Paste a URL to your profile image</p>
                    </div>

                    {/* Email */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Mail className="w-4 h-4 text-green-600" />
                        </div>
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-gray-50/50"
                        required
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    {/* Password */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <Lock className="w-4 h-4 text-red-600" />
                        </div>
                        New Password
                        <span className="text-xs text-gray-500 font-normal ml-2">(leave blank to keep current)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-5 py-4 pr-14 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 text-lg bg-gray-50/50"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-gray-100"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 ml-1">Must be at least 8 characters long</p>
                    </div>

                    {/* Logout Section */}
                    <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-2xl p-6 border border-red-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-100 rounded-lg">
                            <LogOut className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Sign Out</h3>
                            <p className="text-sm text-gray-600">Sign out of your account</p>
                          </div>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-300 font-semibold border border-red-200 hover:border-red-300"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || !hasChanges}
                    className={`w-full flex items-center justify-center gap-3 py-5 px-8 rounded-2xl font-bold text-lg transition-all duration-300 transform ${
                      loading || !hasChanges
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-2xl hover:shadow-3xl hover:scale-105 active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="w-6 h-6 border-3 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Saving Changes...
                      </>
                    ) : (
                      <>
                        <Save className="w-6 h-6" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Footer */}
        <div className="text-center mt-12 p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/50">
          <p className="text-gray-600 text-lg">Your data is encrypted and secure. We never share your information.</p>
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-gray-500">
            <Shield className="w-4 h-4" />
            <span>Protected by enterprise-grade security</span>
          </div>
        </div>
      </div>
      {showEditModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative">
      <button onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><X className="w-6 h-6" /></button>
      <h3 className="text-2xl font-bold mb-6 flex items-center gap-2"><Edit className="w-6 h-6 text-blue-600" /> Edit User</h3>
      {editError && <div className="mb-4 text-red-600 text-sm">{editError}</div>}
      {editUser ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Email</label>
            <input type="email" value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })} className="w-full border rounded-lg px-4 py-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Full Name</label>
            <input type="text" value={editUser.full_name || ''} onChange={e => setEditUser({ ...editUser, full_name: e.target.value })} className="w-full border rounded-lg px-4 py-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Country</label>
            <input type="text" value={editUser.country || ''} onChange={e => setEditUser({ ...editUser, country: e.target.value })} className="w-full border rounded-lg px-4 py-2" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit_is_admin" checked={!!editUser.is_admin} onChange={e => setEditUser({ ...editUser, is_admin: e.target.checked })} className="h-5 w-5" />
            <label htmlFor="edit_is_admin" className="text-sm font-semibold">Admin privileges</label>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="edit_email_verified" checked={!!editUser.email_verified} onChange={e => setEditUser({ ...editUser, email_verified: e.target.checked })} className="h-5 w-5" />
            <label htmlFor="edit_email_verified" className="text-sm font-semibold">Email Verified</label>
            {editUser.email_verified && <CheckCircle className="w-5 h-5 text-green-500 ml-1" />}
          </div>
        </div>
      ) : (
        <div className="text-gray-500">No user data loaded.</div>
      )}
      <button onClick={handleSaveEditUser} disabled={editLoading} className="mt-8 w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50">
        {editLoading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : <Edit className="w-5 h-5" />} Save Changes
      </button>
    </div>
  </div>
)}
    </div>
    
  );
}