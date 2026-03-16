import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, Cookie, Settings, Shield, Info, ChevronRight } from 'lucide-react';

export default function CookiePolicy() {
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
              <Cookie className="w-6 h-6 text-white/80" />
            </div>
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Cookie Policy
            </h1>
            <p className="text-white/60 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Policy Content */}
          <div className="space-y-12 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-medium text-white mb-4">What Are Cookies?</h2>
              <p className="font-light">
                Cookies are small text files that are placed on your device when you visit our website. They help us 
                provide you with a better experience by remembering your preferences, analyzing how you use our site, 
                and personalizing content.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-3 text-white/60" />
                How We Use Cookies
              </h2>
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Essential Cookies</h3>
                  <p className="mb-2 font-light">These cookies are necessary for the website to function properly:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Authentication and security</li>
                    <li>Session management</li>
                    <li>Basic functionality</li>
                    <li>Payment processing</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Performance Cookies</h3>
                  <p className="mb-2 font-light">These cookies help us understand how visitors interact with our website:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Website analytics and statistics</li>
                    <li>Error tracking and debugging</li>
                    <li>Performance monitoring</li>
                    <li>User behavior analysis</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Functional Cookies</h3>
                  <p className="mb-2 font-light">These cookies enable enhanced functionality and personalization:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>User preferences and settings</li>
                    <li>Language and region preferences</li>
                    <li>Theme and display preferences</li>
                    <li>Custom dashboard layouts</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Marketing Cookies</h3>
                  <p className="mb-2 font-light">These cookies are used to deliver relevant advertisements:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Ad targeting and personalization</li>
                    <li>Social media integration</li>
                    <li>Email marketing optimization</li>
                    <li>Conversion tracking</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Shield className="w-5 h-5 mr-3 text-white/60" />
                Third-Party Cookies
              </h2>
              <div className="space-y-4">
                <p className="font-light">We may use third-party services that place cookies on your device:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Analytics Services</h3>
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Google Analytics:</strong> Website usage and performance analysis</li>
                    <li><strong className="text-white/90">Mixpanel:</strong> User behavior and feature usage tracking</li>
                    <li><strong className="text-white/90">Hotjar:</strong> Heatmaps and user session recordings</li>
                  </ul>
                </div>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Payment Services</h3>
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Stripe:</strong> Payment processing and fraud prevention</li>
                    <li><strong className="text-white/90">PayPal:</strong> Alternative payment processing</li>
                  </ul>
                </div>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Marketing Services</h3>
                  <ul className="space-y-2 text-sm">
                    <li><strong className="text-white/90">Facebook Pixel:</strong> Ad conversion tracking</li>
                    <li><strong className="text-white/90">Google Ads:</strong> Advertising performance measurement</li>
                    <li><strong className="text-white/90">Mailchimp:</strong> Email marketing and automation</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Cookie Duration</h2>
              <div className="space-y-4">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Session Cookies</h3>
                  <p className="font-light">These cookies are temporary and are deleted when you close your browser. They are used for:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 mt-2 text-sm">
                    <li>User authentication during your session</li>
                    <li>Temporary form data storage</li>
                    <li>Security tokens and CSRF protection</li>
                  </ul>
                </div>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Persistent Cookies</h3>
                  <p className="font-light">These cookies remain on your device for a set period or until manually deleted:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 mt-2 text-sm">
                    <li>User preferences and settings (1 year)</li>
                    <li>Analytics data (2 years)</li>
                    <li>Marketing and advertising (90 days)</li>
                    <li>Language and region preferences (1 year)</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Managing Your Cookie Preferences</h2>
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Browser Settings</h3>
                  <p className="mb-2 font-light">You can control cookies through your browser settings:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                    <li>Block all cookies</li>
                    <li>Block third-party cookies only</li>
                    <li>Delete existing cookies</li>
                    <li>Set cookie expiration preferences</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Cookie Consent</h3>
                  <p className="font-light">
                    When you first visit our website, you'll see a cookie consent banner. You can choose which 
                    types of cookies to accept or reject. You can change these preferences at any time through 
                    your account settings.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-white mb-2 flex items-center">
                    <Info className="w-5 h-5 mr-2" />
                    Important Note
                  </h3>
                  <p className="font-light">
                    Disabling certain cookies may affect the functionality of our website. Essential cookies 
                    cannot be disabled as they are necessary for basic site operation.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Your Rights</h2>
              <div className="space-y-4">
                <p className="font-light">Under applicable data protection laws, you have the right to:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>Be informed about our use of cookies</li>
                  <li>Give or withdraw consent for non-essential cookies</li>
                  <li>Access information about cookies we use</li>
                  <li>Request deletion of cookie data</li>
                  <li>Lodge a complaint with supervisory authorities</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Updates to This Policy</h2>
              <p className="font-light">
                We may update this Cookie Policy from time to time to reflect changes in our practices or for 
                legal reasons. We will notify you of any material changes by posting the updated policy on our 
                website and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Contact Us</h2>
              <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                <p className="mb-4 font-light">If you have any questions about our use of cookies, please contact us:</p>
                <div className="space-y-2 text-sm">
                  <p><strong className="text-white/90">Email:</strong> privacy@talariajournal.com</p>
                  <p><strong className="text-white/90">Subject:</strong> "Cookie Policy Inquiry"</p>
                  <p><strong className="text-white/90">Response Time:</strong> We aim to respond within 48 hours.</p>
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