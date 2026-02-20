/**
 * ProfileSettings Component
 * 
 * Handles user profile management:
 * - Email display/update
 * - Profile image
 * - Personal information
 */

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import {
  User,
  Mail,
  Image,
  Save,
  Camera,
  Check,
  AlertCircle
} from 'lucide-react';

export default function ProfileSettings({ userData, setUserData }) {
  const [email, setEmail] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalData, setOriginalData] = useState({ email: '', profileImage: '' });

  useEffect(() => {
    if (userData) {
      setEmail(userData.email || '');
      setProfileImage(userData.profile_image || '');
      setPreviewImage(userData.profile_image || '');
      setOriginalData({
        email: userData.email || '',
        profileImage: userData.profile_image || ''
      });
    }
  }, [userData]);

  useEffect(() => {
    const changed = email !== originalData.email || profileImage !== originalData.profileImage;
    setHasChanges(changed);
  }, [email, profileImage, originalData]);

  const handleImageChange = (e) => {
    const url = e.target.value;
    setProfileImage(url);
    setPreviewImage(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email,
          profile_image: profileImage
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMsg('Profile updated successfully!');
        setOriginalData({ email, profileImage });
        setHasChanges(false);
        if (setUserData) {
          setUserData(prev => ({ ...prev, email, profile_image: profileImage }));
        }
      } else {
        setMsg(data.error || 'Failed to update profile');
      }
    } catch (error) {
      setMsg('Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const getMessageType = () => {
    if (msg.includes('successfully')) return 'success';
    if (msg.includes('Failed') || msg.includes('Error')) return 'error';
    return 'info';
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
        <User className="w-5 h-5 text-cyan-400" />
        Profile Settings
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
        {/* Profile Image Preview */}
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center overflow-hidden">
              {previewImage ? (
                <img 
                  src={previewImage} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                  onError={() => setPreviewImage('')}
                />
              ) : (
                <User className="w-12 h-12 text-white" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Profile Image URL
            </label>
            <div className="relative">
              <Image className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="url"
                value={profileImage}
                onChange={handleImageChange}
                placeholder="https://example.com/avatar.jpg"
                className="w-full pl-10 pr-4 py-3 bg-[#1e3a5f] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#1e3a5f] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            getMessageType() === 'success' 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : getMessageType() === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {getMessageType() === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {msg}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !hasChanges}
          className={`
            w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all
            ${hasChanges 
              ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:opacity-90'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </form>
    </div>
  );
}
