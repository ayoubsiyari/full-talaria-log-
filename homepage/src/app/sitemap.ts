import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-static";

/** Marketing and legal URLs only (static export; no authenticated app routes). */
const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing/", priority: 0.9, changeFrequency: "weekly" },
  { path: "/bootcamp/", priority: 0.8, changeFrequency: "monthly" },
  { path: "/ninjatrader/", priority: 0.75, changeFrequency: "monthly" },
  { path: "/terms/", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy/", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refunds/", priority: 0.3, changeFrequency: "yearly" },
  { path: "/disclaimer/", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return PUBLIC_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
