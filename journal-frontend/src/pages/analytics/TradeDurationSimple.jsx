import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchWithAuth } from '../../utils/fetchUtils';

const TradeDurationSimple = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
             try {
         const result = await fetchWithAuth('/journal/trade-duration-analysis');
         if (result && result.success && result.data) {
           setData(result.data);
           console.log('Fetched data:', result.data);
         } else {
           setData(null);
           console.log('No data in response');
         }
       } catch (err) {
        setError(err.message || 'Error fetching data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Simple Trade Duration Analytics</h1>
      {loading && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {data && (
        <>
          <h2>Raw Data</h2>
          <pre style={{ background: '#f4f4f4', padding: 12, borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
          <h2>Performance By Trade Duration</h2>
          {Array.isArray(data.performance_by_duration) && data.performance_by_duration.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.performance_by_duration} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="duration" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="pnl" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div>No performance data available</div>
          )}
        </>
      )}
    </div>
  );
};

export default TradeDurationSimple; 