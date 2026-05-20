import { getSiteUrl } from "@/lib/siteUrl";
import {
  MARKETING_FAQ_ALL_LOCALES,
  PRODUCT_FEATURE_LIST,
  PRODUCT_FEATURE_LIST_AR,
} from "@/lib/marketingFaq";
import { SEO_DESCRIPTION_AR, SEO_DESCRIPTION_EN } from "@/lib/marketingSeo";

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
        alternateName: "تالاريا-لوج",
        url: siteUrl,
        logo: logoUrl,
        description: SEO_DESCRIPTION_EN,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "Talaria-Log",
        alternateName: "تالاريا-لوج",
        description: SEO_DESCRIPTION_EN,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["en", "ar"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "Talaria-Log",
        alternateName: "تالاريا-لوج",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: `${SEO_DESCRIPTION_EN} ${SEO_DESCRIPTION_AR}`,
        featureList: [...PRODUCT_FEATURE_LIST, ...PRODUCT_FEATURE_LIST_AR],
        offers: {
          "@type": "Offer",
          url: pricingUrl,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["en", "ar"],
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        inLanguage: ["en", "ar"],
        mainEntity: MARKETING_FAQ_ALL_LOCALES.map((item) => ({
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
