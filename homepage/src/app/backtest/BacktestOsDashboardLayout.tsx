"use client";

import React from "react";
import Link from "next/link";
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
    advancedSection,
  } = props;

  return (
    <>
      <header className="bt-os-header">
        <div className="bt-os-logo">
          <div className="bt-os-logo-dot" />
          BacktestOS
        </div>
        <nav className="bt-os-nav" aria-label="Dashboard views">
          <Link href="/backtest/analytics" className="bt-os-nav-active">
            Overview
          </Link>
          <span style={{ padding: "5px 14px", fontSize: "0.78rem", color: "#6b7280" }}>Returns</span>
          <span style={{ padding: "5px 14px", fontSize: "0.78rem", color: "#6b7280" }}>Risk</span>
          <span style={{ padding: "5px 14px", fontSize: "0.78rem", color: "#6b7280" }}>Trades</span>
        </nav>
        <div className="bt-os-header-meta">
          <div>{strategyLine}</div>
          <div>{dateRangeLine}</div>
          <div className="bt-os-status">
            <div className="bt-os-status-dot" />
            {nTrades > 0 ? "DATA" : "EMPTY"}
          </div>
        </div>
      </header>

      <main className="bt-os-main">
        <div className="bt-os-section">
          <SectionHeader tag="Return" tagClass="bt-os-tag-return" title="Return metrics" />
          <MetricGrid cards={returnCards} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Chart" tagClass="bt-os-tag-return" title="Equity curve & rolling return" />
          <OsChartsEquityRolling equity={chartPack.equity} rolling={chartPack.rolling} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Risk" tagClass="bt-os-tag-risk" title="Risk metrics" />
          <MetricGrid cards={riskCards} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Chart" tagClass="bt-os-tag-risk" title="Return distribution & monthly %" />
          <OsChartsDistMonthly dist={chartPack.dist} monthlyPct={chartPack.monthlyPct} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Drawdown" tagClass="bt-os-tag-draw" title="Drawdown metrics" />
          <MetricGrid cards={drawCards} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Chart" tagClass="bt-os-tag-draw" title="Drawdown over time" />
          <OsChartsDrawdown drawdown={chartPack.drawdown} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Ratios" tagClass="bt-os-tag-ratio" title="Risk-adjusted ratios" />
          <MetricGrid cards={ratioCards} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Chart" tagClass="bt-os-tag-ratio" title="Risk-adjusted radar & annual" />
          <OsChartsRadarAnnual radar={chartPack.radar} annual={chartPack.annual} />
        </div>

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

        <div className="bt-os-section">
          <SectionHeader tag="Log" tagClass="bt-os-tag-trade" title="Recent trade log" />
          {advancedSection}
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Stats" tagClass="bt-os-tag-stat" title="Statistical metrics" />
          <MetricGrid cards={statCards} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Chart" tagClass="bt-os-tag-stat" title="Monte Carlo simulation" />
          <OsChartsMonteCarlo monteCarlo={chartPack.monteCarlo} />
        </div>

        <div className="bt-os-section">
          <SectionHeader tag="Time" tagClass="bt-os-tag-time" title="Time & calendar" />
          <MetricGrid cards={timeCards} />
        </div>
      </main>

      <footer className="bt-os-footer">
        BacktestOS — {sessionName} &nbsp;|&nbsp; {dateRangeLine} &nbsp;|&nbsp; {nTrades} trades in scope
        &nbsp;|&nbsp; Journal analytics. Past performance ≠ future results.
      </footer>
    </>
  );
}
