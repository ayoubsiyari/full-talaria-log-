import React, { useState } from 'react';
import { useProfile } from '../context/ProfileContext';
import { useNavigate } from 'react-router-dom';
import { Briefcase, BookOpen, Zap, ArrowRight } from 'lucide-react';

const profileModes = [
  {
    key: 'backtest',
    label: 'Backtest',
    description: 'Simulate and edit trades freely.',
    icon: <Briefcase className="w-12 h-12 mx-auto mb-4 text-blue-500" />,
    locked: false,
  },
  {
    key: 'journal',
    label: 'Journal',
    description: 'Manual entry with locked trade fields.',
    icon: <BookOpen className="w-12 h-12 mx-auto mb-4 text-amber-500" />,
    locked: true,
    lockMessage: 'Coming Soon - This feature is currently locked for new users',
  },
  {
    key: 'journal_live',
    label: 'Journal Live',
    description: 'Sync trades from your broker.',
    icon: <Zap className="w-12 h-12 mx-auto mb-4 text-emerald-500" />,
    locked: true,
    lockMessage: 'Coming Soon - This feature is currently locked for new users',
  },
];

const ProfileSelectorPage = () => {
  const [step, setStep] = useState(1);
  const [selectedMode, setSelectedMode] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState('');
  const { createProfile, loading } = useProfile();
  const navigate = useNavigate();

  const handleModeSelect = (mode) => {
    if (mode.locked) {
      alert(mode.lockMessage);
      return;
    }
    setSelectedMode(mode);
    setStep(2);
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      setError('Profile name cannot be empty.');
      return;
    }
    setError('');
    try {
      await createProfile({ name: profileName, mode: selectedMode.key });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {step === 1 ? (
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">Choose a Profile Mode</h1>
            <p className="text-lg text-gray-600 mb-10">Each profile has its own separate data and settings.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {profileModes.map((mode) => (
                <div
                  key={mode.key}
                  className={`p-8 rounded-xl shadow-lg transition-all duration-300 border-2 ${
                    mode.locked 
                      ? 'bg-gray-100 cursor-not-allowed opacity-60 border-gray-300' 
                      : 'bg-white hover:shadow-2xl transform hover:-translate-y-2 cursor-pointer border-transparent hover:border-blue-500'
                  }`}
                  onClick={() => handleModeSelect(mode)}
                >
                  {mode.icon}
                  <h2 className="text-2xl font-semibold mb-2">
                    {mode.label}
                    {mode.locked && <span className="ml-2 text-xs bg-gray-500 text-white px-2 py-1 rounded">LOCKED</span>}
                  </h2>
                  <p className="text-gray-500">{mode.description}</p>
                  {mode.locked && (
                    <div className="mt-4 p-3 bg-gray-200 border border-gray-300 rounded-lg">
                      <p className="text-sm text-gray-600 text-center">{mode.lockMessage}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-800 mb-6">&larr; Back to mode selection</button>
            <div className="bg-white p-8 rounded-xl shadow-lg text-center">
              <div className="mb-6">
                {selectedMode.icon}
                <h2 className="text-3xl font-bold">Create '{selectedMode.label}' Profile</h2>
                <p className="text-gray-600 mt-2">Give your new profile a name.</p>
              </div>
              <form onSubmit={handleCreateProfile}>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g., 'My Day Trading Journal'"
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors duration-300"
                  autoFocus
                />
                {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg mt-6 hover:bg-blue-700 disabled:bg-blue-300 transition-all duration-300 flex items-center justify-center"
                >
                  {loading ? 'Creating...' : 'Create Profile'}
                  {!loading && <ArrowRight className="ml-2 w-5 h-5" />}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSelectorPage;
