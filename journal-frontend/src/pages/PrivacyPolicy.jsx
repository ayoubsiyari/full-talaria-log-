import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, Shield, Eye, Lock, Database, Users, Globe, Mail } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden relative">
      {/* Subtle animated background grid */}
      <div className="fixed inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `\n            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),\n            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)\n          `,
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
      `}</style>

      {/* Navigation - Linear style */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/10 group-hover:bg-white/15 transition-all duration-300">
                <img src={logo} alt="Journal Logo" className="w-6 h-6 rounded-sm" />
              </div>
              <span className="text-xl font-semibold text-white">
                Journal
              </span>
            </Link>
            <Link to="/" className="flex items-center space-x-2 text-white/70 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container mx-auto px-6 pt-32 pb-20 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-6 border border-white/10">
              <Shield className="w-6 h-6 text-white/80" />
            </div>
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Privacy Policy
            </h1>
            <p className="text-white/60 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Policy Content */}
          <div className="space-y-12 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Introduction</h2>
              <p className="font-light">
                At Journal, we take your privacy seriously. This Privacy Policy explains how we collect, use, 
                disclose, and safeguard your information when you use our trading journal platform. Please read 
                this privacy policy carefully. If you do not agree with the terms of this privacy policy, please 
                do not access the site.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Database className="w-5 h-5 mr-3 text-white/60" />
                Information We Collect
              </h2>
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Personal Information</h3>
                  <p className="mb-2 font-light">We may collect personal information that you provide directly to us:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Name and contact information</li>
                    <li>Email address and phone number</li>
                    <li>Account credentials</li>
                    <li>Billing and payment information</li>
                    <li>Profile information and preferences</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Trading Data</h3>
                  <p className="mb-2 font-light">We collect and store your trading information:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Trade details and transaction history</li>
                    <li>Account performance metrics</li>
                    <li>Custom notes and journal entries</li>
                    <li>Uploaded files and documents</li>
                    <li>Analytics and reporting data</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Usage Information</h3>
                  <p className="mb-2 font-light">We automatically collect certain information:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Device and browser information</li>
                    <li>IP address and location data</li>
                    <li>Usage patterns and preferences</li>
                    <li>Log files and error reports</li>
                    <li>Cookies and tracking technologies</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Eye className="w-5 h-5 mr-3 text-white/60" />
                How We Use Your Information
              </h2>
              <div className="space-y-4">
                <p className="font-light">We use the information we collect for various purposes:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Service Provision:</strong> To provide and maintain our trading journal platform</li>
                    <li><strong className="text-white/90">Account Management:</strong> To create and manage your account</li>
                    <li><strong className="text-white/90">Analytics:</strong> To generate trading performance analytics and insights</li>
                    <li><strong className="text-white/90">Communication:</strong> To send you updates, notifications, and support messages</li>
                    <li><strong className="text-white/90">Improvement:</strong> To improve our services and develop new features</li>
                    <li><strong className="text-white/90">Security:</strong> To protect against fraud and unauthorized access</li>
                    <li><strong className="text-white/90">Legal Compliance:</strong> To comply with legal obligations and regulations</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Lock className="w-5 h-5 mr-3 text-white/60" />
                Data Security
              </h2>
              <div className="space-y-4">
                <p className="font-light">We implement appropriate security measures to protect your information:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Encryption:</strong> All data is encrypted in transit and at rest</li>
                    <li><strong className="text-white/90">Access Controls:</strong> Strict access controls and authentication</li>
                    <li><strong className="text-white/90">Regular Audits:</strong> Regular security audits and vulnerability assessments</li>
                    <li><strong className="text-white/90">Secure Infrastructure:</strong> Industry-standard secure hosting and infrastructure</li>
                    <li><strong className="text-white/90">Data Backup:</strong> Regular backups with secure storage</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Users className="w-5 h-5 mr-3 text-white/60" />
                Information Sharing
              </h2>
              <div className="space-y-4">
                <p className="font-light">We do not sell, trade, or rent your personal information. We may share information in limited circumstances:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Service Providers:</strong> With trusted third-party service providers</li>
                    <li><strong className="text-white/90">Legal Requirements:</strong> When required by law or legal process</li>
                    <li><strong className="text-white/90">Business Transfers:</strong> In connection with mergers or acquisitions</li>
                    <li><strong className="text-white/90">Consent:</strong> With your explicit consent</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Your Rights</h2>
              <div className="space-y-4">
                <p className="font-light">You have certain rights regarding your personal information:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Access:</strong> Request access to your personal information</li>
                    <li><strong className="text-white/90">Correction:</strong> Request correction of inaccurate information</li>
                    <li><strong className="text-white/90">Deletion:</strong> Request deletion of your personal information</li>
                    <li><strong className="text-white/90">Portability:</strong> Request transfer of your data</li>
                    <li><strong className="text-white/90">Objection:</strong> Object to processing of your information</li>
                    <li><strong className="text-white/90">Withdrawal:</strong> Withdraw consent at any time</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Contact Us</h2>
              <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                <p className="mb-4 font-light">If you have questions about this Privacy Policy, please contact us:</p>
                <div className="space-y-2 text-sm">
                  <p><strong className="text-white/90">Email:</strong> privacy@journal.com</p>
                  <p><strong className="text-white/90">Subject:</strong> "Privacy Policy Inquiry"</p>
                  <p><strong className="text-white/90">Response Time:</strong> We aim to respond within 48 hours</p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer Links */}
          <div className="mt-16 pt-8 border-t border-white/10">
            <div className="flex flex-wrap justify-center gap-8 text-sm">
              <Link to="/terms" className="text-white/70 hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link to="/cookie-policy" className="text-white/70 hover:text-white transition-colors">
                Cookie Policy
              </Link>
              <Link to="/refund-policy" className="text-white/70 hover:text-white transition-colors">
                Refund Policy
              </Link>
              <Link to="/contact" className="text-white/70 hover:text-white transition-colors">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
