import React, { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Settings, TrendingUp, Lock, Database, Check, X } from 'lucide-react';
import { useProfile } from '../context/ProfileContext';
import { API_BASE_URL } from '../config';

// Reusable Modal Component
const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div className="relative w-full max-w-md p-6 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl transform transition-all duration-300 ease-out scale-95 hover:scale-100">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
        <X className="w-6 h-6" />
      </button>
      {children}
    </div>
  </div>
);

// Refactored CreateProfileForm
const CreateProfileForm = ({ onSuccess, onCancel }) => {
  const { createProfile, refreshProfiles } = useProfile();
  const [formData, setFormData] = useState({ name: '', description: '', mode: 'backtest' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Profile name is required.');
      return;
    }
    setIsSubmitting(true);
    const payload = { name: formData.name, description: formData.description, mode: formData.mode };
    try {
      const token = localStorage.getItem('token');
      await createProfile(payload);
        alert('Profile created successfully!');
        onSuccess();
    } catch (err) {
      alert(`An error occurred: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 id="modal-title" className="text-2xl font-bold text-white text-center">Create a New Profile</h2>
      <div>
        <label htmlFor="profileName" className="block text-sm font-medium text-slate-300 mb-2">Profile Name</label>
        <input
          id="profileName"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          placeholder="e.g., My Swing Strategy"
          required
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-2">Description</label>
        <input
          id="description"
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          placeholder="(Optional) A brief description"
        />
      </div>
      <div>
        <label htmlFor="profileMode" className="block text-sm font-medium text-slate-300 mb-2">Profile Mode</label>
        <select
          id="profileMode"
          value={formData.mode}
          onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
        >
          <option value="backtest">Backtest</option>
          <option value="journal" disabled>Journal (Coming Soon)</option>
          <option value="journal_live" disabled>Journal Live (Coming Soon)</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">Journal and Journal Live modes are currently locked for new users</p>
      </div>
      <div className="flex items-center justify-end space-x-4 pt-4">
        <button type="button" onClick={onCancel} className="px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors font-semibold">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold">
          {isSubmitting ? 'Creating...' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
};

// Main Profile Selector Component
const NewProfileSelector = ({ className = "" }) => {
  const { profiles, activeProfile, setActiveProfile, loading, error } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  const getModeConfig = (mode) => {
    const configs = {
      backtest: { icon: TrendingUp, color: 'bg-blue-500', name: 'Backtest' },
      journal: { icon: Lock, color: 'bg-amber-500', name: 'Journal' },
      journal_live: { icon: Database, color: 'bg-emerald-500', name: 'Journal Live' },
    };
    return configs[mode] || { icon: Settings, color: 'bg-slate-500', name: 'Unknown' };
  };

  const handleProfileSelect = async (profile) => {
    try {
      await setActiveProfile(profile);
      setIsOpen(false);
    } catch (err) {
      console.error('Error selecting profile:', err);
      alert('Failed to switch profile.');
    }
  };

  const ActiveProfileIcon = activeProfile ? getModeConfig(activeProfile.mode).icon : Settings;
  const activeProfileColor = activeProfile ? getModeConfig(activeProfile.mode).color : 'bg-slate-500';

  if (loading) return <div className={`animate-pulse h-12 w-full bg-slate-700 rounded-lg ${className}`}></div>;
  if (error) return <div className={`text-red-400 text-sm p-3 bg-red-900/50 rounded-lg ${className}`}>Error: {error}</div>;

  return (
    <div className={`relative w-full ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
      >
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${activeProfileColor}`}>
            <ActiveProfileIcon className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-white">
              {activeProfile ? activeProfile.name : 'Select Profile'}
            </div>
            <div className="text-sm text-slate-400">
              {activeProfile ? getModeConfig(activeProfile.mode).name : 'No profile selected'}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden animate-fade-in-down">
          <div className="p-2 space-y-1">
            {profiles.map((profile) => {
              const { icon: Icon, color } = getModeConfig(profile.mode);
              const isActive = activeProfile && activeProfile.id === profile.id;
              return (
                <button
                  key={profile.id}
                  onClick={() => handleProfileSelect(profile)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-colors ${isActive ? 'bg-blue-600/50' : 'hover:bg-slate-700'}`}>
                  <div className="flex items-center space-x-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
                    <span className={`font-medium ${isActive ? 'text-white' : 'text-slate-200'}`}>{profile.name}</span>
                  </div>
                  {isActive && <Check className="w-5 h-5 text-blue-300" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-700 p-2 space-y-1">
            <button onClick={() => { setShowCreateModal(true); setIsOpen(false); }} className="w-full flex items-center space-x-3 px-3 py-2 text-left text-slate-300 hover:bg-slate-700 hover:text-white rounded-md transition-colors">
              <Plus className="w-5 h-5" />
              <span>Create New Profile</span>
            </button>
            <button onClick={() => { navigate('/manage-profiles'); setIsOpen(false); }} className="w-full flex items-center space-x-3 px-3 py-2 text-left text-slate-300 hover:bg-slate-700 hover:text-white rounded-md transition-colors">
              <Settings className="w-5 h-5" />
              <span>Manage Profiles</span>
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <CreateProfileForm 
            onSuccess={() => setShowCreateModal(false)} 
            onCancel={() => setShowCreateModal(false)} 
          />
        </Modal>
      )}
    </div>
  );
};

export default NewProfileSelector;
