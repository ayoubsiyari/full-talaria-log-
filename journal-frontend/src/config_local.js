// src/config_local.js
// This config forces localhost API for local testing

export const API_BASE_URL = 'http://localhost:5000/api';

console.log('🔧 Config LOCAL - Forced localhost API');
console.log('🌐 API Base URL:', API_BASE_URL);

export const ENV = 'development';

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

// Development settings
export const DEVELOPMENT_CONFIG = {
  API_TIMEOUT: 10000, // 10 seconds for faster development
  RETRY_ATTEMPTS: 1,
  CACHE_DURATION: 1 * 60 * 1000, // 1 minute for development
  DEBUG_MODE: true,
};

// Console log for development
console.log('🔧 Using LOCAL development configuration');
console.log('🌐 API Base URL:', API_BASE_URL);
console.log('🔍 Debug mode enabled'); 