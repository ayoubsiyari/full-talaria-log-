import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/LOGO-06.png';
import { motion } from 'framer-motion';

import { colors, colorUtils } from '../config/colors';
import {
  BookOpen,
  BarChart3,
  Brain,
  Upload,
  Filter,
  Calendar,
  Database,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import LogoGlowEffect from '../components/LogoGlowEffect';
import BackgroundGlow from '../components/BackgroundGlow';
import PlatformMarquee from '../components/PlatformMarquee';

const Section = ({ children, className, ...rest }) => {
  return (
    <motion.section
      className={`py-20 relative ${className}`}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      {...rest}
    >
      {children}
    </motion.section>
  );
};

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    setIsVisible(true);
  }, []);

  const stats = [
    { value: "200+", label: "Performance Metrics", icon: BarChart3 },
    { value: "24/7", label: "AI Assistant", icon: Brain },
    { value: "10+", label: "Platform Support", icon: Upload },
    { value: "∞", label: "Custom Variables", icon: Filter }
  ];

  const features = [
    {
      icon: BookOpen,
      title: "Professional Journaling",
      description: "Comprehensive trade journal with detailed entry/exit tracking, strategy documentation, and emotional state monitoring.",
      badge: "Core",
      color: "border-purple-500/30"
    },
    {
      icon: BarChart3,
      title: "Performance Tracking",
      description: "200+ performance metrics including Sharpe ratio, profit factor, max drawdown, equity curves, and custom calculations.",
      badge: "Analytics",
      color: "border-blue-500/30"
    },
    {
      icon: Brain,
      title: "AI Trading Assistant",
      description: "Intelligent analysis of your trading patterns, behavioral insights, and personalized recommendations for improvement.",
      badge: "New",
      color: "border-green-500/30"
    },
    {
      icon: Upload,
      title: "Multi-Platform Import",
      description: "Import trades from MetaTrader, cTrader, NinjaTrader, TradingView, and custom CSV/Excel files with smart mapping.",
      badge: "Integration",
      color: "border-orange-500/30"
    },
    {
      icon: Filter,
      title: "Advanced Filtering",
      description: "Filter by date, symbol, strategy, P&L ranges, custom variables, and complex variable combinations for deep analysis.",
      badge: "Pro",
      color: "border-indigo-500/30"
    },
    {
      icon: Calendar,
      title: "Calendar View",
      description: "Visual calendar interface showing daily performance, trade distribution, and time-based pattern analysis.",
      badge: "Visual",
      color: "border-pink-500/30"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const logoVariants = {
    animate: {
      rotate: [0, 360],
      scale: [1, 1.02, 1],
      transition: {
        rotate: {
          duration: 40,
          ease: "linear",
          repeat: Infinity,
        },
        scale: {
          duration: 5,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "mirror"
        }
      }
    },
    hover: {
      scale: 1.1,
      boxShadow: "0px 0px 30px rgba(59, 130, 246, 0.7)",
      transition: {
        duration: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <div className={`min-h-screen text-white relative`} style={{backgroundColor: colors.backgrounds.primary}}>
      <div className="fixed inset-0 overflow-hidden -z-10 pointer-events-none">
        <BackgroundGlow />
      </div>
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'grid-move 25s linear infinite'
        }} />
      </div>

      <div className="relative z-0">
        <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`fixed top-0 w-full z-50 ${colors.components.nav.background} backdrop-blur-xl border-b ${colors.components.nav.border}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.div whileHover={{ scale: 1.05, rotate: -5 }} transition={{ type: 'spring', stiffness: 400, damping: 10 }}>
              <Link to="/" className="flex items-center space-x-3 group">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/10 group-hover:bg-white/15 transition-all duration-300">
                  <img src={logo} alt="Talaria Logo" className="w-6 h-6 rounded-sm" />
                </div>
                <span className={`text-xl font-semibold ${colors.text.primary}`}>
                  Talaria
                </span>
              </Link>
            </motion.div>
            
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
              <Link to="/login " className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-white/90 transition-all duration-200 shadow-sm">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </motion.nav>

      <section className="relative pt-40 pb-20">
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            className="text-center max-w-4xl mx-auto"
            initial="hidden"
            animate={isVisible ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className={`inline-flex items-center space-x-2 ${colors.backgrounds.overlay} backdrop-blur-sm px-3 py-1.5 rounded-full border ${colors.borders.primary} mb-8`}>
              <div className={`w-2 h-2 ${colors.animations.pulse} rounded-full animate-pulse`} />
              <span className={`text-sm ${colors.text.secondary}`}>Elevate Your Trading Game</span>
            </motion.div>
            <div className="moon-container flex justify-center items-center">
                <div className="moon-ambient-glow"></div>
                <div className="moon-sphere">
                  <motion.img
                    src={logo}
                    alt="Talaria Logo"
                    className="moon-logo w-40 h-40 rounded-full"
                    variants={logoVariants}
                    animate="animate"
                    whileHover="hover"
                  />
                </div>
              </div>
            
            <motion.h1 variants={itemVariants} className={`text-5xl md:text-7xl lg:text-8xl font-normal mb-8 leading-tight tracking-tight ${colors.text.primary}`}>
              Professional Trading
              <br />
              <span className={colorUtils.getTextGradient()}>Journal</span>
            </motion.h1>
            
            <motion.p variants={itemVariants} className={`text-lg md:text-xl ${colors.text.secondary} mb-12 leading-relaxed max-w-3xl mx-auto font-light`}>
              AI-powered analytics with 200+ performance metrics. Import from 10+ platforms and get intelligent insights to transform your trading performance.
            </motion.p>

            <motion.div 
              variants={itemVariants} 
              className="flex justify-center items-center mb-20 relative z-30"
              whileHover={{ scale: 1.05 }}
              animate={{
                scale: [1, 1.02, 1],
                transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
              }}
            >
              
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/login" className={colorUtils.getButtonClasses('primary')}>
                <Sparkles className="w-4 h-4" />
                <span>Start Free Trial</span>
              </Link>
              <Link to="/features" className={colorUtils.getButtonClasses('secondary')}>
                <ExternalLink className="w-4 h-4" />
                <span>Explore Features</span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Section>
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-4 mb-12">
            <div className={`${colorUtils.getBadgeClasses()} flex items-center space-x-2`}>
              <BookOpen className={`w-4 h-4 ${colors.components.badge.icon}`} />
              <span className={`text-sm ${colors.components.badge.text} font-medium`}>Core Features</span>
            </div>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className={`text-4xl md:text-5xl font-normal mb-6 leading-tight ${colors.text.primary}`}>
                Enterprise-grade trading
                <br />
                <span className={colorUtils.getTextGradient()}>analytics</span>
              </h2>
              <p className={`text-lg ${colors.text.secondary} mb-8 leading-relaxed font-light`}>
                Track 200+ performance metrics with institutional-grade precision. Our AI analyzes your trading patterns 
                to provide personalized insights that help you identify strengths, weaknesses, and opportunities for improvement.
              </p>
            </div>
            
            <motion.div 
              className="relative"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className={colorUtils.getCardClasses()}>
                <div className={`flex items-center justify-between mb-6 pb-4 border-b ${colors.borders.primary}`}>
                  <div className="flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-3 h-3 bg-red-500/60 rounded-full" />
                      <div className="w-3 h-3 bg-yellow-500/60 rounded-full" />
                      <div className="w-3 h-3 bg-green-500/60 rounded-full" />
                    </div>
                    <span className={`text-sm ${colors.text.secondary}`}>Trading Dashboard</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 ${colors.animations.pulse} rounded-full animate-pulse`} />
                    <span className={`text-xs ${colors.text.tertiary}`}>Live</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {stats.map((stat, index) => (
                    <div key={index} className={`${colors.backgrounds.secondary} rounded-lg p-4 border ${colors.borders.primary}`}>
                      <div className="flex items-center space-x-3 mb-2">
                        <div className={`w-8 h-8 ${colors.backgrounds.tertiary} rounded-lg flex items-center justify-center`}>
                          <stat.icon className={`w-4 h-4 ${colors.text.secondary}`} />
                        </div>
                        <div>
                          <div className={`text-lg font-semibold ${colors.text.primary}`}>{stat.value}</div>
                          <div className={`text-xs ${colors.text.tertiary}`}>{stat.label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className={colors.text.secondary}>Win Rate</span>
                    <span className="text-green-400">68.5%</span>
                  </div>
                  <div className={`w-full ${colors.backgrounds.secondary} rounded-full h-2`}>
                    <div className="bg-green-400 h-2 rounded-full" style={{ width: '68.5%' }} />
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className={colors.text.secondary}>Profit Factor</span>
                    <span className="text-blue-400">2.34</span>
                  </div>
                  <div className={`w-full ${colors.backgrounds.secondary} rounded-full h-2`}>
                    <div className="bg-blue-400 h-2 rounded-full" style={{ width: '85%' }} />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="container mx-auto px-6">
          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {features.map((feature, index) => (
              <motion.div 
                key={index}
                variants={itemVariants}
                whileHover={{ y: -8, scale: 1.03 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={`group ${colors.components.card.background} rounded-xl p-6 border ${colors.components.card.border} transition-all duration-300 ${colors.components.card.hover} ${feature.color}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-white/80" />
                  </div>
                  <span className="text-xs px-2 py-1 bg-white/10 rounded-full text-white/60 border border-white/10">
                    {feature.badge}
                  </span>
                </div>
                
                <h3 className={`text-lg font-medium mb-3 ${colors.text.primary}`}>{feature.title}</h3>
                <p className={`text-sm ${colors.text.secondary} leading-relaxed font-light`}>{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      <Section>
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className={`${colors.components.card.background} rounded-2xl p-8 md:p-12 border ${colors.borders.primary} shadow-2xl`}>
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`text-lg font-medium ${colors.text.primary}`}>AI Trading Assistant</h3>
                  <p className={`text-sm ${colors.text.secondary}`}>Powered by advanced machine learning</p>
                </div>
              </div>
              
              <blockquote className={`text-xl md:text-2xl text-white/90 leading-relaxed mb-8 font-light`}>
                "We analyze thousands of trading patterns to provide personalized insights that help traders 
                identify their strengths, weaknesses, and opportunities for improvement. The AI continuously 
                learns from your trading behavior to deliver increasingly accurate recommendations."
              </blockquote>
              
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className={`text-sm font-medium ${colors.text.primary}`}>AI Engine</div>
                  <div className={`text-xs ${colors.text.secondary}`}>Trading Intelligence System</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <LogoGlowEffect />
      </Section>

      <Section>
        <div className="container mx-auto px-6">
          <div className="flex items-center space-x-4 mb-12">
            <div className="flex items-center space-x-2 bg-blue-500/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-blue-500/20">
              <Upload className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300 font-medium">Integrations</span>
            </div>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className={`text-4xl md:text-5xl font-normal mb-6 leading-tight ${colors.text.primary}`}>
                Import from any platform
              </h2>
              <p className={`text-lg ${colors.text.secondary} mb-8 leading-relaxed font-light`}>
                Seamlessly import your trades from MetaTrader, cTrader, NinjaTrader, TradingView, 
                and custom CSV/Excel files with intelligent mapping and validation.
              </p>
              
              <motion.div 
                className="space-y-4"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                {[
                  { name: "MetaTrader 4/5", status: "Connected" },
                  { name: "cTrader", status: "Available" },
                  { name: "NinjaTrader", status: "Available" },
                  { name: "TradingView", status: "Coming Soon" }
                ].map((platform, index) => (
                  <motion.div 
                    key={index} 
                    variants={itemVariants}
                    className={`flex items-center justify-between p-3 ${colors.backgrounds.secondary} rounded-lg border ${colors.borders.primary}`}>
                    <div className="flex items-center space-x-3">
                      <Database className={`w-4 h-4 ${colors.text.secondary}`} />
                      <span className={`text-sm ${colors.text.primary}`}>{platform.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      platform.status === 'Connected' 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : platform.status === 'Available'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {platform.status}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            </div>
            
            <motion.div 
              className="relative"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className={colorUtils.getCardClasses()}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-sm ${colors.text.secondary}`}>Import Progress</span>
                  <span className="text-sm text-green-400">1,247 trades imported</span>
                </div>
                <div className={`w-full ${colors.backgrounds.tertiary} rounded-full h-2 mb-6`}>
                  <div className="bg-green-400 h-2 rounded-full animate-pulse" style={{ width: '89%' }} />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className={colors.text.secondary}>Processing speed</span>
                    <span className={colors.text.primary}>~2.3k trades/min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={colors.text.secondary}>Data validation</span>
                    <span className="text-green-400">99.7% accuracy</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={colors.text.secondary}>Duplicate detection</span>
                    <span className="text-blue-400">12 found, 12 merged</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </Section>

      <Section className="text-center">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className={`text-4xl md:text-5xl font-normal mb-6 leading-tight ${colors.text.primary}`}>
              Ready to scale to the next level?
            </h2>
            <p className={`text-lg ${colors.text.secondary} mb-8 font-light`}>
              Join thousands of professional traders who use Journal to track, analyze, and optimize their performance.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link to="/login" className={colorUtils.getButtonClasses('primary')}>
                Start free trial
              </Link>
              <Link to="/features" className={colorUtils.getButtonClasses('secondary')}>
                View features
              </Link>
            </div>
            
            <div className={`flex items-center justify-center space-x-8 text-xs ${colors.text.tertiary}`}>
              <span>No credit card required</span>
              <span>•</span>
              <span>14-day free trial</span>
              <span>•</span>
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </Section>

      <PlatformMarquee />

      <footer className={`py-12 border-t ${colors.borders.primary}`}>
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className={`w-6 h-6 ${colors.backgrounds.tertiary} rounded-md flex items-center justify-center`}>
                  <img src={logo} alt="Talaria Logo" className="w-4 h-4 rounded-sm" />
                </div>
                <span className={`text-sm font-medium ${colors.text.primary}`}>Talaria</span>
              </div>
              <p className={`text-xs ${colors.text.tertiary} leading-relaxed`}>
                Professional trading journal with AI-powered insights and institutional-level tools.
              </p>
            </div>

            <div>
              <h3 className={`text-sm font-medium ${colors.text.primary} mb-3`}>Product</h3>
              <div className="space-y-2">
                <Link to="/features" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Features</Link>
               <Link to="/integrations" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Integrations</Link>
              </div>
            </div>

            <div>
              <h3 className={`text-sm font-medium ${colors.text.primary} mb-3`}>Resources</h3>
              <div className="space-y-2">
                <Link to="/docs" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Documentation</Link>
                <Link to="/support" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Support</Link>
                <Link to="/contact" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Contact</Link>
              </div>
            </div>

            <div>
              <h3 className={`text-sm font-medium ${colors.text.primary} mb-3`}>Legal</h3>
              <div className="space-y-2">
                <Link to="/privacy-policy" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Privacy Policy</Link>
                <Link to="/terms" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Terms of Service</Link>
                <Link to="/legal" className={`block text-xs ${colors.text.secondary} hover:text-white transition-colors`}>Legal Information</Link>
              </div>
            </div>
          </div>

          <div className={`flex flex-col md:flex-row items-center justify-between pt-8 border-t ${colors.borders.primary}`}>
            <div className={`text-xs ${colors.text.tertiary} mb-4 md:mb-0`}>
              © 2025 Talaria. Professional Trading Intelligence.
            </div>
            <div className={`text-xs ${colors.text.tertiary}`}>
              Built for traders worldwide
            </div>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
