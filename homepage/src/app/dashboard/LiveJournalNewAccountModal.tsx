"use client";

import * as React from "react";
import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import { authHeaders } from "@/app/dashboard/strategies/strategyLabV9Auth";
import type { V16AccountTypeKey } from "./v16/v16SourceTypes";

const F = "'Exo 2', sans-serif";
const C = {
  bg: "#07080E",
  sf: "#0A0C14",
  el: "#0F1119",
  br: "rgba(140,160,255,0.12)",
  brH: "rgba(140,160,255,0.22)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.55)",
  tm: "rgba(255,255,255,0.38)",
  gn: "#00d4a1",
  gold: "#C9A84C",
  acL: "#4A6AFF",
} as const;

const PLATFORMS = ["MetaTrader 5", "MetaTrader 4", "TradingView", "cTrader", "Manual"];
const MARKETS = ["Forex", "Futures", "Stocks", "Crypto", "Indices"];
const PROP_SUBTYPES = ["Challenge", "Funded", "Demo"];

export type LiveJournalNewAccountInitialState = {
  accountTypeKey?: V16AccountTypeKey;
};

export type LiveJournalNewAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (account: Record<string, unknown>) => void | Promise<void>;
  initialState?: LiveJournalNewAccountInitialState | null;
};

export function LiveJournalNewAccountModal({
  open,
  onClose,
  onSaved,
  initialState,
}: LiveJournalNewAccountModalProps) {
  const [accountTypeKey, setAccountTypeKey] = React.useState<V16AccountTypeKey>("personal");
  const [name, setName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [platform, setPlatform] = React.useState("MetaTrader 5");
  const [market, setMarket] = React.useState("Forex");
  const [accountSubtype, setAccountSubtype] = React.useState("Live");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const type = initialState?.accountTypeKey === "prop" ? "prop" : "personal";
    setAccountTypeKey(type);
    setAccountSubtype(type === "prop" ? "Challenge" : "Live");
    setName("");
    setAccountNumber("");
    setPlatform("MetaTrader 5");
    setMarket("Forex");
    setError(null);
  }, [open, initialState?.accountTypeKey]);

  React.useEffect(() => {
    if (accountTypeKey === "personal") setAccountSubtype("Live");
    else if (accountSubtype === "Live") setAccountSubtype("Challenge");
  }, [accountTypeKey, accountSubtype]);

  if (!open) return null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedAccount = accountNumber.trim();
    if (!trimmedName) {
      setError("Account name is required.");
      return;
    }
    if (!trimmedAccount) {
      setError("Account number is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await syncJournalTokenFromSession();
      const res = await fetch(`${JOURNAL_API_BASE}/journal/live-accounts`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          account_number: trimmedAccount,
          platform,
          market,
          account_type: accountTypeKey,
          account_subtype: accountSubtype,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; account?: Record<string, unknown> };
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Could not create live journal (HTTP ${res.status})`);
      }
      await onSaved?.(data.account || {});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create live journal.");
    } finally {
      setSaving(false);
    }
  };

  const tabBtn = (active: boolean, color: string) => ({
    height: 28,
    padding: "0 12px",
    display: "inline-flex" as const,
    alignItems: "center" as const,
    background: active ? `${color}18` : "transparent",
    color: active ? color : C.ts,
    border: `1px solid ${active ? `${color}55` : C.br}`,
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    fontFamily: F,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100010,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        padding: 18,
      }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "calc(100vw - 36px)",
          background: C.el,
          border: `1px solid ${C.brH}`,
          boxShadow: "0 24px 72px rgba(0,0,0,0.9)",
          fontFamily: F,
        }}
      >
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            borderBottom: `1px solid ${C.br}`,
            background: C.sf,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: C.tx, letterSpacing: "0.05em" }}>
            Create Live Journal
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: C.ts, cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={tabBtn(accountTypeKey === "personal", C.gn)} onClick={() => setAccountTypeKey("personal")}>
              Personal
            </button>
            <button type="button" style={tabBtn(accountTypeKey === "prop", C.gold)} onClick={() => setAccountTypeKey("prop")}>
              Prop
            </button>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Account name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              placeholder="e.g. FTMO Challenge #1"
              style={{
                height: 32,
                background: C.sf,
                border: `1px solid ${C.brH}`,
                color: C.tx,
                padding: "0 10px",
                fontFamily: F,
                fontSize: 12,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Account number
            </span>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.slice(0, 64))}
              placeholder="Required"
              style={{
                height: 32,
                background: C.sf,
                border: `1px solid ${accountNumber ? C.brH : `${C.gn}55`}`,
                color: C.tx,
                padding: "0 10px",
                fontFamily: F,
                fontSize: 12,
              }}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Platform
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PLATFORMS.map((item) => (
                <button key={item} type="button" style={tabBtn(platform === item, C.gn)} onClick={() => setPlatform(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Market
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {MARKETS.map((item) => (
                <button key={item} type="button" style={tabBtn(market === item, C.gn)} onClick={() => setMarket(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          {accountTypeKey === "prop" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Prop type
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PROP_SUBTYPES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    style={tabBtn(accountSubtype === item, C.gold)}
                    onClick={() => setAccountSubtype(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div style={{ fontSize: 11, color: "#ff6b84", fontWeight: 700 }}>{error}</div>
          ) : null}
        </div>

        <div
          style={{
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "0 14px",
            borderTop: `1px solid ${C.brH}`,
            background: C.sf,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 30,
              padding: "0 14px",
              background: "transparent",
              border: `1px solid ${C.brH}`,
              color: C.ts,
              fontFamily: F,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !accountNumber.trim()}
            style={{
              height: 30,
              padding: "0 16px",
              background: C.gn,
              border: "none",
              color: "#04110e",
              fontFamily: F,
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: saving || !accountNumber.trim() ? "default" : "pointer",
              opacity: saving || !accountNumber.trim() ? 0.45 : 1,
            }}
          >
            {saving ? "Creating…" : "Create Journal"}
          </button>
        </div>
      </div>
    </div>
  );
}
