/** Advanced dashboard sidebar — view ids and grouped nav (design parity). */

export type AdvancedDashboardViewId =
  | "performance-summary"
  | "monte-carlo"
  | "distributions-risk"
  | "correlation-independence"
  | "excursion-mae-mfe"
  | "execution-quality"
  | "price-behavior"
  | "tag-analysis"
  | "edge-finder"
  | "behavioral-patterns"
  | "market-regime"
  | "edge-decay"
  | "sequence-risk"
  | "position-sizing";

export type AdvancedNavItem = {
  id: AdvancedDashboardViewId;
  label: string;
  badge?: "new";
};

export type AdvancedNavGroup = {
  title: string;
  items: AdvancedNavItem[];
};

export const ADVANCED_DASHBOARD_NAV: AdvancedNavGroup[] = [
  {
    title: "Overview",
    items: [{ id: "performance-summary", label: "Performance Summary" }],
  },
  {
    title: "Statistical Analysis",
    items: [
      { id: "monte-carlo", label: "Monte Carlo Simulations" },
      { id: "distributions-risk", label: "Distributions & Risk" },
      { id: "correlation-independence", label: "Correlation & Independence" },
    ],
  },
  {
    title: "Execution Quality",
    items: [
      { id: "excursion-mae-mfe", label: "Excursion Analysis (MAE/MFE)" },
      { id: "execution-quality", label: "Execution & Trade Quality" },
      { id: "price-behavior", label: "Price Behavior Explorer" },
    ],
  },
  {
    title: "Patterns & Behavior",
    items: [
      { id: "tag-analysis", label: "Tag Analysis", badge: "new" },
      { id: "edge-finder", label: "Edge Finder" },
      { id: "behavioral-patterns", label: "Behavioral Patterns" },
      { id: "market-regime", label: "Market Regime Performance" },
    ],
  },
  {
    title: "Strategy Health",
    items: [
      { id: "edge-decay", label: "Edge Decay & Stability" },
      { id: "sequence-risk", label: "Sequence Risk" },
      { id: "position-sizing", label: "Position Sizing Analytics" },
    ],
  },
  {
    title: "Export & Reports",
    items: [],
  },
];

export const DEFAULT_ADVANCED_VIEW: AdvancedDashboardViewId = "performance-summary";

export function advancedViewLabel(id: AdvancedDashboardViewId): string {
  for (const g of ADVANCED_DASHBOARD_NAV) {
    const hit = g.items.find((i) => i.id === id);
    if (hit) return hit.label;
  }
  return "Performance Summary";
}
