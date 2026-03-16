import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { colors, colorUtils } from '../config/colors';
import {
  Mail,
  Phone,
  MessageSquare,
  MapPin,
  Clock,
  Send,
  Sparkles,
  ExternalLink,
  Users,
  Shield,
  Zap,
  Award
} from 'lucide-react';
import TalariaLogo from '../components/TalariaLogo';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    type: 'general'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission
    console.log('Form submitted:', formData);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const contactMethods = [
    {
      icon: Mail,
      title: "Email Support",
      description: "Get help with your account or technical questions",
      contact: "support@talaria-trading.com",
      response: "Response within 24 hours",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "Chat with our support team in real-time",
      contact: "Available 24/7",
      response: "Instant response",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: Phone,
      title: "Phone Support",
      description: "Speak directly with our trading experts",
      contact: "+1 (555) 123-4567",
      response: "Available 9AM-6PM EST",
      color: "from-purple-500 to-pink-500"
    }
  ];

  const officeLocations = [
    {
      city: "New York",
      country: "United States",
      address: "123 Trading Street, Financial District",
      timezone: "EST (UTC-5)",
      icon: MapPin
    },
    {
      city: "London",
      country: "United Kingdom", 
      address: "456 Market Square, Canary Wharf",
      timezone: "GMT (UTC+0)",
      icon: MapPin
    },
    {
      city: "Singapore",
      country: "Singapore",
      address: "789 Finance Avenue, Marina Bay",
      timezone: "SGT (UTC+8)",
      icon: MapPin
    }
  ];

  const supportFeatures = [
    {
      icon: Users,
      title: "Expert Team",
      description: "Trading professionals with years of experience"
    },
    {
      icon: Shield,
      title: "Secure Communication",
      description: "End-to-end encrypted support channels"
    },
    {
      icon: Zap,
      title: "Fast Response",
      description: "Average response time under 2 hours"
    },
    {
      icon: Award,
      title: "Premium Support",
      description: "Priority support for Professional and Enterprise plans"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <TalariaLogo size="default" />
            </Link>
            
            <div className="hidden md:flex items-center space-x-1">
              <Link to="/features" className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-md transition-all duration-200 border border-transparent hover:border-white/10">
                Features
              </Link>
              
              <Link to="/contact" className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-md transition-all duration-200 border border-transparent hover:border-white/10">
                Contact
              </Link>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link to="/login" className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-all duration-200">
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
            <div className="inline-flex items-center space-x-2 bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 mb-8">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-white/80">Get in Touch</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-normal mb-8 text-white leading-tight">
              Let's discuss your
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  trading needs
                </span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/60 mb-12 leading-relaxed max-w-3xl mx-auto font-light">
              Whether you're looking for support, have questions about our platform, or want to discuss 
              enterprise solutions, we're here to help you succeed.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {contactMethods.map((method, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 hover:border-white/20 transition-all duration-300">
                <div className={`w-12 h-12 bg-gradient-to-r ${method.color} rounded-lg flex items-center justify-center mb-6`}>
                  <method.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">{method.title}</h3>
                <p className="text-white/60 mb-4 leading-relaxed">{method.description}</p>
                <div className="space-y-2">
                  <div className="text-white font-medium">{method.contact}</div>
                  <div className="text-sm text-white/60">{method.response}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & Office Locations */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Contact Form */}
            <div>
              <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
                Send us a
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  message
                </span>
              </h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">
                Fill out the form below and we'll get back to you within 24 hours. 
                For urgent matters, please use our live chat or phone support.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 transition-colors"
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 transition-colors"
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Company</label>
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Your company (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Inquiry Type</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="general">General Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="sales">Sales Question</option>
                    <option value="enterprise">Enterprise Solution</option>
                    <option value="partnership">Partnership</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Message</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={6}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    placeholder="Tell us how we can help you..."
                    required
                  />
                </div>

                <button
                  type="submit"
                                     className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white px-8 py-4 rounded-lg hover:from-blue-600 hover:to-blue-800 transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-xl"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Message</span>
                </button>
              </form>
            </div>

            {/* Office Locations */}
            <div>
              <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
                Global
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  presence
                </span>
              </h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">
                We have offices around the world to serve our global community of traders 
                and provide local support in your timezone.
              </p>

              <div className="space-y-6">
                {officeLocations.map((office, index) => (
                  <div key={index} className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                        <office.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {office.city}, {office.country}
                        </h3>
                        <p className="text-white/60 text-sm mb-2">{office.address}</p>
                        <div className="flex items-center space-x-2 text-xs text-white/40">
                          <Clock className="w-3 h-3" />
                          <span>{office.timezone}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Support Features */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Why choose our
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  support?
                </span>
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              Our support team consists of trading professionals who understand your needs and challenges.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {supportFeatures.map((feature, index) => (
              <div key={index} className="text-center">
                                 <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-medium mb-3 text-white">{feature.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Ready to get
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  started?
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
              <Link to="/pricing" className="group inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-lg border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-200 text-sm">
                <ExternalLink className="w-4 h-4" />
                <span>View Pricing</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
