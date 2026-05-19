"use client";

import React, { useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";

const gridColor = "rgba(255,255,255,0.05)";
const tickColor = "#4b5563";
const fontFamily = "var(--font-space-mono, 'Space Mono', monospace)";

const commonOpts = {
  responsive: true,
  animation: false as const,
  maintainAspectRatio: false,
};

/** Wrapper height for Chart.js canvases (must match useEffect chart sizing). */
const WRAP_H_200 = 200;

export type BacktestOsChartPack = {
  equity: {
    labels: string[];
    strategy: number[];
    benchmark: number[] | null;
    subtitle: string;
  } | null;
  rolling: { labels: string[]; values: (number | null)[] } | null;
  dist: { labels: string[]; counts: number[]; colors: string[] } | null;
  monthlyPct: { labels: string[]; values: number[] } | null;
  drawdown: { labels: string[]; values: number[] } | null;
  radar: {
    labels: string[];
    strategy: number[];
    benchmark: number[];
  } | null;
  annual: { years: string[]; strategy: number[]; benchmark: number[] | null } | null;
  tradePL: { x: number; y: number }[] | null;
  winLoss: { wins: number; losses: number } | null;
  duration: { labels: string[]; counts: number[] } | null;
  monteCarlo: {
    labels: string[];
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  } | null;
};

function destroy(c: Chart | null | undefined): void {
  if (c) {
    try {
      c.destroy();
    } catch {
      /* ignore */
    }
  }
}

export function OsChartsEquityRolling({
  equity,
  rolling,
}: {
  equity: BacktestOsChartPack["equity"];
  rolling: BacktestOsChartPack["rolling"];
}) {
  const refEq = useRef<HTMLCanvasElement>(null);
  const refRoll = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.color = "#6b7280";
    Chart.defaults.font.family = fontFamily;
    Chart.defaults.font.size = 10;
    const c = charts.current;

    if (equity && refEq.current) {
      destroy(c.eq);
      const ds: any[] = [
        {
          label: "Equity",
          data: equity.strategy,
          borderColor: "#00ff88",
          borderWidth: 2,
          fill: true,
          backgroundColor: "rgba(0,255,136,0.06)",
          pointRadius: 0,
          tension: 0.3,
        },
      ];
      if (equity.benchmark && equity.benchmark.length === equity.strategy.length) {
        ds.push({
          label: "Bench",
          data: equity.benchmark,
          borderColor: "#00c4ff",
          borderWidth: 1.5,
          fill: false,
          borderDash: [4, 4],
          pointRadius: 0,
          tension: 0.3,
        });
      }
      c.eq = new Chart(refEq.current, {
        type: "line",
        data: { labels: equity.labels, datasets: ds },
        options: {
          ...commonOpts,
          plugins: {
            legend: { display: ds.length > 1, labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 14 } },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: tickColor }, grid: { color: gridColor } },
            y: {
              ticks: {
                color: tickColor,
                callback: (v: string | number) => "$" + Math.round(Number(v) / 1000) + "k",
              },
              grid: { color: gridColor },
            },
          },
        },
      });
    }

    if (rolling && refRoll.current) {
      destroy(c.roll);
      c.roll = new Chart(refRoll.current, {
        type: "line",
        data: {
          labels: rolling.labels,
          datasets: [
            {
              data: rolling.values,
              borderColor: "#a855f7",
              borderWidth: 1.5,
              fill: true,
              backgroundColor: "rgba(168,85,247,0.08)",
              pointRadius: 0,
              tension: 0.4,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { callback: (v: string | number) => v + "%", color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    return () => {
      destroy(c.eq ?? null);
      destroy(c.roll ?? null);
      c.eq = undefined;
      c.roll = undefined;
    };
  }, [equity, rolling]);

  return (
    <div className="bt-os-charts-row bt-os-col2">
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Equity curve <span>{equity?.subtitle ?? "—"}</span>
        </div>
        <div style={{ height: WRAP_H_200 }}>
          <canvas ref={refEq} />
        </div>
      </div>
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Rolling return proxy <span>3-mo on monthly %</span>
        </div>
        <div style={{ height: WRAP_H_200 }}>
          <canvas ref={refRoll} />
        </div>
      </div>
    </div>
  );
}

export function OsChartsDistMonthly({
  dist,
  monthlyPct,
}: {
  dist: BacktestOsChartPack["dist"];
  monthlyPct: BacktestOsChartPack["monthlyPct"];
}) {
  const refDist = useRef<HTMLCanvasElement>(null);
  const refMo = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    const c = charts.current;

    if (dist && refDist.current) {
      destroy(c.dist);
      c.dist = new Chart(refDist.current, {
        type: "bar",
        data: {
          labels: dist.labels,
          datasets: [{ data: dist.counts, backgroundColor: dist.colors, borderWidth: 0 }],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 10, color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    if (monthlyPct && refMo.current) {
      destroy(c.mo);
      c.mo = new Chart(refMo.current, {
        type: "bar",
        data: {
          labels: monthlyPct.labels,
          datasets: [
            {
              data: monthlyPct.values,
              backgroundColor: monthlyPct.values.map((r) =>
                r >= 0 ? "rgba(0,255,136,0.65)" : "rgba(255,77,77,0.65)"
              ),
              borderWidth: 0,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 12, color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { callback: (v: string | number) => v + "%", color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    return () => {
      destroy(c.dist ?? null);
      destroy(c.mo ?? null);
    };
  }, [dist, monthlyPct]);

  return (
    <div className="bt-os-charts-row bt-os-col2">
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Trade P&amp;L distribution <span>histogram ($)</span>
        </div>
        <div style={{ height: WRAP_H_200 }}>
          <canvas ref={refDist} />
        </div>
      </div>
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Monthly return % <span>vs start balance</span>
        </div>
        <div style={{ height: WRAP_H_200 }}>
          <canvas ref={refMo} />
        </div>
      </div>
    </div>
  );
}

export function OsChartsDrawdown({ drawdown }: { drawdown: BacktestOsChartPack["drawdown"] }) {
  const refDd = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    const c = charts.current;
    if (drawdown && refDd.current) {
      destroy(c.dd);
      c.dd = new Chart(refDd.current, {
        type: "line",
        data: {
          labels: drawdown.labels,
          datasets: [
            {
              data: drawdown.values,
              fill: true,
              backgroundColor: "rgba(255,77,77,0.18)",
              borderColor: "rgba(255,77,77,0.8)",
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.3,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: tickColor }, grid: { color: gridColor } },
            y: {
              max: 0,
              ticks: { callback: (v: string | number) => v + "%", color: tickColor },
              grid: { color: gridColor },
            },
          },
        },
      });
    }
    return () => destroy(c.dd ?? null);
  }, [drawdown]);

  return (
    <div className="bt-os-chart-card">
      <div className="bt-os-chart-title">
        Drawdown % from peak <span>balance path</span>
      </div>
      <div style={{ height: 130 }}>
        <canvas ref={refDd} />
      </div>
    </div>
  );
}

export function OsChartsRadarAnnual({
  radar,
  annual,
}: {
  radar: BacktestOsChartPack["radar"];
  annual: BacktestOsChartPack["annual"];
}) {
  const refRadar = useRef<HTMLCanvasElement>(null);
  const refAnn = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    const c = charts.current;

    if (radar && refRadar.current) {
      destroy(c.radar);
      c.radar = new Chart(refRadar.current, {
        type: "radar",
        data: {
          labels: radar.labels,
          datasets: [
            {
              label: "Session",
              data: radar.strategy,
              borderColor: "#00ff88",
              backgroundColor: "rgba(0,255,136,0.1)",
              borderWidth: 2,
              pointRadius: 3,
            },
            {
              label: "Ref",
              data: radar.benchmark,
              borderColor: "#00c4ff",
              backgroundColor: "rgba(0,196,255,0.06)",
              borderWidth: 1.5,
              borderDash: [3, 3],
              pointRadius: 2,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: true, labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 12 } } },
          scales: {
            r: {
              ticks: { display: false },
              grid: { color: "rgba(255,255,255,0.07)" },
              pointLabels: { color: "#9ca3af", font: { size: 10 } },
              angleLines: { color: "rgba(255,255,255,0.07)" },
            },
          },
        },
      });
    }

    if (annual && refAnn.current) {
      destroy(c.ann);
      const bench = annual.benchmark;
      const ds: any[] = [
        {
          label: "Session",
          data: annual.strategy,
          backgroundColor: annual.strategy.map((r) => (r >= 0 ? "rgba(0,255,136,0.7)" : "rgba(255,77,77,0.7)")),
          borderRadius: 3,
        },
      ];
      if (bench && bench.length === annual.strategy.length) {
        ds.push({
          label: "Bench",
          data: bench,
          backgroundColor: "rgba(0,196,255,0.3)",
          borderRadius: 3,
        });
      }
      c.ann = new Chart(refAnn.current, {
        type: "bar",
        data: { labels: annual.years, datasets: ds },
        options: {
          ...commonOpts,
          plugins: { legend: { display: !!bench, labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 12 } } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { callback: (v: string | number) => v + "%", color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    return () => {
      destroy(c.radar ?? null);
      destroy(c.ann ?? null);
    };
  }, [radar, annual]);

  return (
    <div className="bt-os-charts-row bt-os-col2">
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">Risk-adjusted radar</div>
        <div style={{ height: 260 }}>
          <canvas ref={refRadar} />
        </div>
      </div>
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Annual return % <span>from monthly P&amp;L</span>
        </div>
        <div style={{ height: 260 }}>
          <canvas ref={refAnn} />
        </div>
      </div>
    </div>
  );
}

export function OsChartsTradeTriple({
  tradePL,
  winLoss,
  duration,
}: {
  tradePL: BacktestOsChartPack["tradePL"];
  winLoss: BacktestOsChartPack["winLoss"];
  duration: BacktestOsChartPack["duration"];
}) {
  const refPL = useRef<HTMLCanvasElement>(null);
  const refWL = useRef<HTMLCanvasElement>(null);
  const refDur = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    const c = charts.current;

    if (tradePL && tradePL.length && refPL.current) {
      destroy(c.pl);
      c.pl = new Chart(refPL.current, {
        type: "line",
        data: {
          datasets: [
            {
              data: tradePL,
              borderColor: "#00ff88",
              borderWidth: 1.5,
              fill: true,
              backgroundColor: "rgba(0,255,136,0.05)",
              pointRadius: 0,
              tension: 0.2,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { type: "linear", ticks: { maxTicksLimit: 7, color: tickColor }, grid: { color: gridColor } },
            y: {
              ticks: {
                color: tickColor,
                callback: (v: string | number) => "$" + Math.round(Number(v) / 1000) + "k",
              },
              grid: { color: gridColor },
            },
          },
        },
      });
    }

    if (winLoss && refWL.current && winLoss.wins + winLoss.losses > 0) {
      destroy(c.wl);
      c.wl = new Chart(refWL.current, {
        type: "doughnut",
        data: {
          labels: [`Wins (${winLoss.wins})`, `Losses (${winLoss.losses})`],
          datasets: [
            {
              data: [winLoss.wins, winLoss.losses],
              backgroundColor: ["rgba(0,255,136,0.75)", "rgba(255,77,77,0.7)"],
              borderWidth: 0,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          ...commonOpts,
          cutout: "68%",
          plugins: {
            legend: {
              display: true,
              position: "bottom" as const,
              labels: { color: "#9ca3af", font: { size: 10 }, boxWidth: 12, padding: 12 },
            },
          },
        },
      });
    }

    if (duration && refDur.current) {
      destroy(c.dur);
      c.dur = new Chart(refDur.current, {
        type: "bar",
        data: {
          labels: duration.labels,
          datasets: [
            {
              data: duration.counts,
              backgroundColor: "rgba(255,107,53,0.65)",
              borderRadius: 4,
              borderWidth: 0,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    return () => {
      destroy(c.pl ?? null);
      destroy(c.wl ?? null);
      destroy(c.dur ?? null);
    };
  }, [tradePL, winLoss, duration]);

  return (
    <div className="bt-os-charts-row bt-os-col3">
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">
          Cumulative trade P&amp;L <span>running total $</span>
        </div>
        <div style={{ height: 220 }}>
          <canvas ref={refPL} />
        </div>
      </div>
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">Win / loss split</div>
        <div style={{ height: 220 }}>
          <canvas ref={refWL} />
        </div>
      </div>
      <div className="bt-os-chart-card">
        <div className="bt-os-chart-title">Holding buckets</div>
        <div style={{ height: 220 }}>
          <canvas ref={refDur} />
        </div>
      </div>
    </div>
  );
}

export function OsChartsMonteCarlo({ monteCarlo }: { monteCarlo: BacktestOsChartPack["monteCarlo"] }) {
  const refMc = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Record<string, Chart | undefined>>({});

  useEffect(() => {
    Chart.defaults.font.family = fontFamily;
    const c = charts.current;
    if (monteCarlo && refMc.current) {
      destroy(c.mc);
      const { labels, p5, p25, p50, p75, p95 } = monteCarlo;
      c.mc = new Chart(refMc.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "95th %",
              data: p95,
              borderColor: "rgba(0,255,136,0.8)",
              borderWidth: 1.5,
              fill: false,
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: "75th %",
              data: p75,
              borderColor: "rgba(0,255,136,0.4)",
              borderWidth: 1,
              fill: "+1",
              backgroundColor: "rgba(0,255,136,0.04)",
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: "Median",
              data: p50,
              borderColor: "#00c4ff",
              borderWidth: 2,
              fill: false,
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: "25th %",
              data: p25,
              borderColor: "rgba(255,107,53,0.4)",
              borderWidth: 1,
              fill: "-1",
              backgroundColor: "rgba(255,77,77,0.04)",
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: "5th %",
              data: p5,
              borderColor: "rgba(255,77,77,0.8)",
              borderWidth: 1.5,
              fill: false,
              pointRadius: 0,
              tension: 0.3,
            },
          ],
        },
        options: {
          ...commonOpts,
          plugins: {
            legend: { display: true, position: "right" as const, labels: { color: "#9ca3af", font: { size: 9 }, boxWidth: 12 } },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: tickColor }, grid: { color: gridColor } },
            y: {
              ticks: {
                color: tickColor,
                callback: (v: string | number) => "$" + Math.round(Number(v) / 1000) + "k",
              },
              grid: { color: gridColor },
            },
          },
        },
      });
    }
    return () => destroy(c.mc ?? null);
  }, [monteCarlo]);

  return (
    <div className="bt-os-chart-card">
      <div className="bt-os-chart-title">
        Monte Carlo — trade P&amp;L bootstrap <span>200 paths · percentiles</span>
      </div>
      <div style={{ height: 160 }}>
        <canvas ref={refMc} />
      </div>
    </div>
  );
}
