"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BacktestOsDashboardLayout } from "../../backtest/BacktestOsDashboardLayout";
import type { BacktestOsChartPack } from "../../backtest/BacktestOsDashboardLayout";
import { PnlCalendarHeatmap } from "../../backtest/PnlCalendarHeatmap";
import type { OsMetricCard } from "../../backtest/backtestOsTypes";
import {
  durationBucketsHours, kurtosisExcess, maxConsecutiveStreaks,
  mean, monteCarloPercentiles, sampleStd, skewness, varCvar95,
} from "../../backtest/backtestOsCompute";
import "../../backtest/sessions-dashboard.css";
import "../../backtest/backtest-os-dashboard.css";

// ── API helpers ────────────────────────────────────────────────────────────────
function jApiUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_JOURNAL_API_ORIGIN ?? "").replace(/\/$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
}
function getToken() {
  try { return typeof window !== "undefined" ? localStorage.getItem("token") : null; } catch { return null; }
}
async function jFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(jApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers ?? {}) as Record<string, string>),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    let detail = "";
    try { detail = (JSON.parse(txt) as { error?: string }).error ?? ""; } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type JEntry = { id: number; symbol: string; direction: string; pnl: number; rr: number; quantity: number; strategy?: string; setup?: string; open_time?: string; close_time?: string; date?: string; risk_amount?: number; commission?: number; slippage?: number; };
type NT      = { id: number; ticker: string; direction: string; pnl: number; rr: number; quantity: number; setup: string; openTs: number; closeTs: number; riskUsd: number; comm: number; };
type Connection = { id: number; broker: string; label: string; status: string; last_sync_at: string | null; last_error: string | null; last_trade_count: number; created_at: string; };
type BalanceSec = { start_balance: number; net_pnl: number; equity: {x:string;y:number}[]; drawdown_pct: {x:string;y:number}[]; max_drawdown: number; max_drawdown_pct: number; recovery_factor: number|null; };
type SessionAna = { sharpe_sortino: { sharpe: number|null; sortino: number|null }; monthly_pnl: {x:string;y:number}[]; holding_duration: { avg_hours: number|null; avg_win_hours: number|null; avg_loss_hours: number|null }; balance?: BalanceSec; };

// ── Broker definitions ─────────────────────────────────────────────────────────
type BrokerDef = {
  id: string; name: string; color: string; icon: string; markets: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  extraConfig?: { key: string; label: string; placeholder: string }[];
  hasAutoSync: boolean; csvOnly?: boolean;
  guide: string[];
  docsUrl?: string;
  csvGuide?: string[];
};
const BROKERS: BrokerDef[] = [
  {
    id: "binance", name: "Binance", color: "#f0b90b", icon: "◈", markets: "Crypto",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "Your Binance API key" },
      { key: "api_secret", label: "API Secret", placeholder: "Your Binance API secret", secret: true },
    ],
    hasAutoSync: true,
    docsUrl: "https://www.binance.com/en/support/faq/360002502072",
    guide: [
      "Log in to Binance and go to Profile → API Management.",
      "Click Create API and choose System generated.",
      "Give the key a name (e.g. Talaria) and complete 2FA verification.",
      "Under Restrictions, enable Read Info only — disable trading & withdrawals.",
      "Optionally restrict access to Talaria's IP for extra security.",
      "Copy the API Key and Secret below (the secret is only shown once).",
    ],
  },
  {
    id: "bybit", name: "Bybit", color: "#f7931a", icon: "⬡", markets: "Crypto",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "Your Bybit API key" },
      { key: "api_secret", label: "API Secret", placeholder: "Your Bybit API secret", secret: true },
    ],
    hasAutoSync: true,
    docsUrl: "https://www.bybit.com/en/help-center/article/How-to-create-your-API-key",
    guide: [
      "Log in to Bybit and open Account & Security → API Management.",
      "Click Create New Key and choose System-generated API Keys.",
      "Set key type to Read-Only and give it a name (e.g. Talaria).",
      "Under API Key Permissions, check Read only for Account info and Positions.",
      "Complete SMS / Google Authenticator verification.",
      "Copy the API Key and API Secret into the fields.",
    ],
  },
  {
    id: "okx", name: "OKX", color: "#ffffff", icon: "⬤", markets: "Crypto",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "" },
      { key: "api_secret", label: "API Secret", placeholder: "", secret: true },
      { key: "api_passphrase", label: "Passphrase", placeholder: "", secret: true },
    ],
    hasAutoSync: false,
    docsUrl: "https://www.okx.com/docs-v5/en/#overview-account-rest-api",
    guide: [
      "Log in to OKX, go to Profile → API.",
      "Click Create API V5 key.",
      "Choose Read only as the permission level.",
      "Set a passphrase — you will need it every time you connect.",
      "Enable Trade history and Account under permissions.",
      "Copy the API Key, Secret, and Passphrase into the fields.",
    ],
  },
  {
    id: "oanda", name: "OANDA", color: "#00a651", icon: "₣", markets: "Forex",
    fields: [ { key: "api_key", label: "API Token", placeholder: "OANDA Bearer token" } ],
    extraConfig: [ { key: "account_id", label: "Account ID", placeholder: "001-001-1234567-001" } ],
    hasAutoSync: true,
    docsUrl: "https://developer.oanda.com/rest-live-v20/introduction/",
    guide: [
      "Log in to your OANDA account at fxtrade.oanda.com.",
      "Go to My Services → Manage API Access (or Settings → API).",
      "Click Generate under Personal Access Token.",
      "Copy the generated token into the API Token field.",
      "Find your Account ID in Account Summary (format: 001-001-xxxxxxx-001).",
      "Both live (api-fxtrade.oanda.com) and practice accounts are supported.",
    ],
  },
  {
    id: "alpaca", name: "Alpaca", color: "#ffcd00", icon: "🦙", markets: "US Stocks",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "PKXXX..." },
      { key: "api_secret", label: "API Secret", placeholder: "", secret: true },
    ],
    hasAutoSync: false,
    docsUrl: "https://docs.alpaca.markets/reference/authentication-2",
    guide: [
      "Log in to Alpaca and open the Paper or Live Trading dashboard.",
      "Click Your Name → API Keys in the top-right corner.",
      "Click Regenerate Key or create a new key pair.",
      "Copy the Key ID (starts with PK…) and Secret Key.",
      "Use Paper keys for testing, Live keys for real trades.",
      "After connecting, import your fills via CSV for full history.",
    ],
  },
  {
    id: "mt4", name: "MT4 / MT5", color: "#4a90d9", icon: "⚙", markets: "Forex / CFD",
    fields: [], hasAutoSync: false, csvOnly: true,
    guide: [],
    docsUrl: "https://www.metatrader4.com/en/trading-platform/help/trading/history",
    csvGuide: [
      "In MetaTrader 4/5, open the Account History tab in the Terminal window.",
      "Right-click anywhere in the history list and choose All History.",
      "Right-click again and select Save as Report (or Save as Detailed Report).",
      "This exports an HTML file — open it in Excel and save as .xlsx or .csv.",
      "Alternatively use the MQL export script for a cleaner CSV format.",
      "Upload the CSV below using the Upload File option.",
    ],
  },
  {
    id: "tradingview", name: "TradingView", color: "#2962ff", icon: "◭", markets: "Any",
    fields: [], hasAutoSync: false, csvOnly: true,
    guide: [],
    docsUrl: "https://www.tradingview.com/support/solutions/43000561222",
    csvGuide: [
      "On TradingView, open a chart and go to the Trade panel at the bottom.",
      "Click History tab to see all past trades.",
      "Click the Export icon (↓ arrow) on the top-right of the History panel.",
      "Save the file as CSV — it includes symbol, side, quantity, price & P&L.",
      "Upload the CSV below using the Upload File option.",
    ],
  },
  {
    id: "ibkr", name: "Interactive Brokers", color: "#c0392b", icon: "▣", markets: "All markets",
    fields: [
      { key: "api_key", label: "Client ID / Key", placeholder: "" },
      { key: "api_secret", label: "Secret", placeholder: "", secret: true },
    ],
    hasAutoSync: false,
    docsUrl: "https://www.interactivebrokers.com/en/trading/ib-api.php",
    guide: [
      "Log in to Client Portal at interactivebrokers.com.",
      "Go to Settings → API Settings.",
      "Generate a Web API key (OAuth2 Client Credentials or IB Key).",
      "Enable read-only access; do NOT enable trading permissions.",
      "Copy the Client ID and Secret into the fields.",
      "Import your full trade history via Activity Statements (CSV) for best results.",
    ],
  },
  {
    id: "ctrader", name: "cTrader", color: "#1a73e8", icon: "◐", markets: "Forex / CFD",
    fields: [], hasAutoSync: false, csvOnly: true,
    guide: [],
    docsUrl: "https://help.ctrader.com/ctrader-desktop/export-history/",
    csvGuide: [
      "Open cTrader desktop and log into your trading account.",
      "Click History in the bottom panel to view closed positions.",
      "Set the date range to cover all trades you want to import.",
      "Right-click anywhere in the history list and choose Export to CSV.",
      "Upload the exported CSV file using the Upload File option below.",
    ],
  },
];

// ── Utilities ──────────────────────────────────────────────────────────────────
const n    = (v: unknown): number => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const isoMs = (s?: string|null): number => { if (!s) return 0; const ms = Date.parse(s); return Number.isFinite(ms) ? ms : 0; };
const fm   = (v: number) => `$${v.toFixed(2)}`;
const fp   = (v: number) => `${v.toFixed(1)}%`;
const fd   = (h: number|null|undefined) => h == null || !Number.isFinite(h) || h < 0 ? "—" : `${(h / 24).toFixed(1)}d`;
const EM   = "—";
const card = (label: string, value: string, sub: string, accent: string, tone?: "pos"|"neg"): OsMetricCard => ({ label, value, sub, accent, tone });

function buildHist(pnls: number[], bkt = 25) {
  const c = pnls.filter(Number.isFinite);
  if (!c.length) return [];
  const mn = Math.min(...c), mx = Math.max(...c);
  const st = Math.floor(mn / bkt) * bkt, en = Math.ceil(mx / bkt) * bkt;
  const bins: { label: string; from: number; to: number; count: number }[] = [];
  for (let x = st; x < en; x += bkt) bins.push({ label: `${x}→${x + bkt}`, from: x, to: x + bkt, count: 0 });
  c.forEach(v => { const i = Math.min(Math.floor((v - st) / bkt), bins.length - 1); if (i >= 0 && bins[i]) bins[i].count++; });
  return bins;
}
function pFromT(ta: number) { return ta > 3.29 ? "<0.001" : ta > 2.58 ? "<0.01" : ta > 1.96 ? "<0.05" : ta > 1.65 ? "<0.10" : "≥0.10"; }
function holdH(o: number, c: number): number|null { if (o <= 0 || c <= 0 || c < o) return null; return (c - o) / 3600000; }

// ── Shared style tokens (sessions-dashboard.css palette) ───────────────────────
const S = {
  bg: "#0a0c0f",
  card: "#111318",
  elevated: "#0d0f13",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  text: "#e8e4dc",
  textSec: "#9b97a0",
  textDim: "#4a4850",
  textMuted: "#6b6870",
  blue: "#2563eb",
  blueLight: "#60a5fa",
  bluePale: "#93c5fd",
  red: "#ff6060",
  amber: "#fbbf24",
  greenPos: "#93c5fd",
  pill: "#1a1d24",
};

// ── Connect view sub-components ────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const c = status === "active" ? "#2563eb" : status === "error" ? "#ff6060" : "#60a5fa";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0, marginTop: 2 }} />;
}

function ConnectedCard({ conn, onSync, onDelete, syncing }: { conn: Connection; onSync: () => void; onDelete: () => void; syncing: boolean }) {
  const def = BROKERS.find(b => b.id === conn.broker);
  const ago = conn.last_sync_at ? (() => {
    const diff = Date.now() - Date.parse(conn.last_sync_at!);
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  })() : "never";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: `1px solid ${conn.status === "error" ? "rgba(255,96,96,0.3)" : S.border}`, background: S.card }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${def?.color ?? "#666"}22`, border: `1px solid ${def?.color ?? "#666"}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", color: def?.color ?? "#fff", flexShrink: 0 }}>{def?.icon ?? "⬤"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot status={conn.status} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem", color: S.text }}>{conn.label}</span>
          <span style={{ fontSize: "0.7rem", color: S.textMuted, background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4 }}>{def?.markets ?? conn.broker}</span>
        </div>
        {conn.status === "error" && conn.last_error && (
          <div style={{ fontSize: "0.68rem", color: S.red, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conn.last_error}</div>
        )}
        <div style={{ fontSize: "0.68rem", color: S.textMuted, marginTop: 2 }}>
          {conn.last_trade_count} trades · synced {ago}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {def?.hasAutoSync && (
          <button onClick={onSync} disabled={syncing}
            className="sd-act-btn sd-challenge"
            style={{ padding: "5px 10px", fontSize: "0.72rem", opacity: syncing ? 0.5 : 1, cursor: syncing ? "default" : "pointer" }}>
            {syncing ? "Syncing…" : "↻ Sync"}
          </button>
        )}
        <button onClick={onDelete}
          className="sd-act-btn sd-danger"
          style={{ padding: "5px 10px", fontSize: "0.72rem" }}>✕</button>
      </div>
    </div>
  );
}

type ModalState = { broker: BrokerDef; fields: Record<string, string>; label: string; busy: boolean; error: string | null };

function GuideSteps({ steps, color }: { steps: string[]; color: string }) {
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, color, fontSize: "0.65rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontSize: "0.78rem", color: "#d1d5db", lineHeight: 1.55 }}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function ConnectModal({ state, onChange, onSubmit, onClose }: {
  state: ModalState;
  onChange: (key: string, val: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { broker, fields, label, busy, error } = state;
  const allFields = [...broker.fields, ...(broker.extraConfig ?? [])];
  const guideSteps = broker.csvOnly ? (broker.csvGuide ?? []) : broker.guide;
  const isCsvOnly  = broker.csvOnly;

  return (
    <div className="sd-modal-backdrop" style={{ overflowY: "auto" }}>
      <div className="sd-modal-panel" style={{ maxWidth: isCsvOnly ? 560 : 820, padding: 0, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: `1px solid ${S.border}` }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${broker.color}1a`, border: `1px solid ${broker.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.35rem", color: broker.color }}>{broker.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: S.text }}>Connect {broker.name}</div>
            <div style={{ fontSize: "0.72rem", color: S.textMuted, marginTop: 2 }}>
              {broker.markets}
              {broker.hasAutoSync && <span style={{ marginLeft: 8, color: S.blueLight }}>● Auto-sync</span>}
              {isCsvOnly && <span style={{ marginLeft: 8, color: S.textMuted }}>CSV import</span>}
            </div>
          </div>
          {broker.docsUrl && (
            <a href={broker.docsUrl} target="_blank" rel="noopener noreferrer"
              className="sd-link-admin"
              style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>
              Official docs ↗
            </a>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.textMuted, fontSize: "1.2rem", cursor: "pointer", padding: "4px 6px", marginLeft: 4 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: "grid", gridTemplateColumns: isCsvOnly ? "1fr" : "1fr 1fr", gap: 0 }}>

          {/* Left: Guide */}
          <div style={{ padding: 24, borderRight: isCsvOnly ? "none" : `1px solid ${S.border}` }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 14 }}>
              {isCsvOnly ? "How to export your trades" : "How to get your API keys"}
            </div>
            {guideSteps.length > 0 ? (
              <GuideSteps steps={guideSteps} color={broker.color} />
            ) : (
              <div style={{ fontSize: "0.78rem", color: S.textMuted }}>See the official documentation for setup instructions.</div>
            )}
            {isCsvOnly && (
              <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 10, border: `1px solid ${S.border}`, background: S.elevated }}>
                <div style={{ fontSize: "0.72rem", color: S.bluePale, fontWeight: 600, marginBottom: 4 }}>After exporting:</div>
                <div style={{ fontSize: "0.72rem", color: S.textSec, lineHeight: 1.5 }}>Go to the <strong style={{ color: S.text }}>Analytics</strong> tab and click <strong style={{ color: S.bluePale }}>⬆ CSV</strong> in the top toolbar to upload your file.</div>
              </div>
            )}
          </div>

          {/* Right: Form (API brokers only) */}
          {!isCsvOnly && (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted, marginBottom: 2 }}>Connection details</div>
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", color: S.textSec, marginBottom: 5 }}>Account label (optional)</label>
                <input value={label} onChange={e => onChange("__label__", e.target.value)} placeholder={`My ${broker.name} account`}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${S.border}`, background: S.elevated, color: S.text, fontSize: "0.82rem", boxSizing: "border-box" }} />
              </div>
              {allFields.map(f => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: "0.72rem", color: S.textSec, marginBottom: 5 }}>{f.label}</label>
                  <input
                    type={(f as typeof broker.fields[0]).secret ? "password" : "text"}
                    value={fields[f.key] ?? ""}
                    onChange={e => onChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${S.border}`, background: S.elevated, color: S.text, fontSize: "0.82rem", boxSizing: "border-box", fontFamily: (f as typeof broker.fields[0]).secret ? "monospace" : "inherit" }}
                  />
                </div>
              ))}
              <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid rgba(251,191,36,0.18)`, background: "rgba(251,191,36,0.04)", fontSize: "0.7rem", color: S.amber, lineHeight: 1.5, marginTop: 2 }}>
                ⚠ Use <strong>read-only</strong> permissions. Never grant withdrawal or trade access.
              </div>
              {error && <div style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(255,96,96,0.08)", border: "1px solid rgba(255,96,96,0.2)", color: S.red, fontSize: "0.78rem" }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "16px 24px", borderTop: `1px solid ${S.border}`, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="sd-btn-ghost" style={{ padding: "9px 18px", fontSize: "0.82rem" }}>Close</button>
          {!isCsvOnly && (
            <button onClick={onSubmit} disabled={busy} className="sd-btn-primary" style={{ padding: "9px 20px", fontSize: "0.82rem", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Connecting…" : `Connect ${broker.name} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Connect / Import view ──────────────────────────────────────────────────────
function ConnectView({
  connections, onNewConn, onSync, onDelete, syncBusy,
  csvRef, csvBusy, csvMsg, onCsvChange, tradeCount,
}: {
  connections: Connection[];
  onNewConn: (broker: BrokerDef) => void;
  onSync: (id: number) => void;
  onDelete: (id: number) => void;
  syncBusy: number | null;
  csvRef: React.RefObject<HTMLInputElement | null>;
  csvBusy: boolean;
  csvMsg: string | null;
  onCsvChange: (f: File) => void;
  tradeCount: number;
}) {
  return (
    <div className="sd-main" style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: S.text, margin: 0, letterSpacing: "-0.02em" }}>Trading Journal</h1>
        <p style={{ color: S.textMuted, fontSize: "0.88rem", marginTop: 6 }}>Connect your broker or import a file to start building your journal analytics.</p>
      </div>

      {/* Import options */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
        {/* API connect card */}
        <button onClick={() => {}} className="sd-modal-choice" style={{ textAlign: "left", display: "block", width: "100%" }}>
          <div style={{ fontSize: "1.3rem", marginBottom: 10, color: S.blueLight }}>🔗</div>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: S.text, marginBottom: 4 }}>Connect Broker API</div>
          <p style={{ fontSize: "0.78rem", color: S.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>Enter your API keys and we&apos;ll sync your trades automatically — no CSV exports needed.</p>
          <div style={{ fontSize: "0.72rem", color: S.textDim }}>Binance · Bybit · OANDA · Alpaca · IBKR</div>
        </button>
        {/* CSV import card */}
        <label className="sd-modal-choice sd-modal-choice-alt" style={{ textAlign: "left", display: "block", width: "100%", cursor: "pointer" }}>
          <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onCsvChange(f); e.target.value = ""; }} />
          <div style={{ fontSize: "1.3rem", marginBottom: 10, color: "#9ba4ff" }}>📁</div>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: S.text, marginBottom: 4 }}>{csvBusy ? "Importing…" : "Upload File"}</div>
          <p style={{ fontSize: "0.78rem", color: S.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>Upload a CSV or Excel file exported from your broker or prop firm.</p>
          <div style={{ fontSize: "0.72rem", color: S.textDim }}>.csv · .xlsx · .xls</div>
          {csvMsg && <div style={{ marginTop: 10, fontSize: "0.72rem", color: csvMsg.startsWith("✓") ? S.blueLight : S.red }}>{csvMsg}</div>}
        </label>
      </div>

      {/* Connected accounts */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: "0.78rem", fontWeight: 700, color: S.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>Connected accounts {connections.length > 0 && `(${connections.length})`}</h2>
        {connections.length === 0 ? (
          <div style={{ padding: "20px 16px", borderRadius: 12, border: `1px dashed ${S.border}`, textAlign: "center", color: S.textDim, fontSize: "0.82rem", background: S.card }}>
            No connected brokers yet. Select one below to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connections.map(c => (
              <ConnectedCard key={c.id} conn={c} onSync={() => onSync(c.id)} onDelete={() => onDelete(c.id)} syncing={syncBusy === c.id} />
            ))}
          </div>
        )}
      </div>

      {/* Broker grid */}
      <div>
        <h2 style={{ fontSize: "0.78rem", fontWeight: 700, color: S.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>Add a broker or platform</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))", gap: 10 }}>
          {BROKERS.map(b => (
            <button key={b.id} onClick={() => onNewConn(b)} className="sd-modal-choice"
              style={{ textAlign: "left", display: "block", width: "100%", padding: "14px 12px" }}>
              <div style={{ fontSize: "1.3rem", marginBottom: 6, color: b.color }}>{b.icon}</div>
              <div style={{ fontWeight: 600, fontSize: "0.82rem", color: S.text, marginBottom: 2 }}>{b.name}</div>
              <div style={{ fontSize: "0.68rem", color: S.textMuted }}>{b.markets}</div>
              {b.hasAutoSync && <div style={{ fontSize: "0.62rem", color: S.blueLight, marginTop: 4 }}>● Auto-sync</div>}
              {b.csvOnly && <div style={{ fontSize: "0.62rem", color: S.textMuted, marginTop: 4 }}>CSV import</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Jump to analytics if trades exist */}
      {tradeCount > 0 && (
        <div style={{ marginTop: 40, padding: "16px 20px", borderRadius: 14, border: `1px solid ${S.border}`, background: S.elevated, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: S.bluePale }}>{tradeCount} trades ready to analyse</div>
            <div style={{ fontSize: "0.72rem", color: S.textMuted, marginTop: 2 }}>Click Analytics tab to view your dashboard.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [raw, setRaw]               = useState<JEntry[]>([]);
  const [connections, setConns]     = useState<Connection[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [noToken, setNoToken]       = useState(false);
  const [reload, setReload]         = useState(0);
  const [view, setView]             = useState<"connect" | "analytics">("connect");
  const [modal, setModal]           = useState<ModalState | null>(null);
  const [syncBusy, setSyncBusy]     = useState<number | null>(null);
  const [pairFilter, setPair]       = useState("ALL");
  const [setupFilter, setSetup]     = useState("ALL");
  const [outcomeFilter, setOutcome] = useState("ALL");
  const [sbInput, setSbInput]       = useState("10000");
  const [csvBusy, setCsvBusy]       = useState(false);
  const [csvMsg, setCsvMsg]         = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [pSortK, setPSortK]         = useState("pnl");
  const [pSortD, setPSortD]         = useState<"asc"|"desc">("desc");

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) { setNoToken(true); setLoading(false); return; }
    setNoToken(false); setLoading(true);
    let ok = true;
    Promise.all([
      jFetch<JEntry[]>("/api/journal/list"),
      jFetch<Connection[]>("/api/journal/broker/list"),
    ])
      .then(([entries, conns]) => {
        if (!ok) return;
        setRaw(Array.isArray(entries) ? entries : []);
        setConns(Array.isArray(conns) ? conns : []);
        setError(null);
        if (entries.length > 0) setView("analytics");
      })
      .catch(e => { if (ok) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [reload]);

  // ── CSV import ──────────────────────────────────────────────────────────────
  const runCsvImport = useCallback(async (file: File) => {
    const token = getToken();
    if (!token) { setCsvMsg("Not logged in."); return; }
    setCsvBusy(true); setCsvMsg(null);
    try {
      const fd2 = new FormData(); fd2.append("file", file);
      const res = await fetch(jApiUrl("/api/journal/import/excel"), {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd2,
      });
      const body = await res.json() as { imported?: number; errors?: string[]; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setCsvMsg(`✓ Imported ${body.imported ?? 0} trades`);
      setReload(x => x + 1);
    } catch (e) { setCsvMsg(e instanceof Error ? e.message : String(e)); }
    finally { setCsvBusy(false); }
  }, []);

  // ── Broker connect ──────────────────────────────────────────────────────────
  const openModal = useCallback((broker: BrokerDef) => {
    setModal({ broker, fields: {}, label: "", busy: false, error: null });
  }, []);

  const handleModalChange = useCallback((key: string, val: string) => {
    setModal(prev => {
      if (!prev) return prev;
      if (key === "__label__") return { ...prev, label: val };
      return { ...prev, fields: { ...prev.fields, [key]: val } };
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (!modal) return;
    setModal(prev => prev ? { ...prev, busy: true, error: null } : prev);
    try {
      const body = { broker: modal.broker.id, label: modal.label || undefined, ...modal.fields, ...(modal.fields.account_id ? {} : {}) };
      const result = await jFetch<{ connection: Connection; imported: number; message: string }>("/api/journal/broker/connect", { method: "POST", body: JSON.stringify(body) });
      setConns(prev => [result.connection, ...prev]);
      if (result.imported > 0) setReload(x => x + 1);
      setModal(null);
      if (result.imported > 0) setView("analytics");
    } catch (e) {
      setModal(prev => prev ? { ...prev, busy: false, error: e instanceof Error ? e.message : String(e) } : prev);
    }
  }, [modal]);

  const handleSync = useCallback(async (id: number) => {
    setSyncBusy(id);
    try {
      const result = await jFetch<{ imported: number; connection: Connection }>(`/api/journal/broker/${id}/sync`, { method: "POST" });
      setConns(prev => prev.map(c => c.id === id ? result.connection : c));
      if (result.imported > 0) setReload(x => x + 1);
    } catch (e) {
      setConns(prev => prev.map(c => c.id === id ? { ...c, status: "error", last_error: e instanceof Error ? e.message : String(e) } : c));
    }
    setSyncBusy(null);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await jFetch(`/api/journal/broker/${id}`, { method: "DELETE" });
      setConns(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  }, []);

  // ── Trade normalization ─────────────────────────────────────────────────────
  const trades = useMemo<NT[]>(() => raw.map(e => ({
    id: e.id,
    ticker: String(e.symbol || "UNKNOWN").replace("/", "").toUpperCase(),
    direction: String(e.direction || "").toUpperCase().startsWith("S") ? "SHORT" : "LONG",
    pnl: n(e.pnl), rr: n(e.rr), quantity: n(e.quantity),
    setup: e.strategy || e.setup || "General",
    openTs:  isoMs(e.open_time)  || isoMs(e.date),
    closeTs: isoMs(e.close_time) || isoMs(e.date),
    riskUsd: n(e.risk_amount), comm: n(e.commission) + n(e.slippage),
  })), [raw]);

  const pairOpts  = useMemo(() => [...new Set(trades.map(t => t.ticker))].sort(), [trades]);
  const setupOpts = useMemo(() => [...new Set(trades.map(t => t.setup))].sort(), [trades]);

  const ft = useMemo<NT[]>(() => trades.filter(t =>
    (pairFilter === "ALL" || t.ticker === pairFilter) &&
    (setupFilter === "ALL" || t.setup  === setupFilter) &&
    (outcomeFilter === "ALL" || (outcomeFilter === "WINNERS" && t.pnl > 0) || (outcomeFilter === "LOSERS" && t.pnl < 0) || (outcomeFilter === "BREAKEVEN" && t.pnl === 0))
  ), [trades, pairFilter, setupFilter, outcomeFilter]);

  const sb      = useMemo(() => { const v = parseFloat(sbInput); return Number.isFinite(v) && v > 0 ? v : null; }, [sbInput]);
  const pnls    = useMemo(() => ft.map(t => t.pnl), [ft]);
  const byClose = useMemo(() => [...ft].sort((a, b) => a.closeTs - b.closeTs), [ft]);

  const stats = useMemo(() => {
    const total = ft.length, wins = ft.filter(t => t.pnl > 0).length, losses = ft.filter(t => t.pnl < 0).length;
    const net = ft.reduce((s, t) => s + t.pnl, 0);
    const gw = ft.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(ft.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgRR   = total > 0 ? ft.reduce((s, t) => s + t.rr, 0) / total : 0;
    const avgWin  = wins   > 0 ? gw / wins   : 0;
    const avgLoss = losses > 0 ? gl / losses : 0;
    const pf = gl > 0 ? gw / gl : gw > 0 ? gw : 0;
    const exp = total > 0 ? net / total : 0;
    const best  = ft.reduce((m, t) => t.pnl > m.pnl ? t : m, { pnl: -Infinity, ticker: "-" } as NT & { pnl: number });
    const worst = ft.reduce((m, t) => t.pnl < m.pnl ? t : m, { pnl:  Infinity, ticker: "-" } as NT & { pnl: number });
    return { total, wins, losses, net, gw, gl, winRate, avgRR, avgWin, avgLoss, pf, exp, best, worst };
  }, [ft]);

  const sAna = useMemo((): SessionAna | undefined => {
    if (!ft.length) return undefined;
    const moMap = new Map<string, number>();
    for (const t of byClose) if (t.closeTs > 0) { const d = new Date(t.closeTs); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; moMap.set(k, (moMap.get(k) ?? 0) + t.pnl); }
    const monthly_pnl = [...moMap.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([x,y]) => ({x,y}));
    const mu = mean(pnls), sig = sampleStd(pnls);
    const dwn = pnls.filter(p => p < 0), dsd = dwn.length > 1 ? sampleStd(dwn) : 0;
    const sharpe = sig > 0 ? mu / sig : null, sortino = dsd > 0 ? mu / dsd : null;
    const hh = byClose.map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null && Number.isFinite(h));
    const avg_hours = hh.length ? mean(hh) : null;
    const avg_win_hours  = (() => { const xs = byClose.filter(t => t.pnl > 0).map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null); return xs.length ? mean(xs) : null; })();
    const avg_loss_hours = (() => { const xs = byClose.filter(t => t.pnl < 0).map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null); return xs.length ? mean(xs) : null; })();
    let balance: BalanceSec | undefined;
    if (sb) {
      let eq = sb, pk = sb, mddA = 0, mddP = 0;
      const equity: {x:string;y:number}[] = [], ddp: {x:string;y:number}[] = [];
      for (let i = 0; i < byClose.length; i++) {
        eq += byClose[i].pnl; equity.push({x: String(i+1), y: eq});
        if (eq > pk) pk = eq;
        const dd = pk > 0 ? ((eq-pk)/pk)*100 : 0;
        if (dd < mddP) mddP = dd; if (eq-pk < mddA) mddA = eq-pk;
        ddp.push({x: String(i+1), y: dd});
      }
      balance = { start_balance: sb, net_pnl: eq-sb, equity, drawdown_pct: ddp, max_drawdown: mddA, max_drawdown_pct: mddP/100, recovery_factor: mddA < 0 ? Math.abs((eq-sb)/mddA) : null };
    }
    return { sharpe_sortino: {sharpe, sortino}, monthly_pnl, balance, holding_duration: {avg_hours, avg_win_hours, avg_loss_hours} };
  }, [ft, byClose, pnls, sb]);

  const eqCurve = useMemo(() => { let r = 0; return byClose.map((t,i) => ({i: i+1, eq: (r += t.pnl)})); }, [byClose]);

  const chartPack = useMemo((): BacktestOsChartPack => {
    const sbN = sAna?.balance?.start_balance ?? null, moRows = sAna?.monthly_pnl ?? [], bEq = sAna?.balance?.equity;
    let equity: BacktestOsChartPack["equity"] = null;
    if (Array.isArray(bEq) && bEq.length) equity = { labels: bEq.map((_,i) => String(i+1)), strategy: bEq.map(r => n(r.y)), benchmark: sbN ? bEq.map(() => sbN) : null, subtitle: sbN ? `$${sbN.toLocaleString()} start` : "equity" };
    else if (eqCurve.length) equity = { labels: eqCurve.map(e => String(e.i)), strategy: eqCurve.map(e => e.eq), benchmark: null, subtitle: "cumulative $ PnL" };
    const moPct = sbN && moRows.length ? { labels: moRows.map(r => r.x), values: moRows.map(r => (n(r.y)/sbN)*100) } : null;
    const rolling = moPct && moPct.values.length >= 3 ? { labels: moPct.labels, values: moPct.values.map((_,i) => i < 2 ? null : ((moPct.values[i]+moPct.values[i-1]+moPct.values[i-2])/3)*12) } : null;
    let dist: BacktestOsChartPack["dist"] = null;
    if (pnls.length) { const sp = Math.max(...pnls)-Math.min(...pnls); const bkt = Math.max(25, sp/8||25); const h = buildHist(pnls, bkt); dist = { labels: h.map(x => x.label), counts: h.map(x => x.count), colors: h.map(x => (x.from+x.to)/2 >= 0 ? "rgba(0,255,136,0.6)" : "rgba(255,77,77,0.6)") }; }
    const ddR = sAna?.balance?.drawdown_pct;
    const drawdown = Array.isArray(ddR) && ddR.length ? { labels: ddR.map((_,i) => String(i+1)), values: ddR.map(r => n(r.y)) } : null;
    const sharpeN = n(sAna?.sharpe_sortino?.sharpe ?? 0), sortinoN = n(sAna?.sharpe_sortino?.sortino ?? 0);
    const mddpN = n(sAna?.balance?.max_drawdown_pct ?? 0), calR = mddpN > 0 && sbN ? Math.abs(stats.net/sbN)/Math.abs(mddpN) : 0;
    const omega = stats.avgLoss > 0 ? (stats.avgWin*stats.wins)/(stats.avgLoss*Math.max(1,stats.losses)) : 0;
    const cr = (x: number) => Math.min(2, Math.max(0, Number.isFinite(x) ? x : 0));
    const sig = sampleStd(pnls);
    const radar = stats.total > 0 ? { labels: ["Sharpe","Sortino","Win%","PF","Calmar","Omega","Avg R","Net/σ"], strategy: [cr(sharpeN/1.2),cr(sortinoN/1.5),cr(stats.winRate/50),cr(stats.pf/2.5),cr(calR),cr(omega/2),cr((stats.avgRR+2)/4),cr(sig>0?stats.net/pnls.length/sig:0)], benchmark: [0.85,0.9,0.55,0.85,0.65,0.9,0.75,0.7] } : null;
    let annual: BacktestOsChartPack["annual"] = null;
    if (moRows.length && sbN) { const by: Record<string,number> = {}; moRows.forEach(r => { const y = String(r.x).slice(0,4); by[y] = (by[y]??0)+n(r.y); }); const yrs = Object.keys(by).sort(); annual = { years: yrs, strategy: yrs.map(y => (by[y]/sbN)*100), benchmark: null }; }
    const tradePL = byClose.length ? (() => { let c = 0; return byClose.map((t,i) => ({x: i+1, y: (c += t.pnl)})); })() : null;
    const winLoss = stats.total > 0 ? { wins: stats.wins, losses: stats.losses } : null;
    const hh = byClose.map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null && Number.isFinite(h));
    const duration = hh.length > 0 ? { labels: ["≤1d","2–3d","4–7d","8–14d","15–30d",">30d"], counts: durationBucketsHours(hh) } : null;
    const monteCarlo = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, Math.min(80, Math.max(10, pnls.length))) : null;
    return { equity, rolling, dist, monthlyPct: moPct, drawdown, radar, annual, tradePL, winLoss, duration, monteCarlo };
  }, [sAna, eqCurve, ft, stats, pnls, byClose]);

  const bundles = useMemo(() => {
    const sbN = sAna?.balance?.start_balance ?? null, moRows = sAna?.monthly_pnl ?? [], sig = sampleStd(pnls);
    const {var95, cvar95} = varCvar95(pnls), sk = skewness(pnls), kt = kurtosisExcess(pnls);
    const neg = pnls.filter(p => p < 0), dsd = neg.length > 1 ? sampleStd(neg) : 0;
    const mddp = sAna?.balance?.max_drawdown_pct, rec = sAna?.balance?.recovery_factor;
    const ddPts = (sAna?.balance?.drawdown_pct ?? []).map(r => Math.abs(n(r.y)));
    const ulcer = ddPts.length ? Math.sqrt(mean(ddPts.map(x => x*x))) : null;
    const pain  = ddPts.length ? mean(ddPts) : null;
    const sharpeN = sAna?.sharpe_sortino?.sharpe, sortinoN = sAna?.sharpe_sortino?.sortino;
    const mddpN = n(mddp ?? 0), calA = sbN && mddpN > 0 ? (Math.abs(stats.net/sbN)/Math.abs(mddpN)).toFixed(2) : EM;
    const strk = maxConsecutiveStreaks(byClose.map(t => t.pnl > 0));
    const commTotal = ft.reduce((s, t) => s + t.comm, 0);
    const pN = pnls.length, se = pN > 1 && sig > 0 ? sig/Math.sqrt(pN) : 0;
    const tStat = se > 0 ? mean(pnls)/se : null;
    const gw = ft.filter(t => t.pnl > 0).reduce((s,t) => s+t.pnl, 0), glA = Math.abs(ft.filter(t => t.pnl < 0).reduce((s,t) => s+t.pnl, 0));
    const omega0 = glA > 1e-9 ? (gw/glA).toFixed(2) : EM;
    const rf = sbN ? stats.net/sbN : null;
    const martin = rf != null && ulcer && ulcer > 1e-9 ? ((rf*100)/ulcer).toFixed(2) : EM;
    const painR  = rf != null && pain  && pain  > 1e-9 ? ((rf*100)/pain).toFixed(2)  : EM;
    const jb = (() => { if (!sk || !kt || pN < 4) return null; return (pN/6)*(sk*sk+(kt*kt)/4); })();
    const mc = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, Math.min(80, pN)) : null;
    const mc5 = mc?.p5?.length ? mc.p5[mc.p5.length-1] : null;
    const totalRet = sbN ? ((stats.net/sbN)*100).toFixed(2)+"%" : EM;
    const moAvgPct = sbN && moRows.length ? ((moRows.reduce((s,r) => s+n(r.y),0)/moRows.length/sbN)*100).toFixed(2)+"%" : EM;
    let bestMo = EM, worstMo = EM, bV = -Infinity, wV = Infinity;
    for (const r of moRows) { const v = n(r.y); if (v > bV) { bV = v; bestMo  = `${r.x} (${fm(v)})`; } if (v < wV) { wV = v; worstMo = `${r.x} (${fm(v)})`; } }
    const hld = sAna?.holding_duration;
    return {
      returnCards: [card("Net P&L",fm(stats.net),`${stats.total} trades`,S.bluePale,stats.net>=0?"pos":"neg"),card("Total return",totalRet,"net/start balance",S.bluePale,stats.net>=0?"pos":"neg"),card("Gross profit",fm(stats.gw),"winners only",S.bluePale,"pos"),card("Gross loss",fm(-stats.gl),"losers only",S.bluePale,"neg"),card("Monthly avg %",moAvgPct,"mean monthly/balance",S.bluePale),card("Long P&L",fm(ft.filter(t=>t.direction==="LONG").reduce((s,t)=>s+t.pnl,0)),"long side",S.bluePale),card("Short P&L",fm(ft.filter(t=>t.direction==="SHORT").reduce((s,t)=>s+t.pnl,0)),"short side",S.bluePale),card("Alpha",EM,"no benchmark loaded",S.bluePale)],
      riskCards: [card("Volatility (σ)",pN?fm(sig):EM,"per-trade PnL std",S.red),card("Downside dev",dsd>0?fm(dsd):EM,"losing trades only",S.red),card("VaR 95%",var95!=null?(var95/(sbN||1)*100).toFixed(2)+"%":EM,"empirical tail",S.red,"neg"),card("CVaR 95%",cvar95!=null?(cvar95/(sbN||1)*100).toFixed(2)+"%":EM,"expected shortfall",S.red,"neg"),card("Skewness",sk!=null?sk.toFixed(2):EM,"trade PnL",S.red,sk!=null&&sk>0?"pos":undefined),card("Kurtosis",kt!=null?kt.toFixed(2):EM,"excess",S.red),card("Tail risk",pN?((pnls.filter(p=>p<-3*sig).length/pN)*100).toFixed(1)+"%":EM,"P(PnL<−3σ)",S.red),card("Commission",fm(-commTotal),"total comm+slippage",S.red,"neg")],
      drawCards: [card("Max drawdown",mddp!=null?(n(mddp)*100).toFixed(2)+"%":EM,"of peak balance","#a855f7","neg"),card("Avg drawdown",pain!=null?pain.toFixed(2)+"%":EM,"mean |underwater|","#a855f7"),card("Calmar ratio",calA,"return/max DD%","#a855f7",calA!==EM?"pos":undefined),card("Recovery factor",rec!=null&&Number.isFinite(n(rec))?n(rec).toFixed(2)+"×":EM,"net/max DD $","#a855f7"),card("Ulcer index",ulcer!=null?ulcer.toFixed(2):EM,"RMS DD%","#a855f7"),card("Pain index",pain!=null?pain.toFixed(2)+"%":EM,"mean DD depth","#a855f7")],
      ratioCards: [card("Sharpe ratio",sharpeN!=null&&Number.isFinite(sharpeN)?sharpeN.toFixed(2):EM,"mean/σ trades",S.blueLight),card("Sortino ratio",sortinoN!=null&&Number.isFinite(sortinoN)?sortinoN.toFixed(2):EM,"downside σ",S.blueLight),card("Calmar ratio",calA,"return/max DD%",S.blueLight,calA!==EM?"pos":undefined),card("Omega ratio",omega0,"gains/|losses| τ=0",S.blueLight,omega0!==EM&&Number(omega0)>=1?"pos":omega0!==EM?"neg":undefined),card("Martin ratio",martin,"return%/ulcer",S.blueLight,martin!==EM?"pos":undefined),card("Pain ratio",painR,"return%/pain idx",S.blueLight,painR!==EM?"pos":undefined),card("t-Statistic",tStat!=null&&Number.isFinite(tStat)?tStat.toFixed(2):EM,"mean/stderr",S.blueLight)],
      tradeCards: [card("Win rate",fp(stats.winRate),`of ${stats.total} trades`,S.bluePale,"pos"),card("Profit factor",stats.pf.toFixed(2),"gross win/gross loss",S.bluePale,stats.pf>=1?"pos":"neg"),card("Payoff ratio",stats.avgLoss>0?(stats.avgWin/stats.avgLoss).toFixed(2):EM,"avg win/avg loss",S.bluePale),card("Expectancy",fm(stats.exp),"per trade",S.bluePale,stats.exp>=0?"pos":"neg"),card("Total trades",String(stats.total),"round-trips",S.bluePale),card("Avg duration",fd(hld?.avg_hours),"open→close",S.bluePale),card("Max consec wins",String(strk.maxWins),"streak",S.bluePale,"pos"),card("Max consec losses",String(strk.maxLosses),"streak",S.bluePale,"neg"),card("Largest win",fm(Number.isFinite(stats.best?.pnl)?stats.best.pnl:0),stats.best?.ticker??"",S.bluePale,"pos"),card("Largest loss",fm(Number.isFinite(stats.worst?.pnl)?stats.worst.pnl:0),stats.worst?.ticker??"",S.bluePale,"neg"),card("Avg winner",fm(stats.avgWin),"per win",S.bluePale,"pos"),card("Avg loser",fm(stats.avgLoss),"per loss (abs)",S.bluePale,"neg"),card("Win hold",fd(hld?.avg_win_hours),"winners",S.bluePale),card("Loss hold",fd(hld?.avg_loss_hours),"losers",S.bluePale)],
      statCards: [card("t-Statistic",tStat!=null?tStat.toFixed(2):EM,"mean PnL/stderr",S.amber),card("p-Value",tStat!=null&&Number.isFinite(tStat)?pFromT(Math.abs(tStat)):EM,"rough |t| thresholds",S.amber),card("Jarque-Bera",jb!=null?jb.toFixed(1):EM,"JB approx",S.amber),card("Skewness",sk!=null?sk.toFixed(2):EM,"trade PnL distribution",S.amber),card("Kurtosis",kt!=null?kt.toFixed(2):EM,"fat tails",S.amber),card("Monte Carlo 5th",mc5!=null?fm(mc5):EM,"bootstrap cum PnL end",S.amber)],
      timeCards: [card("Best month",bestMo,"by $ PnL",S.textSec,"pos"),card("Worst month",worstMo,"by $ PnL",S.textSec,"neg"),card("Avg hold",fd(hld?.avg_hours),"open→close",S.textSec),card("Win hold",fd(hld?.avg_win_hours),"winners",S.textSec),card("Loss hold",fd(hld?.avg_loss_hours),"losers",S.textSec),card("In drawdown",ddPts.length?((ddPts.filter(x=>x>0.01).length/ddPts.length)*100).toFixed(1)+"%":EM,"DD pts>0.01%",S.textSec)],
    };
  }, [sAna, stats, pnls, ft, byClose]);

  const perPair = useMemo(() => {
    const m = new Map<string,{cnt:number;w:number;pnl:number;rr:number;comm:number}>();
    ft.forEach(t => { const v = m.get(t.ticker) ?? {cnt:0,w:0,pnl:0,rr:0,comm:0}; v.cnt++; if(t.pnl>0)v.w++; v.pnl+=t.pnl; v.rr+=t.rr; v.comm+=t.comm; m.set(t.ticker,v); });
    return [...m.entries()].map(([ticker,v]) => ({ ticker, trades: v.cnt, winRate: v.cnt>0?(v.w/v.cnt)*100:0, pnl: v.pnl, avgRr: v.cnt>0?v.rr/v.cnt:0, comm: v.comm }));
  }, [ft]);
  const sortedPair = useMemo(() => [...perPair].sort((a: Record<string,number|string>, b: Record<string,number|string>) => {
    const av = a[pSortK], bv = b[pSortK];
    if (typeof av === "string" && typeof bv === "string") return pSortD === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return pSortD === "asc" ? Number(av)-Number(bv) : Number(bv)-Number(av);
  }) as typeof perPair, [perPair, pSortK, pSortD]);

  const playbookRows = useMemo(() => {
    const m = new Map<string,{cnt:number;w:number;pnl:number;rr:number}>();
    ft.forEach(t => { const v = m.get(t.setup) ?? {cnt:0,w:0,pnl:0,rr:0}; v.cnt++; if(t.pnl>0)v.w++; v.pnl+=t.pnl; v.rr+=t.rr; m.set(t.setup,v); });
    return [...m.entries()].map(([setup,v]) => ({setup, trades: v.cnt, winRate: v.cnt>0?(v.w/v.cnt)*100:0, pnl: v.pnl, avgRr: v.cnt>0?v.rr/v.cnt:0})).sort((a,b)=>b.pnl-a.pnl);
  }, [ft]);

  const recent    = useMemo(() => [...ft].sort((a,b)=>b.closeTs-a.closeTs).slice(0,15), [ft]);
  const calTrades = useMemo(() => ft.map(t => ({closeTs:t.closeTs,pnl:t.pnl})), [ft]);
  const dr        = useMemo(() => { const ts = byClose.map(t=>t.closeTs).filter(x=>x>0); if(!ts.length) return {from:EM,to:EM}; return {from: new Date(Math.min(...ts)).toISOString().slice(0,10), to: new Date(Math.max(...ts)).toISOString().slice(0,10)}; }, [byClose]);

  const thS: React.CSSProperties = { cursor: "pointer", userSelect: "none" };
  const sortHdr = (k: string, label: string) => (
    <th style={thS} onClick={() => { if(pSortK===k)setPSortD(d=>d==="asc"?"desc":"asc"); else{setPSortK(k);setPSortD("desc");} }}>
      {label}{pSortK===k?(pSortD==="asc"?" ↑":" ↓"):""}
    </th>
  );

  // ── No token ────────────────────────────────────────────────────────────────
  if (noToken) return (
    <div className="sd-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
      <div className="sd-modal-panel" style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 8, color: S.text }}>Journal login required</h2>
        <p style={{ color: S.textMuted, fontSize: "0.85rem", marginBottom: 24 }}>No journal token in localStorage. Please log in at <code style={{ color: S.blueLight }}>/journal</code> first.</p>
        <a href="/journal" className="sd-btn-primary" style={{ textDecoration: "none", display: "inline-flex" }}>Go to /journal →</a>
      </div>
    </div>
  );

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="sd-root bt-os-dashboard" style={{ fontFamily: "var(--font-zain),system-ui,sans-serif", minHeight: "100vh" }}>
      {/* Tab bar */}
      <div className="sd-subnav">
        {(["connect","analytics"] as const).map(v => (
          <button
            key={v}
            onClick={()=>setView(v)}
            className={view===v?"sd-subnav-link sd-subnav-link--active":"sd-subnav-link"}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            {v === "connect" ? "⬆ Import & Connect" : "📊 Analytics"}
            {v === "analytics" && trades.length > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "rgba(96,165,250,0.12)", color: S.blueLight, fontSize: "0.65rem" }}>{trades.length}</span>
            )}
          </button>
        ))}
        {view === "analytics" && (
          <div className="sd-filters" style={{ marginLeft: "auto", marginBottom: 0 }}>
            <select value={pairFilter} onChange={e=>setPair(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${S.border}`, background: S.elevated, color: S.text, fontSize: "0.72rem" }}>
              <option value="ALL">All instruments</option>
              {pairOpts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={setupFilter} onChange={e=>setSetup(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${S.border}`, background: S.elevated, color: S.text, fontSize: "0.72rem" }}>
              <option value="ALL">All strategies</option>
              {setupOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={outcomeFilter} onChange={e=>setOutcome(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${S.border}`, background: S.elevated, color: S.text, fontSize: "0.72rem" }}>
              <option value="ALL">All outcomes</option>
              <option value="WINNERS">Winners</option>
              <option value="LOSERS">Losers</option>
              <option value="BREAKEVEN">Breakeven</option>
            </select>
            <label style={{ fontSize: "0.72rem", color: S.textSec, display: "flex", alignItems: "center", gap: 4 }}>
              $<input type="number" min={1} step={1000} value={sbInput} onChange={e=>setSbInput(e.target.value)}
                style={{ width: 80, padding: "3px 6px", borderRadius: 4, border: `1px solid ${S.borderHover}`, background: S.elevated, color: S.text, fontSize: "0.72rem" }} />
            </label>
            <label className="sd-btn-primary" style={{ cursor: "pointer", fontSize: "0.72rem", padding: "5px 12px" }}>
              <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e=>{const f=e.target.files?.[0];if(f)void runCsvImport(f);e.target.value="";}} />
              {csvBusy?"…":"⬆ CSV"}
            </label>
            {csvMsg && <span style={{ fontSize: "0.68rem", color: csvMsg.startsWith("✓")?S.blueLight:S.red, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{csvMsg}</span>}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "10px 32px", background: "rgba(255,96,96,0.06)", borderBottom: `1px solid rgba(255,96,96,0.15)`, color: S.red, fontSize: "0.82rem" }}>
          API error: {error}
        </div>
      )}

      {loading ? (
        <div className="sd-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: S.textMuted }}>Loading…</div>
      ) : view === "connect" ? (
        <ConnectView
          connections={connections}
          onNewConn={openModal}
          onSync={handleSync}
          onDelete={handleDelete}
          syncBusy={syncBusy}
          csvRef={csvRef}
          csvBusy={csvBusy}
          csvMsg={csvMsg}
          onCsvChange={f => void runCsvImport(f)}
          tradeCount={trades.length}
        />
      ) : !ft.length ? (
        <div className="sd-main" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: S.textMuted, gap: 16 }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <div style={{ fontSize: "0.95rem" }}>{trades.length?"No trades match the current filter.":"No trades found."}</div>
          <button onClick={()=>setView("connect")} className="sd-btn-primary" style={{ fontSize: "0.85rem" }}>⬆ Import & Connect →</button>
        </div>
      ) : (
        <BacktestOsDashboardLayout
          sessionName="Trading Journal"
          strategyLine={`${stats.total} trades · ${trades.length} total · ${connections.length} broker${connections.length!==1?"s":""} connected`}
          dateRangeLine={`${dr.from} → ${dr.to}`}
          nTrades={stats.total}
          chartPack={chartPack}
          returnCards={bundles.returnCards}
          riskCards={bundles.riskCards}
          drawCards={bundles.drawCards}
          ratioCards={bundles.ratioCards}
          tradeCards={bundles.tradeCards}
          statCards={bundles.statCards}
          timeCards={bundles.timeCards}
          calendarSection={calTrades.length ? <PnlCalendarHeatmap trades={calTrades} /> : null}
          advancedSection={
            <>
              <div className="bt-os-chart-card" style={{marginBottom:12}}>
                <div className="bt-os-chart-title">Per-instrument breakdown</div>
                <div className="bt-os-table-wrap"><table><thead><tr>{sortHdr("ticker","Instrument")}{sortHdr("trades","Trades")}{sortHdr("winRate","Win%")}{sortHdr("pnl","Net P&L")}{sortHdr("avgRr","Avg R:R")}{sortHdr("comm","Commissions")}</tr></thead><tbody>
                  {sortedPair.map(r => <tr key={r.ticker}><td>{r.ticker}</td><td>{r.trades}</td><td>{fp(r.winRate)}</td><td className={r.pnl>=0?"bt-os-td-pos":"bt-os-td-neg"}>{fm(r.pnl)}</td><td>{r.avgRr.toFixed(2)}</td><td style={{color:S.red}}>{fm(-r.comm)}</td></tr>)}
                </tbody></table></div>
              </div>
              <div className="bt-os-chart-card" style={{marginBottom:12}}>
                <div className="bt-os-chart-title">Strategy breakdown</div>
                <div className="bt-os-table-wrap"><table><thead><tr><th>Strategy</th><th>Trades</th><th>Win%</th><th>Net P&L</th><th>Avg R:R</th></tr></thead><tbody>
                  {playbookRows.map(r => <tr key={r.setup}><td>{r.setup}</td><td>{r.trades}</td><td>{fp(r.winRate)}</td><td className={r.pnl>=0?"bt-os-td-pos":"bt-os-td-neg"}>{fm(r.pnl)}</td><td>{r.avgRr.toFixed(2)}</td></tr>)}
                </tbody></table></div>
              </div>
              <div className="bt-os-chart-card">
                <div className="bt-os-chart-title">Recent trades (last {recent.length})</div>
                <div className="bt-os-table-wrap"><table><thead><tr><th>Instrument</th><th>Direction</th><th>Strategy</th><th>P&amp;L</th><th>R:R</th><th>Closed</th></tr></thead><tbody>
                  {recent.map(t => <tr key={t.id}><td>{t.ticker}</td><td style={{color:t.direction==="LONG"?"#2563eb":"#ff6060"}}>{t.direction}</td><td style={{color:S.textSec}}>{t.setup}</td><td className={t.pnl>=0?"bt-os-td-pos":"bt-os-td-neg"}>{fm(t.pnl)}</td><td>{t.rr.toFixed(2)}</td><td style={{color:S.textMuted}}>{t.closeTs>0?new Date(t.closeTs).toISOString().slice(0,10):"—"}</td></tr>)}
                </tbody></table></div>
              </div>
            </>
          }
        />
      )}

      {modal && (
        <ConnectModal
          state={modal}
          onChange={handleModalChange}
          onSubmit={handleConnect}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
