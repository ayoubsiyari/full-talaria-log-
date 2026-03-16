import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, AlertTriangle, TrendingUp, Shield, Info, ExternalLink } from 'lucide-react';

export default function Disclaimer() {
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
              <AlertTriangle className="w-6 h-6 text-white/80" />
            </div>
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Disclaimer
            </h1>
            <p className="text-white/60 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Disclaimer Content */}
          <div className="space-y-12 text-white/70 leading-relaxed">
            <section>
              <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg mb-8">
                <h2 className="text-xl font-medium text-white mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-3 text-red-400" />
                  Important Trading Risk Warning
                </h2>
                <p className="font-light text-sm">
                  Trading in financial markets involves substantial risk of loss and is not suitable for all investors. 
                  You should carefully consider whether trading is appropriate for you in light of your experience, 
                  objectives, financial resources, and other relevant circumstances.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">General Information</h2>
              <p className="font-light">
                The information contained in this website is for general information purposes only. The information is 
                provided by Journal and while we endeavor to keep the information up to date and correct, we make no 
                representations or warranties of any kind, express or implied, about the completeness, accuracy, 
                reliability, suitability or availability with respect to the website or the information, products, 
                services, or related graphics contained on the website for any purpose.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-3 text-white/60" />
                No Investment Advice
              </h2>
              <div className="space-y-4">
                <p className="font-light">Journal is a trading journal and analytics platform. We do not provide investment advice, recommendations, or suggestions about specific securities or trading strategies.</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">What We Don't Provide</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Investment recommendations or advice</li>
                    <li>Buy or sell signals for specific securities</li>
                    <li>Guaranteed trading strategies or systems</li>
                    <li>Financial planning or portfolio management services</li>
                    <li>Tax or legal advice</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Past Performance Disclaimer</h2>
              <div className="space-y-4">
                <p className="font-light">Past performance is not indicative of future results. Any trading results displayed or discussed are hypothetical or simulated in nature and do not represent actual trading.</p>
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-white mb-2">Performance Metrics</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Historical performance data is for educational purposes only</li>
                    <li>Results may not reflect the impact of material economic factors</li>
                    <li>Simulated results may not reflect actual trading conditions</li>
                    <li>No guarantee that similar results will be achieved in the future</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Shield className="w-5 h-5 mr-3 text-white/60" />
                Limitation of Liability
              </h2>
              <div className="space-y-4">
                <p className="font-light">In no event will Journal be liable for any loss or damage including without limitation, indirect or consequential loss or damage, or any loss or damage whatsoever arising from loss of data or profits arising out of, or in connection with, the use of this website.</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Excluded Damages</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Trading losses or missed opportunities</li>
                    <li>Loss of profits or revenue</li>
                    <li>Loss of data or information</li>
                    <li>Business interruption or downtime</li>
                    <li>Indirect, special, or consequential damages</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Accuracy of Information</h2>
              <div className="space-y-4">
                <p className="font-light">Through this website you are able to link to other websites which are not under the control of Journal. We have no control over the nature, content and availability of those sites.</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Data Sources</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Market data may be delayed or inaccurate</li>
                    <li>Third-party integrations may have limitations</li>
                    <li>User-entered data accuracy is not guaranteed</li>
                    <li>Calculations are based on available information</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Regulatory Compliance</h2>
              <div className="space-y-4">
                <p className="font-light">Journal is not a registered investment advisor, broker-dealer, or financial institution. We do not provide regulated financial services.</p>
                <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-white mb-2">Important Notice</h3>
                  <p className="text-sm font-light">
                    Users are responsible for ensuring their trading activities comply with applicable laws and regulations 
                    in their jurisdiction. Consult with qualified professionals for legal, tax, and financial advice.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Third-Party Services</h2>
              <div className="space-y-4">
                <p className="font-light">Journal may integrate with third-party services and platforms. We are not responsible for the availability, accuracy, or reliability of these external services.</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Broker integrations and data feeds</li>
                    <li>Market data providers</li>
                    <li>Payment processing services</li>
                    <li>Cloud storage and backup services</li>
                    <li>Analytics and tracking tools</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Info className="w-5 h-5 mr-3 text-white/60" />
                Updates and Changes
              </h2>
              <p className="font-light">
                This disclaimer may be updated from time to time. We encourage users to review this page periodically 
                for any changes. Continued use of Journal after any modifications constitutes acceptance of the updated disclaimer.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Contact Information</h2>
              <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                <p className="mb-4 font-light">If you have questions about this disclaimer or need clarification:</p>
                <div className="space-y-2 text-sm">
                  <p><strong className="text-white/90">Email:</strong> legal@journal.com</p>
                  <p><strong className="text-white/90">Subject:</strong> "Disclaimer Inquiry"</p>
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