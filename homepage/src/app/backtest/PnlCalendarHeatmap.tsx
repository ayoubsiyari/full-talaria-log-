"use client";

import React, { useMemo } from "react";

export type PnlCalendarTrade = { closeTs: number; pnl: number };

function closeTsToUtcMs(ts: number): number | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (ts > 1e12) return ts;
  if (ts > 1e9) return ts * 1000;
  return ts * 1000;
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthRows(year: number, month0: number, pnlByDay: Map<string, number>) {
  const first = new Date(Date.UTC(year, month0, 1));
  const pad = first.getUTCDay();
  const dim = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: ({ day: number; key: string; pnl: number } | null)[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    const key = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key, pnl: pnlByDay.get(key) ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function fmtDayTitle(pnl: number): string {
  const sign = pnl < 0 ? "-" : "";
  return `${sign}$${Math.abs(pnl).toFixed(0)}`;
}

export function PnlCalendarHeatmap({ trades }: { trades: PnlCalendarTrade[] }) {
  const { byDay, maxAbs, monthKeys, hadClose } = useMemo(() => {
    const agg = new Map<string, { pnl: number; n: number }>();
    let hadClose = false;
    for (const t of trades) {
      const ms = closeTsToUtcMs(t.closeTs);
      if (ms == null) continue;
      hadClose = true;
      const k = utcDayKey(ms);
      const cur = agg.get(k);
      if (cur) {
        cur.pnl += t.pnl;
        cur.n += 1;
      } else {
        agg.set(k, { pnl: t.pnl, n: 1 });
      }
    }
    const byDay = new Map<string, number>();
    let maxAbs = 1;
    for (const [k, v] of agg) {
      byDay.set(k, v.pnl);
      maxAbs = Math.max(maxAbs, Math.abs(v.pnl), 1e-9);
    }
    const keys = [...agg.keys()].sort();
    if (keys.length === 0) {
      return { byDay, maxAbs, monthKeys: [] as { y: number; m: number }[], hadClose };
    }
    const [y0, mo0] = keys[0]!.split("-").map(Number);
    const [y1, mo1] = keys[keys.length - 1]!.split("-").map(Number);
    const monthKeys: { y: number; m: number }[] = [];
    let y = y0;
    let m = mo0 - 1;
    const endM0 = mo1 - 1;
    while (y < y1 || (y === y1 && m <= endM0)) {
      monthKeys.push({ y, m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return { byDay, maxAbs, monthKeys, hadClose };
  }, [trades]);

  if (!trades.length) {
    return <div className="bt-os-pnl-cal-empty">No trades in current filters.</div>;
  }

  if (!hadClose || monthKeys.length === 0) {
    return (
      <div className="bt-os-pnl-cal-empty">
        No days to plot — trades need a positive <code>closeTime</code> (ms, seconds, or ISO parsed to ms).
      </div>
    );
  }

  const capped = monthKeys.length > 24 ? monthKeys.slice(-24) : monthKeys;
  const truncated = monthKeys.length > 24;

  const cellColor = (pnl: number) => {
    if (pnl === 0) return "rgba(107, 114, 128, 0.32)";
    const intensity = Math.min(1, Math.abs(pnl) / maxAbs);
    const a = 0.28 + intensity * 0.62;
    if (pnl > 0) return `rgba(34, 197, 94, ${a.toFixed(3)})`;
    return `rgba(248, 113, 113, ${a.toFixed(3)})`;
  };

  const monthTitle = (y: number, m: number) =>
    new Date(Date.UTC(y, m, 1)).toLocaleString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="bt-os-pnl-cal">
      <div className="bt-os-pnl-cal-head">
        <span className="bt-os-pnl-cal-title">Daily net PnL (UTC close date)</span>
        <span className="bt-os-pnl-cal-legend">
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(34,197,94,0.75)" }} />
          green day
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(248,113,113,0.75)", marginLeft: 10 }} />
          red day
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(107,114,128,0.45)", marginLeft: 10 }} />
          flat
        </span>
      </div>
      <div className="bt-os-pnl-cal-months">
        {capped.map(({ y, m }) => {
          const rows = monthRows(y, m, byDay);
          return (
            <div key={`${y}-${m}`} className="bt-os-pnl-cal-month">
              <div className="bt-os-pnl-cal-month-title">{monthTitle(y, m)}</div>
              <div className="bt-os-pnl-cal-grid">
                {DOW.map((d) => (
                  <div key={d} className="bt-os-pnl-cal-dow" title={d}>
                    {d.slice(0, 1)}
                  </div>
                ))}
                {rows.map((row, ri) =>
                  row.map((cell, ci) => (
                    <div
                      key={`${ri}-${ci}`}
                      className="bt-os-pnl-cal-cell"
                      style={{
                        background: cell ? cellColor(cell.pnl) : "transparent",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                      title={cell ? `${cell.key} · ${fmtDayTitle(cell.pnl)}` : undefined}
                    >
                      {cell ? <span className="bt-os-pnl-cal-dayn">{cell.day}</span> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {truncated ? <div className="bt-os-pnl-cal-note">Showing the last 24 calendar months that include closes.</div> : null}
    </div>
  );
}
