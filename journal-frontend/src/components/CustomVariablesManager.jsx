import React, { useState, useEffect } from 'react';
import { Plus, X, Edit2, Trash2, Save, Check, CheckSquare, Square } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { colors, colorUtils } from '../config/colors';

const CustomVariablesManager = ({ selectionMode = false, onSelectionChange = null, selectedValues = {} }) => {
  const [customVariables, setCustomVariables] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null);
  const [newVariable, setNewVariable] = useState({ name: '', values: [''] });

  // Fetch custom variables on component mount
  useEffect(() => {
    fetchCustomVariables();
  }, []);

  // Handle selection changes when in selection mode
  const handleSelectionChange = (varName, value, checked) => {
    if (!onSelectionChange) return;
    
    const currentSelections = selectedValues[varName] || [];
    let newSelections;
    
    if (checked) {
      newSelections = [...currentSelections, value];
    } else {
      newSelections = currentSelections.filter(v => v !== value);
    }
    
    onSelectionChange({
      ...selectedValues,
      [varName]: newSelections
    });
  };

  const fetchCustomVariables = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('🔍 Debug - Fetching custom variables...');
      console.log('🔍 Debug - API_BASE_URL:', API_BASE_URL);
      console.log('🔍 Debug - Full URL:', `${API_BASE_URL}/journal/custom-variables`);
      console.log('🔍 Debug - Token exists:', !!token);

      const response = await fetch(`${API_BASE_URL}/journal/custom-variables`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      console.log('🔍 Debug - Response status:', response.status);
      console.log('🔍 Debug - Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('🔍 Debug - Error response:', errorText);
        throw new Error(`Failed to fetch custom variables: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 Debug - Received data:', data);
      setCustomVariables(data);
      setError('');
    } catch (err) {
      console.error('Error fetching custom variables:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariable = async () => {
    try {
      if (!newVariable.name.trim()) {
        setError('Variable name is required');
        return;
      }

      const validValues = newVariable.values.filter(v => v.trim());
      if (validValues.length === 0) {
        setError('At least one value is required');
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/journal/custom-variables`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newVariable.name.trim().toLowerCase(),
          values: validValues
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create variable');
      }

      // Reset form and refresh variables
      setNewVariable({ name: '', values: [''] });
      setShowAddForm(false);
      await fetchCustomVariables();
      setError('');
    } catch (err) {
      console.error('Error adding variable:', err);
      setError(err.message);
    }
  };

  const handleUpdateVariable = async (varName, values) => {
    try {
      const validValues = values.filter(v => v.trim());
      if (validValues.length === 0) {
        setError('At least one value is required');
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/journal/custom-variables/${varName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: validValues }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update variable');
      }

      setEditingVariable(null);
      await fetchCustomVariables();
      setError('');
    } catch (err) {
      console.error('Error updating variable:', err);
      setError(err.message);
    }
  };

  const handleDeleteVariable = async (varName) => {
    if (!window.confirm(`Are you sure you want to delete the variable "${varName}"? This will remove it from all trades.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/journal/custom-variables/${varName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete variable');
      }

      await fetchCustomVariables();
      setError('');
    } catch (err) {
      console.error('Error deleting variable:', err);
      setError(err.message);
    }
  };



  const addValueField = () => {
    setNewVariable(prev => ({
      ...prev,
      values: [...prev.values, '']
    }));
  };

  const removeValueField = (index) => {
    setNewVariable(prev => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index)
    }));
  };

  const updateValueField = (index, value) => {
    setNewVariable(prev => ({
      ...prev,
      values: prev.values.map((v, i) => i === index ? value : v)
    }));
  };

  if (loading) {
    return (
      <div className={`${colorUtils.getCardGlowClasses()} p-6`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3090FF]"></div>
          <span className="ml-2 text-white/60">Loading variables...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-200/60 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-[#040028]">
          {selectionMode ? 'Select Custom Variables' : 'Custom Variables'}
        </h3>
        {!selectionMode && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Variable
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-red-600 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Add Variable Form */}
      {showAddForm && !selectionMode && (
        <div className="mb-6 p-6 bg-slate-50 rounded-xl border border-blue-200/60">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#040028]">Add New Variable</h4>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewVariable({ name: '', values: [''] });
                setError('');
              }}
              className="text-slate-600 hover:text-[#040028] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#040028] mb-2">
                Variable Name
              </label>
              <input
                type="text"
                value={newVariable.name}
                onChange={(e) => setNewVariable(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-blue-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-[#040028] placeholder-slate-500"
                placeholder="e.g., setup, emotion, market_condition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#040028] mb-2">
                Values
              </label>
              <div className="space-y-2">
                {newVariable.values.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateValueField(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-blue-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-[#040028] placeholder-slate-500"
                      placeholder={`Value ${index + 1}`}
                    />
                    {newVariable.values.length > 1 && (
                      <button
                        onClick={() => removeValueField(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addValueField}
                  className="flex items-center text-blue-600 hover:text-blue-700 text-sm transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add another value
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddVariable}
                className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Variable
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewVariable({ name: '', values: [''] });
                  setError('');
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-300 transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variables List */}
      <div className="space-y-4">
        {Object.keys(customVariables).length === 0 ? (
          <p className="text-slate-600 text-center py-8">
            No custom variables created yet. Click "Add Variable" to create your first one.
          </p>
        ) : (
          Object.entries(customVariables).map(([varName, values]) => (
            <div key={varName} className="bg-white border border-blue-200/60 rounded-xl p-4 hover:bg-slate-50 hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-[#040028] capitalize">{varName}</h4>
                {!selectionMode && (
                  <div className="flex items-center gap-2">
                    {editingVariable && editingVariable.name === varName ? (
                      <>
                        <button
                          onClick={() => handleUpdateVariable(varName, editingVariable.values)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingVariable(null)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingVariable({ name: varName, values: [...values] })}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteVariable(varName)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {editingVariable && editingVariable.name === varName ? (
                <div className="space-y-2">
                  {editingVariable.values.map((value, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const newValues = [...editingVariable.values];
                          newValues[index] = e.target.value;
                          setEditingVariable(prev => ({ ...prev, values: newValues }));
                        }}
                        className="flex-1 px-3 py-2 border border-blue-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-[#040028] placeholder-slate-500"
                      />
                                              {editingVariable.values.length > 1 && (
                          <button
                            onClick={() => {
                              const newValues = editingVariable.values.filter((_, i) => i !== index);
                              setEditingVariable(prev => ({ ...prev, values: newValues }));
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newValues = [...editingVariable.values, ''];
                      setEditingVariable(prev => ({ ...prev, values: newValues }));
                    }}
                    className="flex items-center text-blue-600 hover:text-blue-700 text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add another value
                  </button>
                </div>
              ) : selectionMode ? (
                <div className="space-y-2">
                  {values.map((value) => {
                    const isSelected = selectedValues[varName]?.includes(value) || false;
                    return (
                      <label key={value} className="flex items-center gap-3 cursor-pointer hover:bg-slate-100 p-3 rounded-lg transition-colors">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectionChange(varName, value, e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-sm text-[#040028]">{value}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => (
                    <span
                      key={value}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 border border-blue-200 text-blue-700"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CustomVariablesManager; 