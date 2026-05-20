import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/",
        "/login/",
        "/register/",
        "/backtest/",
        "/journal/",
        "/api/",
        "/chart/",
        "/pricing/success/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
