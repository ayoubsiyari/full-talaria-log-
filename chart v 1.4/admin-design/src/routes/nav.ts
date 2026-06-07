import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Users,
  Shield,
  Database,
  BarChart3,
  CreditCard,
  Wallet,
  UserPlus,
  Mail,
  MessageSquare,
  FileText,
  Settings,
  Zap,
  ScrollText,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  title: string;
  icon: LucideIcon;
  legacyHashes?: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", title: "Overview & roadmap", icon: LayoutGrid, legacyHashes: ["sec-overview"] },
  { id: "users", label: "Users", title: "User Management", icon: Users, legacyHashes: ["sec-users"] },
  { id: "sessions", label: "Sessions", title: "Live Sessions", icon: Shield, legacyHashes: ["sec-sessions"] },
  { id: "datasets", label: "Datasets", title: "Dataset Management", icon: Database, legacyHashes: ["sec-datasets", "dataset-registry", "sec-dataset-registry"] },
  { id: "insights", label: "Analytics", title: "Analytics & VPS", icon: BarChart3, legacyHashes: ["sec-insights"] },
  { id: "subscriptions", label: "Subscriptions", title: "Subscriptions", icon: CreditCard, legacyHashes: ["sec-subscriptions"] },
  { id: "payments", label: "Payments", title: "Payments", icon: Wallet, legacyHashes: ["sec-payments"] },
  { id: "affiliates", label: "Affiliates", title: "Affiliates", icon: UserPlus, legacyHashes: ["sec-affiliates"] },
  { id: "bulk-email", label: "Bulk email", title: "Bulk email", icon: Mail, legacyHashes: ["sec-bulk-email"] },
  { id: "support", label: "Tickets", title: "Support", icon: MessageSquare, legacyHashes: ["sec-support"] },
  { id: "feature-flags", label: "Feature flags", title: "Feature Flags", icon: Zap },
  { id: "security-logs", label: "Security logs", title: "Security Logs", icon: ScrollText },
  { id: "audit-log", label: "Audit log", title: "Audit log", icon: FileText, legacyHashes: ["sec-audit-log"] },
  { id: "settings", label: "Settings", title: "Settings", icon: Settings, legacyHashes: ["sec-settings"] },
];

export function resolveHashRoute(hash: string): string {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return "overview";
  if (raw.startsWith("sec-")) return raw.slice(4);
  for (const item of NAV_ITEMS) {
    if (item.legacyHashes?.includes(raw)) {
      if (raw === "dataset-registry" || raw === "sec-dataset-registry") return "datasets";
      return item.id;
    }
  }
  const found = NAV_ITEMS.find((n) => n.id === raw);
  return found ? found.id : "overview";
}
