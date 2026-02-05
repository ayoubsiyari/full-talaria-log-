import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../context/ProfileContext';
import { TrendingUp, Lock, Database, Check, ArrowLeft } from 'lucide-react';

const profileModes = [
  {
    value: 'backtest',
    name: 'Backtest',
    description: 'Perfect for simulation and learning',
    icon: <TrendingUp className="w-8 h-8 mx-auto mb-4 text-blue-500" />,
    features: [
      'Full edit access to all trade data',
      'Ideal for testing strategies',
      'No restrictions on modifications',
      'Great for learning and experimentation',
    ],
    locked: false,
  },
  {
    value: 'journal',
    name: 'Journal',
    description: 'Real trading with data protection',
    icon: <Lock className="w-8 h-8 mx-auto mb-4 text-amber-500" />,
    features: [
      'Core trade data locked after entry',
      'Maintains data integrity',
      'Editable notes and tags',
      'Perfect for real trading records',
    ],
    locked: true,
    lockMessage: 'Coming Soon - This feature is currently locked for new users',
  },
  {
    value: 'journal_live',
    name: 'Live Trading',
    description: 'Automated broker synchronization',
    icon: <Database className="w-8 h-8 mx-auto mb-4 text-emerald-500" />,
    features: [
      'Auto-import from broker',
      'Trade data always locked',
      'Real-time synchronization',
      'Only notes and tags editable',
    ],
    locked: true,
    lockMessage: 'Coming Soon - This feature is currently locked for new users',
  },
];

const ProfileSetup = () => {
  const [step, setStep] = useState(1);
  const [selectedMode, setSelectedMode] = useState('backtest'); // Default to backtest
  const [profileName, setProfileName] = useState('Backtest Profile'); // Default name
  const [profileDescription, setProfileDescription] = useState('Default backtest profile for trading analysis'); // Default description
  const { createProfile, profiles } = useProfile();
  const navigate = useNavigate();

  // Auto-advance to step 2 for new users with backtest as default
  useEffect(() => {
    // If this is a new user (no existing profiles), automatically set up backtest profile
    if (profiles.length === 0) {
      setSelectedMode('backtest');
      setProfileName('Backtest Profile');
      setProfileDescription('Default backtest profile for trading analysis');
      setStep(2); // Skip the selection step and go directly to profile creation
    }
  }, [profiles]);

  const handleModeSelect = (mode) => {
    const selectedModeData = profileModes.find(m => m.value === mode);
    if (selectedModeData && selectedModeData.locked) {
      // Show alert for locked modes
      alert(selectedModeData.lockMessage);
      return;
    }
    setSelectedMode(mode);
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createProfile({ name: profileName, description: profileDescription, mode: selectedMode });
    navigate('/dashboard');
  };

  // If user has existing profiles, show the full selection flow
  if (profiles.length > 0) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome to Talaria Log</h1>
          <p className="text-lg text-gray-400">Let's set up your trading profile to get started</p>
        </div>

        <div className="relative mb-8">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-700"></div>
          <div className="relative flex justify-between w-1/2 mx-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${step >= 1 ? 'bg-blue-500' : 'bg-gray-700'}`}>
              <span className="text-white font-bold">1</span>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${step >= 2 ? 'bg-blue-500' : 'bg-gray-700'}`}>
              <span className="text-white font-bold">2</span>
            </div>
          </div>
        </div>

        {step === 1 && (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-8">
            <h2 className="text-2xl font-semibold text-center text-white mb-8">Choose Your Profile Mode</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {profileModes.map((mode) => (
                <div
                  key={mode.value}
                  onClick={() => handleModeSelect(mode.value)}
                  className={`p-6 border-2 rounded-lg transition-all duration-300 ${
                    mode.locked 
                      ? 'border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-60' 
                      : selectedMode === mode.value 
                        ? 'border-blue-500 bg-blue-500/10 cursor-pointer' 
                        : 'border-gray-700 hover:border-gray-500 cursor-pointer'
                  }`}>
                  {mode.icon}
                  <h3 className="text-xl font-bold text-center text-white mb-2">
                    {mode.name}
                    {mode.locked && <span className="ml-2 text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">LOCKED</span>}
                  </h3>
                  <p className="text-sm text-center text-gray-400 mb-6">{mode.description}</p>
                  {mode.locked && (
                    <div className="mb-4 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                      <p className="text-sm text-gray-300 text-center">{mode.lockMessage}</p>
                    </div>
                  )}
                  <ul className="space-y-3">
                    {mode.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-10">
              <button className="text-gray-400 hover:text-white transition-colors" onClick={() => navigate('/dashboard')}>Skip for now</button>
              <button onClick={handleNext} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">Next &rarr;</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-8 max-w-lg mx-auto">
              <button onClick={handleBack} className="flex items-center text-gray-400 hover:text-white mb-6">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
              </button>
            <h2 className="text-2xl font-semibold text-center text-white mb-2">Set Up Your Profile</h2>
            <p className="text-center text-gray-400 mb-8">You chose the <span className="font-semibold text-blue-400">{profileModes.find(m => m.value === selectedMode).name}</span> mode.</p>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="profileName" className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                <input
                  id="profileName"
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., My Swing Strategy"
                  required
                />
              </div>
              <div>
                <label htmlFor="profileDescription" className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                <textarea
                  id="profileDescription"
                  value={profileDescription}
                  onChange={(e) => setProfileDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:ring-blue-500 focus:border-blue-500"
                  rows="3"
                  placeholder="A few words about this profile's purpose"
                ></textarea>
              </div>
              <button type="submit" className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">Create Profile & Start</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // For new users, show a simplified setup with backtest as default
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome to Talaria Log</h1>
        <p className="text-lg text-gray-400">Let's set up your default backtest profile to get started</p>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-8 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 text-blue-500" />
          <h2 className="text-2xl font-semibold text-white mb-2">Backtest Profile</h2>
          <p className="text-gray-400">Perfect for simulation and learning</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="profileName" className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
            <input
              id="profileName"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., My Swing Strategy"
              required
            />
          </div>
          <div>
            <label htmlFor="profileDescription" className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
            <textarea
              id="profileDescription"
              value={profileDescription}
              onChange={(e) => setProfileDescription(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:ring-blue-500 focus:border-blue-500"
              rows="3"
              placeholder="A few words about this profile's purpose"
            ></textarea>
          </div>
          <button type="submit" className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">Create Backtest Profile & Start</button>
        </form>
      </div>
    </div>
  );
};

export default ProfileSetup;
