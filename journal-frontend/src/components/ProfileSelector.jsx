import React, { useState } from 'react';
import { API_BASE_URL } from '../config';

const profiles = [
  { key: 'backtest', label: 'backtest', description: 'Simulate and edit trades freely.', locked: false },
  { key: 'journal', label: 'journal', description: 'Manual journal with locked trade fields.', locked: true, lockMessage: 'Coming Soon - This feature is currently locked for new users' },
  { key: 'journal_live', label: 'live journal', description: 'Sync trades from broker, no editing.', locked: true, lockMessage: 'Coming Soon - This feature is currently locked for new users' },
];

export default function ProfileSelector({ onSelect }) {
  const [showMetaapiConnect, setShowMetaapiConnect] = useState(false);
  const [metaapiAccountId, setMetaapiAccountId] = useState('');
  const [metaapiMsg, setMetaapiMsg] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleSelect = (profileKey) => {
    const selectedProfile = profiles.find(p => p.key === profileKey);
    if (selectedProfile && selectedProfile.locked) {
      alert(selectedProfile.lockMessage);
      return;
    }
    
    if (profileKey === 'journal_live') {
      const existing = localStorage.getItem('metaapi_account_id');
      if (!existing) {
        setShowMetaapiConnect(true);
        return;
      }
    }
    onSelect(profileKey);
  };

  const connectMetaapi = async () => {
    setConnecting(true);
    setMetaapiMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/broker/metaapi/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ account_id: metaapiAccountId })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('metaapi_account_id', metaapiAccountId);
        setMetaapiMsg('MetaAPI connected! You can now proceed.');
        setShowMetaapiConnect(false);
        onSelect('journal_live');
      } else {
        setMetaapiMsg(data.error || 'Failed to connect MetaAPI');
      }
    } catch (e) {
      setMetaapiMsg('Error connecting to MetaAPI');
    }
    setConnecting(false);
  };

  if (showMetaapiConnect) {
    return (
      <div style={{ maxWidth: 400, margin: '2rem auto', textAlign: 'center' }}>
        <h2>Connect MetaAPI (MT4/MT5)</h2>
        <div className="mb-4">Enter your MetaAPI Account ID to use Journal Live mode.</div>
        <input
          type="text"
          value={metaapiAccountId}
          onChange={e => setMetaapiAccountId(e.target.value)}
          placeholder="MetaAPI Account ID"
          className="w-full p-2 rounded border border-gray-300 mb-2"
        />
        <div className="text-sm text-gray-600 mb-3">
          <strong>How to find your MetaAPI Account ID?</strong><br />
          1. Log in to your <a href="https://app.metaapi.cloud" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>MetaAPI Dashboard</a>.<br />
          2. Create or select your MT4/MT5 account.<br />
          3. Copy the <b>Account ID</b> from the account details.<br />
          4. Paste it here and click Connect.
        </div>
        <div className="mb-3">
          <a href="/how-to-setup-account" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 500 }}>
            Full setup instructions: How to Set Up Journal Live
          </a>
        </div>
        <button
          onClick={connectMetaapi}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={!metaapiAccountId || connecting}
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
        {metaapiMsg && <div className="mt-2 text-blue-700">{metaapiMsg}</div>}
      </div>
    );
  }

  // Diagram-style selector UI
  return (
    <div style={{ maxWidth: 600, margin: '3rem auto', textAlign: 'center', position: 'relative' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: 2, marginBottom: '2.5rem' }}>TALARIA-LOG</h1>
      {/* SVG for lines/arrows */}
      <svg width="100%" height="80" style={{ position: 'absolute', left: 0, top: 60, pointerEvents: 'none' }}>
        <line x1="50%" y1="0" x2="20%" y2="80" stroke="#222" strokeWidth="3" />
        <line x1="50%" y1="0" x2="50%" y2="80" stroke="#222" strokeWidth="3" />
        <line x1="50%" y1="0" x2="80%" y2="80" stroke="#222" strokeWidth="3" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 80 }}>
        {profiles.map((profile, idx) => (
          <button
            key={profile.key}
            onClick={() => handleSelect(profile.key)}
            style={{
              flex: 1,
              margin: '0 1rem',
              padding: '2.5rem 1rem',
              borderRadius: '1.5rem',
              border: '3px solid #222',
              background: '#fff',
              fontSize: '1.5rem',
              fontWeight: 500,
              boxShadow: '0 4px 24px 0 rgba(0,0,0,0.04)',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
              position: 'relative',
              zIndex: 1
            }}
          >
            {profile.label}
          </button>
        ))}
      </div>
    </div>
  );
}
