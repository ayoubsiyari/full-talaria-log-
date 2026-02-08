"use client";
import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import SiteDisclosuresFooter from "@/components/SiteDisclosuresFooter";

export default function RefundsPage() {
  const copy = React.useMemo(
    () => ({
      ar: {
            backHome: "العودة للرئيسية",
            title: "سياسة الاسترجاع",
            updated: "آخر تحديث: يناير 2026",
            s1t: "1. نظرة عامة",
            s1p:
              "في Talaria Log نريدك أن تكون راضياً تماماً عن مشترياتك. توضح هذه السياسة الشروط والأحكام الخاصة بطلب استرجاع الأموال للخدمات.",
            s2t: "2. أهلية الاسترجاع",
            s2p: "قد تكون مؤهلاً للاسترجاع إذا:",
            s2l: [
              "طلبت الاسترجاع خلال 7 أيام من الشراء الأول",
              "لم تستخدم الميزات المدفوعة بشكل مكثف",
              "وجدت مشكلة تقنية تمنعك من استخدام الخدمة",
              "تم تحصيل رسوم غير صحيحة أو متعددة",
            ],
            s3t: "3. عناصر غير قابلة للاسترجاع",
            s3p: "العناصر التالية غير مؤهلة للاسترجاع:",
            s3l: [
              "الاشتراكات بعد انتهاء نافذة 7 أيام",
              "دورات البوتكامب بعد إكمال أكثر من 25% من المحتوى",
              "المشتريات لمرة واحدة بعد 14 يوماً",
              "الخدمات التي تم تقديمها بالكامل",
            ],
            s4t: "4. كيفية طلب الاسترجاع",
            s4p: "لطلب الاسترجاع:",
            s4l: [
              "راسلنا على support-center@talaria-log.com بعنوان \"طلب استرجاع\"",
              "ضمّن بريد حسابك ورقم الطلب/المعاملة",
              "قدم شرحاً مختصراً لسبب الطلب",
              "اترك 3-5 أيام عمل لمراجعة الطلب",
            ],
            s5t: "5. مدة المعالجة",
            s5p:
              "بعد الموافقة، سيتم معالجة الاسترجاع خلال 5-10 أيام عمل وإعادته إلى وسيلة الدفع الأصلية. قد يستغرق مزود الدفع أو البنك وقتاً إضافياً لظهور المبلغ.",
            s6t: "6. إلغاء الاشتراك",
            s6p:
              "يمكنك إلغاء اشتراكك في أي وقت. ستحتفظ بالوصول للميزات المدفوعة حتى نهاية دورة الفوترة الحالية. لا يتم إصدار استرجاع جزئي للفترة غير المستخدمة بعد نافذة 7 أيام.",
            s7t: "7. النزاعات",
            s7p:
              "إذا كنت تعتقد أن طلبك رُفض بالخطأ، يمكنك الاستئناف عبر التواصل مع الدعم وتقديم معلومات إضافية. نحن ملتزمون بحل النزاعات بشكل عادل وسريع.",
            s8t: "8. تواصل معنا",
            s8p:
              "لطلبات الاسترجاع أو الأسئلة حول هذه السياسة، تواصل معنا على:",
            footer: "© 2026 Talaria Log Trading Platform. جميع الحقوق محفوظة.",
          },
      en: {
            backHome: "Back Home",
            title: "Refund Policy",
            updated: "Last updated: January 2026",
            s1t: "1. Overview",
            s1p:
              "At Talaria Log, we want you to be completely satisfied with your purchase. This Refund Policy outlines the terms and conditions for requesting refunds on our services.",
            s2t: "2. Eligibility for Refunds",
            s2p: "You may be eligible for a refund if:",
            s2l: [
              "You request a refund within 7 days of your initial purchase",
              "You have not extensively used the premium features",
              "There is a technical issue that prevents you from using the service",
              "You were charged incorrectly or multiple times",
            ],
            s3t: "3. Non-Refundable Items",
            s3p: "The following are not eligible for refunds:",
            s3l: [
              "Subscriptions after the 7-day refund window",
              "Bootcamp courses after completion of more than 25% of content",
              "One-time purchases after 14 days",
              "Services that have been fully rendered",
            ],
            s4t: "4. How to Request a Refund",
            s4p: "To request a refund:",
            s4l: [
              "Email us at support-center@talaria-log.com with the subject \"Refund Request\"",
              "Include your account email and order/transaction ID",
              "Provide a brief explanation for your refund request",
              "Allow 3-5 business days for our team to review your request",
            ],
            s5t: "5. Processing Time",
            s5p:
              "Once your refund is approved, it will be processed within 5-10 business days. The refund will be credited to your original payment method. Please note that your bank or payment provider may take additional time to reflect the refund in your account.",
            s6t: "6. Subscription Cancellations",
            s6p:
              "You can cancel your subscription at any time. Upon cancellation, you will retain access to premium features until the end of your current billing period. No partial refunds will be issued for unused portions of a subscription period after the 7-day window.",
            s7t: "7. Disputes",
            s7p:
              "If you believe your refund request was wrongly denied, you may appeal by contacting our support team with additional information. We are committed to resolving all disputes fairly and promptly.",
            s8t: "8. Contact Us",
            s8p:
              "For refund requests or questions about this policy, please contact:",
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
          <p className="text-neutral-300 leading-relaxed mb-4">{t.s4p}</p>
          <ol className="list-decimal list-inside text-neutral-300 space-y-2">
            {t.s4l.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">{t.s5t}</h2>
          <p className="text-neutral-300 leading-relaxed">{t.s5p}</p>
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
          <p className="text-blue-400 mt-2">
            <a href="mailto:support-center@talaria-log.com">support-center@talaria-log.com</a>
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
