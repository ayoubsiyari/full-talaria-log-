import { MarketingFaqSection } from "@/components/seo/MarketingFaqSection";
import HomePageClient from "./HomePageClient";

export default function HomePage() {
  return <HomePageClient seoAppendix={<MarketingFaqSection variant="home" />} />;
}
