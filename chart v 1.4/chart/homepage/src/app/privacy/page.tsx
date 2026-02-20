"use client";
import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import SiteDisclosuresFooter from "@/components/SiteDisclosuresFooter";

export default function PrivacyPage() {
  const copy = React.useMemo(
    () => ({
      ar: {
            backHome: "العودة للرئيسية",
            title: "سياسة الخصوصية",
            updated: "آخر تحديث: يناير 2026",
            s1t: "1. مقدمة",
            s1p:
              "مرحباً بك في Talaria Log. نحن ملتزمون بحماية معلوماتك الشخصية وحقك في الخصوصية. تشرح هذه السياسة كيفية جمع معلوماتك واستخدامها ومشاركتها وحمايتها عند استخدام منصتنا وخدماتنا.",
            s2t: "2. المعلومات التي نجمعها",
            s2p: "نجمع المعلومات التي تقدمها لنا مباشرة، بما في ذلك:",
            s2l: [
              "معلومات تسجيل الحساب (الاسم، البريد الإلكتروني، كلمة المرور)",
              "معلومات الملف الشخصي والتفضيلات",
              "بيانات التداول وإعدادات الرسوم البيانية",
              "بيانات التواصل عند الاتصال بالدعم",
              "معلومات الدفع للخدمات المدفوعة",
            ],
            s3t: "3. كيف نستخدم معلوماتك",
            s3p: "نستخدم المعلومات التي نجمعها من أجل:",
            s3l: [
              "تقديم خدماتنا وصيانتها وتحسينها",
              "معالجة المعاملات وإرسال المعلومات ذات الصلة",
              "إرسال إشعارات فنية وتحديثات ورسائل دعم",
              "الرد على تعليقاتك وأسئلتك وطلبات خدمة العملاء",
              "مراقبة وتحليل الاتجاهات والاستخدام والأنشطة",
            ],
            s4t: "4. أمان البيانات",
            s4p:
              "نطبق إجراءات أمنية تقنية وتنظيمية مناسبة لحماية معلوماتك الشخصية من الوصول غير المصرح به أو التعديل أو الإفصاح أو الإتلاف. ومع ذلك، لا توجد طريقة نقل عبر الإنترنت آمنة بنسبة 100%.",
            s5t: "5. الاحتفاظ بالبيانات",
            s5p:
              "نحتفظ بمعلوماتك الشخصية طالما كان ذلك ضرورياً لتحقيق الأغراض الموضحة في هذه السياسة، ما لم تتطلب القوانين فترة أطول.",
            s6t: "6. حقوقك",
            s6p: "لديك الحق في:",
            s6l: [
              "الوصول إلى بياناتك الشخصية",
              "تصحيح البيانات غير الدقيقة",
              "طلب حذف بياناتك",
              "الاعتراض على معالجة بياناتك",
              "قابلية نقل البيانات",
            ],
            s7t: "7. ملفات تعريف الارتباط (Cookies)",
            s7p:
              "نستخدم ملفات تعريف الارتباط وتقنيات تتبع مشابهة لتتبع النشاط على منصتنا والاحتفاظ بمعلومات معينة. يمكنك ضبط المتصفح لرفض ملفات تعريف الارتباط أو لتنبيهك عند إرسالها.",
            s8t: "8. تواصل معنا",
            s8p:
              "إذا كانت لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا على:",
            footer: "© 2026 Talaria Log Trading Platform. جميع الحقوق محفوظة.",
          },
      en: {
            backHome: "Back Home",
            title: "Privacy Policy",
            updated: "Last updated: January 2026",
            s1t: "1. Introduction",
            s1p:
              "Welcome to Talaria Log (\"we,\" \"our,\" or \"us\"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our trading platform and services.",
            s2t: "2. Information We Collect",
            s2p: "We collect information that you provide directly to us, including:",
            s2l: [
              "Account registration information (name, email address, password)",
              "Profile information and preferences",
              "Trading data and chart configurations",
              "Communication data when you contact our support team",
              "Payment information for premium services",
            ],
            s3t: "3. How We Use Your Information",
            s3p: "We use the information we collect to:",
            s3l: [
              "Provide, maintain, and improve our services",
              "Process transactions and send related information",
              "Send you technical notices, updates, and support messages",
              "Respond to your comments, questions, and customer service requests",
              "Monitor and analyze trends, usage, and activities",
            ],
            s4t: "4. Data Security",
            s4p:
              "We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure.",
            s5t: "5. Data Retention",
            s5p:
              "We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.",
            s6t: "6. Your Rights",
            s6p: "You have the right to:",
            s6l: [
              "Access your personal data",
              "Correct inaccurate data",
              "Request deletion of your data",
              "Object to processing of your data",
              "Data portability",
            ],
            s7t: "7. Cookies",
            s7p:
              "We use cookies and similar tracking technologies to track activity on our platform and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.",
            s8t: "8. Contact Us",
            s8p:
              "If you have any questions about this Privacy Policy, please contact us at:",
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
            {t.s2l.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s3t}</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">{t.s3p}</p>
          <ul className="list-disc list-inside text-neutral-300 space-y-2">
            {t.s3l.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s4t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s4p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s5t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s5p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s6t}</h2>
          <p className="text-neutral-300 leading-relaxed mb-4">{t.s6p}</p>
          <ul className="list-disc list-inside text-neutral-300 space-y-2">
            {t.s6l.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s7t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s7p}</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s8t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s8p}</p>
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
