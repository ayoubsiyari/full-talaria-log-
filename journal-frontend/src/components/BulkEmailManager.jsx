import React, { useState } from 'react';
import { Mail, Users, Send, CheckCircle, AlertCircle, Search } from 'lucide-react';

const BulkEmailManager = ({ users = [] }) => {
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter users based on search
  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Toggle user selection
  const toggleUser = (email) => {
    setSelectedEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  // Select all filtered users
  const selectAll = () => {
    const filteredEmails = filteredUsers.map(u => u.email);
    setSelectedEmails(prev => {
      const newSelection = new Set([...prev, ...filteredEmails]);
      return Array.from(newSelection);
    });
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedEmails([]);
  };

  // Select users with journal access
  const selectJournalUsers = () => {
    const journalEmails = users.filter(u => u.has_journal_access).map(u => u.email);
    setSelectedEmails(journalEmails);
  };

  // Send bulk email
  const handleSendEmail = async () => {
    if (selectedEmails.length === 0) {
      setResult({ success: false, message: 'Please select at least one user' });
      return;
    }
    if (!subject.trim()) {
      setResult({ success: false, message: 'Please enter a subject' });
      return;
    }
    if (!content.trim()) {
      setResult({ success: false, message: 'Please enter email content' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails: selectedEmails,
          subject: subject,
          content: content
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully sent ${data.sent} emails`,
          details: data
        });
        // Clear form after success
        setSubject('');
        setContent('');
        setSelectedEmails([]);
      } else {
        setResult({
          success: false,
          message: data.detail || data.error || 'Failed to send emails'
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Network error: ' + err.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Bulk Email Manager</h3>
          <p className="text-gray-600">Send custom emails to multiple users at once</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Email Composer */}
        <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-pink-100 rounded-xl">
              <Send className="w-6 h-6 text-pink-600" />
            </div>
            <h4 className="text-xl font-bold text-gray-900">Compose Email</h4>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content (HTML supported)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="<p>Enter your email content here...</p>&#10;&#10;You can use HTML tags for formatting."
                rows={10}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all font-mono text-sm"
              />
            </div>

            <div className="bg-white rounded-xl p-4 border border-pink-200">
              <p className="text-sm text-gray-600">
                <strong className="text-pink-600">Selected:</strong> {selectedEmails.length} user(s)
              </p>
            </div>

            <button
              onClick={handleSendEmail}
              disabled={sending || selectedEmails.length === 0}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Email to {selectedEmails.length} User(s)
                </>
              )}
            </button>

            {result && (
              <div className={`p-4 rounded-xl flex items-start gap-3 ${
                result.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                )}
                <div>
                  <p className={result.success ? 'text-green-800' : 'text-red-800'}>
                    {result.message}
                  </p>
                  {result.details && result.details.failed > 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      Failed: {result.details.failed} emails
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Selection */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <h4 className="text-xl font-bold text-gray-900">Select Recipients</h4>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition-colors"
            >
              Select All Visible
            </button>
            <button
              onClick={selectJournalUsers}
              className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold hover:bg-green-200 transition-colors"
            >
              Select Journal Users
            </button>
            <button
              onClick={() => {
                const mentorshipEmails = users.filter(u => !u.has_journal_access).map(u => u.email);
                setSelectedEmails(mentorshipEmails);
              }}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold hover:bg-purple-200 transition-colors"
            >
              Select 2026 Mentorship
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Deselect All
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by email or name..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </div>

          {/* Users List */}
          <div className="max-h-[600px] overflow-y-auto border-2 border-gray-200 rounded-xl divide-y bg-white">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No users found</p>
              </div>
            ) : (
              filteredUsers.map((user) => (
                <label
                  key={user.id}
                  className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedEmails.includes(user.email) ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEmails.includes(user.email)}
                    onChange={() => toggleUser(user.email)}
                    className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="ml-4 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{user.email}</p>
                    {user.full_name && (
                      <p className="text-xs text-gray-500">{user.full_name}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {user.has_journal_access && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                        Journal
                      </span>
                    )}
                    {user.is_admin && (
                      <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="mt-4 text-sm text-gray-500 text-center">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEmailManager;
