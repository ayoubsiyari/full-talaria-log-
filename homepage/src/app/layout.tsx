import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { LanguageProvider } from "./LanguageProvider";
import CookieConsent from "./CookieConsent";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import {
  buildPublicAlternates,
  SEO_DESCRIPTION_BILINGUAL,
  SEO_TITLE_AR,
  SEO_TITLE_EN,
} from "@/lib/marketingSeo";
import { getSiteUrl } from "@/lib/siteUrl";

const zain = localFont({
  variable: "--font-zain",
  src: [
    { path: "../../font/Zain/Zain-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../font/Zain/Zain-Light.ttf", weight: "300", style: "normal" },
    { path: "../../font/Zain/Zain-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../font/Zain/Zain-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../font/Zain/Zain-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "../../font/Zain/Zain-Black.ttf", weight: "900", style: "normal" },
    { path: "../../font/Zain/Zain-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../font/Zain/Zain-LightItalic.ttf", weight: "300", style: "italic" },
  ],
});

/** Browser tab / bookmark icon (square mark). */
const FAVICON_PATH = "/logo-04.png";
/** Link previews (Discord, X, etc.). */
const OG_IMAGE_PATH = "/talaria-log.logo.png";

const siteUrl = getSiteUrl();
const DEFAULT_TITLE = `${SEO_TITLE_EN} | ${SEO_TITLE_AR}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | Talaria-Log",
  },
  description: SEO_DESCRIPTION_BILINGUAL,
  keywords: [
    "backtesting",
    "trading journal",
    "باك تست",
    "دفتر تداول",
    "تحليل جلسات التداول",
    "prop firm",
    "futures",
    "forex",
    "Talaria-Log",
    "تالاريا لوج",
  ],
  alternates: buildPublicAlternates("/"),
  applicationName: "Talaria-Log",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: FAVICON_PATH, sizes: "32x32", type: "image/png" },
      { url: FAVICON_PATH, sizes: "192x192", type: "image/png" },
    ],
    apple: FAVICON_PATH,
    shortcut: FAVICON_PATH,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ar_SA"],
    url: "/",
    siteName: "Talaria-Log",
    title: DEFAULT_TITLE,
    description: SEO_DESCRIPTION_BILINGUAL,
    images: [
      {
        url: OG_IMAGE_PATH,
        alt: "Talaria-Log | تالاريا-لوج",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SEO_DESCRIPTION_BILINGUAL,
    images: [OG_IMAGE_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <head>
        <JsonLdScript />
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-2S8BJ30FJE"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-2S8BJ30FJE');
          `}
        </Script>
      </head>
      <body className={`${zain.variable} font-sans antialiased`}>
        <LanguageProvider>
          {children}
          <CookieConsent />
        </LanguageProvider>
      </body>
    </html>
  );
}
