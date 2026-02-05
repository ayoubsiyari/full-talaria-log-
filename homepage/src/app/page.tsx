"use client";
import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SparklesCore } from "@/components/ui/sparkles";
import { Button } from "@/components/ui/button";
import { useLanguage } from "./LanguageProvider";
import SiteDisclosuresFooter from "@/components/SiteDisclosuresFooter";
import Image from "next/image";
import {
  TrendingUp,
  BarChart3,
  LineChart,
  Shield,
  Zap,
  Clock,
  ChevronRight,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

import NinjaTraderWordmark from "../../ninjatrader/Landing-Page-Text-Images/NinjaTrader/NinjaTrader_Wordmark_color_RGB.png";

const talariaBrands = [
  
  { name: "Talaria-Prop", href: "#" },
  { name: "Talaria-Flow", href: "#" },
  { name: "Talaria-Copy", href: "#" },
];

export default function HomePage() {
  const { isArabic } = useLanguage();

  const t = React.useMemo(
    () =>
      isArabic
        ? {
            tabs: {
              bootcamp: "المنتورشيب",
              soon: "قريباً",
            },
            hero: {
              titleA: "تداول",
              titleB: "بذكاء",
              subtitle:
                "",
            },
            footer: {
              brandLine: "أدوات تداول احترافية للمتداولين الجادّين.",
              legal: "",
              privacy: "سياسة الخصوصية",
              terms: "شروط الخدمة",
              refunds: "سياسة الاسترجاع",
              disclaimer: "إخلاء مسؤولية التداول",
              contact: "تواصل",
              emailSupport: "دعم عبر البريد الإلكتروني",
              rights: "© 2026 Talaria Log جميع الحقوق محفوظة.",
              riskLine:
                "",
            },
            disclosures: {
              riskTitle: "إفصاح المخاطر:",
              riskText:
                "تداول العقود الآجلة والفوركس ينطوي على مخاطر كبيرة وليس مناسباً لكل مستثمر. قد يخسر المستثمر كامل أو أكثر من الاستثمار الأولي. رأس المال المعرض للمخاطر هو المال الذي يمكن خسارته دون التأثير على الأمن المالي أو نمط الحياة. ينبغي استخدام رأس مال المخاطر فقط للتداول، ولا ينبغي إلا لمن يملكون رأس مال كافٍ للتداول أن يفكروا في ذلك. الأداء السابق ليس بالضرورة مؤشراً على النتائج المستقبلية.",
              hypoTitle: "إفصاح الأداء الافتراضي:",
              hypoText:
                "لنتائج الأداء الافتراضي العديد من القيود الجوهرية، وبعضها موضح أدناه. لا يتم تقديم أي تمثيل بأن أي حساب سيحقق أو من المحتمل أن يحقق أرباحاً أو خسائر مشابهة لما هو معروض؛ في الواقع توجد غالباً فروقات كبيرة بين النتائج الافتراضية والنتائج الفعلية التي تتحقق لاحقاً لأي برنامج تداول محدد. أحد قيود النتائج الافتراضية أنها تُعد عادةً مع الاستفادة من معرفة ما حدث في الماضي. بالإضافة إلى ذلك، لا ينطوي التداول الافتراضي على مخاطرة مالية، ولا يمكن لأي سجل تداول افتراضي أن يراعي بالكامل تأثير المخاطرة المالية في التداول الفعلي. على سبيل المثال، القدرة على تحمل الخسائر أو الالتزام ببرنامج تداول معين رغم الخسائر هي نقاط مهمة قد تؤثر سلباً على النتائج الفعلية. توجد عوامل عديدة أخرى مرتبطة بالأسواق عموماً أو بتطبيق أي برنامج تداول محدد لا يمكن أخذها بالكامل في الاعتبار عند إعداد النتائج الافتراضية، وكلها قد تؤثر سلباً على نتائج التداول.",
              liveTitle: "إفصاح غرفة التداول المباشر:",
              liveText:
                "هذا العرض للأغراض التعليمية فقط والآراء المعبر عنها هي آراء المقدم فقط. جميع الصفقات المعروضة يجب اعتبارها افتراضية ولا ينبغي توقع تكرارها في حساب تداول حقيقي.",
              testTitle: "إفصاح الشهادات:",
              testText:
                "الشهادات الظاهرة على هذا الموقع قد لا تكون ممثلة لعملاء أو مستخدمين آخرين ولا تعد ضماناً للأداء أو النجاح مستقبلاً.",
            },
          }
        : {
            tabs: {
              bootcamp: "Mentorship",
              soon: "Soon",
            },
            hero: {
              titleA: "Trade",
              titleB: "Smarter",
              subtitle:
                "",
            },
            footer: {
              brandLine: "Professional trading tools for serious traders.",
              legal: "Legal",
              privacy: "Privacy Policy",
              terms: "Terms of Service",
              refunds: "Refund Policy",
              disclaimer: "Trading Disclaimer",
              contact: "Contact",
              emailSupport: "Email Support",
              rights: "© 2026 Talaria Log . All rights reserved.",
              riskLine:
                "",
            },
            disclosures: {
              riskTitle: "Risk Disclosure:",
              riskText:
                "Futures and forex trading contains substantial risk and is not for every investor. An investor could potentially lose all or more than the initial investment. Risk capital is money that can be lost without jeopardizing ones’ financial security or lifestyle. Only risk capital should be used for trading and only those with sufficient risk capital should consider trading. Past performance is not necessarily indicative of future results.",
              hypoTitle: "Hypothetical Performance Disclosure:",
              hypoText:
                "Hypothetical performance results have many inherent limitations, some of which are described below. No representation is being made that any account will or is likely to achieve profits or losses similar to those shown; in fact, there are frequently sharp differences between hypothetical performance results and the actual results subsequently achieved by any particular trading program. One of the limitations of hypothetical performance results is that they are generally prepared with the benefit of hindsight. In addition, hypothetical trading does not involve financial risk, and no hypothetical trading record can completely account for the impact of financial risk of actual trading. for example, the ability to withstand losses or to adhere to a particular trading program in spite of trading losses are material points which can also adversely affect actual trading results. There are numerous other factors related to the markets in general or to the implementation of any specific trading program which cannot be fully accounted for in the preparation of hypothetical performance results and all which can adversely affect trading results.",
              liveTitle: "Live Trade Room Disclosure:",
              liveText:
                "This presentation is for educational purposes only and the opinions expressed are those of the presenter only. All trades presented should be considered hypothetical and should not be expected to be replicated in a live trading account.",
              testTitle: "Testimonial Disclosure:",
              testText:
                "Testimonials appearing on this website may not be representative of other clients or customers and is not a guarantee of future performance or success.",
            },
          },
    [isArabic]
  );

  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 300);
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (dropdownOpen && !target.closest('[data-dropdown-container]')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <main className="min-h-screen bg-[#030014] overflow-hidden">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Dark gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#030014] to-[#0a0a1a]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
        
        {/* Sparkles Background */}
        <div className="absolute inset-0 w-full h-full">
          <SparklesCore
            id="tsparticlesfullpage"
            background="transparent"
            minSize={0.4}
            maxSize={1.2}
            particleDensity={100}
            className="w-full h-full"
            particleColor="#6366f1"
            speed={0.5}
          />
        </div>

        {/* Navigation */}
        <nav className="absolute top-0 left-0 right-0 z-50 px-2 sm:px-6 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div
              className="relative"
              data-dropdown-container
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropdownOpen(!dropdownOpen);
                }}
              >
                  <Image src="/logo-04.png" alt="Talaria" width={40} height={40} className="h-8 w-8 sm:h-10 sm:w-10" />
                  <span className="text-base sm:text-2xl font-bold text-white whitespace-nowrap">Talaria-Log</span>
                  <ChevronDown 
                    className={`h-5 w-5 text-white/80 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} 
                    strokeWidth={2.5}
                  />
                </motion.div>
              {dropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute top-full right-0 sm:left-0 sm:right-auto pt-2 z-[100]"
                >
                  <div className="w-72 sm:w-80 max-w-[calc(100vw-1rem)] rounded-2xl bg-[#08080f]/98 backdrop-blur-xl border border-purple-500/20 shadow-2xl shadow-purple-900/30 p-3 sm:p-4">
                    <div className="flex flex-col gap-3">
                    {talariaBrands.map((brand, index) => {
                      const cardStyles = [
                        { color: '#eab308', ring: 'ring-yellow-500/60 shadow-yellow-500/30' },
                        { color: '#ec4899', ring: 'ring-pink-500/60 shadow-pink-500/30' },
                        { color: '#06b6d4', ring: 'ring-cyan-500/60 shadow-cyan-500/30' },
                        { color: '#3b82f6', ring: 'ring-blue-500/60 shadow-blue-500/30' },
                      ];
                      const style = cardStyles[index];
                      const suffix = brand.name.includes('-') ? brand.name.split('-').slice(1).join('-') : brand.name;
                      return (
                        <motion.div
                          key={brand.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.08, ease: "easeOut" }}
                          whileHover={{ scale: 1.03 }}
                          className="group relative flex items-center justify-center p-5 rounded-xl overflow-hidden cursor-not-allowed shadow-lg bg-black pointer-events-auto select-none"
                          onClick={(e) => e.preventDefault()}
                        >
                          <div className="absolute inset-0 overflow-hidden">
                            <motion.div 
                              className="absolute w-32 h-32 rounded-full blur-2xl"
                              animate={{ 
                                x: ['-20%', '120%', '-20%'],
                                y: ['0%', '50%', '0%'],
                                scale: [1, 1.2, 1]
                              }}
                              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                              style={{ background: style.color, opacity: 0.4 }}
                            />
                            <motion.div 
                              className="absolute w-24 h-24 rounded-full blur-xl"
                              animate={{ 
                                x: ['100%', '-20%', '100%'],
                                y: ['60%', '10%', '60%'],
                                scale: [1.1, 0.9, 1.1]
                              }}
                              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                              style={{ background: style.color, opacity: 0.3 }}
                            />
                          </div>
                          <span className="relative z-10 text-lg font-semibold text-white text-center" aria-label={brand.name}>
                            Talaria-<span className="tg-spoiler">{suffix}</span>
                          </span>
                        </motion.div>
                      );
                    })}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs sm:text-sm px-2 sm:px-4"
              >
                <Link href="/login/?mode=signin">{isArabic ? "دخول" : "Login"}</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="rounded-full text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_14px_40px_rgba(59,130,246,0.25)] text-xs sm:text-sm px-2 sm:px-4"
              >
                <Link href="/login/?mode=signup">{isArabic ? "حساب جديد" : "Sign up"}</Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* Tabs Section */}
        <div className="absolute top-16 sm:top-20 left-0 right-0 z-40 px-2 sm:px-6">
          <div className="max-w-7xl mx-auto flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex items-center justify-center gap-2 sm:gap-7 flex-wrap"
            >
              <Link href="/bootcamp">
                <Button className="rounded-full text-sm sm:text-base px-4 py-3 sm:px-8 sm:py-6 text-white bg-gradient-to-r from-black via-blue-900 to-blue-600 hover:from-black hover:via-blue-800 hover:to-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_18px_45px_rgba(37,99,235,0.25)] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_22px_55px_rgba(37,99,235,0.32)] transition-all">
                  {t.tabs.bootcamp}
                </Button>
              </Link>
              <div className="relative group">
                <Button variant="ghost" className="text-white/50 cursor-not-allowed px-2 sm:px-4 py-1 text-xs sm:text-sm rounded-full h-6 sm:h-8">
                  <span className="tg-mask" aria-hidden="true" />
                </Button>
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] sm:text-[10px] px-1 py-0.5 rounded-full font-semibold">{t.tabs.soon}</span>
              </div>
              <div className="relative group">
                <Button variant="ghost" className="text-white/50 cursor-not-allowed px-2 sm:px-4 py-1 text-xs sm:text-sm rounded-full h-6 sm:h-8">
                  <span className="tg-mask" aria-hidden="true" />
                </Button>
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] sm:text-[10px] px-1 py-0.5 rounded-full font-semibold">{t.tabs.soon}</span>
              </div>
              <div className="relative group">
                <Button variant="ghost" className="text-white/50 cursor-not-allowed px-2 sm:px-4 py-1 text-xs sm:text-sm rounded-full h-6 sm:h-8">
                  <span className="tg-mask" aria-hidden="true" />
                </Button>
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] sm:text-[10px] px-1 py-0.5 rounded-full font-semibold">{t.tabs.soon}</span>
              </div>
              {/* NinjaTrader tab hidden for now
              <Link href="/ninjatrader">
                <Button variant="ghost" className="px-2 sm:px-4 py-1 text-sm rounded-full h-6 sm:h-8 flex items-center bg-transparent hover:bg-white/10">
                  <Image
                    src={NinjaTraderWordmark}
                    alt="NinjaTrader"
                    width={112}
                    height={16}
                    className="h-3 sm:h-4 w-auto object-contain mix-blend-screen"
                  />
                </Button>
              </Link>
              */}
            </motion.div>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-20 text-center px-4">
          {/* Big Animated Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="mb-8"
          >
            <motion.div
              animate={{ 
                y: [0, -10, 0]
              }}
              transition={{ 
                duration: 3, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            >
              <Image 
                src="/logo-04.png" 
                alt="Talaria" 
                width={520} 
                height={520} 
                className="w-64 h-64 md:w-[22rem] md:h-[22rem] lg:w-[26rem] lg:h-[26rem] mx-auto"
              />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6">
              {t.hero.titleA}{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400">
                {t.hero.titleB}
              </span>
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-neutral-400 max-w-2xl mx-auto mb-8">
              {t.hero.subtitle}
            </p>
          </motion.div>

          
        </div>

        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-60 bg-gradient-to-t from-[#030014] via-[#030014]/80 to-transparent z-10" />
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBoMXYxaC0xek0zMCAwaDF2MWgtMXoiIGZpbGw9IiMxYTFhMmUiIGZpbGwtb3BhY2l0eT0iLjMiLz48L2c+PC9zdmc+')] opacity-40" />
      </section>

      <SiteDisclosuresFooter />
    </main>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Advanced Charting",
    description:
      "Professional-grade candlestick charts with 50+ technical indicators and drawing tools.",
  },
  {
    icon: LineChart,
    title: "Backtesting Engine",
    description:
      "Test your strategies against historical data with our powerful backtesting system.",
  },
  {
    icon: Zap,
    title: "Real-time Data",
    description:
      "Lightning-fast data feeds with millisecond latency for accurate market analysis.",
  },
  {
    icon: Shield,
    title: "Prop Firm Ready",
    description:
      "Built-in tools for prop firm challenges including drawdown tracking and risk management.",
  },
  {
    icon: Clock,
    title: "Session Analysis",
    description:
      "Analyze your trading sessions with detailed statistics and performance metrics.",
  },
  {
    icon: TrendingUp,
    title: "Multi-timeframe",
    description:
      "Seamlessly switch between timeframes from 1-minute to monthly charts.",
  },
];

const stats = [
  { value: "50K+", label: "Active Traders" },
  { value: "2M+", label: "Charts Created" },
  { value: "99.9%", label: "Uptime" },
  { value: "24/7", label: "Support" },
];
