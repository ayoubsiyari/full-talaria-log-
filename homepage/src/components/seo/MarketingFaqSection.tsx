import Link from "next/link";
import { MARKETING_FAQ_ITEMS } from "@/lib/marketingFaq";

type Props = {
  /** Extra bottom padding when stacked under pricing UI */
  variant?: "home" | "pricing";
};

export function MarketingFaqSection({ variant = "home" }: Props) {
  const padBottom = variant === "pricing" ? "pb-16" : "pb-10";

  return (
    <section
      id="faq"
      aria-labelledby="marketing-faq-heading"
      className={`border-t border-white/10 bg-[#07080E] px-4 pt-14 ${padBottom}`}
      lang="en"
      dir="ltr"
    >
      <div className="mx-auto max-w-3xl">
        <h2
          id="marketing-faq-heading"
          className="text-center text-2xl font-bold text-white sm:text-3xl"
          style={{ fontFamily: "'Exo 2', sans-serif" }}
        >
          Frequently asked questions
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/55">
          Quick answers about Talaria-Log as a backtesting and trading journal platform.
        </p>
        <dl className="mt-10 space-y-6">
          {MARKETING_FAQ_ITEMS.map((item) => (
            <div
              key={item.question}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4"
            >
              <dt className="text-base font-semibold text-white">{item.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-white/65">{item.answer}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-center text-sm text-white/50">
          <Link href="/pricing/" className="text-[#6b8cff] hover:underline">
            View plans &amp; pricing
          </Link>
          {" · "}
          <Link href="/login/?mode=signup" className="text-[#6b8cff] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}
