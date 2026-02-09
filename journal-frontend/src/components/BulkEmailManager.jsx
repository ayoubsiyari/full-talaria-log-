import React, { useState, useEffect } from 'react';
import { Mail, Users, Send, CheckCircle, AlertCircle, Search, Eye, EyeOff, RotateCcw, X } from 'lucide-react';

const BulkEmailManager = ({ users = [] }) => {
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sentEmails, setSentEmails] = useState([]);
  const [hideSentUsers, setHideSentUsers] = useState(true);

  // Load sent emails from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bulkEmailSentList');
    if (saved) {
      setSentEmails(JSON.parse(saved));
    }
  }, []);

  // Save sent emails to localStorage
  const saveSentEmails = (emails) => {
    localStorage.setItem('bulkEmailSentList', JSON.stringify(emails));
    setSentEmails(emails);
  };

  // Reset sent emails list
  const resetSentList = () => {
    localStorage.removeItem('bulkEmailSentList');
    setSentEmails([]);
  };

  // Filter users based on search and sent status
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const notSent = hideSentUsers ? !sentEmails.includes(user.email) : true;
    return matchesSearch && notSent;
  });

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
        // Add sent emails to the sent list
        const newSentEmails = [...new Set([...sentEmails, ...selectedEmails])];
        saveSentEmails(newSentEmails);
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
    <div className="w-full">
      {/* Professional Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-t-2xl p-6 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Email Campaign Manager</h2>
              <p className="text-slate-400 text-sm">Send targeted emails to your users</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{selectedEmails.length}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Selected</p>
            </div>
            <div className="w-px h-12 bg-slate-700"></div>
            <div className="text-right">
              <p className="text-3xl font-bold text-emerald-400">{sentEmails.length}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Sent</p>
            </div>
            <div className="w-px h-12 bg-slate-700"></div>
            <div className="text-right">
              <p className="text-3xl font-bold text-amber-400">{users.length - sentEmails.length}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Remaining</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-b-2xl shadow-xl border border-t-0 border-gray-200">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
            >
              Select All ({filteredUsers.length})
            </button>
            <button
              onClick={selectJournalUsers}
              className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-all"
            >
              Journal Users
            </button>
            <button
              onClick={() => {
                const mentorshipEmails = users.filter(u => !u.has_journal_access && (hideSentUsers ? !sentEmails.includes(u.email) : true)).map(u => u.email);
                setSelectedEmails(mentorshipEmails);
              }}
              className="px-4 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100 transition-all"
            >
              2026 Mentorship
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
            >
              Clear
            </button>
            <div className="w-px h-8 bg-gray-300 mx-2"></div>
            <button
              onClick={() => setHideSentUsers(!hideSentUsers)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                hideSentUsers 
                  ? 'bg-amber-50 border border-amber-200 text-amber-700' 
                  : 'bg-white border border-gray-300 text-gray-600'
              }`}
            >
              {hideSentUsers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {hideSentUsers ? 'Sent Hidden' : 'All Visible'}
            </button>
            {sentEmails.length > 0 && (
              <button
                onClick={resetSentList}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="w-64 pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          
          {/* Recipients Panel */}
          <div className="lg:col-span-1 border-r border-gray-200 bg-gray-50">
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Recipients
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {filteredUsers.length} users
                </span>
              </div>
            </div>
            <div className="h-[500px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <label
                    key={user.id}
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 transition-all ${
                      selectedEmails.includes(user.email) 
                        ? 'bg-indigo-50 border-l-4 border-l-indigo-500' 
                        : 'hover:bg-white border-l-4 border-l-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmails.includes(user.email)}
                      onChange={() => toggleUser(user.email)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                      {user.full_name && (
                        <p className="text-xs text-gray-500 truncate">{user.full_name}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {sentEmails.includes(user.email) && (
                        <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded font-medium">
                          SENT
                        </span>
                      )}
                      {user.has_journal_access && (
                        <span className="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded font-medium">
                          JOURNAL
                        </span>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Compose Panel */}
          <div className="lg:col-span-2 p-6">
            <div className="space-y-5">
              {/* Subject */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter a compelling subject line..."
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-base"
                />
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Email Content
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">HTML supported</span>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                        showPreview 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPreview ? 'Hide Preview' : 'Preview'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your email content here. You can use HTML tags for formatting..."
                  rows={showPreview ? 8 : 12}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-mono text-sm bg-slate-900 text-slate-100"
                />
              </div>

              {/* Preview */}
              {showPreview && content && (
                <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                  <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-700">📧 Live Preview</span>
                    <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div 
                    className="p-6 bg-white max-h-[300px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                </div>
              )}

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center gap-4">
                  {result && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      result.success 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {result.success ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium">{result.message}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSendEmail}
                  disabled={sending || selectedEmails.length === 0 || !subject.trim() || !content.trim()}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold text-base hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl disabled:shadow-none"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send to {selectedEmails.length} Recipients
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEmailManager;
