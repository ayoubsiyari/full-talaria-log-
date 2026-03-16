import React, { useState } from 'react';
import { useProfile } from '../context/ProfileContext';
import { API_BASE_URL } from '../config';
import { Edit, Trash2, Save, XCircle, TestTube2, BookCopy, BookUp, ShieldCheck } from 'lucide-react';

const profileModeConfig = {
  backtest: {
    icon: <TestTube2 size={18} className="text-primary-500" />,
    label: 'Backtest',
    borderColor: 'border-primary-500',
  },
  journal: {
    icon: <BookCopy size={18} className="text-amber-500" />,
    label: 'Journal',
    borderColor: 'border-amber-500',
  },
  journal_live: {
    icon: <BookUp size={18} className="text-emerald-500" />,
    label: 'Journal Live',
    borderColor: 'border-emerald-500',
  },
};

export default function ProfileManager() {
  const { profiles, activeProfile, deleteProfile, refreshProfiles } = useProfile();
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [profileData, setProfileData] = useState({ name: '', description: '', mode: 'journal' });
  const [profileToDelete, setProfileToDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEdit = (profile) => {
    setEditingProfileId(profile.id);
    setProfileData({ name: profile.name, description: profile.description || '', mode: profile.mode || 'journal' });
  };

  const handleCancel = () => {
    setEditingProfileId(null);
    setError('');
  };

  const handleSave = async (profileId) => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('token');

    console.log('Attempting to save profile with ID:', profileId, 'and data:', profileData);

    try {
      const response = await fetch(`${API_BASE_URL}/profile/profiles/${profileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileData.name,
          description: profileData.description,
          mode: profileData.mode,
        }),
      });

      const responseData = await response.json();
      console.log('Server response:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update profile');
      }

      // On success, force a hard refresh to ensure all components get the new data
      window.location.reload();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (profileId) => {
    setProfileToDelete(profileId);
  };

  const confirmDelete = async () => {
    if (!profileToDelete) return;
    setError('');
    try {
      await deleteProfile(profileToDelete);
      setProfileToDelete(null); // Close modal on success
    } catch (err) {
      setError(err.message);
      setProfileToDelete(null); // Close modal on error too
    }
  };

  const cancelDelete = () => {
    setProfileToDelete(null);
  };

  return (
    <div className="bg-theme-bg-light dark:bg-theme-bg-dark p-6 rounded-lg shadow-lg text-theme-text-primary-light dark:text-theme-text-primary-dark">
      <h2 className="text-3xl font-bold mb-6 text-center">Manage Profiles</h2>
      {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4 text-center">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((profile) => {
          const modeKey = profile.mode ? profile.mode.toLowerCase() : '';
          const mode = profileModeConfig[modeKey] || { label: 'Unknown', icon: null, borderColor: 'border-gray-500' };
          const isActive = activeProfile?.id === profile.id;

          return (
            <div 
              key={profile.id} 
              className={`bg-theme-card-bg-light dark:bg-theme-card-bg-dark rounded-lg shadow-md transition-all duration-300 flex flex-col border-l-4 ${mode.borderColor} ${isActive ? 'ring-2 ring-offset-2 ring-offset-theme-bg-light dark:ring-offset-theme-bg-dark ring-emerald-500' : ''}`}>
              
              {editingProfileId === profile.id ? (
                // EDITING VIEW
                <div className="p-4 flex-grow flex flex-col">
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    className="w-full p-2 rounded-md bg-theme-input-bg-light dark:bg-theme-input-bg-dark border border-theme-input-border-light dark:border-theme-input-border-dark text-lg font-bold text-theme-text-primary-light dark:text-theme-text-primary-dark"
                  />
                  <textarea
                    value={profileData.description}
                    onChange={(e) => setProfileData({ ...profileData, description: e.target.value })}
                    placeholder="Enter a description..."
                    className="w-full p-2 mt-2 border border-theme-divider-light dark:border-theme-divider-dark rounded-md bg-theme-input-bg-light dark:bg-theme-input-bg-dark focus:ring-2 focus:ring-primary-500 transition-colors flex-grow"
                    rows="3"
                  />
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-theme-text-secondary-light dark:text-theme-text-secondary-dark mb-1">Profile Mode</label>
                    <select
                      value={profileData.mode}
                      onChange={(e) => setProfileData({ ...profileData, mode: e.target.value })}
                      className="w-full p-2 border border-theme-divider-light dark:border-theme-divider-dark rounded-md bg-theme-input-bg-light dark:bg-theme-input-bg-dark focus:ring-2 focus:ring-primary-500 transition-colors"
                    >
                      <option value="journal">Journal</option>
                      <option value="backtest">Backtest</option>
                      <option value="journal_live">Journal Live</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end space-x-2 mt-4">
                    <button onClick={() => handleSave(profile.id)} disabled={loading} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900 rounded-full disabled:opacity-50">
                      <Save size={20} />
                    </button>
                    <button onClick={handleCancel} disabled={loading} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                // DISPLAY VIEW
                <div className="p-4 flex-grow flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <div className={`flex items-center space-x-2 text-sm font-medium px-2 py-1 rounded-full bg-theme-bg-light dark:bg-theme-bg-dark`}>
                      {mode.icon}
                      <span>{mode.label}</span>
                    </div>
                    {isActive && (
                      <div className="flex items-center space-x-1 text-emerald-500 text-xs font-bold">
                        <ShieldCheck size={16} />
                        <span>ACTIVE</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-grow mb-4">
                    <h3 className="font-bold text-xl text-theme-text-primary-light dark:text-theme-text-primary-dark truncate">{profile.name}</h3>
                    <p className="text-sm text-theme-text-secondary-light dark:text-theme-text-secondary-dark h-10 overflow-hidden">{profile.description || 'No description provided.'}</p>
                  </div>
                  <div className="flex items-center justify-end space-x-2 border-t border-theme-divider-light dark:border-theme-divider-dark pt-3 mt-auto">
                    <button onClick={() => handleEdit(profile)} disabled={loading} className="p-2 text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-full disabled:opacity-50">
                      <Edit size={20} />
                    </button>
                    <button 
                      onClick={() => handleDelete(profile.id)} 
                      disabled={loading || profiles.length <= 1}
                      className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/10 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                      title={profiles.length <= 1 ? 'Cannot delete the last profile' : 'Delete profile'}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {profileToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-theme-card-bg-light dark:bg-theme-card-bg-dark p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-xl font-bold text-theme-text-primary-light dark:text-theme-text-primary-dark">Confirm Deletion</h3>
            <p className="text-theme-text-secondary-light dark:text-theme-text-secondary-dark my-4">Are you sure you want to delete this profile? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button onClick={cancelDelete} className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-600 text-theme-text-primary-light dark:text-theme-text-primary-dark hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
