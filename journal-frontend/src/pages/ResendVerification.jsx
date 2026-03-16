// src/pages/ResendVerification.jsx

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import logo from '../assets/logo4.jpg';

export default function ResendVerification() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleResendVerification = async (e) => {
    e.preventDefault();
    setMsg('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();

      if (res.ok) {
        setMsg(data.message || 'Verification email sent successfully!');
        setEmail(''); // Clear email field
      } else {
        setMsg(data.error || 'Failed to send verification email.');
      }
    } catch (err) {
      console.error('Resend error:', err);
      setMsg('Network error, please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
      <div className={`w-full max-w-md transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Talaria Logo" className="h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Resend Verification</h1>
          <p className="text-gray-300">Get a new verification email</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl">
          <form onSubmit={handleResendVerification} className="space-y-6">
            {/* Email Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-6 w-6 text-yellow-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="input-premium block w-full pl-12 pr-4 py-4 rounded-xl text-lg font-medium placeholder-gray-400 focus:outline-none"
                required
                disabled={isLoading}
              />
            </div>

            {/* Message */}
            {msg && (
              <div className={`px-4 py-3 rounded-lg text-center font-medium ${
                msg.includes('successfully') 
                  ? 'bg-green-900/50 border border-green-500 text-green-200'
                  : 'bg-red-900/50 border border-red-500 text-red-200'
              }`}>
                {msg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-premium w-full py-4 px-6 rounded-xl text-xl font-black uppercase tracking-wider transition-all duration-300 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-yellow-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5 mr-2" />
                  Resend Verification Email
                </>
              )}
            </button>
          </form>

          {/* Additional Info */}
          <div className="mt-6 text-center">
            <p className="text-gray-300 text-sm">
              Didn't receive the email? Check your spam folder or try again.
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="text-center mt-6 space-y-3">
          <Link
            to="/login"
            className="block text-gray-400 hover:text-white transition-colors duration-300"
          >
            Back to Login
          </Link>
          <Link
            to="/"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors duration-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
} 