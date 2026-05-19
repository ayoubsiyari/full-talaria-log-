"use client";

import React, { useMemo } from "react";
import type { TalariaScoreBreakdown } from "./quantMetricHelpers";
import { normalizeSeries } from "./quantMetricHelpers";

const PILLAR_META: {
  key: keyof Omit<TalariaScoreBreakdown, "overall" | "overallLabel">;
  label: string;
  color: string;
}[] = [
  { key: "profitability", label: "Profitability", color: "var(--bt-quant-cyan)" },
  { key: "risk", label: "Risk", color: "var(--bt-quant-red)" },
  { key: "consistency", label: "Consistency", color: "var(--bt-quant-blue)" },
  { key: "discipline", label: "Discipline", color: "var(--bt-quant-yellow)" },
];

function ScoreRing({
  score,
  label,
  size = "sm",
  color,
  sublabel,
}: {
  score: number;
  label: string;
  size?: "lg" | "sm";
  color: string;
  sublabel?: string;
}) {
  const r = size === "lg" ? 52 : 22;
  const stroke = size === "lg" ? 6 : 3.5;
  const dim = size === "lg" ? 128 : 56;
  const cx = dim / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className={`bt-talaria-ring bt-talaria-ring--${size}`}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} aria-hidden>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="bt-talaria-ring-center">
        <span className="bt-talaria-ring-score">
          {score}
          <span className="bt-talaria-ring-denom">/100</span>
        </span>
        {size === "lg" && sublabel ? <span className="bt-talaria-ring-grade">{sublabel}</span> : null}
      </div>
      <span className="bt-talaria-ring-label">{label}</span>
    </div>
  );
}

function ScoreTrend({ series }: { series: number[] }) {
  const norm = useMemo(() => normalizeSeries(series), [series]);
  if (norm.length < 2) {
    return (
      <div className="bt-talaria-trend bt-talaria-trend--empty">
        <span className="bt-quant-section-label">30-day score trend</span>
        <p className="bt-talaria-trend-empty">Not enough history</p>
      </div>
    );
  }
  const w = 200;
  const h = 72;
  const pts = norm
    .map((v, i) => {
      const x = (i / (norm.length - 1)) * w;
      const y = h - v * h * 0.9 - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="bt-talaria-trend">
      <span className="bt-quant-section-label">30-day score trend</span>
      <svg className="bt-talaria-trend-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="bt-talaria-trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bt-quant-cyan)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--bt-quant-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill="url(#bt-talaria-trend-grad)" points={`0,${h} ${pts} ${w},${h}`} />
        <polyline fill="none" stroke="var(--bt-quant-cyan)" strokeWidth="2" points={pts} />
      </svg>
    </div>
  );
}

export function TalariaScorePanel({
  scores,
  trendSeries = [],
}: {
  scores: TalariaScoreBreakdown;
  trendSeries?: number[];
}) {
  return (
    <section className="bt-talaria-score-section" aria-label="Talaria score">
      <h3 className="bt-quant-section-label">Talaria score</h3>
      <div className="bt-talaria-score-panel">
        <ScoreRing
          score={scores.overall}
          label="Overall"
          size="lg"
          color="var(--bt-quant-cyan)"
          sublabel={scores.overallLabel}
        />
        <div className="bt-talaria-pillars">
          {PILLAR_META.map(({ key, label, color }) => (
            <ScoreRing key={key} score={scores[key]} label={label} color={color} />
          ))}
        </div>
        <ScoreTrend series={trendSeries} />
      </div>
    </section>
  );
}
