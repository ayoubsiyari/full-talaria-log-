import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { LanguageProvider } from "./LanguageProvider";
import CookieConsent from "./CookieConsent";
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

const SITE_TITLE = "Talaria-Log — Advanced Backtesting & Trading Journal";
const SITE_DESCRIPTION =
  "Professional backtesting, trading journal, and session analytics for serious traders. Replay sessions, analyze performance, and improve your edge.";
/** Browser tab / bookmark icon (square mark). */
const FAVICON_PATH = "/logo-04.png";
/** Link previews (Discord, X, etc.). */
const OG_IMAGE_PATH = "/talaria-log.logo.png";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: "%s | Talaria-Log",
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        alt: "Talaria-Log",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
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
