import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, FileText, AlertTriangle, Shield, Users, Globe } from 'lucide-react';

export default function TermsOfService() {
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
              <FileText className="w-6 h-6 text-white/80" />
            </div>
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Terms of Service
            </h1>
            <p className="text-white/60 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Terms Content */}
          <div className="space-y-12 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Agreement to Terms</h2>
              <p className="font-light">
                By accessing and using Journal, you accept and agree to be bound by the terms and provision of this agreement. 
                If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Users className="w-5 h-5 mr-3 text-white/60" />
                Use License
              </h2>
              <div className="space-y-4">
                <p className="font-light">Permission is granted to temporarily use Journal for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>modify or copy the materials</li>
                    <li>use the materials for any commercial purpose or for any public display</li>
                    <li>attempt to reverse engineer any software contained on the website</li>
                    <li>remove any copyright or other proprietary notations from the materials</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-3 text-white/60" />
                Disclaimer
              </h2>
              <div className="space-y-4">
                <p className="font-light">The materials on Journal are provided on an 'as is' basis. Journal makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
                <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-white mb-2">Trading Risk Warning</h3>
                  <p className="text-sm font-light">
                    Trading involves substantial risk and is not suitable for all investors. Past performance is not indicative of future results. 
                    Journal is a tool for tracking and analyzing trades but does not provide investment advice.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Limitations</h2>
              <div className="space-y-4">
                <p className="font-light">In no event shall Journal or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use Journal, even if Journal or a Journal authorized representative has been notified orally or in writing of the possibility of such damage.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Accuracy of Materials</h2>
              <p className="font-light">
                The materials appearing on Journal could include technical, typographical, or photographic errors. Journal does not warrant that any of the materials on its website are accurate, complete, or current. Journal may make changes to the materials contained on its website at any time without notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Links</h2>
              <p className="font-light">
                Journal has not reviewed all of the sites linked to our website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Journal of the site. Use of any such linked website is at the user's own risk.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Modifications</h2>
              <p className="font-light">
                Journal may revise these terms of service for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Globe className="w-5 h-5 mr-3 text-white/60" />
                Governing Law
              </h2>
              <p className="font-light">
                These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which Journal operates, and you irrevocably submit to the exclusive jurisdiction of the courts in that state or location.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Contact Information</h2>
              <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                <p className="mb-4 font-light">If you have any questions about these Terms of Service, please contact us:</p>
                <div className="space-y-2 text-sm">
                  <p><strong className="text-white/90">Email:</strong> legal@journal.com</p>
                  <p><strong className="text-white/90">Subject:</strong> "Terms of Service Inquiry"</p>
                  <p><strong className="text-white/90">Response Time:</strong> We aim to respond within 48 hours</p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer Links */}
          <div className="mt-16 pt-8 border-t border-white/10">
            <div className="flex flex-wrap justify-center gap-8 text-sm">
              <Link to="/privacy-policy" className="text-white/70 hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link to="/cookie-policy" className="text-white/70 hover:text-white transition-colors">
                Cookie Policy
              </Link>
              <Link to="/refund-policy" className="text-white/70 hover:text-white transition-colors">
                Refund Policy
              </Link>
              <Link to="/disclaimer" className="text-white/70 hover:text-white transition-colors">
                Disclaimer
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
