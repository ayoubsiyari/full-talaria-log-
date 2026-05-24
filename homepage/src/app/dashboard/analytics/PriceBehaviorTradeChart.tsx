"use client";

import React, { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";
import type { ExcursionSeries } from "./priceBehaviorUtils";

const gridColor = "rgba(255,255,255,0.05)";
const tickColor = "#4b5563";
const fontFamily = "var(--font-space-mono, 'Space Mono', monospace)";

function destroy(c: Chart | null | undefined): void {
  if (c) {
    try {
      c.destroy();
    } catch {
      /* ignore */
    }
  }
}

const exitLinePluginFactory = (exitIndex: number) => ({
  id: `pbExitLine-${exitIndex}`,
  afterDraw(chart: Chart) {
    if (exitIndex < 0) return;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;
    const x = xScale.getPixelForValue(exitIndex);
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 204, 0, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.stroke();
    ctx.restore();
  },
});

type Props = {
  series: ExcursionSeries | null;
  height?: number;
};

export function PriceBehaviorTradeChart({ series, height = 280 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | undefined>(undefined);

  useEffect(() => {
    Chart.defaults.color = "#6b7280";
    Chart.defaults.font.family = fontFamily;
    Chart.defaults.font.size = 10;

    destroy(chartRef.current);
    chartRef.current = undefined;

    if (!series || !ref.current || series.labels.length === 0) return;

    const exitBarIndex = series.exitBarIndex;

    const resultLine = series.labels.map(() => series.resultR);

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: series.labels,
        datasets: [
          {
            label: "Favorable (MFE envelope)",
            data: series.favorable,
            borderColor: "#00d4a1",
            backgroundColor: "rgba(0, 212, 161, 0.08)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15,
            fill: "+1",
          },
          {
            label: "Adverse (MAE envelope)",
            data: series.adverse,
            borderColor: "#ff5068",
            backgroundColor: "rgba(255, 80, 104, 0.06)",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.15,
            fill: false,
          },
          {
            label: "Close R",
            data: series.close,
            borderColor: "rgba(136, 184, 204, 0.9)",
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.1,
            fill: false,
          },
          {
            label: "Actual result",
            data: resultLine,
            borderColor: "rgba(212, 178, 122, 0.95)",
            borderWidth: 1.5,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0]?.dataIndex ?? 0;
                if (i <= series.exitBarIndex) return `In-trade bar ${i + 1}`;
                return `Post-exit bar +${i - series.exitBarIndex}`;
              },
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
                return `${ctx.dataset.label}: ${v.toFixed(2)}R`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 12, color: tickColor, maxRotation: 0 },
            grid: { color: gridColor },
            title: {
              display: true,
              text: series.postExitBars > 0 ? "Bars (exit → +N post-exit)" : "Bars since entry",
              color: "#6b7280",
              font: { size: 10 },
            },
          },
          y: {
            ticks: {
              color: tickColor,
              callback: (v) => `${Number(v).toFixed(1)}R`,
            },
            grid: { color: gridColor },
            title: { display: true, text: "R-multiple", color: "#6b7280", font: { size: 10 } },
          },
        },
      },
      plugins: [exitLinePluginFactory(exitBarIndex)],
    };

    chartRef.current = new Chart(ref.current, config);

    return () => {
      destroy(chartRef.current);
      chartRef.current = undefined;
    };
  }, [series]);

  if (!series) {
    return (
      <div className="bt-os-pb-chart-empty" style={{ height }}>
        No bar-by-bar excursion data for this trade. Replay backtest sessions populate{" "}
        <code>bar_*_r</code> arrays; CSV imports show scalar MAE/MFE only.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}
