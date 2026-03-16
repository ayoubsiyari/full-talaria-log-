import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { fetchWithAuth } from '../utils/fetchUtils';

const CombinationFilterTest = () => {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    setTestResults([]);
    
    const results = [];

    // Test 1: Check if backend is running
    try {
      const response = await fetch(`${API_BASE_URL}/`);
      const data = await response.json();
      results.push({
        test: 'Backend Connection',
        status: response.ok ? '✅ PASS' : '❌ FAIL',
        details: data
      });
    } catch (error) {
      results.push({
        test: 'Backend Connection',
        status: '❌ FAIL',
        details: error.message
      });
    }

    // Test 2: Check combinations-filter endpoint (without auth)
    try {
      const response = await fetch(`${API_BASE_URL}/journal/combinations-filter?combination_level=2&min_trades=3`);
      results.push({
        test: 'Combinations Filter Endpoint (No Auth)',
        status: response.status === 401 ? '✅ PASS' : '❌ FAIL',
        details: `Status: ${response.status} - ${response.status === 401 ? 'Correctly requires authentication' : 'Unexpected response'}`
      });
    } catch (error) {
      results.push({
        test: 'Combinations Filter Endpoint (No Auth)',
        status: '❌ FAIL',
        details: error.message
      });
    }

    // Test 3: Check variables-analysis endpoint (without auth)
    try {
      const response = await fetch(`${API_BASE_URL}/journal/variables-analysis?combine_vars=true&combination_level=2`);
      results.push({
        test: 'Variables Analysis Endpoint (No Auth)',
        status: response.status === 401 ? '✅ PASS' : '❌ FAIL',
        details: `Status: ${response.status} - ${response.status === 401 ? 'Correctly requires authentication' : 'Unexpected response'}`
      });
    } catch (error) {
      results.push({
        test: 'Variables Analysis Endpoint (No Auth)',
        status: '❌ FAIL',
        details: error.message
      });
    }

    // Test 4: Check if user is logged in
    const token = localStorage.getItem('token');
    results.push({
      test: 'Authentication Token',
      status: token ? '✅ PASS' : '❌ FAIL',
      details: token ? `Token found (${token.length} chars)` : 'No token found - please log in first'
    });

    // Test 5: Test combinations-filter with auth (if token exists)
    if (token) {
      try {
        const data = await fetchWithAuth(`${API_BASE_URL}/journal/combinations-filter?combination_level=2&min_trades=3`);
        results.push({
          test: 'Combinations Filter (With Auth)',
          status: data && data.combinations ? '✅ PASS' : '❌ FAIL',
          details: data ? `Found ${data.combinations?.length || 0} combinations` : 'No data returned'
        });
      } catch (error) {
        results.push({
          test: 'Combinations Filter (With Auth)',
          status: '❌ FAIL',
          details: error.message
        });
      }
    }

    // Test 6: Test variables-analysis with auth (if token exists)
    if (token) {
      try {
        const data = await fetchWithAuth(`${API_BASE_URL}/journal/variables-analysis?combine_vars=true&combination_level=2`);
        results.push({
          test: 'Variables Analysis (With Auth)',
          status: data && (data.variables || data.combinations) ? '✅ PASS' : '❌ FAIL',
          details: data ? `Found ${data.variables?.length || 0} variables, ${data.combinations?.length || 0} combinations` : 'No data returned'
        });
      } catch (error) {
        results.push({
          test: 'Variables Analysis (With Auth)',
          status: '❌ FAIL',
          details: error.message
        });
      }
    }

    setTestResults(results);
    setLoading(false);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Combination Filter Test</h2>
      
      <button
        onClick={runTests}
        disabled={loading}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running Tests...' : 'Run Tests'}
      </button>

      {testResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Test Results:</h3>
          {testResults.map((result, index) => (
            <div key={index} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <span className="font-medium">{result.test}</span>
                <span className={result.status.includes('PASS') ? 'text-green-600' : 'text-red-600'}>
                  {result.status}
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {result.details}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded">
        <h4 className="font-semibold mb-2">Instructions:</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Make sure the backend is running on port 5000</li>
          <li>Log in to the application first</li>
          <li>Click "Run Tests" to verify the combination filter functionality</li>
          <li>All tests should show ✅ PASS for the filter to work correctly</li>
        </ol>
      </div>
    </div>
  );
};

export default CombinationFilterTest; 