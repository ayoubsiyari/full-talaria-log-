/** Canonical public site origin for metadata, sitemap, and robots. */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    "https://www.talaria-log.com"
  ).replace(/\/$/, "");
}
