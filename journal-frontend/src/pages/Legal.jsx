import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, Shield, FileText, RefreshCw, Cookie, AlertTriangle, ChevronRight } from 'lucide-react';

export default function Legal() {
  const legalPages = [
    {
      title: 'Privacy Policy',
      description: 'How we collect, use, and protect your personal information and trading data.',
      icon: Shield,
      path: '/privacy-policy'
    },
    {
      title: 'Terms of Service',
      description: 'The terms and conditions governing your use of our trading journal platform.',
      icon: FileText,
      path: '/terms'
    },
    {
      title: 'Refund Policy',
      description: 'Our refund and cancellation policies for subscriptions and services.',
      icon: RefreshCw,
      path: '/refund-policy'
    },
    {
      title: 'Cookie Policy',
      description: 'How we use cookies and similar technologies to improve your experience.',
      icon: Cookie,
      path: '/cookie-policy'
    },
    {
      title: 'Disclaimer',
      description: 'Important disclaimers about trading risks and our service limitations.',
      icon: AlertTriangle,
      path: '/disclaimer'
    }
  ];

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
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Legal Information
            </h1>
            <p className="text-lg text-white/60 font-light">
              Important legal documents and policies for Journal users.
            </p>
          </div>

          {/* Legal Pages Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {legalPages.map((page, index) => (
              <Link 
                key={index}
                to={page.path}
                className="group bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-white/20"
              >
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <page.icon className="w-5 h-5 text-white/80" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-white mb-2 group-hover:text-white transition-colors">
                      {page.title}
                    </h3>
                    <p className="text-white/60 text-sm leading-relaxed font-light mb-3">
                      {page.description}
                    </p>
                    <div className="flex items-center text-white/70 text-sm group-hover:text-white transition-colors">
                      <span>Read more</span>
                      <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Additional Information */}
          <div className="space-y-8">
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-xl font-medium text-white mb-4">Last Updated</h2>
              <div className="space-y-2 text-sm text-white/70">
                <p><strong className="text-white/90">Privacy Policy:</strong> {new Date().toLocaleDateString()}</p>
                <p><strong className="text-white/90">Terms of Service:</strong> {new Date().toLocaleDateString()}</p>
                <p><strong className="text-white/90">Cookie Policy:</strong> {new Date().toLocaleDateString()}</p>
                <p><strong className="text-white/90">Refund Policy:</strong> {new Date().toLocaleDateString()}</p>
                <p><strong className="text-white/90">Disclaimer:</strong> {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h2 className="text-xl font-medium text-white mb-4">Contact Information</h2>
              <div className="space-y-2 text-sm text-white/70">
                <p><strong className="text-white/90">Legal Questions:</strong> legal@journal.com</p>
                <p><strong className="text-white/90">Privacy Concerns:</strong> privacy@journal.com</p>
                <p><strong className="text-white/90">General Support:</strong> support@journal.com</p>
                <p><strong className="text-white/90">Response Time:</strong> We aim to respond within 48 hours</p>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
              <h2 className="text-xl font-medium text-white mb-4">Important Notice</h2>
              <p className="text-white/70 text-sm leading-relaxed font-light">
                These legal documents are regularly updated to reflect changes in our services and applicable laws. 
                We recommend reviewing them periodically. Material changes will be communicated to users via email 
                and prominently displayed on our website.
              </p>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-16 pt-8 border-t border-white/10">
            <div className="flex flex-wrap justify-center gap-8 text-sm">
              <Link to="/privacy-policy" className="text-white/70 hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-white/70 hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link to="/refund-policy" className="text-white/70 hover:text-white transition-colors">
                Refund Policy
              </Link>
              <Link to="/cookie-policy" className="text-white/70 hover:text-white transition-colors">
                Cookie Policy
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