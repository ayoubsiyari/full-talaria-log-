import { getSiteUrl } from "@/lib/siteUrl";
import { MARKETING_FAQ_ITEMS, PRODUCT_FEATURE_LIST } from "@/lib/marketingFaq";

const SITE_DESCRIPTION =
  "Professional backtesting, trading journal, and session analytics for serious traders. Replay sessions, analyze performance, and improve your edge.";

export function JsonLdScript() {
  const siteUrl = getSiteUrl();
  const logoUrl = `${siteUrl}/logo-04.png`;
  const pricingUrl = `${siteUrl}/pricing/`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "Talaria-Log",
        url: siteUrl,
        logo: logoUrl,
        description: SITE_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "Talaria-Log",
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["en", "ar"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "Talaria-Log",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: SITE_DESCRIPTION,
        featureList: [...PRODUCT_FEATURE_LIST],
        offers: {
          "@type": "Offer",
          url: pricingUrl,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: MARKETING_FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
