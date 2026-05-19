"use client";

import React from "react";
import type { OsMetricCard } from "./backtestOsTypes";
import type { QuantKpiItem } from "./quantMetricHelpers";
import { normalizeSeries, osMetricCardsToQuantKpi } from "./quantMetricHelpers";

const TONE_COLOR: Record<NonNullable<QuantKpiItem["tone"]>, string> = {
  pos: "var(--bt-quant-cyan)",
  neg: "var(--bt-quant-red)",
  warn: "var(--bt-quant-yellow)",
  neutral: "var(--bt-quant-blue)",
};

function vizColor(tone?: QuantKpiItem["tone"]): string {
  return TONE_COLOR[tone ?? "neutral"];
}

function MiniSparkline({ data, color, gradId }: { data: number[]; color: string; gradId: string }) {
  const norm = normalizeSeries(data);
  if (norm.length < 2) return <div className="bt-quant-viz bt-quant-viz--empty" />;
  const w = 100;
  const h = 32;
  const pts = norm
    .map((v, i) => {
      const x = (i / (norm.length - 1)) * w;
      const y = h - v * h * 0.85 - h * 0.075;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="bt-quant-viz-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${gradId})`} points={`0,${h} ${pts} ${w},${h}`} />
      <polyline fill="none" stroke={color} strokeWidth="1.75" points={pts} />
    </svg>
  );
}

function MiniBars({ data, color }: { data: number[]; color: string }) {
  const norm = normalizeSeries(data);
  if (!norm.length) return <div className="bt-quant-viz bt-quant-viz--empty" />;
  return (
    <div className="bt-quant-bars" aria-hidden>
      {norm.map((v, i) => (
        <span
          key={i}
          className="bt-quant-bar"
          style={{
            height: `${Math.max(8, v * 100)}%`,
            background: i % 2 === 0 ? color : "var(--bt-quant-red)",
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

function MiniProgress({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bt-quant-progress" aria-hidden>
      <div className="bt-quant-progress-fill" style={{ width: `${clampPct(pct)}%`, background: color }} />
    </div>
  );
}

function MiniRing({ pct, color }: { pct: number; color: string }) {
  const p = clampPct(pct);
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  return (
    <svg className="bt-quant-ring-svg" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function KpiViz({ item }: { item: QuantKpiItem }) {
  const color = vizColor(item.tone);
  const series = item.vizSeries ?? [];
  const gradId = `bt-spark-${item.label.replace(/\W+/g, "-").toLowerCase()}`;
  switch (item.viz) {
    case "sparkline":
      return <MiniSparkline data={series} color={color} gradId={gradId} />;
    case "bars":
      return <MiniBars data={series} color={color} />;
    case "progress":
      return <MiniProgress pct={item.progress ?? 0} color={color} />;
    case "ring":
      return <MiniRing pct={item.progress ?? 0} color={color} />;
    default:
      return item.progress != null ? <MiniProgress pct={item.progress} color={color} /> : <div className="bt-quant-viz bt-quant-viz--empty" />;
  }
}

export function QuantKpiStrip({ items, title = "Quant KPI strip" }: { items: QuantKpiItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="bt-quant-strip-section" aria-label={title}>
      <h3 className="bt-quant-section-label">{title}</h3>
      <div className="bt-quant-kpi-strip">
        {items.map((item) => (
          <article key={item.label} className={`bt-quant-kpi-card bt-quant-kpi-card--${item.tone ?? "neutral"}`}>
            <span className="bt-quant-kpi-label">{item.label}</span>
            <span className={`bt-quant-kpi-value bt-quant-kpi-value--${item.tone ?? "neutral"}`}>{item.value}</span>
            <div className="bt-quant-kpi-viz">
              <KpiViz item={item} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Horizontal strip from legacy OsMetricCard rows. */
export function QuantKpiFromCards({ cards, title }: { cards: OsMetricCard[]; title?: string }) {
  return <QuantKpiStrip items={osMetricCardsToQuantKpi(cards)} title={title} />;
}
