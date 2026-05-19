"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Diamond,
  Dices,
  Grid2X2,
  LayoutGrid,
  LineChart,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Waves,
} from "lucide-react";
import {
  ADVANCED_DASHBOARD_NAV,
  type AdvancedDashboardViewId,
  type AdvancedNavItem,
} from "./advancedDashboardNav";

const SIDEBAR_COLLAPSED_KEY = "talaria_adv_dash_sidebar_collapsed_v1";

const ICONS: Record<AdvancedDashboardViewId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "performance-summary": LineChart,
  "monte-carlo": Dices,
  "distributions-risk": LayoutGrid,
  "correlation-independence": Grid2X2,
  "excursion-mae-mfe": TrendingDown,
  "execution-quality": Activity,
  "price-behavior": LineChart,
  "tag-analysis": Tag,
  "edge-finder": Compass,
  "behavioral-patterns": Diamond,
  "market-regime": LayoutGrid,
  "edge-decay": TrendingUp,
  "sequence-risk": Waves,
  "position-sizing": Crosshair,
};

export type AdvancedDashboardSidebarProps = {
  sessionName: string;
  sessionTier?: string;
  activeView: AdvancedDashboardViewId;
  onViewChange: (id: AdvancedDashboardViewId) => void;
};

function NavButton({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: AdvancedNavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: AdvancedDashboardViewId) => void;
}) {
  const Icon = ICONS[item.id];
  return (
    <button
      type="button"
      className={`bt-os-adv-nav-item${active ? " bt-os-adv-nav-item--active" : ""}`}
      onClick={() => onSelect(item.id)}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <span className="bt-os-adv-nav-icon" aria-hidden>
        <Icon size={15} strokeWidth={2} />
      </span>
      {!collapsed ? (
        <>
          <span className="bt-os-adv-nav-label">{item.label}</span>
          {item.badge === "new" ? <span className="bt-os-adv-nav-badge">NEW</span> : null}
        </>
      ) : null}
    </button>
  );
}

export function AdvancedDashboardSidebar({
  sessionName,
  sessionTier = "STANDARD",
  activeView,
  onViewChange,
}: AdvancedDashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={`bt-os-adv-sidebar${collapsed ? " bt-os-adv-sidebar--collapsed" : ""}`}
      aria-label="Advanced dashboard navigation"
    >
      <div className="bt-os-adv-sidebar-head">
        {!collapsed ? (
          <>
            <div className="bt-os-adv-sidebar-kicker">Advanced Dashboard</div>
            <div className="bt-os-adv-sidebar-session" title={sessionName}>
              {sessionName}
            </div>
            <span className="bt-os-adv-sidebar-tier">{sessionTier}</span>
          </>
        ) : (
          <span className="bt-os-adv-sidebar-kicker bt-os-adv-sidebar-kicker--mini" title="Advanced Dashboard">
            AD
          </span>
        )}
      </div>

      <nav className="bt-os-adv-sidebar-nav">
        {ADVANCED_DASHBOARD_NAV.map((group) => (
          <div key={group.title} className="bt-os-adv-nav-group">
            {!collapsed ? <div className="bt-os-adv-nav-group-title">{group.title}</div> : null}
            {group.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeView === item.id}
                collapsed={collapsed}
                onSelect={onViewChange}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="bt-os-adv-sidebar-foot">
        <Link
          href="/dashboard/profile/"
          className="bt-os-adv-nav-item bt-os-adv-nav-item--link"
          title={collapsed ? "Profile" : undefined}
        >
          <span className="bt-os-adv-nav-icon" aria-hidden>
            <User size={15} strokeWidth={2} />
          </span>
          {!collapsed ? <span className="bt-os-adv-nav-label">Profile</span> : null}
        </Link>
        <button
          type="button"
          className="bt-os-adv-nav-item bt-os-adv-collapse-btn"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
        >
          <span className="bt-os-adv-nav-icon" aria-hidden>
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </span>
          {!collapsed ? <span className="bt-os-adv-nav-label">Collapse menu</span> : null}
        </button>
      </div>
    </aside>
  );
}
