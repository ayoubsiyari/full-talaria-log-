"use client";

import React, { useEffect, useRef, useState } from "react";
import { journalColumnLabel } from "./sessionJournalUtils";

const c = {
  acL: "#4A6AFF",
  el: "#0F1119",
  sf: "#0A0C14",
  brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.70)",
  tm: "rgba(255,255,255,0.50)",
};
const F = "'Exo 2', sans-serif";

const miniBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 26,
  background: c.sf,
  border: `1px solid ${c.brH}`,
  color: c.ts,
  fontSize: 9,
  fontWeight: 800,
  fontFamily: F,
  cursor: "pointer",
  letterSpacing: "0.05em",
};

type Props = {
  allColumns: string[];
  hiddenColumns: Set<string>;
  onHiddenChange: (hidden: Set<string>) => void;
  isArabic?: boolean;
};

export default function TradesColumnPicker({
  allColumns,
  hiddenColumns,
  onHiddenChange,
  isArabic = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visibleCount = allColumns.filter((col) => !hiddenColumns.has(col)).length;

  const filteredCols = allColumns.filter((col) => {
    if (!filterQ.trim()) return true;
    const q = filterQ.trim().toLowerCase();
    return (
      col.toLowerCase().includes(q) ||
      journalColumnLabel(col).toLowerCase().includes(q)
    );
  });

  const toggleColumn = (col: string) => {
    const next = new Set(hiddenColumns);
    if (next.has(col)) {
      next.delete(col);
    } else {
      if (visibleCount <= 1) return;
      next.add(col);
    }
    onHiddenChange(next);
  };

  const showAll = () => onHiddenChange(new Set());
  const hideAll = () => {
    if (allColumns.length <= 1) return;
    const keep = allColumns[0];
    onHiddenChange(new Set(allColumns.filter((col) => col !== keep)));
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          height: 28,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: open ? "rgba(74,106,255,0.12)" : c.sf,
          border: `1px solid ${open ? "rgba(74,106,255,0.35)" : c.brH}`,
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 800,
          color: open ? c.acL : c.ts,
          letterSpacing: "0.06em",
          fontFamily: F,
        }}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {isArabic ? "الأعمدة" : "Columns"}
        <span style={{ fontSize: 9, fontWeight: 700, color: c.tm }}>
          {visibleCount}/{allColumns.length}
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={isArabic ? "إظهار الأعمدة" : "Show columns"}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: isArabic ? undefined : 0,
            left: isArabic ? 0 : undefined,
            zIndex: 50,
            width: 280,
            maxHeight: 360,
            display: "flex",
            flexDirection: "column",
            background: c.el,
            border: `1px solid ${c.brH}`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${c.brH}` }}>
            <input
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              placeholder={isArabic ? "بحث في الأعمدة…" : "Filter columns…"}
              style={{
                width: "100%",
                height: 28,
                boxSizing: "border-box",
                background: c.sf,
                border: `1px solid ${c.brH}`,
                color: c.tx,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: F,
                padding: "0 8px",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button type="button" onClick={showAll} style={miniBtnStyle}>
                {isArabic ? "إظهار الكل" : "Show all"}
              </button>
              <button type="button" onClick={hideAll} style={miniBtnStyle}>
                {isArabic ? "إخفاء الكل" : "Hide all"}
              </button>
            </div>
          </div>
          <div className="tlr-scroll" style={{ overflowY: "auto", padding: "6px 0" }}>
            {filteredCols.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 10, color: c.tm, fontFamily: F }}>
                {isArabic ? "لا أعمدة مطابقة" : "No matching columns"}
              </div>
            ) : (
              filteredCols.map((col) => {
                const visible = !hiddenColumns.has(col);
                return (
                  <label
                    key={col}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 12px",
                      cursor: visibleCount <= 1 && visible ? "not-allowed" : "pointer",
                      fontFamily: F,
                      fontSize: 10,
                      color: visible ? c.ts : c.tm,
                      background: visible ? "transparent" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={visibleCount <= 1 && visible}
                      onChange={() => toggleColumn(col)}
                      style={{ accentColor: c.acL, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, lineHeight: 1.3 }}>{journalColumnLabel(col)}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
