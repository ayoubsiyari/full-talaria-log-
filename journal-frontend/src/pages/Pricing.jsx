import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { colors, colorUtils } from '../config/colors';
import {
  CheckCircle,
  Star,
  Sparkles,
  Zap,
  Shield,
  Users,
  ArrowRight,
  ExternalLink,
  Crown,
  Award,
  Lock,
  Globe
} from 'lucide-react';
import TalariaLogo from '../components/TalariaLogo';

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');

  const plans = [
    {
      name: "Starter",
      description: "Perfect for individual traders getting started",
      price: billingCycle === 'monthly' ? 29 : 290,
      originalPrice: billingCycle === 'monthly' ? 39 : 390,
      features: [
        "Up to 1,000 trades per month",
        "50+ performance metrics",
        "Basic AI insights",
        "CSV/Excel import",
        "Email support",
        "Mobile responsive"
      ],
      popular: false,
      cta: "Start Free Trial",
      color: "border-white/10 bg-white/5"
    },
    {
      name: "Professional",
      description: "For serious traders who demand excellence",
      price: billingCycle === 'monthly' ? 79 : 790,
      originalPrice: billingCycle === 'monthly' ? 99 : 990,
      features: [
        "Unlimited trades",
        "200+ performance metrics",
        "Advanced AI assistant",
        "Multi-platform import",
        "Advanced filtering",
        "Calendar view",
        "Priority support",
        "API access"
      ],
      popular: true,
      cta: "Start Free Trial",
      color: "border-purple-500/30 bg-purple-500/5"
    },
    {
      name: "Enterprise",
      description: "Institutional-grade tools for professional firms",
      price: "Custom",
      originalPrice: null,
      features: [
        "Everything in Professional",
        "Custom integrations",
        "White-label options",
        "Dedicated account manager",
        "Custom reporting",
        "Team collaboration",
        "Advanced security",
        "SLA guarantees"
      ],
      popular: false,
      cta: "Contact Sales",
      color: "border-white/10 bg-white/5"
    }
  ];

  const benefits = [
    {
      icon: Shield,
      title: "Bank-level Security",
      description: "End-to-end encryption and SOC 2 compliance"
    },
    {
      icon: Zap,
      title: "99.9% Uptime",
      description: "Enterprise-grade infrastructure and reliability"
    },
    {
      icon: Users,
      title: "Expert Support",
      description: "Dedicated support team with trading expertise"
    },
    {
      icon: Globe,
      title: "Global Access",
      description: "Available worldwide with local data centers"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 ${colors.components.nav.background} backdrop-blur-xl border-b ${colors.components.nav.border}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <TalariaLogo size="default" />
            </Link>
            
            <div className="hidden md:flex items-center space-x-1">
              <Link to="/features" className={`px-3 py-1.5 text-sm ${colors.components.nav.link} hover:${colors.components.nav.linkHover} hover:${colors.components.nav.linkBg} rounded-md transition-all duration-200 border border-transparent hover:${colors.components.nav.linkBorder}`}>
                Features
              </Link>
              
              <Link to="/contact" className={`px-3 py-1.5 text-sm ${colors.components.nav.link} hover:${colors.components.nav.linkHover} hover:${colors.components.nav.linkBg} rounded-md transition-all duration-200 border border-transparent hover:${colors.components.nav.linkBorder}`}>
                Contact
              </Link>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link to="/login" className={`px-3 py-1.5 text-sm ${colors.components.nav.link} hover:${colors.components.nav.linkHover} transition-all duration-200`}>
                Log in
              </Link>
              <Link to="/login" className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-white/90 transition-all duration-200 shadow-sm">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className={`inline-flex items-center space-x-2 ${colors.backgrounds.overlay} backdrop-blur-sm px-3 py-1.5 rounded-full border ${colors.borders.primary} mb-8`}>
              <div className={`w-2 h-2 ${colors.animations.pulse} rounded-full animate-pulse`} />
              <span className={`text-sm ${colors.text.secondary}`}>Simple, Transparent Pricing</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-normal mb-8 text-white leading-tight">
              Choose your
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  trading edge
                </span>
            </h1>
            
            <p className={`text-lg md:text-xl ${colors.text.secondary} mb-12 leading-relaxed max-w-3xl mx-auto font-light`}>
              From individual traders to institutional firms, we have the perfect plan to help you achieve 
              consistent profitability and professional growth.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center space-x-4 mb-12">
                              <span className={`text-sm ${billingCycle === 'monthly' ? colors.text.primary : colors.text.secondary}`}>
                 Monthly
                </span>
                <button
                  onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    billingCycle === 'yearly' ? 'bg-blue-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm ${billingCycle === 'yearly' ? colors.text.primary : colors.text.secondary}`}>
                  Yearly
                  <span className="ml-1 text-green-400">Save 25%</span>
                </span>
            </div>
          </div>
        </div>
      </section>

     

      {/* Benefits Section */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Trusted by
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  professionals
                </span>
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              Join thousands of traders who trust Talaria for their trading analytics and journaling needs.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center">
                                 <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <benefit.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-medium mb-3 text-white">{benefit.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Frequently Asked
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  Questions
                </span>
            </h2>
          </div>
          
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                question: "Can I change my plan at any time?",
                answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and are prorated."
              },
              {
                question: "Is there a free trial available?",
                answer: "Yes, we offer a 14-day free trial on all paid plans. No credit card required to start."
              },
              {
                question: "What payment methods do you accept?",
                answer: "We accept all major credit cards, PayPal, and bank transfers for enterprise plans."
              },
              {
                question: "Can I cancel my subscription?",
                answer: "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-medium mb-3 text-white">{faq.question}</h3>
                <p className="text-white/60 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Ready to start
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  your journey?
                </span>
            </h2>
            <p className="text-lg text-white/60 mb-8 leading-relaxed">
              Join thousands of professional traders who trust Talaria for their trading analytics and journaling needs.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                             <Link to="/login" className="group inline-flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white px-8 py-4 rounded-lg hover:from-blue-600 hover:to-blue-800 transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-xl">
                <Sparkles className="w-4 h-4" />
                <span>Start Free Trial</span>
              </Link>
              <Link to="/contact" className="group inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-lg border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-200 text-sm">
                <ExternalLink className="w-4 h-4" />
                <span>Contact Sales</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
