import { useState } from 'react';
import { API_BASE_URL, STORAGE_KEYS } from '../config';

// Helper function to fetch data with error handling and authentication
export const fetchWithAuth = async (url, options = {}) => {
  try {
    // Prepend API_BASE_URL only if the URL is not absolute and does not already start with /api
    let fullUrl = url;
    if (!url.startsWith('http') && !url.startsWith('/api')) {
      fullUrl = `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    
    // Get token from localStorage
    let token = localStorage.getItem('token');
    
    // Debug: Log token retrieval
    console.log(`[fetch] Preparing ${options.method || 'GET'} request to ${fullUrl} (original URL: ${url})`);
    console.log('[fetch] Retrieved token from localStorage:', token ? `Token found (${token.length} chars)` : 'No token found');
    
    if (!token) {
      console.error('[fetch] No authentication token found in localStorage');
      // Clear any partial token that might exist
      localStorage.removeItem('token');
      // Redirect to login if not already there
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/login';
      }
      throw new Error('No authentication token found. Please log in again.');
    }

    // Clean up the token (remove quotes if present)
    token = token.replace(/^"|"$/g, '').trim();
    
    // If token is empty after cleanup, treat as no token
    if (!token) {
      console.error('[fetch] Empty token after cleanup');
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/login';
      }
      throw new Error('Invalid authentication token. Please log in again.');
    }
    
    // Verify token format
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('[fetch] Invalid token format - expected 3 parts, got', tokenParts.length);
      localStorage.removeItem('token');
      throw new Error('Invalid authentication token format. Please log in again.');
    }

    // Prepare headers with the token
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });
    
    // Add Authorization header
    headers.set('Authorization', `Bearer ${token}`);

    // Log request details (with token redacted in logs)
    console.log(`[fetch] Sending ${options.method || 'GET'} request to ${url}`, {
      hasToken: !!token,
      tokenLength: token.length,
      headers: Object.fromEntries(
        Array.from(headers.entries()).map(([key, value]) => [
          key,
          key.toLowerCase() === 'authorization' ? 'Bearer [REDACTED]' : value
        ])
      ),
      options: { 
        ...options, 
        body: options.body ? '[REDACTED]' : undefined,
        headers: Object.fromEntries(
          Object.entries(options.headers || {}).map(([key, value]) => [
            key, 
            key.toLowerCase() === 'authorization' ? 'Bearer [REDACTED]' : value
          ])
        )
      }
    });

    const startTime = Date.now();
    let response;
    let responseText;
    let data;
    
    // Ensure we're using the full URL for the actual fetch
    const fetchUrl = fullUrl;
    
    try {
      response = await fetch(fetchUrl, { 
        ...options, 
        headers,
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache'
      });
      
      const responseClone = response.clone(); // Clone response for logging
      responseText = await response.text();
      
      // Check if response should be JSON based on content-type header
      const contentType = response.headers.get('content-type');
      const shouldBeJson = contentType && contentType.includes('application/json');
      
      console.log('[fetch] Content-Type:', contentType, 'Should be JSON:', shouldBeJson);
      console.log('[fetch] Response text length:', responseText.length);
      console.log('[fetch] Response text preview:', responseText.substring(0, 100) + '...');
      
      // Try to parse JSON, but don't fail if it's not JSON
      try {
        data = responseText ? JSON.parse(responseText) : null;
        console.log('[fetch] Successfully parsed JSON response:', typeof data);
      } catch (e) {
        console.error('[fetch] JSON parsing failed:', e.message);
        console.log('[fetch] Raw response text:', responseText.substring(0, 500) + '...');
        
        // Check if the error is related to Infinity values
        if (e.message.includes('Unexpected token') && responseText.includes('"inf"')) {
          throw new Error('Server returned invalid JSON with Infinity values. This is a known issue that has been fixed. Please try again.');
        }
        
        // For other JSON parsing errors, still treat as text but log the error
        console.warn('[fetch] Response is not valid JSON, treating as text. Error:', e.message);
        data = responseText;
      }
      
      const duration = Date.now() - startTime;
      
      // Log successful response
      console.log(`[fetch] Received ${response.status} response in ${duration}ms from ${fetchUrl}`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: data && typeof data === 'object' ? 
          (data.error ? { error: data.error } : '...') : 
          (responseText.length > 100 ? responseText.substring(0, 100) + '...' : responseText)
      });
    
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          url,
          response: data || responseText,
          headers: Object.fromEntries(response.headers.entries())
        };
        
        console.error(`[fetch] Request failed with status ${response.status}`, errorDetails);
        
        if (response.status === 401) {
          console.log('[fetch] Token expired or invalid, attempting to refresh...');
          try {
            const refreshed = await refreshToken();
            if (refreshed) {
              console.log('[fetch] Token refreshed successfully, retrying the original request...');
              // Get the new token and retry the request
              const newToken = localStorage.getItem('token');
              headers.set('Authorization', `Bearer ${newToken}`);
              const retryResponse = await fetch(fetchUrl, { 
                ...options, 
                headers,
                credentials: 'include',
                mode: 'cors',
                cache: 'no-cache'
              });

              if (!retryResponse.ok) {
                // If retry also fails, throw an error
                throw new Error('Request failed even after token refresh.');
              }

              const retryData = await retryResponse.json();
              return retryData;
            } else {
              // If refresh fails, then logout
              throw new Error('Session expired. Please log in again.');
            }
          } catch (refreshError) {
            console.error('[fetch] Token refresh failed, logging out:', refreshError);
            localStorage.removeItem('token');
            if (!window.location.pathname.includes('login')) {
              window.location.href = '/login';
            }
            throw new Error('Your session has expired. Please log in again.');
          }
        }
        
        // Create a more detailed error message
        const errorMessage = data?.message || 
                             (data?.error || `Request failed with status ${response.status}`);
        
        const error = new Error(errorMessage);
        error.status = response.status;
        error.response = data || responseText;
        throw error;
      }
      
      // Log successful response details
      console.log(`[fetch] Request successful: ${options.method || 'GET'} ${url}`, {
        status: response.status,
        data: url.includes('stats') ? 
          { tradesCount: data?.trades?.length, hasTrades: !!data?.trades?.length } : 
          (data ? 'Response data available' : 'No data')
      });
    
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log the error with as much context as possible
      console.error(`[fetch] Error after ${duration}ms for ${options.method || 'GET'} ${url}:`, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          status: error.status,
          response: error.response
        },
        request: {
          url,
          method: options.method || 'GET',
          headers: headers ? Object.fromEntries(headers.entries()) : undefined,
          body: options.body
        }
      });
      
      // If we have a response with an error message, use that
      if (error.response) {
        throw error; // Re-throw the error with the response attached
      }
      
      // Otherwise create a more helpful error
      const errorMessage = error.message.includes('Failed to fetch') ? 
        'Unable to connect to the server. Please check your internet connection and try again.' :
        `Network error: ${error.message}`;
      
      const networkError = new Error(errorMessage);
      networkError.originalError = error;
      throw networkError;
    }
  } catch (error) {
    console.error('[fetch] Unexpected error in fetchWithAuth:', error);
    throw error;
  }
};

// Helper function to handle API errors
export const handleApiError = (error, setError) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    setError(`API Error: ${error.response.data.message || error.response.statusText}`);
  } else if (error.request) {
    // The request was made but no response was received
    setError('No response received from the server');
  } else {
    // Something happened in setting up the request that triggered an Error
    setError(`Error: ${error.message}`);
  }
};

// Helper function to check authentication status
export const checkAuth = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return false;
  }

  try {
        const response = await fetchWithAuth(`${API_BASE_URL}/auth/check`);
    return response?.authenticated || false;
  } catch (error) {
    console.error('Auth check failed:', error);
    return false;
  }
};

// Helper function to refresh auth token
export const refreshToken = async () => {
  try {
        const response = await fetchWithAuth(`${API_BASE_URL}/auth/refresh`);
    if (response?.token) {
      localStorage.setItem('token', response.token);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
};
