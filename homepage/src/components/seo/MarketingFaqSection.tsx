import Link from "next/link";
import { MARKETING_FAQ_ITEMS, MARKETING_FAQ_ITEMS_AR } from "@/lib/marketingFaq";

type Props = {
  variant?: "home" | "pricing";
};

function FaqBlock({
  id,
  lang,
  dir,
  heading,
  subheading,
  items,
  links,
}: {
  id: string;
  lang: string;
  dir: "ltr" | "rtl";
  heading: string;
  subheading: string;
  items: { question: string; answer: string }[];
  links: { pricing: string; signup: string };
}) {
  return (
    <div className="mx-auto max-w-3xl" lang={lang} dir={dir}>
      <h2
        id={id}
        className="text-center text-2xl font-bold text-white sm:text-3xl"
        style={{ fontFamily: lang === "ar" ? "var(--font-zain), sans-serif" : "'Exo 2', sans-serif" }}
      >
        {heading}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/55">{subheading}</p>
      <dl className="mt-10 space-y-6">
        {items.map((item) => (
          <div
            key={`${lang}-${item.question}`}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4"
          >
            <dt className="text-base font-semibold text-white">{item.question}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-white/65">{item.answer}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-center text-sm text-white/50">
        <Link href="/pricing/" className="text-[#6b8cff] hover:underline">
          {links.pricing}
        </Link>
        {" · "}
        <Link href="/login/?mode=signup" className="text-[#6b8cff] hover:underline">
          {links.signup}
        </Link>
      </p>
    </div>
  );
}

export function MarketingFaqSection({ variant = "home" }: Props) {
  const padBottom = variant === "pricing" ? "pb-16" : "pb-10";

  return (
    <section
      className={`border-t border-white/10 bg-[#07080E] px-4 pt-14 ${padBottom}`}
      aria-label="Frequently asked questions"
    >
      <FaqBlock
        id="marketing-faq-heading-en"
        lang="en"
        dir="ltr"
        heading="Frequently asked questions"
        subheading="Quick answers about Talaria-Log as a backtesting and trading journal platform."
        items={MARKETING_FAQ_ITEMS}
        links={{ pricing: "View plans & pricing", signup: "Create an account" }}
      />

      <div className="mx-auto mt-16 max-w-3xl border-t border-white/10 pt-14" lang="ar" dir="rtl">
        <FaqBlock
          id="marketing-faq-heading-ar"
          lang="ar"
          dir="rtl"
          heading="الأسئلة الشائعة"
          subheading="إجابات سريعة عن تالاريا-لوج كمنصة باك تست ودفتر تداول."
          items={MARKETING_FAQ_ITEMS_AR}
          links={{ pricing: "الخطط والأسعار", signup: "إنشاء حساب" }}
        />
      </div>
    </section>
  );
}
