// Test script to check API access
import { fetchWithAuth } from './utils/fetchUtils';

export const testTradeDurationAPI = async () => {
  console.log('🧪 Testing Trade Duration API...');
  
  try {
    // Test the trade duration analysis endpoint
    const result = await fetchWithAuth('/journal/trade-duration-analysis');
    console.log('✅ API Response:', result);
    
    if (result && result.data) {
      console.log('📊 Data found:');
      console.log('- Performance data points:', result.data.performance_by_duration?.length || 0);
      console.log('- Count data points:', result.data.count_by_duration?.length || 0);
      console.log('- Win rate data points:', result.data.win_rate_by_duration?.length || 0);
      console.log('- Total trades:', result.data.total_trades || 0);
      console.log('- Data quality:', result.data.data_quality || 'N/A');
    } else {
      console.log('❌ No data in response');
    }
    
    return result;
  } catch (error) {
    console.error('❌ API Test Failed:', error);
    return null;
  }
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testTradeDurationAPI = testTradeDurationAPI;
} 