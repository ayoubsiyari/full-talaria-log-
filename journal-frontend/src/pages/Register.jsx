import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { colors, colorUtils } from '../config/colors';
import { Mail, Lock, User, Phone, Globe, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import logo from '../assets/logo4.jpg';
import { API_BASE_URL } from '../config';
import { countries } from '../data/countries';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedPhoneCode, setSelectedPhoneCode] = useState(null);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showPhoneCodeDropdown, setShowPhoneCodeDropdown] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState('');
  const [passwordStrengthMsg, setPasswordStrengthMsg] = useState("");
  const [mounted, setMounted] = useState(false);
  const [registered, setRegistered] = useState(false);
  const navigate = useNavigate();
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneCodeSearch, setPhoneCodeSearch] = useState("");

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showCountryDropdown && !event.target.closest('.country-dropdown')) {
        setShowCountryDropdown(false);
      }
      if (showPhoneCodeDropdown && !event.target.closest('.phone-code-dropdown')) {
        setShowPhoneCodeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCountryDropdown, showPhoneCodeDropdown]);

  const handleCountrySelect = (countryData) => {
    setSelectedCountry(countryData);
    setCountry(countryData.name);
    setShowCountryDropdown(false);
  };

  const handlePhoneCodeSelect = (countryData) => {
    setSelectedPhoneCode(countryData);
    setShowPhoneCodeDropdown(false);
  };

  const getPhoneWithCode = () => {
    if (selectedPhoneCode && phone) {
      return `${selectedPhoneCode.phoneCode}${phone.replace(/^0+/, '')}`;
    }
    return phone;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg('');

    if (password !== confirmPassword) {
      setMsg('Passwords do not match. Please retype your password.');
      return;
    }

    if (!isStrongPassword(password)) {
      setMsg('Password is not strong enough.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          full_name: fullName,
          phone: getPhoneWithCode(),
          country
        }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('pendingVerificationEmail', email);
        navigate('/verify-email');
      } else {
        setMsg(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('Network error:', err);
      setMsg('Network error, please try again');
    }
  };

  // Password strength check
  function isStrongPassword(pw) {
    return (
      pw.length >= 8 &&
      /[A-Z]/.test(pw) &&
      /[a-z]/.test(pw) &&
      /[0-9]/.test(pw) &&
      /[^A-Za-z0-9]/.test(pw)
    );
  }

  // Password strength scoring
  function getPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { label: 'Weak', color: 'bg-red-500' };
    if (score === 3 || score === 4) return { label: 'Medium', color: 'bg-yellow-500' };
    if (score === 5) return { label: 'Strong', color: 'bg-green-500' };
    return { label: '', color: '' };
  }

  useEffect(() => {
    if (password && !isStrongPassword(password)) {
      setPasswordStrengthMsg(
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
      );
    } else {
      setPasswordStrengthMsg("");
    }
  }, [password]);

  // Filtered countries for search
  const filteredCountries = countries.filter((countryData) =>
    countryData.name.toLowerCase().includes(countrySearch.toLowerCase())
  );
  // Filtered countries for phone code search
  const filteredPhoneCodeCountries = countries.filter((countryData) =>
    countryData.name.toLowerCase().includes(phoneCodeSearch.toLowerCase()) ||
    countryData.phoneCode.replace('+', '').includes(phoneCodeSearch.replace('+', ''))
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white overflow-hidden relative">
      {/* Subtle animated background grid */}
      <div className="fixed inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'grid-move 20s linear infinite'
        }} />
      </div>

      {/* Gradient orb background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle, #8b5cf6 0%, transparent 70%)`,
            animation: 'float 8s ease-in-out infinite'
          }}
        />
        <div 
          className="absolute top-3/4 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl"
          style={{
            background: `radial-gradient(circle, #06b6d4 0%, transparent 70%)`,
            animation: 'float 12s ease-in-out infinite reverse'
          }}
        />
      </div>

      {/* Custom CSS animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
      `}</style>

      <div className={`w-full max-w-md transition-all duration-1000 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Header */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/10">
                <img src={logo} alt="Journal Logo" className="w-8 h-8 rounded-sm" />
              </div>
              <span className="text-2xl font-semibold text-white">Journal</span>
            </Link>
            <h1 className="text-3xl font-semibold text-white mb-2 animate-fade-in-up">
              Sign up
            </h1>
            <p className="text-white/60 text-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              Create your account to get started
            </p>
          </div>

          {/* Form */}
          {!registered ? (
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Full Name Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="fullName">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="text"
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Phone Code + Phone Number Side by Side */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  {/* Phone Code Dropdown */}
                  <div className="relative w-1/3">
                    <button
                      type="button"
                      onClick={() => setShowPhoneCodeDropdown(!showPhoneCodeDropdown)}
                      className="phone-code-dropdown w-full px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
                    >
                      <span className="text-white/80">
                        {selectedPhoneCode ? selectedPhoneCode.phoneCode : 'Code'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-white/50" />
                    </button>
                    {showPhoneCodeDropdown && (
                      <div className="phone-code-dropdown absolute top-full left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-md max-h-60 overflow-y-auto mt-1">
                        {/* Search input for phone code dropdown */}
                        <div className="p-2 sticky top-0 bg-gray-900/95 z-10">
                          <input
                            type="text"
                            value={phoneCodeSearch}
                            onChange={e => setPhoneCodeSearch(e.target.value)}
                            placeholder="Search country or code..."
                            className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none"
                            autoFocus
                          />
                        </div>
                        {filteredPhoneCodeCountries.length === 0 && (
                          <div className="px-3 py-2 text-white/60 text-sm">No countries found</div>
                        )}
                        {filteredPhoneCodeCountries.map((countryData) => (
                          <button
                            key={countryData.code}
                            type="button"
                            onClick={() => handlePhoneCodeSelect(countryData)}
                            className="w-full text-left px-3 py-2 hover:bg-white/10 text-white/80 hover:text-white transition-colors text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate">{countryData.name.slice(0, 3)}</span>
                              <span className="text-blue-400 text-xs ml-2">{countryData.phoneCode}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Phone Number Input */}
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full pl-10 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Country Dropdown */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">
                  Country
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <button
                    type="button"
                    onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                    className="country-dropdown w-full pl-10 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
                  >
                    <span className="text-white/80">
                      {selectedCountry ? selectedCountry.name : 'Select country'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-white/50" />
                  </button>
                  {showCountryDropdown && (
                    <div className="country-dropdown absolute top-full left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-md max-h-60 overflow-y-auto mt-1">
                      {/* Search input */}
                      <div className="p-2 sticky top-0 bg-gray-900/95 z-10">
                        <input
                          type="text"
                          value={countrySearch}
                          onChange={e => setCountrySearch(e.target.value)}
                          placeholder="Search country..."
                          className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none"
                          autoFocus
                        />
                      </div>
                      {filteredCountries.length === 0 && (
                        <div className="px-3 py-2 text-white/60 text-sm">No countries found</div>
                      )}
                      {filteredCountries.map((countryData) => (
                        <button
                          key={countryData.code}
                          type="button"
                          onClick={() => {
                            handleCountrySelect(countryData);
                            setCountrySearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 text-white/80 hover:text-white transition-colors text-sm"
                        >
                          <span>{countryData.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {/* Password strength bar */}
                {password && (
                  <div className="mt-2">
                    <div className="w-full h-2 rounded bg-white/10">
                      <div
                        className={`h-2 rounded transition-all duration-300 ${getPasswordStrength(password).color}`}
                        style={{ width: getPasswordStrength(password).label === 'Weak' ? '33%' : getPasswordStrength(password).label === 'Medium' ? '66%' : getPasswordStrength(password).label === 'Strong' ? '100%' : '0%' }}
                      />
                    </div>
                    <div className={`text-xs mt-1 font-semibold ${getPasswordStrength(password).label === 'Weak' ? 'text-red-400' : getPasswordStrength(password).label === 'Medium' ? 'text-yellow-400' : getPasswordStrength(password).label === 'Strong' ? 'text-green-400' : ''}`}>
                      {getPasswordStrength(password).label}
                    </div>
                  </div>
                )}
                {passwordStrengthMsg && (
                  <div className="text-xs text-red-400 mt-1">{passwordStrengthMsg}</div>
                )}
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {msg && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-md text-center text-sm">
                  {msg}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-white text-black py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors flex items-center justify-center space-x-2 mt-6"
              >
                <span>Create account</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="text-center space-y-6 py-8">
              <div className="flex justify-center mb-2">
                <Mail className="w-12 h-12 text-blue-400 animate-bounce" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Registration Successful!</h2>
              <p className="text-white/60 text-sm">Please check your email for a verification link before logging in.</p>
              <button
                className="bg-white text-black py-2 px-6 rounded-md text-sm font-medium hover:bg-white/90 transition-colors"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-white/60 text-sm">
              Already have an account?{' '}
              <Link 
                to="/login" 
                className="text-blue-400 hover:underline"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
