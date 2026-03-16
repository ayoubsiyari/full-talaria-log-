// Test script to check connection to backend API
import { API_BASE_URL } from './config';

console.log('🔧 Testing API connection...');
console.log('API_BASE_URL:', API_BASE_URL);

// Test the connection
async function testConnection() {
  try {
    console.log('🔍 Testing connection to backend...');
    
    // Test basic connectivity
    const response = await fetch(`${API_BASE_URL}/auth/check`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Connection successful!', data);
    } else {
      console.log('⚠️ Connection failed with status:', response.status);
      const text = await response.text();
      console.log('Response text:', text);
    }
  } catch (error) {
    console.error('❌ Connection error:', error);
  }
}

// Run the test
testConnection(); 