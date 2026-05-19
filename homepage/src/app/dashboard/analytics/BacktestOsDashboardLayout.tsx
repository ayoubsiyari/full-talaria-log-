"use client";

import React, { useState } from "react";
import type { OsMetricCard } from "./backtestOsTypes";
import type { BacktestOsChartPack } from "./BacktestOsCharts";
import {
  OsChartsDrawdown,
  OsChartsDistMonthly,
  OsChartsEquityRolling,
  OsChartsMonteCarlo,
  OsChartsRadarAnnual,
  OsChartsTradeTriple,
} from "./BacktestOsCharts";

export type { BacktestOsChartPack } from "./BacktestOsCharts";

const TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "returns" as const, label: "Returns" },
  { id: "risk" as const, label: "Risk" },
  { id: "trades" as const, label: "Trades" },
];

export type AnalyticsTabId = (typeof TABS)[number]["id"];

function MetricGrid({ cards }: { cards: OsMetricCard[] }) {
  return (
    <div className="bt-os-metrics-grid">
      {cards.map((c, i) => (
        <div key={`${c.label}-${i}`} className="bt-os-metric-card" style={{ ["--card-accent" as string]: c.accent }}>
          <div className="bt-os-metric-label">{c.label}</div>
          <div
            className={`bt-os-metric-value${c.tone === "pos" ? " bt-os-pos" : ""}${c.tone === "neg" ? " bt-os-neg" : ""}`}
          >
            {c.value}
          </div>
          <div className="bt-os-metric-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ tag, tagClass, title }: { tag: string; tagClass: string; title: string }) {
  return (
    <div className="bt-os-section-header">
      <span className={`bt-os-section-tag ${tagClass}`}>{tag}</span>
      <span className="bt-os-section-title">{title}</span>
      <div className="bt-os-section-line" />
    </div>
  );
}

export type BacktestOsDashboardLayoutProps = {
  sessionName: string;
  strategyLine: string;
  dateRangeLine: string;
  nTrades: number;
  chartPack: BacktestOsChartPack;
  returnCards: OsMetricCard[];
  riskCards: OsMetricCard[];
  drawCards: OsMetricCard[];
  ratioCards: OsMetricCard[];
  tradeCards: OsMetricCard[];
  statCards: OsMetricCard[];
  timeCards: OsMetricCard[];
  /** Optional PnL calendar / time visual below time metric cards */
  calendarSection?: React.ReactNode;
  advancedSection: React.ReactNode;
};

export function BacktestOsDashboardLayout(props: BacktestOsDashboardLayoutProps) {
  const {
    sessionName,
    strategyLine,
    dateRangeLine,
    nTrades,
    chartPack,
    returnCards,
    riskCards,
    drawCards,
    ratioCards,
    tradeCards,
    statCards,
    timeCards,
    calendarSection,
    advancedSection,
  } = props;

  const [tab, setTab] = useState<AnalyticsTabId>("overview");

  return (
    <>
      <header className="bt-os-header">
        <div className="bt-os-header-inner bt-os-header-inner--tabs">
          <div className="bt-os-header-context" title={strategyLine}>
            <div className="bt-os-header-context-mark" aria-hidden />
            <div className="bt-os-header-context-text">
              <span className="bt-os-session-name">{sessionName}</span>
              <span className="bt-os-session-range">{dateRangeLine}</span>
            </div>
          </div>

          <nav className="bt-os-tabbar" role="tablist" aria-label="Analytics sections">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "bt-os-tab bt-os-tab--active" : "bt-os-tab"}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="bt-os-header-meta">
            <div className="bt-os-header-meta-primary">{strategyLine}</div>
            <div className="bt-os-header-meta-secondary">{dateRangeLine}</div>
            <div className={`bt-os-status${nTrades > 0 ? " bt-os-status--live" : " bt-os-status--empty"}`}>
              <span className="bt-os-status-dot" aria-hidden />
              {nTrades > 0 ? "DATA" : "EMPTY"}
            </div>
          </div>
        </div>
      </header>

      <main className="bt-os-main">
        {tab === "overview" ? (
          <>
            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Return" tagClass="bt-os-tag-return" title="Return metrics" />
                <MetricGrid cards={returnCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Chart" tagClass="bt-os-tag-return" title="Equity curve & rolling return" />
                <OsChartsEquityRolling equity={chartPack.equity} rolling={chartPack.rolling} />
              </div>
              {calendarSection ? (
                <div className="bt-os-section">
                  <SectionHeader tag="Time" tagClass="bt-os-tag-time" title="Calendar & rhythm" />
                  <div className="bt-os-calendar-shell">{calendarSection}</div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "returns" ? (
          <div className="bt-os-cluster">
            <div className="bt-os-section">
              <SectionHeader tag="Chart" tagClass="bt-os-tag-return" title="Return distribution & monthly %" />
              <OsChartsDistMonthly dist={chartPack.dist} monthlyPct={chartPack.monthlyPct} />
            </div>
          </div>
        ) : null}

        {tab === "risk" ? (
          <>
            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Risk" tagClass="bt-os-tag-risk" title="Risk metrics" />
                <MetricGrid cards={riskCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Drawdown" tagClass="bt-os-tag-draw" title="Drawdown metrics" />
                <MetricGrid cards={drawCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Chart" tagClass="bt-os-tag-draw" title="Drawdown over time" />
                <OsChartsDrawdown drawdown={chartPack.drawdown} />
              </div>
            </div>
            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Ratios" tagClass="bt-os-tag-ratio" title="Risk-adjusted ratios" />
                <MetricGrid cards={ratioCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Chart" tagClass="bt-os-tag-ratio" title="Risk-adjusted radar & annual" />
                <OsChartsRadarAnnual radar={chartPack.radar} annual={chartPack.annual} />
              </div>
            </div>
          </>
        ) : null}

        {tab === "trades" ? (
          <>
            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Trades" tagClass="bt-os-tag-trade" title="Trade metrics" />
                <MetricGrid cards={tradeCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Chart" tagClass="bt-os-tag-trade" title="Trade analysis" />
                <OsChartsTradeTriple
                  tradePL={chartPack.tradePL}
                  winLoss={chartPack.winLoss}
                  duration={chartPack.duration}
                />
              </div>
            </div>

            <div className="bt-os-cluster bt-os-cluster--wide">
              <div className="bt-os-section">
                <SectionHeader tag="Log" tagClass="bt-os-tag-trade" title="Recent trade log" />
                {advancedSection}
              </div>
            </div>

            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Stats" tagClass="bt-os-tag-stat" title="Statistical metrics" />
                <MetricGrid cards={statCards} />
              </div>
              <div className="bt-os-section">
                <SectionHeader tag="Chart" tagClass="bt-os-tag-stat" title="Monte Carlo simulation" />
                <OsChartsMonteCarlo monteCarlo={chartPack.monteCarlo} />
              </div>
            </div>

            <div className="bt-os-cluster">
              <div className="bt-os-section">
                <SectionHeader tag="Time" tagClass="bt-os-tag-time" title="Time & session stats" />
                <MetricGrid cards={timeCards} />
              </div>
            </div>
          </>
        ) : null}
      </main>

      <footer className="bt-os-footer">
        <div className="bt-os-footer-inner">
          {sessionName} · {dateRangeLine} · {nTrades} trades · Past performance ≠ future results.
        </div>
      </footer>
    </>
  );
}
