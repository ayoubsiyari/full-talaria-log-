import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { Plus, Trash2, Eye } from 'lucide-react';
import StrategyModal from '../components/StrategyModal';
import StrategyDetailModal from '../components/StrategyDetailModal';

export default function StrategyBuilder() {
  const [strategies, setStrategies] = useState([]);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  const fetchStrategies = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/strategies`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setStrategies(data.strategies);
      } else {
        console.error('Failed to fetch strategies:', data.error);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleSaveStrategy = async (strategy) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}/strategies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(strategy)
      });
      const data = await response.json();
      if (data.success) {
        setStrategies([...strategies, data.strategy]);
      } else {
        console.error('Failed to save strategy:', data.error);
      }
    } catch (error) {
      console.error('Error saving strategy:', error);
    }
  };

  const handleDeleteStrategy = async (id) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setStrategies(strategies.filter(s => s.id !== id));
      } else {
        console.error('Failed to delete strategy:', data.error);
      }
    } catch (error) {
      console.error('Error deleting strategy:', error);
    }
  };

  const handleViewStrategy = (strategy) => {
    setSelectedStrategy(strategy);
    setDetailModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <StrategyModal 
        isOpen={isCreateModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={handleSaveStrategy}
      />
      <StrategyDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        strategy={selectedStrategy}
      />

      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Strategy Builder</h1>
        <button 
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus size={16} />
          New Strategy
        </button>
      </header>

      <main>
        {strategies.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed rounded-lg border-gray-700/50">
            <h2 className="text-xl font-semibold">No strategies yet</h2>
            <p className="mt-2 text-gray-400">Click "New Strategy" to build your first trading plan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {strategies.map(strategy => (
              <div key={strategy.id} className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-700/50 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2 truncate">{strategy.name}</h3>
                  <p className="text-gray-400 text-sm h-20 overflow-hidden text-ellipsis">{strategy.description}</p>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => handleViewStrategy(strategy)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><Eye size={16} /></button>
                  <button onClick={() => handleDeleteStrategy(strategy.id)} className="p-2 text-red-500 hover:text-white hover:bg-red-500/50 rounded-md"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
