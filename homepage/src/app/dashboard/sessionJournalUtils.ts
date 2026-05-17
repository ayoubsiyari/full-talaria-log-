/** Shared helpers for session trades journal (BacktestView). */

export function sessionJournalLocalKey(sessionId: number | string): string {
  return `talaria_v8_session_journal_${sessionId}`;
}

export type JournalApiTradeItem = {
  client_trade_id?: string;
  updated_at?: string | null;
  payload?: Record<string, unknown>;
  session_id?: number;
  session_name?: string;
};

export function flattenJournalApiTrade(item: JournalApiTradeItem): Record<string, unknown> {
  const p =
    item && item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? item.payload
      : {};
  return {
    ...p,
    client_trade_id: item.client_trade_id ?? p.client_trade_id,
    updated_at: item.updated_at ?? p.updated_at,
    session_id: item.session_id ?? p.session_id,
    session_name: item.session_name ?? p.session_name,
  };
}

/** Tooltip — avoid multi‑MB base64 in DOM title; JSON for objects/variables. */
export function formatJournalCellRawTitle(val: unknown, columnKey?: string): string {
  if (val == null) return "";
  const key = columnKey || "";
  if (typeof val === "string") {
    if ((/screenshot|rail/i.test(key) && val.length > 120) || isLikelyBase64ImageString(val)) {
      const kb = Math.max(1, Math.round(val.length / 1024));
      return `Image / binary payload (~${kb} KB). Full value omitted in tooltip — use chart trade details or CSV export.`;
    }
    return val;
  }
  if (Array.isArray(val)) {
    if (/screenshot|rail/i.test(key)) {
      return `${val.length} row(s) of image / capture data (tooltip truncated — open trade in chart for full view).`;
    }
    try {
      const s = JSON.stringify(val);
      return s.length > 4000 ? `${s.slice(0, 3997)}…` : s;
    } catch {
      return "";
    }
  }
  if (typeof val === "object") {
    try {
      const s = JSON.stringify(val);
      return s.length > 4000 ? `${s.slice(0, 3997)}…` : s;
    } catch {
      return "";
    }
  }
  return String(val);
}

function isLikelyBase64ImageString(s: string): boolean {
  const t = s.trim();
  if (/^data:image\//i.test(t)) return t.length > 80;
  if (t.length < 400) return false;
  const head = t.slice(0, 240).replace(/\s/g, "");
  return /^[A-Za-z0-9+/=]+$/.test(head);
}

/**
 * Table display: max 2 decimal places for numbers, JSON for objects,
 * compact labels for screenshots (payload can include entry/exit/rail images),
 * readable blobs for strategy PRE/POST variable maps.
 */
export function formatJournalCellForDisplay(val: unknown, columnKey?: string): string {
  if (val == null) return "";
  const key = columnKey || "";
  const shotKey = /screenshot|rail/i.test(key);

  if (typeof val === "string") {
    const t = val.trim();
    if (t === "") return "";
    if (shotKey || isLikelyBase64ImageString(t)) {
      const kb = Math.max(1, Math.round(t.length / 1024));
      const label = key ? key.replace(/_/g, " ") : "Image";
      return `[${label} · ~${kb} KB]`;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) {
      return t.length >= 19 ? t.slice(0, 19) : t;
    }
    if (/^-?\d+$/.test(t)) return t;
    const n = Number(t);
    if (
      Number.isFinite(n) &&
      /^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(t) &&
      !/^\d{4}-\d{2}-\d{2}/.test(t)
    ) {
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
        useGrouping: false,
      }).format(n);
    }
    return t;
  }

  if (Array.isArray(val)) {
    if (shotKey) {
      if (val.length === 0) return "";
      const first = val[0];
      if (first && typeof first === "object" && "dataUrl" in (first as object)) {
        return `[${val.length} chart image(s)]`;
      }
      return `[${val.length} item(s)]`;
    }
    try {
      const s = JSON.stringify(val);
      const max = /tp|active|leg|partial|split|scaled|exit/i.test(key) ? 520 : 280;
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    } catch {
      return "";
    }
  }

  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "bigint") return val.toString();

  if (typeof val === "object") {
    try {
      const s = JSON.stringify(val);
      const max = /variable|playbook|post_trade|postTrade|strategy/i.test(key) ? 360 : 240;
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    } catch {
      return "";
    }
  }

  if (typeof val === "number") {
    if (!Number.isFinite(val)) return String(val);
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      useGrouping: false,
    }).format(val);
  }

  return String(val);
}

export function buildSessionJournalColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  (rows || []).forEach((r) => {
    if (r && typeof r === "object") Object.keys(r).forEach((k) => keys.add(k));
  });
  const fixedOrder = [
    "client_trade_id",
    "session_name",
    "session_id",
    "updated_at",
    "id",
    "time",
    "symbol",
    "side",
    "status",
    "size",
    "type",
    "entry",
    "exit",
    "pnl",
    "duration",
    "tags",
    "notes",
    "screenshots",
    "post_trade_notes",
    "postTradeNotes",
    "strategy_variables",
    "strategyVariables",
    "post_strategy_variables",
    "postStrategyVariables",
    "entryScreenshot",
    "exitScreenshot",
    "entryScreenshots",
    "railScreenshots",
    "tp",
    "sl",
    "mae",
    "mfe",
  ];
  const ordered: string[] = [];
  fixedOrder.forEach((k) => {
    if (keys.has(k)) {
      ordered.push(k);
      keys.delete(k);
    }
  });
  [...keys].sort().forEach((k) => ordered.push(k));
  if (ordered.length === 0) {
    return [
      "client_trade_id",
      "session_name",
      "session_id",
      "updated_at",
      "id",
      "time",
      "symbol",
      "side",
      "status",
      "size",
      "type",
      "entry",
      "exit",
      "pnl",
      "duration",
      "tags",
      "notes",
      "screenshots",
      "post_trade_notes",
      "postTradeNotes",
      "strategy_variables",
      "strategyVariables",
      "post_strategy_variables",
      "postStrategyVariables",
      "entryScreenshot",
      "exitScreenshot",
      "entryScreenshots",
      "railScreenshots",
      "tp",
      "sl",
      "mae",
      "mfe",
    ];
  }
  return ordered;
}

export function escapeCsvCell(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildSessionJournalCsvText(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(escapeCsvCell).join(",")];
  (rows || []).forEach((r) => {
    lines.push(columns.map((k) => escapeCsvCell(r[k])).join(","));
  });
  return lines.join("\r\n");
}

export function downloadUtf8Csv(filename: string, csvBody: string): void {
  const blob = new Blob([`\uFEFF${csvBody}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type SessionJournalPlaceholderInput = {
  id: number | string;
  trades?: number;
  tickers?: string[];
  symbol?: string;
};

export function generateSessionJournalPlaceholders(
  session: SessionJournalPlaceholderInput,
  maxN = 500,
): Record<string, unknown>[] {
  const n = Math.min(maxN, Math.max(0, Number(session.trades) || 0));
  if (!n) return [];
  const tickers =
    session.tickers && session.tickers.length ? session.tickers : [session.symbol || "—"];
  let seed =
    typeof session.id === "number"
      ? session.id
      : String(session.id)
          .split("")
          .reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sides = ["Long", "Short"];
  const stat = ["Closed", "Open"];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const sym = tickers[Math.floor(rnd() * tickers.length)] || "—";
    const pnl = Math.round((rnd() - 0.45) * 400);
    rows.push({
      client_trade_id: `demo-${session.id}-${i + 1}`,
      time: new Date(Date.now() - Math.floor(rnd() * 90 * 86400000)).toISOString(),
      symbol: sym,
      side: sides[Math.floor(rnd() * 2)],
      status: stat[Math.floor(rnd() * 2)],
      size: (rnd() * 4 + 0.25).toFixed(2),
      type: rnd() > 0.7 ? "Limit" : "Market",
      entry: (18000 + rnd() * 2000).toFixed(2),
      exit: rnd() > 0.15 ? (18000 + rnd() * 2000).toFixed(2) : "—",
      pnl: String(pnl),
      duration: `${Math.floor(rnd() * 8) + 1}h ${Math.floor(rnd() * 59)}m`,
      tags: rnd() > 0.6 ? "demo" : "",
      notes: "",
      tp: rnd() > 0.5 ? (1 + rnd() * 2).toFixed(1) : "",
      sl: rnd() > 0.5 ? (1 + rnd()).toFixed(1) : "",
      mae: String(-Math.floor(rnd() * 120)),
      mfe: String(Math.floor(rnd() * 200)),
    });
  }
  return rows;
}
