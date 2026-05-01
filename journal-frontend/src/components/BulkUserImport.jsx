import React, { useState } from 'react';

const BulkUserImport = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  const API_BASE_URL = '/api';

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/download-user-template`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bulk_users_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      alert('Error downloading template');
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE_URL}/admin/import-users`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      setResults(await response.json());
      if (response.ok) setFile(null);
    } catch (error) {
      setResults({ success: false, error: 'Network error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-cyan-950/40 rounded-xl p-6 border border-cyan-500/15">
        <h4 className="text-lg font-semibold mb-4">📋 Download Template</h4>
        <p className="text-gray-600 mb-4">Download CSV template with group support</p>
        <button 
          onClick={downloadTemplate} 
          className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium"
        >
          📥 Download Template
        </button>
      </div>
      
      <div className="bg-cyan-950/40 rounded-xl p-6 border border-cyan-500/15">
        <h4 className="text-lg font-semibold mb-4">📤 Upload Users</h4>
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files[0])} 
          accept=".csv,.xlsx,.xls" 
          className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-950/25 file:text-cyan-200 hover:file:bg-blue-100"
        />
        {file && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Selected: {file.name}</p>
            <button 
              onClick={uploadFile} 
              disabled={uploading} 
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium"
            >
              {uploading ? '⏳ Importing...' : '🚀 Import Users'}
            </button>
          </div>
        )}
      </div>
      
      {results && (
        <div className={`p-4 rounded-lg border ${results.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h5 className="font-medium mb-2">{results.success ? '✅ Import Successful!' : '❌ Import Failed'}</h5>
          <p className="text-sm">
            {results.success 
              ? `Imported ${results.imported_count} users successfully${results.skipped_count > 0 ? ` (${results.skipped_count} skipped)` : ''}` 
              : results.error
            }
          </p>
          {results.errors && results.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium">Details:</p>
              <ul className="text-xs list-disc list-inside">
                {results.errors.slice(0, 5).map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-cyan-500/20">
        <h4 className="text-lg font-semibold mb-4">🎯 Account Types</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-cyan-950/40 rounded-lg p-3 border">
            <h5 className="font-medium text-blue-900">👤 Individual</h5>
            <p className="text-cyan-200">Students see only their own trades</p>
          </div>
          <div className="bg-cyan-950/40 rounded-lg p-3 border">
            <h5 className="font-medium text-purple-900">👥 Group</h5>
            <p className="text-purple-700">Sees ALL group member trades</p>
          </div>
          <div className="bg-cyan-950/40 rounded-lg p-3 border">
            <h5 className="font-medium text-green-900">👑 Admin</h5>
            <p className="text-green-700">Full system access</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUserImport;
