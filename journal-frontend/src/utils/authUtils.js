// utils/authUtils.js

/**
 * Get the current user's authentication token from localStorage
 * SIMPLE VERSION - back to basic localStorage
 * @returns {string|null} The authentication token or null if not found
 */
export const getCurrentUserToken = () => {
  const token = localStorage.getItem('token');
  
  if (token) {
    console.log('✅ AuthUtils - Found token (SIMPLE VERSION)');
    return token;
  }
  
  console.warn('⚠️ AuthUtils - No token found');
  return null;
};

/**
 * Get the current user's email
 * @returns {string|null} The current user's email or null if not logged in
 */
export const getCurrentUserEmail = () => {
  // For now, return null since we're using simple version
  return null;
};

/**
 * Check if the current user is an admin
 * @returns {boolean} True if the current user is an admin
 */
export const getCurrentUserIsAdmin = () => {
  return localStorage.getItem('is_admin') === 'true';
};

/**
 * Create headers with authentication for API requests
 * @returns {Object} Headers object with Authorization and Content-Type
 */
export const getAuthHeaders = () => {
  const token = getCurrentUserToken();
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}; 