import React from 'react';
import { Link } from 'react-router-dom';
import { colors, colorUtils } from '../config/colors';
import {
  BookOpen,
  BarChart3,
  Brain,
  Upload,
  Filter,
  Calendar,
  TrendingUp,
  Target,
  Zap,
  Shield,
  Users,
  Clock,
  Star,
  ArrowRight,
  CheckCircle,
  Activity,
  Database,
  FileText,
  Settings,
  Award,
  DollarSign,
  ChevronRight,
  Play,
  Sparkles,
  Globe,
  Layers,
  ExternalLink,
  Lock,
  Eye,
  PieChart,
  LineChart,
  BarChart,
  Scatter,
  AreaChart,
  RefreshCw
} from 'lucide-react';
import TalariaLogo from '../components/TalariaLogo';

export default function Features() {
  const features = [
    {
      category: "Core Analytics",
      items: [
        {
          icon: BarChart3,
          title: "200+ Performance Metrics",
          description: "Comprehensive analytics including Sharpe ratio, profit factor, max drawdown, equity curves, and custom calculations.",
          highlight: "Enterprise-grade precision"
        },
        {
          icon: PieChart,
          title: "Advanced Charting",
          description: "Interactive charts and visualizations for deep performance analysis and pattern recognition.",
          highlight: "Professional insights"
        },
        {
          icon: TrendingUp,
          title: "Real-time Tracking",
          description: "Live performance monitoring with instant updates and alerts for critical metrics.",
          highlight: "Always current"
        }
      ]
    },
    {
      category: "AI Intelligence",
      items: [
        {
          icon: Brain,
          title: "AI Trading Assistant",
          description: "Intelligent analysis of your trading patterns, behavioral insights, and personalized recommendations.",
          highlight: "Machine learning powered"
        },
        {
          icon: Target,
          title: "Pattern Recognition",
          description: "Advanced algorithms identify profitable patterns and suggest optimization strategies.",
          highlight: "Predictive analytics"
        },
        {
          icon: Sparkles,
          title: "Smart Recommendations",
          description: "AI-generated insights help you improve decision-making and trading performance.",
          highlight: "Personalized guidance"
        }
      ]
    },
    {
      category: "Professional Tools",
      items: [
        {
          icon: BookOpen,
          title: "Trade Journaling",
          description: "Comprehensive trade documentation with detailed entry/exit tracking and strategy notes.",
          highlight: "Complete record keeping"
        },
        {
          icon: Filter,
          title: "Advanced Filtering",
          description: "Filter by date, symbol, strategy, P&L ranges, and complex variable combinations.",
          highlight: "Granular analysis"
        },
        {
          icon: Calendar,
          title: "Calendar View",
          description: "Visual calendar interface showing daily performance and time-based pattern analysis.",
          highlight: "Time-based insights"
        }
      ]
    },
    {
      category: "Platform Integration",
      items: [
        {
          icon: Upload,
          title: "Multi-Platform Import",
          description: "Import from MetaTrader, cTrader, NinjaTrader, TradingView, and custom CSV/Excel files.",
          highlight: "10+ platforms supported"
        },
        {
          icon: Database,
          title: "Smart Mapping",
          description: "Intelligent field mapping and validation for accurate data import and processing.",
          highlight: "Error-free imports"
        },
        {
          icon: RefreshCw,
          title: "Automated Sync",
          description: "Set up automatic synchronization with your trading platforms for real-time updates.",
          highlight: "Always up-to-date"
        }
      ]
    }
  ];

  const benefits = [
    {
      icon: Award,
      title: "Professional Grade",
      description: "Enterprise-level tools trusted by institutional traders and serious professionals."
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Bank-level security with end-to-end encryption and complete data privacy."
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Optimized performance with instant loading and real-time data processing."
    },
    {
      icon: Users,
      title: "Community Driven",
      description: "Join a community of professional traders sharing insights and strategies."
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
              <span className={`text-sm ${colors.text.secondary}`}>Professional Features</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-normal mb-8 text-white leading-tight">
              Everything you need to
              <br />
                              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  elevate your trading
                </span>
            </h1>
            
            <p className={`text-lg md:text-xl ${colors.text.secondary} mb-12 leading-relaxed max-w-3xl mx-auto font-light`}>
              From AI-powered insights to enterprise-grade analytics, Talaria provides the complete toolkit 
              for professional traders who demand excellence.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          {features.map((category, categoryIndex) => (
            <div key={categoryIndex} className="mb-20">
              <div className="flex items-center space-x-4 mb-12">
                <div className="flex items-center space-x-2 bg-blue-500/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-blue-500/20">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-blue-300 font-medium">{category.category}</span>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.items.map((feature, index) => (
                  <div 
                    key={index}
                    className={colorUtils.getCardClasses()}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                        <feature.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className={`text-xs px-2 py-1 ${colors.backgrounds.tertiary} rounded-full ${colors.text.secondary} border ${colors.borders.primary}`}>
                        {feature.highlight}
                      </span>
                    </div>
                    
                    <h3 className={`text-lg font-medium mb-3 ${colors.text.primary}`}>{feature.title}</h3>
                    <p className={`text-sm ${colors.text.secondary} leading-relaxed font-light`}>{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-normal mb-6 text-white leading-tight">
              Why choose
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                Talaria?
              </span>
            </h2>
            <p className={`text-lg ${colors.text.secondary} max-w-2xl mx-auto`}>
              Built by traders, for traders. Every feature is designed to help you achieve consistent profitability.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center">
                                 <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <benefit.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className={`text-lg font-medium mb-3 ${colors.text.primary}`}>{benefit.title}</h3>
                <p className={`text-sm ${colors.text.secondary} leading-relaxed`}>{benefit.description}</p>
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
              Ready to transform
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                your trading?
              </span>
            </h2>
            <p className={`text-lg ${colors.text.secondary} mb-8 leading-relaxed`}>
              Join thousands of professional traders who trust Talaria for their trading analytics and journaling needs.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                              <Link to="/login" className="group inline-flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white px-8 py-4 rounded-lg hover:from-blue-600 hover:to-blue-800 transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-xl">
                <Sparkles className="w-4 h-4" />
                <span>Start Free Trial</span>
              </Link>
              <Link to="/contact" className={colorUtils.getButtonClasses('secondary')}>
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
