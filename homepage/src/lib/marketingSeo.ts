import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export const SEO_TITLE_EN = "Talaria-Log — Advanced Backtesting & Trading Journal";
export const SEO_TITLE_AR = "تالاريا-لوج — باك تست متقدم ودفتر تداول";

export const SEO_DESCRIPTION_EN =
  "Professional backtesting, trading journal, and session analytics for serious traders. Replay sessions, analyze performance, and improve your edge.";

export const SEO_DESCRIPTION_AR =
  "منصة احترافية للباك تست ودفتر التداول وتحليل الجلسات للمتداولين الجادين. أعد تشغيل الجلسات تاريخياً، حلّل الأداء، وطوّر أسلوبك.";

/** Combined description for meta tags (both languages crawlable in one field). */
export const SEO_DESCRIPTION_BILINGUAL = `${SEO_DESCRIPTION_EN} | ${SEO_DESCRIPTION_AR}`;

export function buildPublicAlternates(path: string): NonNullable<Metadata["alternates"]> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  const absolute = `${getSiteUrl()}${withSlash === "//" ? "" : withSlash}`;

  return {
    canonical: withSlash,
    languages: {
      en: absolute,
      ar: absolute,
      "x-default": absolute,
    },
  };
}

export function buildBilingualPageMetadata(opts: {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  path: string;
  openGraphPath?: string;
}): Metadata {
  const title = `${opts.titleEn} | ${opts.titleAr}`;
  const description = `${opts.descriptionEn} ${opts.descriptionAr}`;

  return {
    title,
    description,
    alternates: buildPublicAlternates(opts.path),
    openGraph: {
      title,
      description: opts.descriptionEn,
      url: opts.openGraphPath ?? opts.path,
      locale: "en_US",
      alternateLocale: ["ar_SA"],
    },
  };
}
