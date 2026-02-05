// src/config.js

// The base URL for all API calls.
// In development, we use the proxy defined in package.json which forwards to the backend
// In production, we use the full domain with /api prefix
const isDev = process.env.NODE_ENV !== 'production';

// For local development, use relative paths to leverage the proxy
// The proxy is configured in package.json to forward requests to the backend
// In production, use /journal/api since the app is hosted at /journal/
export const API_BASE_URL = isDev
  ? '/api'  // Uses the proxy in development (configured in package.json)  
  : '/journal/api';  // Production - app is hosted at /journal/

console.log('🔧 Config - Environment:', process.env.NODE_ENV);
console.log('🌐 API Base URL:', API_BASE_URL);

// Environment
export const ENV = process.env.NODE_ENV || 'development';

// Feature Flags
export const FEATURES = {
  ANALYTICS: true,
  TRADE_IMPORT: true,
  EXPORT: true,
};

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'token',
  USER_DATA: 'userData',
  THEME: 'theme',
};

// Default Settings
export const DEFAULTS = {
  PAGE_SIZE: 10,
  DATE_FORMAT: 'yyyy-MM-dd',
  TIME_FORMAT: 'HH:mm',
};

// Production settings
export const PRODUCTION_CONFIG = {
  API_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

// Debug logging
if (ENV === 'development') {
  console.log('🔧 API Configuration:', {
    API_BASE_URL,
    ENV,
    hostname: window.location.hostname,
    protocol: window.location.protocol
  });
}
