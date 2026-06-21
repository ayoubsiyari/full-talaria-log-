"use client";

import * as React from "react";
import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import { authHeaders } from "@/app/dashboard/strategies/strategyLabV9Auth";
import type { ApiLiveJournalAccount, V16AccountTypeKey } from "./v16/v16SourceTypes";
import type { LiveJournalPropRules } from "@/lib/liveJournalPropRules";
import {
  defaultLiveJournalPropRules,
  futuresPresetForBalance,
  liveJournalPropRulesToApiBody,
  parseLiveJournalPropRules,
} from "@/lib/liveJournalPropRules";
import { LiveJournalPropRulesForm } from "./LiveJournalPropRulesForm";

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

const MARKETS = ["Forex", "Futures", "Stocks", "Crypto", "Indices"];
const PROP_SUBTYPES = ["Challenge", "Funded", "Demo"];
const PROP_FIRMS = ["FTMO", "Topstep", "The5ers", "FundedNext", "E8 Funding", "MyForexFunds", "Other"];
const PROP_BALANCE_PRESETS = ["10000", "25000", "50000", "100000", "200000"];
const FUTURES_BALANCE_PRESETS = ["25000", "50000", "100000", "150000"];

export type LiveJournalNewAccountInitialState = {
  accountTypeKey?: V16AccountTypeKey;
  lockAccountType?: boolean;
  editAccount?: ApiLiveJournalAccount | null;
};

export type LiveJournalNewAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (account: Record<string, unknown>) => void | Promise<void>;
  initialState?: LiveJournalNewAccountInitialState | null;
};

function parseBalanceInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function LiveJournalNewAccountModal({
  open,
  onClose,
  onSaved,
  initialState,
}: LiveJournalNewAccountModalProps) {
  const isEdit = Boolean(initialState?.editAccount?.id);
  const lockedType = initialState?.lockAccountType
    ? initialState?.accountTypeKey === "prop"
      ? "prop"
      : "personal"
    : null;

  const [accountTypeKey, setAccountTypeKey] = React.useState<V16AccountTypeKey>("personal");
  const [name, setName] = React.useState("");
  const [startingBalance, setStartingBalance] = React.useState("");
  const [market, setMarket] = React.useState("Forex");
  const [accountSubtype, setAccountSubtype] = React.useState("Live");
  const [propFirm, setPropFirm] = React.useState("FTMO");
  const [propFirmCustom, setPropFirmCustom] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [propRules, setPropRules] = React.useState<LiveJournalPropRules>(() =>
    defaultLiveJournalPropRules("Forex", 50000, "FTMO")
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const effectiveType = lockedType || accountTypeKey;
  const accent = effectiveType === "prop" ? C.gold : C.gn;
  const resolvedPropFirm =
    effectiveType === "prop" ? (propFirm === "Other" ? propFirmCustom.trim() : propFirm) : null;
  const parsedBalance = parseBalanceInput(startingBalance) ?? (effectiveType === "prop" ? 50000 : 10000);

  React.useEffect(() => {
    if (!open) return;
    const edit = initialState?.editAccount;
    const type =
      edit?.account_type === "prop" || initialState?.accountTypeKey === "prop" ? "prop" : "personal";
    setAccountTypeKey(type);
    setAccountSubtype(type === "prop" ? edit?.account_subtype || "Challenge" : "Live");

    if (edit) {
      setName(edit.name || "");
      setStartingBalance(
        edit.starting_balance != null && Number.isFinite(Number(edit.starting_balance))
          ? String(edit.starting_balance)
          : ""
      );
      setMarket(edit.market || "Forex");
      setNotes(edit.notes || "");
      const firm = edit.prop_firm || "FTMO";
      if (PROP_FIRMS.includes(firm)) {
        setPropFirm(firm);
        setPropFirmCustom("");
      } else if (firm) {
        setPropFirm("Other");
        setPropFirmCustom(firm);
      } else {
        setPropFirm("FTMO");
        setPropFirmCustom("");
      }
      const bal =
        edit.starting_balance != null && Number.isFinite(Number(edit.starting_balance))
          ? Number(edit.starting_balance)
          : 50000;
      setPropRules(
        parseLiveJournalPropRules(edit.prop_rules) ||
          defaultLiveJournalPropRules(edit.market || "Forex", bal, firm)
      );
    } else {
      setName("");
      setStartingBalance(type === "prop" ? "50000" : "10000");
      setMarket("Forex");
      setPropFirm("FTMO");
      setPropFirmCustom("");
      setNotes("");
      setPropRules(defaultLiveJournalPropRules(type === "prop" ? "Forex" : "Forex", type === "prop" ? 50000 : 10000, "FTMO"));
    }
    setError(null);
  }, [open, initialState?.accountTypeKey, initialState?.editAccount]);

  React.useEffect(() => {
    if (effectiveType === "personal") setAccountSubtype("Live");
    else if (accountSubtype === "Live") setAccountSubtype("Challenge");
  }, [effectiveType, accountSubtype]);

  const applyFuturesPreset = React.useCallback((balanceValue: number) => {
    const preset = futuresPresetForBalance(balanceValue);
    if (!preset) return;
    setPropRules((prev) => ({
      ...prev,
      limitMode: "amount",
      p1Amt: preset,
      p2Amt: { ...preset, pt: String(Math.round(balanceValue * 0.05)) },
    }));
  }, []);

  if (!open) return null;

  const balancePresets =
    effectiveType === "prop" && market.toLowerCase() === "futures"
      ? FUTURES_BALANCE_PRESETS
      : PROP_BALANCE_PRESETS;

  const handleSave = async () => {
    const trimmedName = name.trim();
    const balance = parseBalanceInput(startingBalance);
    if (!trimmedName) {
      setError("Journal name is required.");
      return;
    }
    if (balance == null) {
      setError("Starting balance is required and must be greater than zero.");
      return;
    }
    if (effectiveType === "prop" && !resolvedPropFirm) {
      setError("Prop firm is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await syncJournalTokenFromSession();
      const body = {
        name: trimmedName,
        starting_balance: balance,
        market,
        account_type: effectiveType,
        account_subtype: accountSubtype,
        prop_firm: resolvedPropFirm,
        prop_rules: effectiveType === "prop" ? liveJournalPropRulesToApiBody(propRules) : null,
        notes: notes.trim() || null,
      };
      const editId = initialState?.editAccount?.id;
      const res = await fetch(
        editId
          ? `${JOURNAL_API_BASE}/journal/live-accounts/${editId}`
          : `${JOURNAL_API_BASE}/journal/live-accounts`,
        {
          method: editId ? "PATCH" : "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json()) as { success?: boolean; error?: string; account?: Record<string, unknown> };
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Could not save live journal (HTTP ${res.status})`);
      }
      await onSaved?.(data.account || {});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save live journal.");
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

  const inputStyle = {
    height: 32,
    background: C.sf,
    border: `1px solid ${C.brH}`,
    color: C.tx,
    padding: "0 10px",
    fontFamily: F,
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const title =
    isEdit
      ? effectiveType === "prop"
        ? "Edit Prop Journal"
        : "Edit Personal Journal"
      : effectiveType === "prop"
      ? "Create Prop Journal"
      : "Create Personal Journal";

  const canSave = name.trim() && parseBalanceInput(startingBalance) != null;

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
          width: effectiveType === "prop" ? 480 : 440,
          maxWidth: "calc(100vw - 36px)",
          maxHeight: "calc(100vh - 36px)",
          overflow: "auto",
          background: C.el,
          border: `1px solid ${C.brH}`,
          boxShadow: "0 24px 72px rgba(0,0,0,0.9)",
          fontFamily: F,
        }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg,${accent},${C.acL},${accent})` }} />
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
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.tx, letterSpacing: "0.05em" }}>{title}</div>
            <div style={{ fontSize: 9, color: C.tm, marginTop: 2 }}>
              Manual journal · trades added by hand
            </div>
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
          {lockedType ? (
            <div style={{ display: "flex", gap: 8 }}>
              <span style={tabBtn(true, accent)}>
                {lockedType === "prop" ? "Prop firm" : "Personal"}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={tabBtn(accountTypeKey === "personal", C.gn)}
                onClick={() => setAccountTypeKey("personal")}
              >
                Personal
              </button>
              <button
                type="button"
                style={tabBtn(accountTypeKey === "prop", C.gold)}
                onClick={() => setAccountTypeKey("prop")}
              >
                Prop
              </button>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Journal name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              placeholder={effectiveType === "prop" ? "e.g. FTMO Challenge #1" : "e.g. My Live Account"}
              style={inputStyle}
            />
          </label>

          {effectiveType === "prop" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Prop firm
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PROP_FIRMS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      style={tabBtn(propFirm === item, C.gold)}
                      onClick={() => setPropFirm(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {propFirm === "Other" ? (
                  <input
                    value={propFirmCustom}
                    onChange={(e) => setPropFirmCustom(e.target.value.slice(0, 80))}
                    placeholder="Enter prop firm name"
                    style={{ ...inputStyle, marginTop: 4 }}
                  />
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Account phase
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
            </>
          ) : null}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {effectiveType === "prop" ? "Account size" : "Starting balance"}
            </span>
            {effectiveType === "prop" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {balancePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    style={tabBtn(startingBalance === preset, C.gold)}
                    onClick={() => {
                      setStartingBalance(preset);
                      if (market.toLowerCase() === "futures") applyFuturesPreset(Number(preset));
                    }}
                  >
                    ${Number(preset).toLocaleString()}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value.replace(/[^\d.,]/g, "").slice(0, 16))}
              placeholder={effectiveType === "prop" ? "50000" : "10000"}
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Primary market
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {MARKETS.map((item) => (
                <button key={item} type="button" style={tabBtn(market === item, accent)} onClick={() => setMarket(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          {effectiveType === "prop" ? (
            <LiveJournalPropRulesForm
              rules={propRules}
              onChange={setPropRules}
              balance={parsedBalance}
              market={market}
            />
          ) : null}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Notes <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              placeholder="Rules, goals, or reminders for this journal"
              rows={3}
              style={{
                ...inputStyle,
                height: "auto",
                minHeight: 72,
                padding: "8px 10px",
                resize: "vertical" as const,
              }}
            />
          </label>

          {error ? <div style={{ fontSize: 11, color: "#ff6b84", fontWeight: 700 }}>{error}</div> : null}
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
            disabled={saving || !canSave}
            style={{
              height: 30,
              padding: "0 16px",
              background: accent,
              border: "none",
              color: effectiveType === "prop" ? "#1a1408" : "#04110e",
              fontFamily: F,
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: saving || !canSave ? "default" : "pointer",
              opacity: saving || !canSave ? 0.45 : 1,
            }}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Journal"}
          </button>
        </div>
      </div>
    </div>
  );
}
