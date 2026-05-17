"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../LanguageProvider";
import SessionJournalTable from "./SessionJournalTable";
import {
  buildSessionJournalColumns,
  buildSessionJournalCsvText,
  compareTradeRows,
  downloadUtf8Csv,
  flattenJournalApiTrade,
  tradeRowPnl,
  tradeRowSide,
  tradeRowStatus,
  tradeRowSymbol,
  type JournalApiTradeItem,
  type TradeSortPreset,
} from "./sessionJournalUtils";

const c = {
  acL: "#4A6AFF",
  bg: "#07080E",
  el: "#0F1119",
  brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.70)",
  tm: "rgba(255,255,255,0.50)",
  sf: "#0A0C14",
  gn: "#00D4A1",
  rd: "#FF5068",
};
const F = "'Exo 2', sans-serif";

const selectStyle: React.CSSProperties = {
  height: 28,
  minWidth: 120,
  background: c.el,
  border: `1px solid ${c.brH}`,
  color: c.ts,
  fontSize: 10,
  fontWeight: 700,
  fontFamily: F,
  padding: "0 8px",
  letterSpacing: "0.04em",
};

type ResultFilter = "all" | "win" | "loss" | "breakeven";
type SideFilter = "all" | "long" | "short";
type StatusFilter = "all" | "open" | "closed";

function rowMatchesSearch(row: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return Object.values(row).some((v) => {
    if (v == null) return false;
    if (typeof v === "object") {
      try {
        return JSON.stringify(v).toLowerCase().includes(needle);
      } catch {
        return false;
      }
    }
    return String(v).toLowerCase().includes(needle);
  });
}

function FilterSelect({
  value,
  onChange,
  options,
  minWidth = 120,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{ ...selectStyle, minWidth }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TradesView() {
  const { isArabic } = useLanguage();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQ, setSearchQ] = useState("");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortPreset, setSortPreset] = useState<TradeSortPreset>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sortColumn, setSortColumn] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/journal-trades?limit=5000", { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as {
        trades?: JournalApiTradeItem[];
        truncated?: boolean;
        total?: number;
      };
      const items = Array.isArray(data.trades) ? data.trades : [];
      setRows(items.map(flattenJournalApiTrade));
      setTruncated(!!data.truncated);
      setTotal(typeof data.total === "number" ? data.total : items.length);
    } catch {
      setRows([]);
      setTruncated(false);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const sessionOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const sid = r.session_id != null ? String(r.session_id) : "";
      const name = String(r.session_name || "").trim() || (sid ? `Session ${sid}` : "");
      if (sid) map.set(sid, name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const sym = tradeRowSymbol(r);
      if (sym) set.add(sym);
    });
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rows]);

  const activeSortKey = sortColumn ?? sortPreset;

  const filteredRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (sessionFilter !== "all" && String(r.session_id ?? "") !== sessionFilter) return false;
      if (symbolFilter !== "all" && tradeRowSymbol(r) !== symbolFilter) return false;
      if (sideFilter !== "all") {
        const side = tradeRowSide(r);
        if (side !== sideFilter) return false;
      }
      if (statusFilter !== "all") {
        const st = tradeRowStatus(r);
        if (statusFilter === "closed" && st !== "closed") return false;
        if (statusFilter === "open" && st === "closed") return false;
      }
      if (resultFilter !== "all") {
        const pnl = tradeRowPnl(r);
        if (pnl == null) return false;
        if (resultFilter === "win" && pnl <= 0) return false;
        if (resultFilter === "loss" && pnl >= 0) return false;
        if (resultFilter === "breakeven" && Math.abs(pnl) > 0.005) return false;
      }
      return rowMatchesSearch(r, searchQ);
    });
    return [...filtered].sort((a, b) => compareTradeRows(a, b, activeSortKey, sortDir));
  }, [
    rows,
    searchQ,
    sessionFilter,
    symbolFilter,
    sideFilter,
    resultFilter,
    statusFilter,
    activeSortKey,
    sortDir,
  ]);

  const hasActiveFilters =
    sessionFilter !== "all" ||
    symbolFilter !== "all" ||
    sideFilter !== "all" ||
    resultFilter !== "all" ||
    statusFilter !== "all" ||
    !!searchQ.trim() ||
    sortColumn != null;

  const resetFilters = () => {
    setSearchQ("");
    setSessionFilter("all");
    setSymbolFilter("all");
    setSideFilter("all");
    setResultFilter("all");
    setStatusFilter("all");
    setSortPreset("date");
    setSortDir("desc");
    setSortColumn(null);
  };

  const handleSortColumn = (col: string) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir(/pnl|profit/i.test(col) ? "desc" : "asc");
      return col;
    });
  };

  const handleSortPresetChange = (preset: TradeSortPreset) => {
    setSortColumn(null);
    setSortPreset(preset);
    if (preset === "pnl") setSortDir("desc");
    else if (preset === "date") setSortDir("desc");
    else setSortDir("asc");
  };

  const exportCsv = () => {
    const cols = buildSessionJournalColumns(filteredRows);
    const csv = buildSessionJournalCsvText(cols, filteredRows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadUtf8Csv(`talaria-all-trades-${stamp}.csv`, csv);
  };

  const sortPresetOptions: { value: TradeSortPreset; label: string }[] = [
    { value: "date", label: isArabic ? "التاريخ" : "Date" },
    { value: "pnl", label: isArabic ? "الربح/الخسارة" : "P&L" },
    { value: "symbol", label: isArabic ? "الرمز" : "Symbol" },
    { value: "session", label: isArabic ? "الجلسة" : "Session" },
  ];

  return (
    <div
      className="tlr-scroll"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: c.bg,
        fontFamily: F,
        color: c.tx,
        padding: "16px 28px 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: c.el,
            border: `1px solid ${c.brH}`,
            padding: "0 10px",
            width: 200,
            height: 28,
            boxSizing: "border-box",
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="8" stroke={c.tm} strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke={c.tm} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQ("");
            }}
            placeholder={isArabic ? "بحث…" : "Search…"}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: c.tx,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: F,
              padding: 0,
            }}
          />
          {searchQ ? (
            <button
              type="button"
              onClick={() => setSearchQ("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: c.tm,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={isArabic ? "مسح البحث" : "Clear search"}
            >
              ×
            </button>
          ) : null}
        </div>

        {sessionOptions.length > 0 ? (
          <FilterSelect
            value={sessionFilter}
            onChange={setSessionFilter}
            minWidth={150}
            ariaLabel={isArabic ? "تصفية الجلسة" : "Filter by session"}
            options={[
              { value: "all", label: isArabic ? "كل الجلسات" : "All sessions" },
              ...sessionOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
        ) : null}

        {symbolOptions.length > 0 ? (
          <FilterSelect
            value={symbolFilter}
            onChange={setSymbolFilter}
            minWidth={120}
            ariaLabel={isArabic ? "تصفية الرمز" : "Filter by symbol"}
            options={[
              { value: "all", label: isArabic ? "كل الرموز" : "All symbols" },
              ...symbolOptions.map((sym) => ({ value: sym, label: sym })),
            ]}
          />
        ) : null}

        <FilterSelect
          value={sideFilter}
          onChange={(v) => setSideFilter(v as SideFilter)}
          ariaLabel={isArabic ? "تصفية الاتجاه" : "Filter by side"}
          options={[
            { value: "all", label: isArabic ? "كل الاتجاهات" : "All sides" },
            { value: "long", label: isArabic ? "شراء / Long" : "Long" },
            { value: "short", label: isArabic ? "بيع / Short" : "Short" },
          ]}
        />

        <FilterSelect
          value={resultFilter}
          onChange={(v) => setResultFilter(v as ResultFilter)}
          ariaLabel={isArabic ? "تصفية النتيجة" : "Filter by result"}
          options={[
            { value: "all", label: isArabic ? "كل النتائج" : "All results" },
            { value: "win", label: isArabic ? "رابحة" : "Winners" },
            { value: "loss", label: isArabic ? "خاسرة" : "Losers" },
            { value: "breakeven", label: isArabic ? "تعادل" : "Breakeven" },
          ]}
        />

        <FilterSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          ariaLabel={isArabic ? "تصفية الحالة" : "Filter by status"}
          options={[
            { value: "all", label: isArabic ? "كل الحالات" : "All status" },
            { value: "open", label: isArabic ? "مفتوحة" : "Open" },
            { value: "closed", label: isArabic ? "مغلقة" : "Closed" },
          ]}
        />

        <div style={{ flex: 1, minWidth: 8 }} />

        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || filteredRows.length === 0}
          style={{
            height: 28,
            padding: "0 14px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: c.sf,
            border: `1px solid ${c.brH}`,
            cursor: filteredRows.length === 0 ? "not-allowed" : "pointer",
            fontSize: 10,
            fontWeight: 800,
            color: c.ts,
            letterSpacing: "0.06em",
            fontFamily: F,
            opacity: filteredRows.length === 0 ? 0.5 : 1,
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3v12M8 11l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M5 21h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {isArabic ? "تصدير CSV" : "Export CSV"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, color: c.tm, letterSpacing: "0.08em" }}>
          {isArabic ? "ترتيب حسب" : "SORT BY"}
        </span>
        <FilterSelect
          value={sortColumn ?? sortPreset}
          onChange={(v) => {
            const preset = sortPresetOptions.find((o) => o.value === v);
            if (preset) handleSortPresetChange(preset.value);
            else handleSortColumn(v);
          }}
          minWidth={130}
          options={[
            ...sortPresetOptions.map((o) => ({ value: o.value, label: o.label })),
            ...(sortColumn && !sortPresetOptions.some((o) => o.value === sortColumn)
              ? [{ value: sortColumn, label: sortColumn.replace(/_/g, " ") }]
              : []),
          ]}
        />
        <FilterSelect
          value={sortDir}
          onChange={(v) => setSortDir(v as "asc" | "desc")}
          minWidth={110}
          options={[
            {
              value: "desc",
              label: isArabic ? "تنازلي ▼" : "Descending ▼",
            },
            {
              value: "asc",
              label: isArabic ? "تصاعدي ▲" : "Ascending ▲",
            },
          ]}
        />
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            style={{
              height: 28,
              padding: "0 12px",
              background: "rgba(255,80,104,0.08)",
              border: "1px solid rgba(255,80,104,0.25)",
              color: c.rd,
              fontSize: 10,
              fontWeight: 800,
              fontFamily: F,
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            {isArabic ? "إعادة تعيين" : "Reset filters"}
          </button>
        ) : null}
        <span style={{ fontSize: 9, fontWeight: 600, color: c.tm, marginInlineStart: "auto" }}>
          {isArabic ? "انقر على عنوان العمود للترتيب" : "Click column headers to sort"}
        </span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: c.tm, marginBottom: 10, flexShrink: 0 }}>
        {loading
          ? isArabic
            ? "جارٍ تحميل الصفقات…"
            : "Loading trades…"
          : isArabic
            ? `${filteredRows.length} صفقة معروضة${rows.length !== filteredRows.length ? ` (من ${rows.length})` : ""}${total ? ` · ${total} إجمالي` : ""}${truncated ? " · أحدث 5000" : ""}`
            : `${filteredRows.length} trade${filteredRows.length === 1 ? "" : "s"} shown${rows.length !== filteredRows.length ? ` (of ${rows.length})` : ""}${total ? ` · ${total} total` : ""}${truncated ? " · latest 5000 loaded" : ""}`}
      </div>

      <SessionJournalTable
        rows={filteredRows}
        loading={loading}
        sortColumn={sortColumn}
        sortDirection={sortDir}
        onSortColumn={handleSortColumn}
        emptyMessage={
          hasActiveFilters
            ? isArabic
              ? "لا توجد صفقات تطابق الفلاتر. جرّب توسيع البحث أو إعادة التعيين."
              : "No trades match your filters. Try widening filters or reset."
            : isArabic
              ? "لا توجد صفقات بعد. سجّل صفقات في جلسة backtest لفتحها هنا."
              : "No trades yet. Log trades in a backtest session to see them here."
        }
      />
    </div>
  );
}