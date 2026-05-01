// Debug script to test authentication and API access
import { fetchWithAuth } from './utils/fetchUtils';

export const debugAuthAndAPI = async () => {
  console.log('🔍 Debugging Authentication and API Access...');
  
  try {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    console.log('Token exists:', !!token);
    if (token) {
      console.log('Token length:', token.length);
      console.log('Token preview:', token.substring(0, 20) + '...');
    }
    
    // Test basic API call
    console.log('Testing basic API call...');
    const result = await fetchWithAuth('/journal/trade-duration-analysis');
    console.log('API Response:', result);
    
    if (result && result.data) {
      console.log('✅ Data received successfully!');
      console.log('- Performance data points:', result.data.performance_by_duration?.length || 0);
      console.log('- Count data points:', result.data.count_by_duration?.length || 0);
      console.log('- Win rate data points:', result.data.win_rate_by_duration?.length || 0);
      console.log('- Total trades:', result.data.total_trades || 0);
    } else {
      console.log('❌ No data in response');
      console.log('Full response:', result);
    }
    
  } catch (error) {
    console.error('❌ Error during API call:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      statusText: error.statusText
    });
  }
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.debugAuthAndAPI = debugAuthAndAPI;
} 