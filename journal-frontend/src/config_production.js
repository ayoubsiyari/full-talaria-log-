// src/config_production.js
// This config uses the production API URL for VPS deployment

export const API_BASE_URL = 'https://api.talaria-log.com/api';

console.log('🔧 Config PRODUCTION - Using VPS API');
console.log('🌐 API Base URL:', API_BASE_URL);

export const ENV = 'production';

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
  DEBUG_MODE: false,
};

// Console log for production
console.log('🔧 Using PRODUCTION configuration');
console.log('🌐 API Base URL:', API_BASE_URL);
console.log('🔍 Debug mode disabled'); 