"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./cot-page.css";
import { COT_POPULAR_CODES } from "./cot-instruments";
import {
  buildSnapshot,
  fetchCotHistory,
  loadPopularAndCatalog,
  type CotSnapshot,
  type LoadCotProgress,
} from "./cot-fetch";

/** CFTC commodity_group_name — full Legacy Combined universe */
type CotCategoryFilter =
  | "all"
  | "AGRICULTURE"
  | "FINANCIAL INSTRUMENTS"
  | "NATURAL RESOURCES"
  | "__none__";

const CATEGORY_TABS: { id: CotCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "AGRICULTURE", label: "Agriculture" },
  { id: "FINANCIAL INSTRUMENTS", label: "Financial" },
  { id: "NATURAL RESOURCES", label: "Resources" },
  { id: "__none__", label: "Ungrouped" },
];

type SortKey = "net_abs" | "net_desc" | "net_asc" | "name" | "code";

const VIEW_WEEKS = [4, 13, 26, 52] as const;

/** Bull / positive data accent (lime) — matches original COT mock */
const ACCENT = "#c8f060";

function fmtK(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (a >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function formatReportDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function makeSpark(data: number[], color: string): React.ReactNode {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 160;
  const h = 28;
  if (data.length === 1) {
    const y = h / 2;
    return (
      <line
        x1={0}
        y1={y}
        x2={w}
        y2={y}
        stroke={color}
        strokeWidth="1.5"
      />
    );
  }
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <polyline
      points={pts}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}

function biasFromIndex(idx: number | null): "bull" | "bear" | "neutral" {
  if (idx == null) return "neutral";
  if (idx > 60) return "bull";
  if (idx < 40) return "bear";
  return "neutral";
}

function signalFromDelta(d: number): { text: string; color: string } {
  if (d > 3000) return { text: "▲ Increasing", color: ACCENT };
  if (d < -3000) return { text: "▼ Decreasing", color: "#ff6060" };
  return { text: "→ Steady", color: "#a8a4b2" };
}

export default function CotDashboardPage() {
  const [snapshots, setSnapshots] = useState<CotSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadCotProgress>({
    phase: "catalog",
    done: 0,
    total: 1,
  });
  const [categoryFilter, setCategoryFilter] =
    useState<CotCategoryFilter>("all");
  const [subgroupFilter, setSubgroupFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("net_abs");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [viewWeeks, setViewWeeks] = useState<number>(13);
  const [detailLoadingCode, setDetailLoadingCode] = useState<string | null>(
    null
  );
  const snapshotsRef = useRef<CotSnapshot[]>([]);
  snapshotsRef.current = snapshots;
  const historyFetchInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadProgress({ phase: "catalog", done: 0, total: 1 });
    try {
      const rows = await loadPopularAndCatalog(
        COT_POPULAR_CODES,
        220,
        8,
        setLoadProgress
      );
      if (!rows.length) throw new Error("No CFTC rows returned");
      setSnapshots(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CFTC data");
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureHistory = useCallback(async (code: string) => {
    const cur = snapshotsRef.current.find((s) => s.def.code === code);
    if (!cur || cur.historyLoaded) return;
    if (historyFetchInFlight.current.has(code)) return;
    historyFetchInFlight.current.add(code);

    setDetailLoadingCode(code);
    try {
      const rows = await fetchCotHistory(code, 220);
      const full = buildSnapshot(cur.def, rows);
      if (!full) return;
      setSnapshots((prev) =>
        prev.map((s) => (s.def.code === code ? full : s))
      );
    } finally {
      historyFetchInFlight.current.delete(code);
      setDetailLoadingCode((c) => (c === code ? null : c));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subgroupOptions = useMemo(() => {
    let base = snapshots;
    if (categoryFilter !== "all") {
      if (categoryFilter === "__none__") {
        base = base.filter((s) => !s.def.commodityGroup);
      } else {
        base = base.filter((s) => s.def.commodityGroup === categoryFilter);
      }
    }
    const set = new Set<string>();
    for (const s of base) {
      if (s.def.commoditySubgroup) set.add(s.def.commoditySubgroup);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [snapshots, categoryFilter]);

  useEffect(() => {
    if (
      subgroupFilter !== "all" &&
      !subgroupOptions.includes(subgroupFilter)
    ) {
      setSubgroupFilter("all");
    }
  }, [subgroupOptions, subgroupFilter]);

  const filtered = useMemo(() => {
    let out = snapshots;
    if (categoryFilter !== "all") {
      if (categoryFilter === "__none__") {
        out = out.filter((s) => !s.def.commodityGroup);
      } else {
        out = out.filter((s) => s.def.commodityGroup === categoryFilter);
      }
    }
    if (subgroupFilter !== "all") {
      out = out.filter(
        (s) => (s.def.commoditySubgroup || "") === subgroupFilter
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((s) => {
        const hay = [
          s.def.sym,
          s.marketName,
          s.def.code,
          s.def.commodityName || "",
          s.def.commoditySubgroup || "",
          s.def.commodityGroup || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const sorted = [...out];
    if (sortKey === "net_abs") {
      sorted.sort(
        (a, b) => Math.abs(b.netNonComm) - Math.abs(a.netNonComm)
      );
    } else if (sortKey === "net_desc") {
      sorted.sort((a, b) => b.netNonComm - a.netNonComm);
    } else if (sortKey === "net_asc") {
      sorted.sort((a, b) => a.netNonComm - b.netNonComm);
    } else if (sortKey === "name") {
      sorted.sort((a, b) => a.def.sym.localeCompare(b.def.sym));
    } else {
      sorted.sort((a, b) => a.def.code.localeCompare(b.def.code));
    }
    return sorted;
  }, [
    snapshots,
    categoryFilter,
    subgroupFilter,
    search,
    sortKey,
  ]);

  const stripList = useMemo(() => filtered.slice(0, 8), [filtered]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedCode(null);
      return;
    }
    if (
      !selectedCode ||
      !filtered.some((s) => s.def.code === selectedCode)
    ) {
      setSelectedCode(filtered[0].def.code);
    }
  }, [filtered, selectedCode]);

  const selected = useMemo(
    () =>
      filtered.find((s) => s.def.code === selectedCode) || filtered[0] || null,
    [filtered, selectedCode]
  );

  const latestReport = useMemo(() => {
    let max = "";
    for (const s of snapshots) {
      if (s.reportDate > max) max = s.reportDate;
    }
    return max;
  }, [snapshots]);

  const chartsReadyCount = useMemo(
    () => snapshots.filter((s) => s.historyLoaded).length,
    [snapshots]
  );

  const extremes = useMemo(() => {
    const out: {
      code: string;
      sym: string;
      desc: string;
      pct: number;
      bear: boolean;
    }[] = [];
    for (const s of filtered) {
      const p = s.percentile3y;
      if (p == null) continue;
      if (p >= 85) {
        out.push({
          code: s.def.code,
          sym: s.def.sym,
          desc: "High vs sample — crowded long positioning",
          pct: p,
          bear: false,
        });
      } else if (p <= 15) {
        out.push({
          code: s.def.code,
          sym: s.def.sym,
          desc: "Low vs sample — crowded short positioning",
          pct: p,
          bear: true,
        });
      }
    }
    return out.slice(0, 8);
  }, [filtered]);

  const flips = useMemo(() => {
    const out: {
      code: string;
      sym: string;
      type: string;
      bear: boolean;
      note: string;
    }[] = [];
    for (const s of filtered) {
      if (s.crossedZero) {
        out.push({
          code: s.def.code,
          sym: s.def.sym,
          type: "Net spec crossed zero (vs prior week)",
          bear: s.netNonComm < 0,
          note: "Non-commercial net changed sign week over week",
        });
      }
    }
    return out.slice(0, 8);
  }, [filtered]);

  const exportCsv = useCallback(() => {
    const headers = [
      "symbol",
      "cftc_code",
      "commodity_group",
      "commodity_subgroup",
      "report_date",
      "net_noncomm",
      "wk_delta_net",
      "noncomm_long",
      "noncomm_short",
      "open_interest",
      "oi_wk_pct",
      "cot_index_pct",
      "bias",
    ];
    const lines = [headers.join(",")];
    for (const s of filtered) {
      const b = biasFromIndex(s.percentile3y);
      const esc = (x: string) =>
        x.includes(",") ? `"${x.replace(/"/g, '""')}"` : x;
      lines.push(
        [
          esc(s.def.sym),
          s.def.code,
          esc(s.def.commodityGroup || ""),
          esc(s.def.commoditySubgroup || ""),
          s.reportDate,
          s.netNonComm,
          s.wkNetDelta,
          s.noncommLong,
          s.noncommShort,
          s.oi,
          s.wkOiDeltaPct.toFixed(2),
          s.percentile3y ?? "",
          b,
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cot-legacy-${latestReport || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtered, latestReport]);

  if (loading) {
    const msg =
      loadProgress.phase === "catalog"
        ? "Loading latest CFTC report (all markets, positions only)…"
        : `Loading popular markets — weekly history ${loadProgress.done}/${loadProgress.total}…`;
    return (
      <div className="cot-page cot-page-bg">
        <div className="cot-loading">{msg}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cot-page cot-page-bg">
        <div className="cot-error">{error}</div>
        <button type="button" className="cot-btn-sm" onClick={() => load()}>
          Retry
        </button>
      </div>
    );
  }

  const pSel = selected?.percentile3y ?? 50;
  const arcLen = 220;
  const dashOffset = arcLen * (1 - pSel / 100);
  const gaugeAngle = Math.PI * (1 - pSel / 100);
  const needleX = 90 + 70 * Math.cos(gaugeAngle);
  const needleY = 90 - 70 * Math.sin(gaugeAngle);

  const specLongPct =
    selected && selected.noncommLong + selected.noncommShort > 0
      ? Math.round(
          (selected.noncommLong /
            (selected.noncommLong + selected.noncommShort)) *
            100
        )
      : 50;

  return (
    <div className="cot-page cot-page-bg">
      <div className="cot-page-header">
        <div>
          <div className="cot-page-title">
            Commitment of <span>Traders</span>
          </div>
          <div className="cot-page-sub">
            CFTC Public Reporting · Legacy Combined (futures + options) ·{" "}
            {snapshots.length} markets in catalog · {chartsReadyCount} with full
            weekly history preloaded · Week ending{" "}
            {formatReportDate(latestReport)}
          </div>
        </div>
        <div className="cot-header-right">
          <div className="cot-update-badge">
            <div className="cot-update-dot" />
            Live CFTC API
          </div>
          <button type="button" className="cot-btn-sm" onClick={exportCsv}>
            ↓ Export CSV
          </button>
          <button type="button" className="cot-btn-sm" onClick={() => load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="cot-main">
        <div className="cot-filters-block">
          <div className="cot-asset-tabs">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  "cot-asset-tab" +
                  (categoryFilter === t.id ? " cot-active" : "")
                }
                onClick={() => {
                  setCategoryFilter(t.id);
                  setSubgroupFilter("all");
                }}
              >
                <span className="cot-dot" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="cot-filter-row">
            <label className="cot-filter-label">
              <span className="cot-section-label">Subgroup</span>
              <select
                className="cot-select"
                value={subgroupFilter}
                onChange={(e) => setSubgroupFilter(e.target.value)}
              >
                <option value="all">All subgroups</option>
                {subgroupOptions.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
              </select>
            </label>
            <label className="cot-filter-label cot-filter-grow">
              <span className="cot-section-label">Search</span>
              <input
                type="search"
                className="cot-search-input"
                placeholder="Name, CFTC code, commodity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="cot-filter-label">
              <span className="cot-section-label">Sort</span>
              <select
                className="cot-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="net_abs">|Net| (largest)</option>
                <option value="net_desc">Net (high → low)</option>
                <option value="net_asc">Net (low → high)</option>
                <option value="name">Name (A–Z)</option>
                <option value="code">CFTC code</option>
              </select>
            </label>
            <div className="cot-view-row">
              <span className="cot-section-label">View:</span>
              {VIEW_WEEKS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={
                    "cot-wk-btn" + (viewWeeks === w ? " cot-active" : "")
                  }
                  onClick={() => setViewWeeks(w)}
                >
                  {w}W
                </button>
              ))}
            </div>
          </div>
          <div className="cot-filter-meta">
            Showing {filtered.length} of {snapshots.length} markets
            {search.trim() ? ` matching “${search.trim()}”` : ""}. Select a
            market to load weekly history (charts, percentile) if not
            preloaded.
          </div>
        </div>

        {/* Sentiment strip */}
        <div className="cot-sentiment-strip">
          {stripList.map((p) => {
            const barW = Math.min(
              90,
              (Math.abs(p.netNonComm) / (Math.max(p.oi, 1) || 1)) * 5000
            );
            const chgK = p.wkNetDelta / 1000;
            const chgTxt =
              (chgK >= 0 ? "+" : "") + (Math.round(chgK * 10) / 10).toFixed(1) + "K";
            const cls =
              p.wkNetDelta > 0 ? "up" : p.wkNetDelta < 0 ? "dn" : "flat";
            const bull = p.netNonComm >= 0;
            return (
              <button
                key={p.def.code}
                type="button"
                className={
                  "cot-sent-card" +
                  (selected?.def.code === p.def.code ? " cot-selected" : "")
                }
                onClick={() => {
                  setSelectedCode(p.def.code);
                  if (!p.historyLoaded) void ensureHistory(p.def.code);
                }}
                title={p.marketName}
              >
                <div className="cot-sent-sym">{p.def.sym}</div>
                <div
                  className={
                    "cot-sent-val " + (bull ? "cot-bull" : "cot-bear")
                  }
                >
                  {bull ? "+" : "−"}
                  {fmtK(Math.abs(p.netNonComm))}
                </div>
                <div className="cot-sent-bar-wrap">
                  <div
                    className={"cot-sent-bar" + (!bull ? " cot-bear" : "")}
                    style={{ width: `${Math.min(95, barW)}%` }}
                  />
                </div>
                <div className={"cot-sent-chg cot-" + cls}>
                  {p.wkNetDelta > 0 ? "▲" : p.wkNetDelta < 0 ? "▼" : "—"}{" "}
                  {chgTxt} wk
                </div>
              </button>
            );
          })}
        </div>

        <div className="cot-grid-3">
          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Net Positioning</div>
                <div className="cot-panel-sub">
                  Non-commercial (large spec) — contracts
                </div>
              </div>
              <span
                className={
                  "cot-panel-badge " +
                  (selected && selected.netNonComm >= 0 ? "cot-bull" : "cot-bear")
                }
              >
                {selected && selected.netNonComm >= 0 ? "NET LONG" : "NET SHORT"}
              </span>
            </div>
            <div className="cot-bar-chart">
              {filtered.map((p) => {
                const pos = p.netNonComm >= 0;
                const w = Math.min(
                  48,
                  (Math.abs(p.netNonComm) / (Math.max(p.oi, 1) || 1)) * 80
                );
                return (
                  <div key={p.def.code} className="cot-bar-row">
                    <div className="cot-bar-label" title={p.def.sym}>
                      {p.def.sym.slice(0, 8)}
                      {p.def.sym.length > 8 ? "…" : ""}
                    </div>
                    <div className="cot-bar-track">
                      <div className="cot-bar-center" />
                      <div
                        className={"cot-bar-fill " + (pos ? "cot-pos" : "cot-neg")}
                        style={{ width: `${w}%` }}
                      >
                        <span
                          className={"cot-bar-num " + (pos ? "cot-pos" : "cot-neg")}
                        >
                          {pos ? "+" : ""}
                          {fmtK(p.netNonComm)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Long / Short Breakdown</div>
                <div className="cot-panel-sub">Non-commercial % of long+short</div>
              </div>
            </div>
            <div className="cot-stacked-section">
              {filtered.slice(0, 8).map((p) => {
                const tot = p.noncommLong + p.noncommShort;
                const lp =
                  tot > 0 ? Math.round((p.noncommLong / tot) * 100) : 50;
                const sp = 100 - lp;
                return (
                  <div key={p.def.code} style={{ marginBottom: 12 }}>
                    <div className="cot-stacked-label">{p.def.sym}</div>
                    <div className="cot-stacked-bar">
                      <div className="cot-stacked-long" style={{ width: `${lp}%` }}>
                        <span className="cot-stacked-bar-label">{lp}%</span>
                      </div>
                      <div className="cot-stacked-short" style={{ width: `${sp}%` }}>
                        <span className="cot-stacked-bar-label">{sp}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="cot-stacked-legend">
                <div className="cot-leg-item">
                  <div className="cot-leg-dot" style={{ background: ACCENT }} />
                  Long
                </div>
                <div className="cot-leg-item">
                  <div className="cot-leg-dot" style={{ background: "#ff6060" }} />
                  Short
                </div>
              </div>
            </div>
          </div>

          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">COT Index</div>
                <div className="cot-panel-sub">Percentile vs loaded history</div>
              </div>
              <span className="cot-hint">{selected?.def.sym ?? ""}</span>
            </div>
            <div className="cot-gauge-section">
              <svg className="cot-gauge-svg" viewBox="0 0 180 100">
                <path
                  d="M20 90 A70 70 0 0 1 160 90"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  d="M20 90 A70 70 0 0 1 160 90"
                  fill="none"
                  stroke="url(#cotGgrad)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={arcLen}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 0.4s ease" }}
                />
                <defs>
                  <linearGradient
                    id="cotGgrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#ff6060" />
                    <stop offset="50%" stopColor={ACCENT} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={ACCENT} />
                  </linearGradient>
                </defs>
                <line
                  x1={90}
                  y1={90}
                  x2={needleX}
                  y2={needleY}
                  stroke={ACCENT}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <circle cx={90} cy={90} r={5} fill={ACCENT} />
                <text
                  x={16}
                  y={105}
                  fontSize={8}
                  fill="#a8a4b2"
                  fontFamily="var(--font-zain),system-ui,sans-serif"
                >
                  0
                </text>
                <text
                  x={83}
                  y={18}
                  fontSize={8}
                  fill="#a8a4b2"
                  fontFamily="var(--font-zain),system-ui,sans-serif"
                >
                  50
                </text>
                <text
                  x={160}
                  y={105}
                  fontSize={8}
                  fill="#a8a4b2"
                  fontFamily="var(--font-zain),system-ui,sans-serif"
                >
                  100
                </text>
              </svg>
              <div className="cot-gauge-val">{selected?.percentile3y ?? "—"}</div>
              <div className="cot-gauge-label">
                Percentile ·{" "}
                {biasFromIndex(selected?.percentile3y ?? null).toUpperCase()}
              </div>
              {selected && !selected.historyLoaded && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <p className="cot-hint" style={{ marginBottom: 8 }}>
                    {detailLoadingCode === selected.def.code
                      ? "Loading weekly history…"
                      : "COT index needs weekly history — use the table row or Load below."}
                  </p>
                  <button
                    type="button"
                    className="cot-btn-sm"
                    disabled={detailLoadingCode === selected.def.code}
                    onClick={() => ensureHistory(selected.def.code)}
                  >
                    {detailLoadingCode === selected.def.code
                      ? "Loading…"
                      : "Load weekly history"}
                  </button>
                </div>
              )}
              {selected && selected.historyLoaded && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 14,
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      padding: "8px 14px",
                      background: "#111318",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "#a8a4b2",
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        marginBottom: 3,
                      }}
                    >
                      SAMPLE LOW
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        color: "#c4c0ce",
                      }}
                    >
                      {fmtK(selected.low3y)}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "8px 14px",
                      background: "#111318",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "#a8a4b2",
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        marginBottom: 3,
                      }}
                    >
                      CURRENT
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        color: ACCENT,
                      }}
                    >
                      {fmtK(selected.netNonComm)}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "8px 14px",
                      background: "#111318",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "#a8a4b2",
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        marginBottom: 3,
                      }}
                    >
                      SAMPLE HIGH
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        color: "#c4c0ce",
                      }}
                    >
                      {fmtK(selected.high3y)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cot-grid-3">
          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Net Position History</div>
                <div className="cot-panel-sub">
                  Non-commercial net — last {viewWeeks} reports
                </div>
              </div>
            </div>
            <div className="cot-line-chart-wrap">
              {filtered.map((p) => {
                const series = p.historyLoaded
                  ? p.netHistoryFull.slice(-viewWeeks)
                  : [];
                const last = series[series.length - 1];
                const color = (last ?? 0) >= 0 ? ACCENT : "#ff6060";
                return (
                  <div key={p.def.code} className="cot-sparkline-row">
                    <div className="cot-spark-name">{p.def.sym}</div>
                    {!p.historyLoaded ? (
                      <span
                        className="cot-hint"
                        style={{
                          flex: 1,
                          textAlign: "center",
                          fontSize: 10,
                          alignSelf: "center",
                        }}
                      >
                        Select row to load
                      </span>
                    ) : (
                      <>
                        <svg
                          className="cot-spark-svg"
                          viewBox="0 0 160 28"
                          preserveAspectRatio="none"
                        >
                          {makeSpark(series.length ? series : [0], color)}
                        </svg>
                        <div className="cot-spark-val" style={{ color }}>
                          {last != null && Number.isFinite(last)
                            ? (last >= 0 ? "+" : "") + fmtK(last)
                            : "—"}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Extreme Readings</div>
                <div className="cot-panel-sub">Percentile vs loaded window</div>
              </div>
              <span className="cot-panel-badge cot-bear">
                {extremes.length} flagged
              </span>
            </div>
            <div className="cot-extremes-list">
              {extremes.length === 0 ? (
                <div className="cot-panel-body cot-hint">No extremes in this filter</div>
              ) : (
                extremes.map((e) => (
                  <div key={e.code} className="cot-ext-row">
                    <div className="cot-ext-left">
                      <div className="cot-ext-sym">{e.sym}</div>
                      <div>
                        <div className="cot-ext-desc">{e.desc}</div>
                        <div className="cot-ext-bar-wrap">
                          <div
                            className="cot-ext-bar"
                            style={{
                              width: `${Math.min(100, e.pct)}%`,
                              background: e.bear ? "#ff6060" : ACCENT,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div
                      className="cot-ext-pct"
                      style={{ color: e.bear ? "#ff6060" : ACCENT }}
                    >
                      {e.pct}th
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Weekly Δ Net (heatmap)</div>
                <div className="cot-panel-sub">Non-commercial net change (contracts)</div>
              </div>
            </div>
            <div className="cot-heatmap">
              <div className="cot-hm-head">
                {["W-5", "W-4", "W-3", "W-2", "W-1", "Now"].map((w) => (
                  <div key={w} className="cot-hm-head-cell">
                    {w}
                  </div>
                ))}
              </div>
              {filtered.map((p) => {
                const cells = p.netDeltaSeries;
                const pad = Math.max(0, 6 - cells.length);
                const padded = [
                  ...Array(pad).fill(null),
                  ...cells,
                ].slice(-6);
                return (
                  <div key={p.def.code} className="cot-hm-row">
                    <div className="cot-hm-label" title={p.def.sym}>
                      {p.def.sym.slice(0, 8)}
                    </div>
                    <div className="cot-hm-cells">
                      {padded.map((v, i) => {
                        if (v == null) {
                          return (
                            <div
                              key={i}
                              className="cot-hm-cell"
                              style={{
                                background: "rgba(255,255,255,0.03)",
                                color: "#a8a4b2",
                              }}
                            >
                              —
                            </div>
                          );
                        }
                        const abs = Math.abs(v);
                        const alpha = Math.min(0.9, (abs / 50000) * 0.8 + 0.1);
                        const bg =
                          v > 0
                            ? `rgba(200,240,96,${alpha})`
                            : `rgba(255,96,96,${alpha})`;
                        const k = Math.round(v / 1000);
                        return (
                          <div
                            key={i}
                            className="cot-hm-cell"
                            style={{
                              background: bg,
                              color: "#0a0c0f",
                            }}
                          >
                            {k > 0 ? "+" : ""}
                            {k}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="cot-panel">
          <div className="cot-panel-head">
            <div>
              <div className="cot-panel-title">Full COT Data Table</div>
              <div className="cot-panel-sub">
                {filtered.length} instruments · Week ending {formatReportDate(latestReport)}
              </div>
            </div>
            <span className="cot-hint">CFTC jun7-fc8e Legacy Combined</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="cot-data-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Subgroup</th>
                  <th>Code</th>
                  <th title="Full weekly history loaded">Hist</th>
                  <th>Net Non-Comm</th>
                  <th>Wk Δ</th>
                  <th>Long</th>
                  <th>Short</th>
                  <th>Open Interest</th>
                  <th>OI Δ %</th>
                  <th>COT Index</th>
                  <th>Bias</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const idx = p.percentile3y;
                  const idxColor =
                    idx != null && idx > 66
                      ? ACCENT
                      : idx != null && idx < 33
                        ? "#ff6060"
                        : "#c4c0ce";
                  const bias = biasFromIndex(idx);
                  const biasLabel =
                    bias === "bull"
                      ? "BULLISH"
                      : bias === "bear"
                        ? "BEARISH"
                        : "NEUTRAL";
                  const sig = signalFromDelta(p.wkNetDelta);
                  return (
                    <tr
                      key={p.def.code}
                      className={
                        selected?.def.code === p.def.code
                          ? "cot-tr-selected"
                          : undefined
                      }
                      onClick={() => {
                        setSelectedCode(p.def.code);
                        if (!p.historyLoaded) void ensureHistory(p.def.code);
                      }}
                    >
                      <td className="cot-td-sym" title={p.marketName}>
                        {p.def.sym}
                      </td>
                      <td className="cot-td-muted">
                        {p.def.commoditySubgroup || "—"}
                      </td>
                      <td
                        className="cot-td-muted"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {p.def.code}
                      </td>
                      <td
                        className="cot-td-muted"
                        title={
                          p.historyLoaded
                            ? "Weekly history loaded"
                            : "Latest week only — select row to load history"
                        }
                      >
                        {detailLoadingCode === p.def.code
                          ? "…"
                          : p.historyLoaded
                            ? "✓"
                            : "—"}
                      </td>
                      <td
                        className={
                          p.netNonComm >= 0 ? "cot-td-bull" : "cot-td-bear"
                        }
                      >
                        {p.netNonComm >= 0 ? "+" : ""}
                        {p.netNonComm.toLocaleString()}
                      </td>
                      <td
                        className={
                          p.wkNetDelta >= 0 ? "cot-td-chg-up" : "cot-td-chg-dn"
                        }
                      >
                        {p.wkNetDelta >= 0 ? "+" : ""}
                        {p.wkNetDelta.toLocaleString()}
                      </td>
                      <td className="cot-td-bull">
                        {p.noncommLong.toLocaleString()}
                      </td>
                      <td className="cot-td-bear">
                        {p.noncommShort.toLocaleString()}
                      </td>
                      <td>{p.oi.toLocaleString()}</td>
                      <td
                        className={
                          p.wkOiDeltaPct >= 0 ? "cot-td-chg-up" : "cot-td-chg-dn"
                        }
                      >
                        {p.wkOiDeltaPct >= 0 ? "+" : ""}
                        {p.wkOiDeltaPct.toFixed(2)}%
                      </td>
                      <td
                        style={{
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          color: idxColor,
                          fontWeight: 600,
                        }}
                      >
                        {idx ?? "—"}
                      </td>
                      <td>
                        <span className={"cot-bias-pill cot-" + bias}>
                          {biasLabel}
                        </span>
                      </td>
                      <td
                        style={{
                          color: sig.color,
                          fontSize: 10,
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                        }}
                      >
                        {sig.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cot-grid-2">
          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Commercial vs Non-Commercial</div>
                <div className="cot-panel-sub">
                  {selected?.marketName.slice(0, 60) ?? ""}
                </div>
              </div>
              <div className="cot-week-sel">
                {filtered.slice(0, 6).map((s) => {
                  const short =
                    s.def.sym.length > 14
                      ? `${s.def.sym.slice(0, 12)}…`
                      : s.def.sym;
                  return (
                    <button
                      key={s.def.code}
                      type="button"
                      className={
                        "cot-wk-btn" +
                        (selected?.def.code === s.def.code ? " cot-active" : "")
                      }
                      onClick={() => {
                        setSelectedCode(s.def.code);
                        if (!s.historyLoaded) void ensureHistory(s.def.code);
                      }}
                      title={s.marketName}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="cot-panel-body">
              {selected ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: "#b8b4c0",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                        }}
                      >
                        Non-Commercial (Spec)
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          color: ACCENT,
                        }}
                      >
                        {selected.netNonComm >= 0 ? "+" : ""}
                        {selected.netNonComm.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${specLongPct}%`,
                          height: "100%",
                          background: ACCENT,
                          borderRadius: 4,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: "#b8b4c0",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                        }}
                      >
                        Commercial (Hedgers)
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          color: "#ff6060",
                        }}
                      >
                        {selected.netComm >= 0 ? "+" : ""}
                        {selected.netComm.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.abs(selected.netComm) / (Math.max(selected.oi, 1)) * 200)}%`,
                          height: "100%",
                          background: "#ff6060",
                          borderRadius: 4,
                          opacity: 0.6,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: "#b8b4c0",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                        }}
                      >
                        Small traders (non-reportable)
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          color: "#c4c0ce",
                        }}
                      >
                        {Number.isFinite(selected.smallNet)
                          ? (selected.smallNet >= 0 ? "+" : "") +
                            selected.smallNet.toLocaleString()
                          : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (Math.abs(selected.smallNet) / Math.max(selected.oi, 1)) * 400)}%`,
                          height: "100%",
                          background: "#a8a5b0",
                          borderRadius: 4,
                          opacity: 0.4,
                        }}
                      />
                    </div>
                  </div>
                  <div className="cot-divider" style={{ margin: "4px 0" }} />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        background: "#111318",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#a8a4b2",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          marginBottom: 4,
                          letterSpacing: "0.08em",
                        }}
                      >
                        SPEC LONGS
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: ACCENT,
                        }}
                      >
                        {fmtK(selected.noncommLong)}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#111318",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#a8a4b2",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          marginBottom: 4,
                          letterSpacing: "0.08em",
                        }}
                      >
                        SPEC SHORTS
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#ff6060",
                        }}
                      >
                        {fmtK(selected.noncommShort)}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#111318",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#a8a4b2",
                          fontFamily: "var(--font-zain), system-ui, sans-serif",
                          marginBottom: 4,
                          letterSpacing: "0.08em",
                        }}
                      >
                        OPEN INT
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#e8e4dc",
                        }}
                      >
                        {fmtK(selected.oi)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="cot-hint">Select an instrument</div>
              )}
            </div>
          </div>

          <div className="cot-panel">
            <div className="cot-panel-head">
              <div>
                <div className="cot-panel-title">Position Flip Signals</div>
                <div className="cot-panel-sub">
                  Non-commercial net crossed zero (week over week)
                </div>
              </div>
              <span className="cot-panel-badge cot-neutral">
                {flips.length} signals
              </span>
            </div>
            <div style={{ padding: "16px 0 8px" }}>
              {flips.length === 0 ? (
                <div className="cot-panel-body cot-hint">No sign flips in current filter</div>
              ) : (
                flips.map((f) => (
                  <div key={f.code} className="cot-flip-row">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: f.bear
                            ? "rgba(255,96,96,0.08)"
                            : "rgba(200,240,96,0.07)",
                          border: `1px solid ${f.bear ? "rgba(255,96,96,0.15)" : "rgba(200,240,96,0.12)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 14,
                        }}
                      >
                        {f.bear ? "↓" : "↑"}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#e8e4dc",
                            marginBottom: 2,
                          }}
                        >
                          {f.sym}
                        </div>
                        <div style={{ fontSize: 10, color: "#b8b4c0" }}>
                          {f.type}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#a8a4b2",
                        fontFamily: "var(--font-zain), system-ui, sans-serif",
                        maxWidth: 200,
                        textAlign: "right",
                        lineHeight: 1.5,
                      }}
                    >
                      {f.note}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
