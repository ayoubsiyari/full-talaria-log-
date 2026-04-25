"use client";
import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import SiteDisclosuresFooter from "@/components/SiteDisclosuresFooter";

export default function DisclaimerPage() {
  const copy = React.useMemo(
    () => ({
      ar: {
        backHome: "العودة للرئيسية",
        warnTitle: "تحذير هام حول المخاطر",
        warnText:
          "التداول في الأسواق المالية ينطوي على مخاطر كبيرة وقد لا يكون مناسباً لجميع المستثمرين. يرجى قراءة هذا الإخلاء بعناية قبل استخدام منصتنا.",
        title: "إخلاء مسؤولية التداول",
        updated: "آخر تحديث: يناير 2026",
        s1t: "1. لا توجد نصيحة مالية",
        s1p:
          "توفر Talaria Log أدوات للرسوم البيانية والتحليل والاختبار الخلفي فقط. لا يشكل أي محتوى لدينا نصيحة مالية أو استثمارية أو قانونية أو ضريبية. جميع المحتويات لأغراض تعليمية ومعلوماتية فقط. يجب استشارة مختصين قبل اتخاذ قرارات استثمارية.",
        s2t: "2. مخاطر التداول",
        s2p:
          "التداول في الأدوات المالية ينطوي على مخاطر كبيرة، بما في ذلك على سبيل المثال لا الحصر:",
        s2l: [
          { b: "خسارة رأس المال:", t: "قد تخسر جزءاً أو كل رأس المال المستثمر" },
          { b: "مخاطر الرافعة:", t: "قد تضاعف الرافعة الأرباح والخسائر" },
          { b: "تقلبات السوق:", t: "قد تتحرك الأسواق بسرعة وبشكل غير متوقع" },
          { b: "مخاطر السيولة:", t: "قد لا تتمكن من إغلاق مراكزك عند رغبتك" },
          { b: "مخاطر الطرف المقابل:", t: "قد يفشل الوسطاء أو البورصات أو يصبحون معسرين" },
        ],
        s3t: "3. الأداء السابق",
        s3p:
          "الأداء السابق لا يدل على النتائج المستقبلية. أي نتائج اختبار خلفي أو بيانات تاريخية أو مقاييس أداء معروضة لأغراض تعليمية فقط ولا ينبغي الاعتماد عليها كتوقعات. قد تختلف النتائج الفعلية بشكل كبير.",
        s4t: "4. لا توجد ضمانات",
        s4p:
          "لا تقدم Talaria Log أي ضمانات بشأن دقة أو اكتمال أو موثوقية المعلومات. لا نضمن أي نتائج محددة من استخدام الأدوات ولسنا مسؤولين عن خسائر التداول.",
        s5t: "5. مسؤوليتك",
        s5p:
          "كمستخدم لـ Talaria Log، فإنك تقر وتوافق على أنك:",
        s5l: [
          "أنت المسؤول الوحيد عن قراراتك",
          "لديك معرفة كافية لفهم المخاطر",
          "ستتداول فقط بأموال يمكنك تحمل خسارتها",
          "ستطلب نصيحة مستقلة عند الحاجة",
          "تفهم أن التداول مضاربي وينطوي على مخاطر",
        ],
        s6t: "6. محتوى تعليمي",
        s6p:
          "البوتكامب والمواد التعليمية تهدف لتعليم مفاهيم واستراتيجيات التداول. لا تعد توصيات للتداول أو الاستثمار في أداة مالية محددة. قد لا تناسب الاستراتيجيات ظروفك الفردية.",
        s7t: "7. بيانات من طرف ثالث",
        s7p:
          "قد نعرض بيانات من مصادر خارجية. لا نضمن دقة تلك البيانات ولسنا مسؤولين عن الأخطاء أو التأخير.",
        s8t: "8. الامتثال التنظيمي",
        s8p:
          "Talaria Log ليست مستشاراً استثمارياً مسجلاً ولا وسيطاً ولا مؤسسة مالية. لا نحتفظ بأموال العملاء ولا نديرها. تقع على عاتقك مسؤولية الامتثال للقوانين واللوائح في بلدك.",
        s9t: "9. تحديد المسؤولية",
        s9p:
          "إلى أقصى حد يسمح به القانون، لا تتحمل Talaria Log ومديروها وموظفوها والشركات التابعة أي مسؤولية عن أضرار مباشرة أو غير مباشرة أو تبعية ناتجة عن استخدامك للمنصة أو أنشطة التداول.",
        s10t: "10. تواصل معنا",
        s10p:
          "إذا كانت لديك أسئلة حول هذا الإخلاء، تواصل معنا على:",
        footer: "© 2026 Talaria Log Trading Platform. جميع الحقوق محفوظة.",
      },
      en: {
            backHome: "Back Home",
            warnTitle: "Important Risk Warning",
            warnText:
              "Trading in financial markets involves substantial risk of loss and is not suitable for all investors. Please read this disclaimer carefully before using our platform.",
            title: "Trading Disclaimer",
            updated: "Last updated: January 2026",
            s1t: "1. No Financial Advice",
            s1p:
              "Talaria Log provides tools for charting, analysis, and backtesting purposes only. Nothing on our platform constitutes financial, investment, legal, or tax advice. All content is provided for informational and educational purposes only. You should consult with qualified professionals before making any investment decisions.",
            s2t: "2. Risk of Trading",
            s2p:
              "Trading in financial instruments involves significant risks, including but not limited to:",
            s2l: [
              { b: "Loss of Capital:", t: "You may lose some or all of your invested capital" },
              { b: "Leverage Risk:", t: "Leveraged trading can amplify both gains and losses" },
              { b: "Market Volatility:", t: "Markets can move rapidly and unpredictably" },
              { b: "Liquidity Risk:", t: "You may not be able to exit positions when desired" },
              { b: "Counterparty Risk:", t: "Brokers and exchanges may fail or become insolvent" },
            ],
            s3t: "3. Past Performance",
            s3p:
              "Past performance is not indicative of future results. Any backtesting results, historical data, or performance metrics shown on our platform are for educational purposes only and should not be relied upon as predictions of future performance. Actual trading results may differ significantly from backtested or hypothetical results.",
            s4t: "4. No Guarantees",
            s4p:
              "Talaria Log makes no guarantees regarding the accuracy, completeness, or reliability of any information provided on the platform. We do not guarantee any specific results from using our tools, and we are not responsible for any trading losses you may incur.",
            s5t: "5. Your Responsibility",
            s5p:
              "As a user of Talaria Log, you acknowledge and agree that:",
            s5l: [
              "You are solely responsible for your trading decisions",
              "You have sufficient knowledge to understand the risks involved",
              "You will only trade with money you can afford to lose",
              "You will seek independent financial advice if needed",
              "You understand that trading is speculative and involves risk",
            ],
            s6t: "6. Educational Content",
            s6p:
              "Our bootcamp and educational materials are designed to teach trading concepts and strategies. They are not recommendations to trade or invest in any specific financial instrument. The strategies discussed may not be suitable for your individual circumstances.",
            s7t: "7. Third-Party Data",
            s7p:
              "We may display data from third-party sources. We do not guarantee the accuracy of third-party data and are not responsible for errors, omissions, or delays in such data.",
            s8t: "8. Regulatory Compliance",
            s8p:
              "Talaria Log is not a registered investment advisor, broker-dealer, or financial institution. We do not hold or manage client funds. It is your responsibility to ensure that your trading activities comply with all applicable laws and regulations in your jurisdiction.",
            s9t: "9. Limitation of Liability",
            s9p:
              "To the fullest extent permitted by law, Talaria Log and its directors, employees, and affiliates shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the platform or any trading activities.",
            s10t: "10. Contact Us",
            s10p:
              "If you have questions about this disclaimer, please contact us at:",
            footer: "© 2026 Talaria Log Trading Platform. All rights reserved.",
          },
    }),
    []
  );

  const LegalContent = ({ t, dir }: { t: any; dir: "ltr" | "rtl" }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      dir={dir}
      className={dir === "rtl" ? "text-right" : "text-left"}
    >
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 mb-8 flex items-start gap-4">
        <AlertTriangle className="w-8 h-8 text-yellow-500 flex-shrink-0 mt-1" />
        <div>
          <h2 className="text-xl font-semibold text-yellow-500 mb-2">{t.warnTitle}</h2>
          <p className="text-yellow-200/80">{t.warnText}</p>
        </div>
      </div>

      <h1 className="text-4xl font-bold text-white mb-8">{t.title}</h1>
      <p className="text-neutral-400 mb-4">{t.updated}</p>

      <div className="prose prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s1t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s1p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s2t}</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">{t.s2p}</p>
          <ul className="list-disc list-inside text-neutral-300 space-y-2">
            {t.s2l.map((item: any) => (
              <li key={item.b}>
                <strong>{item.b}</strong> {item.t}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s3t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s3p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s4t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s4p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s5t}</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">{t.s5p}</p>
          <ul className="list-disc list-inside text-neutral-300 space-y-2">
            {t.s5l.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s6t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s6p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s7t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s7p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s8t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s8p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s9t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s9p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s10t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s10p}</p>
          <p className="text-blue-400 mt-2">
            <a href="mailto:support@talaria-log.com">support@talaria-log.com</a>
          </p>
        </section>
      </div>
    </motion.div>
  );

  return (
    <main className="min-h-screen bg-[#030014]">
      {/* Navigation */}
      <nav className="relative z-50 px-6 py-4 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-04.png" alt="Talaria" width={40} height={40} className="h-10 w-10" />
            <span className="text-2xl font-bold text-white">Talaria Log</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" className="text-white hover:text-blue-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {copy.en.backHome}
            </Button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <LegalContent t={copy.en} dir="ltr" />
        <div className="my-14 h-px bg-white/10" />
        <LegalContent t={copy.ar} dir="rtl" />
      </div>

      <SiteDisclosuresFooter />
    </main>
  );
 }
