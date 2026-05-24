"use client";

import React, { useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";
import type { MaeMfeScatterPoint } from "./priceBehaviorUtils";

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

type Props = {
  points: MaeMfeScatterPoint[];
  selectedKey?: string;
  onSelect?: (tradeKey: string) => void;
  height?: number;
};

export function PriceBehaviorScatterChart({
  points,
  selectedKey,
  onSelect,
  height = 260,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | undefined>(undefined);

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    destroy(chartRef.current);
    chartRef.current = undefined;

    if (!ref.current || points.length === 0) return;

    const wins = points.filter((p) => p.win);
    const losses = points.filter((p) => !p.win);

    chartRef.current = new Chart(ref.current, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Winners",
            data: wins.map((p) => ({ x: p.x, y: p.y, tradeKey: p.tradeKey })),
            backgroundColor: "rgba(0, 212, 161, 0.75)",
            borderColor: "#00d4a1",
            borderWidth: 1,
            pointRadius: wins.map((p) => (p.tradeKey === selectedKey ? 7 : 4)),
            pointHoverRadius: 7,
          },
          {
            label: "Losers",
            data: losses.map((p) => ({ x: p.x, y: p.y, tradeKey: p.tradeKey })),
            backgroundColor: "rgba(255, 80, 104, 0.75)",
            borderColor: "#ff5068",
            borderWidth: 1,
            pointRadius: losses.map((p) => (p.tradeKey === selectedKey ? 7 : 4)),
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        onClick: (_e, elements) => {
          if (!onSelect || !elements.length) return;
          const el = elements[0];
          const dsIdx = el.datasetIndex;
          const idx = el.index;
          const pool = dsIdx === 0 ? wins : losses;
          const pt = pool[idx];
          if (pt?.tradeKey) onSelect(pt.tradeKey);
        },
        plugins: {
          legend: { labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const px = ctx.parsed.x;
                const py = ctx.parsed.y;
                const p = points.find((pt) => pt.x === px && pt.y === py);
                return [
                  p ? `${p.ticker}` : "",
                  px != null ? `MAE: ${px.toFixed(2)}R` : "MAE: —",
                  py != null ? `MFE: ${py.toFixed(2)}R` : "MFE: —",
                ].filter(Boolean);
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "MAE (R)", color: "#6b7280", font: { size: 10 } },
            ticks: { color: tickColor },
            grid: { color: gridColor },
          },
          y: {
            title: { display: true, text: "MFE (R)", color: "#6b7280", font: { size: 10 } },
            ticks: { color: tickColor },
            grid: { color: gridColor },
          },
        },
      },
    });

    return () => {
      destroy(chartRef.current);
      chartRef.current = undefined;
    };
  }, [points, selectedKey, onSelect]);

  if (points.length === 0) {
    return (
      <div className="bt-os-pb-chart-empty" style={{ height }}>
        No MAE/MFE scalar data yet. Take trades on the chart or import CSV with{" "}
        <code>mae_r</code> and <code>mfe_r</code> columns.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}
