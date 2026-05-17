"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../LanguageProvider";
import SessionJournalTable from "./SessionJournalTable";
import {
  buildSessionJournalColumns,
  buildSessionJournalCsvText,
  downloadUtf8Csv,
  flattenJournalApiTrade,
  type JournalApiTradeItem,
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
};
const F = "'Exo 2', sans-serif";

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

export function TradesView() {
  const { isArabic } = useLanguage();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQ, setSearchQ] = useState("");
  const [sessionFilter, setSessionFilter] = useState<string>("all");

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

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (sessionFilter !== "all") {
        if (String(r.session_id ?? "") !== sessionFilter) return false;
      }
      return rowMatchesSearch(r, searchQ);
    });
  }, [rows, searchQ, sessionFilter]);

  const exportCsv = () => {
    const cols = buildSessionJournalColumns(filteredRows);
    const csv = buildSessionJournalCsvText(cols, filteredRows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadUtf8Csv(`talaria-all-trades-${stamp}.csv`, csv);
  };

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
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
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
            width: 220,
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
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            style={{
              height: 28,
              minWidth: 160,
              background: c.el,
              border: `1px solid ${c.brH}`,
              color: c.ts,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: F,
              padding: "0 8px",
              letterSpacing: "0.04em",
            }}
          >
            <option value="all">{isArabic ? "كل الجلسات" : "All sessions"}</option>
            {sessionOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || filteredRows.length === 0}
          style={{
            height: 28,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
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
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
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

      <div style={{ fontSize: 10, fontWeight: 700, color: c.tm, marginBottom: 10, flexShrink: 0 }}>
        {loading
          ? isArabic
            ? "جارٍ تحميل الصفقات…"
            : "Loading trades…"
          : isArabic
            ? `${filteredRows.length} صفقة معروضة${total ? ` · ${total} إجمالي` : ""}${truncated ? " · أحدث 5000" : ""}`
            : `${filteredRows.length} trade${filteredRows.length === 1 ? "" : "s"} shown${total ? ` · ${total} total` : ""}${truncated ? " · latest 5000 loaded" : ""}`}
      </div>

      <SessionJournalTable
        rows={filteredRows}
        loading={loading}
        emptyMessage={
          isArabic
            ? "لا توجد صفقات بعد. سجّل صفقات في جلسة backtest لفتحها هنا."
            : "No trades yet. Log trades in a backtest session to see them here."
        }
      />
    </div>
  );
}
