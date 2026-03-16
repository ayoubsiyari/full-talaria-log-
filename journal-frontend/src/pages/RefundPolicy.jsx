import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo4.jpg';
import { ArrowLeft, RefreshCw, CreditCard, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function RefundPolicy() {
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
              <RefreshCw className="w-6 h-6 text-white/80" />
            </div>
            <h1 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Refund Policy
            </h1>
            <p className="text-white/60 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Policy Content */}
          <div className="space-y-12 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-2xl font-medium text-white mb-4">30-Day Money-Back Guarantee</h2>
              <p className="font-light">
                We offer a 30-day money-back guarantee on all paid subscriptions. If you're not completely satisfied 
                with Journal within the first 30 days of your subscription, we'll provide a full refund, no questions asked.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-white/60" />
                Refund Eligibility
              </h2>
              <div className="space-y-6">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Eligible for Refund</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Subscriptions purchased within the last 30 days</li>
                    <li>First-time subscribers to a particular plan</li>
                    <li>Technical issues that prevent service usage</li>
                    <li>Billing errors or unauthorized charges</li>
                    <li>Dissatisfaction with service features</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Not Eligible for Refund</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Subscriptions older than 30 days</li>
                    <li>Repeated refund requests for the same plan</li>
                    <li>Violation of terms of service</li>
                    <li>Fraudulent or abusive usage</li>
                    <li>Partial month refunds (except for billing errors)</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-3 text-white/60" />
                Refund Process
              </h2>
              <div className="space-y-4">
                <p className="font-light">To request a refund, please follow these steps:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Contact our support team at support@journal.com</li>
                    <li>Include your account email and reason for refund</li>
                    <li>Provide your subscription details and payment information</li>
                    <li>Allow 3-5 business days for processing</li>
                    <li>Receive confirmation and refund timeline</li>
                  </ol>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <CreditCard className="w-5 h-5 mr-3 text-white/60" />
                Refund Timeline
              </h2>
              <div className="space-y-4">
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <h3 className="text-lg font-medium text-white mb-2">Processing Times</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-white/90">Credit Cards:</strong> 5-10 business days</p>
                    <p><strong className="text-white/90">PayPal:</strong> 3-5 business days</p>
                    <p><strong className="text-white/90">Bank Transfers:</strong> 7-14 business days</p>
                    <p><strong className="text-white/90">Digital Wallets:</strong> 1-3 business days</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Subscription Cancellation</h2>
              <div className="space-y-4">
                <p className="font-light">You can cancel your subscription at any time:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Access your account settings</li>
                    <li>Navigate to subscription management</li>
                    <li>Click "Cancel Subscription"</li>
                    <li>Your access continues until the end of the billing period</li>
                    <li>No automatic renewal after cancellation</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Pro-rated Refunds</h2>
              <div className="space-y-4">
                <p className="font-light">In certain circumstances, we may offer pro-rated refunds:</p>
                <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Billing errors or system malfunctions</li>
                    <li>Service downtime exceeding our SLA</li>
                    <li>Plan downgrades within the billing cycle</li>
                    <li>Extraordinary circumstances at our discretion</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Free Trial Policy</h2>
              <div className="space-y-4">
                <p className="font-light">Our free trial policy:</p>
                <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-lg">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>14-day free trial for all paid plans</li>
                    <li>No credit card required to start</li>
                    <li>Cancel anytime during trial period</li>
                    <li>No charges if cancelled before trial ends</li>
                    <li>One free trial per customer per plan</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-3 text-white/60" />
                Important Notes
              </h2>
              <div className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-6 rounded-lg">
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Refunds are processed to the original payment method</li>
                    <li>Processing fees may not be refundable</li>
                    <li>Currency conversion fees are non-refundable</li>
                    <li>Account data may be deleted after refund processing</li>
                    <li>Re-subscription after refund may require new payment setup</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-medium text-white mb-4">Contact Information</h2>
              <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                <p className="mb-4 font-light">For refund requests or questions about our refund policy:</p>
                <div className="space-y-2 text-sm">
                  <p><strong className="text-white/90">Email:</strong> support@journal.com</p>
                  <p><strong className="text-white/90">Subject:</strong> "Refund Request" or "Refund Policy Question"</p>
                  <p><strong className="text-white/90">Response Time:</strong> We aim to respond within 24 hours</p>
                  <p><strong className="text-white/90">Processing Time:</strong> 3-5 business days for refund approval</p>
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
