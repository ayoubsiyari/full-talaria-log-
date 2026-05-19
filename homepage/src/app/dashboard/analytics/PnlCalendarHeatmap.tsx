"use client";

import React, { useEffect, useMemo, useState } from "react";

export type PnlCalendarTrade = { closeTs: number; pnl: number };

export type CalendarViewMode = "days" | "weeks" | "years";

function closeTsToUtcMs(ts: number): number | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (ts > 1e12) return ts;
  if (ts > 1e9) return ts * 1000;
  return ts * 1000;
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseDayKeyUtc(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

/** Monday 00:00 UTC of the ISO week containing `utcMs`. */
function utcMondayOfWeekContaining(utcMs: number): number {
  const d = new Date(utcMs);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = d.getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  return dayStart - daysFromMonday * 86400000;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthRows(year: number, month0: number, pnlByDay: Map<string, { pnl: number; n: number }>) {
  const first = new Date(Date.UTC(year, month0, 1));
  const pad = first.getUTCDay();
  const dim = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: ({ day: number; key: string; pnl: number; n: number } | null)[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    const key = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = pnlByDay.get(key) ?? { pnl: 0, n: 0 };
    cells.push({ day: d, key, pnl: cell.pnl, n: cell.n });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function fmtMoney(pnl: number): string {
  const sign = pnl < 0 ? "-" : "";
  return `${sign}$${Math.abs(pnl).toFixed(0)}`;
}

function tradeLabel(n: number): string {
  if (n === 0) return "0 trades";
  if (n === 1) return "1 trade";
  return `${n} trades`;
}

type Bounds = {
  agg: Map<string, { pnl: number; n: number }>;
  maxAbsDay: number;
  maxAbsMonth: number;
  minDayKey: string;
  maxDayKey: string;
  monthSpan: { y: number; m: number }[];
  byMonth: Map<string, { pnl: number; n: number }>;
  hadClose: boolean;
};

function buildBounds(trades: PnlCalendarTrade[]): Bounds {
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
  const keys = [...agg.keys()].sort();
  let maxAbsDay = 1;
  for (const v of agg.values()) maxAbsDay = Math.max(maxAbsDay, Math.abs(v.pnl), 1e-9);

  const byMonth = new Map<string, { pnl: number; n: number }>();
  for (const [k, v] of agg) {
    const ym = k.slice(0, 7);
    const cur = byMonth.get(ym);
    if (cur) {
      cur.pnl += v.pnl;
      cur.n += v.n;
    } else {
      byMonth.set(ym, { pnl: v.pnl, n: v.n });
    }
  }
  let maxAbsMonth = 1;
  for (const v of byMonth.values()) maxAbsMonth = Math.max(maxAbsMonth, Math.abs(v.pnl), 1e-9);

  if (keys.length === 0) {
    return {
      agg,
      maxAbsDay,
      maxAbsMonth,
      minDayKey: "",
      maxDayKey: "",
      monthSpan: [],
      byMonth,
      hadClose,
    };
  }
  const minDayKey = keys[0]!;
  const maxDayKey = keys[keys.length - 1]!;
  const [y0, mo0] = minDayKey.split("-").map(Number);
  const [y1, mo1] = maxDayKey.split("-").map(Number);
  const monthSpan: { y: number; m: number }[] = [];
  let y = y0;
  let m = mo0 - 1;
  const endM0 = mo1 - 1;
  while (y < y1 || (y === y1 && m <= endM0)) {
    monthSpan.push({ y, m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return { agg, maxAbsDay, maxAbsMonth, minDayKey, maxDayKey, monthSpan, byMonth, hadClose };
}

function cellColorDay(pnl: number, maxAbs: number) {
  if (pnl === 0) return "rgba(107, 114, 128, 0.32)";
  const intensity = Math.min(1, Math.abs(pnl) / maxAbs);
  const a = 0.28 + intensity * 0.62;
  if (pnl > 0) return `rgba(34, 197, 94, ${a.toFixed(3)})`;
  return `rgba(248, 113, 113, ${a.toFixed(3)})`;
}

export function PnlCalendarHeatmap({ trades }: { trades: PnlCalendarTrade[] }) {
  const bounds = useMemo(() => buildBounds(trades), [trades]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const { y } of bounds.monthSpan) ys.add(y);
    return [...ys].sort((a, b) => a - b);
  }, [bounds.monthSpan]);

  const [view, setView] = useState<CalendarViewMode>("days");
  const [cursorMonth, setCursorMonth] = useState<{ y: number; m: number } | null>(null);
  const [weekBlockStart, setWeekBlockStart] = useState<number | null>(null);

  useEffect(() => {
    if (!bounds.hadClose || bounds.monthSpan.length === 0 || !bounds.maxDayKey) {
      setCursorMonth(null);
      setWeekBlockStart(null);
      return;
    }
    const lastM = bounds.monthSpan[bounds.monthSpan.length - 1]!;
    setCursorMonth(lastM);
    const lastMs = parseDayKeyUtc(bounds.maxDayKey);
    const monday = utcMondayOfWeekContaining(lastMs);
    setWeekBlockStart(monday - 7 * 5 * 86400000);
  }, [bounds.hadClose, bounds.minDayKey, bounds.maxDayKey, bounds.monthSpan.length, trades.length]);

  const monthTitle = (y: number, m: number) =>
    new Date(Date.UTC(y, m, 1)).toLocaleString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

  if (!trades.length) {
    return <div className="bt-os-pnl-cal-empty">No trades in current filters.</div>;
  }

  if (!bounds.hadClose || bounds.monthSpan.length === 0 || !cursorMonth || weekBlockStart == null) {
    return (
      <div className="bt-os-pnl-cal-empty">
        No days to plot — trades need a positive <code>closeTime</code> (ms, seconds, or ISO parsed to ms).
      </div>
    );
  }

  const monthIdx = bounds.monthSpan.findIndex((x) => x.y === cursorMonth.y && x.m === cursorMonth.m);
  const canPrevMonth = monthIdx > 0;
  const canNextMonth = monthIdx >= 0 && monthIdx < bounds.monthSpan.length - 1;

  const firstMonday = weekBlockStart;
  const dataStartMs = bounds.minDayKey ? parseDayKeyUtc(bounds.minDayKey) : 0;
  const dataEndMs = bounds.maxDayKey ? parseDayKeyUtc(bounds.maxDayKey) : 0;
  const canPrevWeek = firstMonday > dataStartMs - 86400000 * 7;
  const canNextWeek = firstMonday + 4 * 7 * 86400000 < dataEndMs + 7 * 86400000;

  const shiftMonth = (dir: -1 | 1) => {
    if (monthIdx < 0) return;
    const next = monthIdx + dir;
    if (next >= 0 && next < bounds.monthSpan.length) setCursorMonth(bounds.monthSpan[next]!);
  };

  const shiftWeek = (dir: -1 | 1) => {
    setWeekBlockStart((prev) => (prev == null ? prev : prev + dir * 7 * 86400000 * 4));
  };

  const weekCells = Array.from({ length: 8 * 7 }, (_, i) => {
    const ms = firstMonday + i * 86400000;
    const key = utcDayKey(ms);
    const cell = bounds.agg.get(key) ?? { pnl: 0, n: 0 };
    const d = new Date(ms);
    const dayNum = d.getUTCDate();
    return { key, cell, dayNum, ms };
  });

  return (
    <div className="bt-os-pnl-cal">
      <div className="bt-os-pnl-cal-head">
        <div className="bt-os-pnl-cal-head-left">
          <span className="bt-os-pnl-cal-title">Net PnL by close (UTC)</span>
          <div className="bt-os-pnl-cal-view-toggle" role="tablist" aria-label="Calendar view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "days"}
              className={view === "days" ? "bt-os-pnl-cal-view-btn bt-os-pnl-cal-view-btn--active" : "bt-os-pnl-cal-view-btn"}
              onClick={() => setView("days")}
            >
              Days
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "weeks"}
              className={view === "weeks" ? "bt-os-pnl-cal-view-btn bt-os-pnl-cal-view-btn--active" : "bt-os-pnl-cal-view-btn"}
              onClick={() => setView("weeks")}
            >
              Weeks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "years"}
              className={view === "years" ? "bt-os-pnl-cal-view-btn bt-os-pnl-cal-view-btn--active" : "bt-os-pnl-cal-view-btn"}
              onClick={() => setView("years")}
            >
              Years
            </button>
          </div>
        </div>
        <span className="bt-os-pnl-cal-legend">
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(34,197,94,0.75)" }} />
          win
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(248,113,113,0.75)", marginLeft: 10 }} />
          loss
          <span className="bt-os-pnl-cal-legend-swatch" style={{ background: "rgba(107,114,128,0.45)", marginLeft: 10 }} />
          flat
        </span>
      </div>

      {view === "days" ? (
        <>
          <div className="bt-os-pnl-cal-nav">
            <button type="button" className="bt-os-pnl-cal-nav-btn" disabled={!canPrevMonth} onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ←
            </button>
            <span className="bt-os-pnl-cal-nav-label">{monthTitle(cursorMonth.y, cursorMonth.m)}</span>
            <button type="button" className="bt-os-pnl-cal-nav-btn" disabled={!canNextMonth} onClick={() => shiftMonth(1)} aria-label="Next month">
              →
            </button>
          </div>
          <div className="bt-os-pnl-cal-months bt-os-pnl-cal-months--single">
            <div className="bt-os-pnl-cal-month">
              <div className="bt-os-pnl-cal-grid">
                {DOW.map((d) => (
                  <div key={d} className="bt-os-pnl-cal-dow" title={d}>
                    {d.slice(0, 1)}
                  </div>
                ))}
                {monthRows(cursorMonth.y, cursorMonth.m, bounds.agg).flatMap((row, ri) =>
                  row.map((cell, ci) => (
                    <div
                      key={`${ri}-${ci}`}
                      className="bt-os-pnl-cal-cell"
                      style={{
                        background: cell ? cellColorDay(cell.pnl, bounds.maxAbsDay) : "transparent",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                      title={cell ? `${cell.key} · ${fmtMoney(cell.pnl)} · ${tradeLabel(cell.n)}` : undefined}
                    >
                      {cell ? <span className="bt-os-pnl-cal-dayn">{cell.day}</span> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {view === "weeks" ? (
        <>
          <div className="bt-os-pnl-cal-nav">
            <button type="button" className="bt-os-pnl-cal-nav-btn" disabled={!canPrevWeek} onClick={() => shiftWeek(-1)} aria-label="Earlier weeks">
              ←
            </button>
            <span className="bt-os-pnl-cal-nav-label">8 weeks · Mon–Sun (UTC)</span>
            <button type="button" className="bt-os-pnl-cal-nav-btn" disabled={!canNextWeek} onClick={() => shiftWeek(1)} aria-label="Later weeks">
              →
            </button>
          </div>
          <div className="bt-os-pnl-cal-week-wrap">
            <div className="bt-os-pnl-cal-grid bt-os-pnl-cal-grid--weeks">
              {DOW_MON.map((d) => (
                <div key={d} className="bt-os-pnl-cal-dow">
                  {d.slice(0, 1)}
                </div>
              ))}
              {weekCells.map(({ key, cell, dayNum }) => (
                <div
                  key={key}
                  className="bt-os-pnl-cal-cell"
                  style={{
                    background: cellColorDay(cell.pnl, bounds.maxAbsDay),
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                  title={`${key} · ${fmtMoney(cell.pnl)} · ${tradeLabel(cell.n)}`}
                >
                  <span className="bt-os-pnl-cal-dayn">{dayNum}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {view === "years" ? (
        <div className="bt-os-pnl-cal-years">
          {years.map((y) => (
            <div key={y} className="bt-os-pnl-cal-year-row">
              <div className="bt-os-pnl-cal-year-label">{y}</div>
              <div className="bt-os-pnl-cal-year-months">
                {MONTH_SHORT.map((label, mi) => {
                  const ym = `${y}-${String(mi + 1).padStart(2, "0")}`;
                  const cell = bounds.byMonth.get(ym) ?? { pnl: 0, n: 0 };
                  const title = `${label} ${y} · ${fmtMoney(cell.pnl)} · ${tradeLabel(cell.n)}`;
                  return (
                    <div
                      key={ym}
                      className="bt-os-pnl-cal-year-cell"
                      style={{ background: cellColorDay(cell.pnl, bounds.maxAbsMonth) }}
                      title={title}
                    >
                      <span className="bt-os-pnl-cal-year-cell-mo">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
