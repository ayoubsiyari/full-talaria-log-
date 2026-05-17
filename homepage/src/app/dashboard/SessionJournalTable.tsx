"use client";

import React from "react";
import {
  buildSessionJournalColumns,
  formatJournalCellForDisplay,
  formatJournalCellRawTitle,
} from "./sessionJournalUtils";

const c = {
  acL: "#4A6AFF",
  gold: "#C9A84C",
  sf: "#0A0C14",
  el: "#0F1119",
  br: "rgba(140,160,255,0.05)",
  brH: "rgba(140,160,255,0.12)",
  ts: "rgba(255,255,255,0.70)",
  tm: "rgba(255,255,255,0.50)",
};
const F = "'Exo 2', sans-serif";

type Props = {
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function SessionJournalTable({
  rows,
  loading = false,
  emptyMessage = "No trades yet.",
}: Props) {
  const cols = buildSessionJournalColumns(rows);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: c.sf,
        border: `1px solid ${c.brH}`,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg,${c.acL},${c.gold})`,
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />
      {!loading && rows.length === 0 && (
        <div style={{ padding: 48, textAlign: "center", color: c.tm, fontSize: 12, fontFamily: F }}>
          {emptyMessage}
        </div>
      )}
      {(loading || rows.length > 0) && (
        <div className="tlr-scroll" style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: F }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 1, background: c.el, boxShadow: `0 1px 0 ${c.brH}` }}>
                {cols.map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      fontWeight: 800,
                      color: c.tm,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                      borderBottom: `1px solid ${c.brH}`,
                    }}
                  >
                    {col.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Math.max(cols.length, 1)} style={{ padding: 32, color: c.tm, textAlign: "center" }}>
                    Loading trades…
                  </td>
                </tr>
              ) : (
                rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid ${c.br}` }}>
                    {cols.map((col) => {
                      const raw = row[col];
                      const display = formatJournalCellForDisplay(raw, col);
                      const show = display !== "";
                      return (
                        <td
                          key={col}
                          style={{
                            padding: "8px 12px",
                            color: c.ts,
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={raw != null && raw !== "" ? formatJournalCellRawTitle(raw, col) : ""}
                        >
                          {show ? display : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
