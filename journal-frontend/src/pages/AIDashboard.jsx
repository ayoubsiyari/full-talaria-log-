import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Clock, 
  Lightbulb,
  Shield,
  Zap,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Cpu,
  Settings
} from 'lucide-react';

export default function AIDashboard() {
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [selectedInsight, setSelectedInsight] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchAIInsights();
  }, [selectedTimeframe]);

  const fetchAIInsights = async () => {
    try {
      setLoading(true);
      setScanning(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/journal/ai-dashboard?timeframe=${selectedTimeframe}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiInsights(data);
      } else {
        console.error('AI dashboard response not ok:', response.status);
      }
    } catch (error) {
      console.error('Error fetching AI insights:', error);
    } finally {
      setLoading(false);
      setTimeout(() => setScanning(false), 1000);
    }
  };

  const fixProfileData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('${API_BASE_URL}/journal/fix-profile-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${data.message}`);
        fetchAIInsights();
      } else {
        alert('❌ Failed to fix profile data');
      }
    } catch (error) {
      console.error('Error fixing profile data:', error);
      alert('❌ Error fixing profile data');
    }
  };

  const getInsightIcon = (type) => {
    switch (type) {
      case 'positive': return <ArrowUpRight className="w-5 h-5 text-emerald-400" />;
      case 'negative': return <ArrowDownRight className="w-5 h-5 text-red-400" />;
      case 'neutral': return <Minus className="w-5 h-5 text-blue-400" />;
      default: return <Lightbulb className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getInsightColor = (type) => {
    switch (type) {
      case 'positive': return 'border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm';
      case 'negative': return 'border-red-500/30 bg-red-500/10 backdrop-blur-sm';
      case 'neutral': return 'border-blue-500/30 bg-blue-500/10 backdrop-blur-sm';
      default: return 'border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)] animate-pulse"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(120,119,198,0.05)_25%,rgba(120,119,198,0.05)_50%,transparent_50%,transparent_75%,rgba(120,119,198,0.05)_75%)] bg-[length:20px_20px] animate-pulse"></div>
        </div>

        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            {/* AI Brain Icon with Glow */}
            <div className="relative mb-8">
              <div className="w-32 h-32 mx-auto relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-full blur-xl opacity-50 animate-pulse"></div>
                <div className="relative w-full h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-2xl">
                  <Brain className="w-16 h-16 text-white animate-pulse" />
                </div>
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-400 rounded-full animate-ping"></div>
            </div>

            {/* Scanning Animation */}
            <div className="mb-6">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI Neural Network
            </h2>
            <p className="text-lg text-cyan-200 mb-8">
              {scanning ? 'Scanning trading patterns...' : 'Initializing AI analysis...'}
            </p>

            {/* Progress Bar */}
            <div className="w-64 mx-auto bg-slate-800 rounded-full h-2 mb-8">
              <div className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 h-2 rounded-full animate-pulse" style={{ width: scanning ? '60%' : '30%' }}></div>
            </div>

            {/* Status Indicators */}
            <div className="flex justify-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-emerald-300">Data Processing</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <span className="text-blue-300">Pattern Recognition</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                <span className="text-purple-300">AI Insights</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(120,119,198,0.05)_25%,rgba(120,119,198,0.05)_50%,transparent_50%,transparent_75%,rgba(120,119,198,0.05)_75%)] bg-[length:20px_20px]"></div>
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-4 mb-2">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full animate-ping"></div>
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                    AI Trading Assistant
                  </h1>
                  <p className="text-cyan-200 mt-1">
                    Neural network analysis of your trading performance
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="px-4 py-2 bg-slate-800/50 border border-cyan-500/30 rounded-lg text-cyan-200 backdrop-blur-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
                <option value="all">All time</option>
              </select>
              
              <button
                onClick={fetchAIInsights}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
              >
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4" />
                  <span>Refresh Analysis</span>
                </div>
              </button>

              <button
                onClick={fixProfileData}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 shadow-lg hover:shadow-orange-500/25"
              >
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4" />
                  <span>Fix Data</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {aiInsights && (
          <>
            {/* Key Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-cyan-500/30 hover:border-cyan-400/50 transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-cyan-300 mb-1">AI Confidence</p>
                    <p className="text-3xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {aiInsights.confidenceScore}%
                    </p>
                  </div>
                  <div className="relative">
                    <Brain className="w-8 h-8 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full transition-all duration-1000"
                      style={{ width: `${aiInsights.confidenceScore}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-orange-500/30 hover:border-orange-400/50 transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-300 mb-1">Risk Level</p>
                    <p className="text-3xl font-bold text-white group-hover:text-orange-300 transition-colors">
                      {aiInsights.riskLevel}
                    </p>
                  </div>
                  <Shield className="w-8 h-8 text-orange-400 group-hover:text-orange-300 transition-colors" />
                </div>
                <p className="text-sm text-orange-200 mt-2">
                  {aiInsights.riskDescription}
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/30 hover:border-emerald-400/50 transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-300 mb-1">Improvement</p>
                    <p className="text-3xl font-bold text-white group-hover:text-emerald-300 transition-colors">
                      {aiInsights.improvementPotential}%
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                </div>
                <p className="text-sm text-emerald-200 mt-2">
                  Potential based on AI analysis
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-300 mb-1">Next Setup</p>
                    <p className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">
                      {aiInsights.nextBestSetup}
                    </p>
                  </div>
                  <Zap className="w-8 h-8 text-purple-400 group-hover:text-purple-300 transition-colors" />
                </div>
                <p className="text-sm text-purple-200 mt-2">
                  {aiInsights.setupConfidence}% confidence
                </p>
              </div>
            </div>

            {/* Main Insights Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Performance Insights */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-cyan-500/30">
                <div className="p-6 border-b border-cyan-500/30">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <TrendingUp className="w-5 h-5 text-emerald-400 mr-2" />
                    Performance Insights
                  </h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {aiInsights.performanceInsights?.map((insight, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-xl border backdrop-blur-sm ${getInsightColor(insight.type)} hover:scale-105 transition-all duration-300`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-white mb-1">
                              {insight.title}
                            </p>
                            <p className="text-sm text-cyan-200 mb-2">
                              {insight.description}
                            </p>
                            {insight.recommendation && (
                              <p className="text-sm text-emerald-300 font-medium">
                                💡 {insight.recommendation}
                              </p>
                            )}
                          </div>
                          {getInsightIcon(insight.type)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk Analysis */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-orange-500/30">
                <div className="p-6 border-b border-orange-500/30">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <AlertTriangle className="w-5 h-5 text-orange-400 mr-2" />
                    Risk Analysis
                  </h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {aiInsights.riskAnalysis?.map((risk, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-xl border backdrop-blur-sm ${getInsightColor(risk.severity)} hover:scale-105 transition-all duration-300`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-white mb-1">
                              {risk.title}
                            </p>
                            <p className="text-sm text-cyan-200 mb-2">
                              {risk.description}
                            </p>
                            {risk.action && (
                              <p className="text-sm text-orange-300 font-medium">
                                ⚠️ {risk.action}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-white">
                              {risk.probability}%
                            </p>
                            <p className="text-xs text-cyan-300">probability</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Behavioral Analysis */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 mb-8">
              <div className="p-6 border-b border-purple-500/30">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Eye className="w-5 h-5 text-purple-400 mr-2" />
                  Behavioral Analysis
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {aiInsights.behavioralPatterns?.map((pattern, index) => (
                    <div key={index} className="bg-slate-700/50 rounded-xl p-4 hover:scale-105 transition-all duration-300 group">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-white group-hover:text-purple-300 transition-colors">
                          {pattern.name}
                        </h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          pattern.impact === 'positive' 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : pattern.impact === 'negative'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {pattern.impact}
                        </span>
                      </div>
                      <p className="text-sm text-cyan-200 mb-3">
                        {pattern.description}
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-purple-300">
                          Frequency: {pattern.frequency}%
                        </span>
                        <span className="text-emerald-300">
                          Impact: {pattern.impactScore}/10
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-emerald-500/30 mb-8">
              <div className="p-6 border-b border-emerald-500/30">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Lightbulb className="w-5 h-5 text-emerald-400 mr-2" />
                  AI Recommendations
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {aiInsights.recommendations?.map((rec, index) => (
                    <div key={index} className="border-l-4 border-emerald-500 pl-6 hover:scale-105 transition-all duration-300">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium text-white mb-2">
                            {rec.title}
                          </h4>
                          <p className="text-cyan-200 mb-3">
                            {rec.description}
                          </p>
                          <div className="flex items-center space-x-4 text-sm">
                            <span className="flex items-center text-emerald-300">
                              <Target className="w-4 h-4 mr-1" />
                              Priority: {rec.priority}
                            </span>
                            <span className="flex items-center text-blue-300">
                              <TrendingUp className="w-4 h-4 mr-1" />
                              Expected Impact: {rec.expectedImpact}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedInsight(rec)}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 transition-all duration-300 text-sm shadow-lg"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Market Timing Analysis */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-blue-500/30 mb-8">
              <div className="p-6 border-b border-blue-500/30">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Clock className="w-5 h-5 text-blue-400 mr-2" />
                  Optimal Trading Times
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {aiInsights.optimalTimes?.map((time, index) => (
                    <div key={index} className="text-center p-4 bg-slate-700/50 rounded-xl hover:scale-105 transition-all duration-300 group">
                      <p className="text-sm font-medium text-white mb-1 group-hover:text-blue-300 transition-colors">
                        {time.period}
                      </p>
                      <p className="text-2xl font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                        {time.winRate}%
                      </p>
                      <p className="text-xs text-cyan-300">
                        Win Rate
                      </p>
                      <p className="text-sm text-blue-200 mt-2">
                        Avg P&L: ${time.avgPnl}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Detailed Insight Modal */}
        {selectedInsight && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800/90 backdrop-blur-xl rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-cyan-500/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">
                  {selectedInsight.title}
                </h3>
                <button
                  onClick={() => setSelectedInsight(null)}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-cyan-200">
                  {selectedInsight.description}
                </p>
                
                {selectedInsight.details && (
                  <div className="bg-slate-700/50 rounded-xl p-4 border border-cyan-500/20">
                    <h4 className="font-medium text-white mb-2">Detailed Analysis</h4>
                    <p className="text-sm text-cyan-200">
                      {selectedInsight.details}
                    </p>
                  </div>
                )}
                
                {selectedInsight.actions && (
                  <div>
                    <h4 className="font-medium text-white mb-2">Recommended Actions</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-cyan-200">
                      {selectedInsight.actions.map((action, index) => (
                        <li key={index}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setSelectedInsight(null)}
                    className="px-4 py-2 text-cyan-300 bg-slate-700/50 rounded-lg hover:bg-slate-600/50 transition-colors"
                  >
                    Close
                  </button>
                  <button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 transition-all duration-300">
                    Apply Recommendation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 