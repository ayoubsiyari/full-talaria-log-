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
  liveJournalPropStepFormat,
  parseLiveJournalPropRules,
} from "@/lib/liveJournalPropRules";
import { LiveJournalPropRulesForm } from "./LiveJournalPropRulesForm";

const F = "'Exo 2', sans-serif";

const MARKETS = ["Forex", "Futures", "Stocks", "Crypto", "Indices"];
const PROP_SUBTYPES = ["Challenge", "Funded", "Demo"];
const PROP_FIRMS = ["FTMO", "Topstep", "The5ers", "FundedNext", "E8 Funding", "MyForexFunds", "Other"];
const PROP_BALANCE_PRESETS = ["10000", "25000", "50000", "100000", "200000"];
const FUTURES_BALANCE_PRESETS = ["25000", "50000", "100000", "150000"];

type WizardStepId = "info" | "account" | "rules";

const STEP_META: Record<WizardStepId, { label: string; section: string }> = {
  info: { label: "Journal Info", section: "Journal Info" },
  account: { label: "Account Settings", section: "Account Settings" },
  rules: { label: "Challenge Rules", section: "Challenge Rules" },
};

function IconX({ s = 18, cl = "currentColor" }: { s?: number; cl?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 -960 960 960" fill={cl}>
      <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
    </svg>
  );
}

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
  const c = {
    ac: "#2643F7",
    acL: "#4A6AFF",
    acD: "rgba(38,67,247,0.08)",
    acB: "rgba(38,67,247,0.22)",
    acG: "rgba(74,106,255,0.35)",
    gold: "#C9A84C",
    bg: "#07080E",
    sf: "#0A0C14",
    el: "#0F1119",
    br: "rgba(140,160,255,0.05)",
    brH: "rgba(140,160,255,0.12)",
    tx: "rgba(255,255,255,0.92)",
    ts: "rgba(255,255,255,0.70)",
    tm: "rgba(255,255,255,0.50)",
    gn: "#00D4A1",
    rd: "#FF5068",
  };

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
  const [wizardStep, setWizardStep] = React.useState(0);
  const [hov, setHov] = React.useState<string | null>(null);

  const effectiveType = lockedType || accountTypeKey;
  const resolvedPropFirm =
    effectiveType === "prop" ? (propFirm === "Other" ? propFirmCustom.trim() : propFirm) : null;
  const parsedBalance = parseBalanceInput(startingBalance) ?? (effectiveType === "prop" ? 50000 : 10000);
  const stepIds: WizardStepId[] = effectiveType === "prop" ? ["info", "account", "rules"] : ["info", "account"];
  const currentStepId = stepIds[Math.min(wizardStep, stepIds.length - 1)] ?? "info";
  const isLastStep = wizardStep >= stepIds.length - 1;
  const stepFormat = effectiveType === "prop" ? liveJournalPropStepFormat(propRules) : null;
  const stepFormatLabel =
    stepFormat === "2-step" ? "2 Step" : stepFormat === "instant" ? "Instant" : stepFormat === "1-step" ? "1 Step" : null;

  const lbl = (t: string, required = false) => (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: c.tm,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        marginBottom: 4,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {t}
      {required ? (
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(255,80,104,0.9)",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
      ) : null}
    </div>
  );

  const secH = (t: string, accent = c.acL) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 9,
        fontWeight: 800,
        color: c.tm,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          width: 2,
          height: 9,
          background: accent,
          flexShrink: 0,
          boxShadow: `0 0 4px ${accent === c.gold ? "rgba(200,150,0,0.4)" : c.acG}`,
        }}
      />
      {t}
    </div>
  );

  const inp = (extra: React.CSSProperties = {}) =>
    ({
      background: c.el,
      border: `1px solid ${c.brH}`,
      color: c.tx,
      fontSize: 11,
      fontWeight: 600,
      padding: "0 8px",
      height: 27,
      fontFamily: F,
      outline: "none",
      width: "100%",
      boxSizing: "border-box" as const,
      ...extra,
    }) as React.CSSProperties;

  React.useEffect(() => {
    if (!open) return;
    const edit = initialState?.editAccount;
    const type =
      edit?.account_type === "prop" || initialState?.accountTypeKey === "prop" ? "prop" : "personal";
    setAccountTypeKey(type);
    setAccountSubtype(type === "prop" ? edit?.account_subtype || "Challenge" : "Live");
    setWizardStep(0);
    setHov(null);

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
      setPropRules(
        defaultLiveJournalPropRules(type === "prop" ? "Forex" : "Forex", type === "prop" ? 50000 : 10000, "FTMO")
      );
    }
    setError(null);
  }, [open, initialState?.accountTypeKey, initialState?.editAccount]);

  React.useEffect(() => {
    if (effectiveType === "personal") setAccountSubtype("Live");
    else if (accountSubtype === "Live") setAccountSubtype("Challenge");
  }, [effectiveType, accountSubtype]);

  React.useEffect(() => {
    setWizardStep((prev) => Math.min(prev, stepIds.length - 1));
  }, [stepIds.length]);

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

  const balancePresets =
    effectiveType === "prop" && market.toLowerCase() === "futures"
      ? FUTURES_BALANCE_PRESETS
      : PROP_BALANCE_PRESETS;

  const validateStep = (stepId: WizardStepId): string | null => {
    if (stepId === "info") {
      if (!name.trim()) return "Journal name is required.";
      if (effectiveType === "prop" && !resolvedPropFirm) return "Prop firm is required.";
      return null;
    }
    if (stepId === "account") {
      if (parseBalanceInput(startingBalance) == null) return "Starting balance is required and must be greater than zero.";
      return null;
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(currentStepId);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setWizardStep((prev) => Math.min(prev + 1, stepIds.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setWizardStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSave = async () => {
    const err = validateStep(currentStepId);
    if (err) {
      setError(err);
      return;
    }
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

  const renderChip = (
    key: string,
    label: string,
    active: boolean,
    onClick: () => void,
    accent: string,
    glow: string,
    bg: string
  ) => {
    const hk = `chip_${key}`;
    const isH = hov === hk;
    return (
      <div
        key={key}
        onClick={onClick}
        onMouseEnter={() => setHov(hk)}
        onMouseLeave={() => setHov(null)}
        style={{
          padding: "4px 9px",
          fontSize: 10,
          fontWeight: active ? 700 : 500,
          color: active ? accent : isH ? c.tx : c.ts,
          background: active ? bg : isH ? "rgba(255,255,255,0.05)" : "transparent",
          cursor: "default",
          transition: "background 0.12s,color 0.12s",
          position: "relative",
          fontFamily: F,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label}
        {active ? (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "15%",
              right: "15%",
              height: 2,
              background: `linear-gradient(90deg,transparent,${accent},transparent)`,
              boxShadow: `0 0 6px ${glow}`,
              pointerEvents: "none",
            }}
          />
        ) : isH ? (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "20%",
              right: "20%",
              height: 1,
              background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    );
  };

  const renderModeToggle = () => {
    if (lockedType) return null;
    return (
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: `1px solid ${c.br}` }}>
        {(
          [
            ["personal", "Personal", "Track your own live account", c.acL, c.acG],
            ["prop", "Prop Firm", "Track prop challenge or funded account", c.gold, "rgba(200,150,0,0.4)"],
          ] as const
        ).map(([v, l, desc, acColor, acGlow]) => {
          const isA = accountTypeKey === v;
          const hk = `mode_${v}`;
          const isH = hov === hk;
          return (
            <div
              key={v}
              onClick={() => {
                setAccountTypeKey(v);
                setWizardStep(0);
              }}
              onMouseEnter={() => setHov(hk)}
              onMouseLeave={() => setHov(null)}
              style={{
                flex: 1,
                padding: "6px 10px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                cursor: "default",
                transition: "all 0.15s",
                position: "relative",
                textAlign: "center",
                background: isA
                  ? v === "prop"
                    ? "rgba(200,150,0,0.07)"
                    : "rgba(74,106,255,0.07)"
                  : isH
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isA ? acColor : isH ? c.tx : c.ts,
                  fontFamily: F,
                  transition: "color 0.12s",
                }}
              >
                {l}
              </span>
              <span style={{ fontSize: 9, color: isA ? c.ts : c.tm, fontFamily: F, transition: "color 0.12s" }}>
                {desc}
              </span>
              {isA ? (
                <div
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: "15%",
                    right: "15%",
                    height: 2,
                    background: `linear-gradient(90deg,transparent,${acColor},transparent)`,
                    boxShadow: `0 0 6px ${acGlow}`,
                    pointerEvents: "none",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInfoStep = () => (
    <div style={{ border: `1px solid ${c.brH}`, padding: "12px 14px" }}>
      {secH(STEP_META.info.section)}
      {renderModeToggle()}
      <div style={{ marginBottom: 10 }}>
        {lbl("Journal name", true)}
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          placeholder={effectiveType === "prop" ? "e.g. FTMO Challenge #1" : "e.g. My Live Account"}
          style={inp()}
        />
      </div>
      {effectiveType === "prop" ? (
        <>
          <div style={{ marginBottom: 10 }}>
            {lbl("Prop firm", true)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {PROP_FIRMS.map((item) =>
                renderChip(
                  `firm_${item}`,
                  item,
                  propFirm === item,
                  () => setPropFirm(item),
                  c.gold,
                  "rgba(200,150,0,0.4)",
                  "rgba(200,150,0,0.08)"
                )
              )}
            </div>
            {propFirm === "Other" ? (
              <input
                value={propFirmCustom}
                onChange={(e) => setPropFirmCustom(e.target.value.slice(0, 80))}
                placeholder="Enter prop firm name"
                style={{ ...inp(), marginTop: 8 }}
              />
            ) : null}
          </div>
          <div style={{ marginBottom: 10 }}>
            {lbl("Account phase")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {PROP_SUBTYPES.map((item) =>
                renderChip(
                  `phase_${item}`,
                  item,
                  accountSubtype === item,
                  () => setAccountSubtype(item),
                  c.gold,
                  "rgba(200,150,0,0.4)",
                  "rgba(200,150,0,0.08)"
                )
              )}
            </div>
          </div>
        </>
      ) : null}
      <div>
        {lbl("Description")}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
          placeholder="Rules, goals, or reminders for this journal"
          rows={3}
          style={{
            ...inp({ height: "auto", minHeight: 72, padding: "8px 10px", resize: "vertical" }),
          }}
        />
      </div>
    </div>
  );

  const renderAccountStep = () => {
    const isProp = effectiveType === "prop";
    const chipAc = isProp ? c.gold : c.acL;
    const chipGlow = isProp ? "rgba(200,150,0,0.4)" : c.acG;
    const chipBg = isProp ? "rgba(200,150,0,0.08)" : "rgba(74,106,255,0.08)";
    return (
      <div style={{ border: `1px solid ${c.brH}`, padding: "12px 14px" }}>
        {secH(STEP_META.account.section, isProp ? c.gold : c.acL)}
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: c.tm,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: F,
              whiteSpace: "nowrap",
              flexShrink: 0,
              width: 130,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isProp ? "Account size" : "Starting balance"}
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "rgba(255,80,104,0.9)",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 130, flexShrink: 0 }}>
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: c.ts,
                  fontWeight: 700,
                  borderRight: `1px solid ${c.br}`,
                  pointerEvents: "none",
                  fontFamily: F,
                }}
              >
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value.replace(/[^\d.,]/g, "").slice(0, 16))}
                className="tlr-nospinner"
                style={inp({ fontSize: 11, fontWeight: 800, paddingLeft: 26, fontVariantNumeric: "tabular-nums" })}
              />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {balancePresets.map((preset) => {
                const label =
                  Number(preset) >= 1000 ? `${Math.round(Number(preset) / 1000)}K` : preset;
                return renderChip(
                  `bal_${preset}`,
                  label,
                  startingBalance === preset,
                  () => {
                    setStartingBalance(preset);
                    if (market.toLowerCase() === "futures") applyFuturesPreset(Number(preset));
                  },
                  chipAc,
                  chipGlow,
                  chipBg
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: c.tm,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: F,
              whiteSpace: "nowrap",
              flexShrink: 0,
              width: 130,
              paddingTop: 6,
            }}
          >
            Primary market
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {MARKETS.map((item) =>
              renderChip(
                `market_${item}`,
                item,
                market === item,
                () => setMarket(item),
                isProp ? c.gold : c.acL,
                isProp ? "rgba(200,150,0,0.4)" : c.acG,
                isProp ? "rgba(200,150,0,0.08)" : "rgba(74,106,255,0.08)"
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRulesStep = () => (
    <div style={{ border: `1px solid ${c.brH}`, padding: "12px 14px" }}>
      {secH(STEP_META.rules.section, c.gold)}
      <LiveJournalPropRulesForm
        embedded
        rules={propRules}
        onChange={setPropRules}
        balance={parsedBalance}
        market={market}
      />
    </div>
  );

  const modalTitle = isEdit
    ? effectiveType === "prop"
      ? "Edit Prop Journal"
      : "Edit Personal Journal"
    : effectiveType === "prop"
      ? "New Prop Journal"
      : "New Personal Journal";

  const summaryItems: [string, string][] = [
    [effectiveType === "prop" ? "Prop Firm" : "Personal", effectiveType === "prop" ? c.gold : c.ts],
    [market || "—", c.ts],
    [`$${parsedBalance.toLocaleString()}`, c.ts],
  ];
  if (stepFormatLabel) summaryItems.push([stepFormatLabel, c.gold]);
  if (resolvedPropFirm) summaryItems.splice(1, 0, [resolvedPropFirm, c.gold]);

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 500000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={onClose}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(4,5,10,0.72)",
            backdropFilter: "blur(3px)",
          }}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "min(680px, 90vw)",
            height: "min(88vh, 660px)",
            background: c.sf,
            border: `1px solid ${c.brH}`,
            display: "flex",
            flexDirection: "column",
            animation: "tlrPopIn 0.18s ease",
            boxShadow: "0 24px 72px rgba(0,0,0,0.9)",
            fontFamily: F,
          }}
        >
          <div
            style={{
              height: 2,
              background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              height: 44,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              borderBottom: `1px solid ${c.br}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <img src="/LOGO-07.png" style={{ width: 22, height: 22, objectFit: "contain" }} alt="" />
              <div style={{ fontSize: 12, fontWeight: 700, color: c.tx, letterSpacing: "0.04em", fontFamily: F }}>
                {modalTitle}
              </div>
            </div>
            <div
              onClick={onClose}
              onMouseEnter={() => setHov("modalX")}
              onMouseLeave={() => setHov(null)}
              style={{
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "default",
                background: hov === "modalX" ? "rgba(255,80,80,0.07)" : "transparent",
                transition: "background 0.12s",
              }}
            >
              <IconX s={18} cl={hov === "modalX" ? c.rd : c.ts} />
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              padding: "10px 20px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {stepIds.map((id, i) => {
              const done = i < wizardStep;
              const active = i === wizardStep;
              const accent = effectiveType === "prop" ? c.gold : c.acL;
              return (
                <React.Fragment key={id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 800,
                        fontFamily: F,
                        flexShrink: 0,
                        background: active || done ? (effectiveType === "prop" ? "rgba(200,150,0,0.15)" : c.acD) : c.el,
                        border: `1px solid ${active || done ? accent : c.brH}`,
                        color: active || done ? accent : c.tm,
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: active ? 800 : 600,
                        color: active ? c.tx : done ? c.ts : c.tm,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontFamily: F,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {STEP_META[id].label}
                    </span>
                  </div>
                  {i < stepIds.length - 1 ? (
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        minWidth: 12,
                        background: done ? accent : c.br,
                        opacity: done ? 0.6 : 1,
                      }}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>

          <div
            className="tlr-scroll"
            style={{ flex: 1, overflowY: "auto", padding: "16px 20px 68px" }}
          >
            <div style={{ maxWidth: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
              {currentStepId === "info" ? renderInfoStep() : null}
              {currentStepId === "account" ? renderAccountStep() : null}
              {currentStepId === "rules" ? renderRulesStep() : null}
              {error ? (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255,80,104,0.08)",
                    border: "1px solid rgba(255,80,104,0.2)",
                    fontSize: 11,
                    color: c.rd,
                    fontFamily: F,
                    fontWeight: 600,
                  }}
                >
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              height: 46,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              borderTop: `1px solid ${c.brH}`,
              background: c.el,
              gap: 10,
              boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 0, overflow: "hidden", fontFamily: F }}>
              {summaryItems.map(([val, col], i, arr) => (
                <span
                  key={`${val}_${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0,
                    overflow: "hidden",
                    minWidth: 0,
                    flexShrink: i === arr.length - 1 ? 1 : 0,
                  }}
                >
                  <b
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: col,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {val}
                  </b>
                  {i < arr.length - 1 ? (
                    <span style={{ fontSize: 10, color: c.tm, margin: "0 6px", flexShrink: 0 }}>·</span>
                  ) : null}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div
                onClick={onClose}
                onMouseEnter={() => setHov("cancel")}
                onMouseLeave={() => setHov(null)}
                style={{
                  height: 27,
                  padding: "0 14px",
                  display: "flex",
                  alignItems: "center",
                  border: `1px solid ${hov === "cancel" ? c.brH : c.br}`,
                  background: "transparent",
                  cursor: "default",
                  fontSize: 10,
                  fontWeight: 600,
                  color: hov === "cancel" ? c.tx : c.ts,
                  letterSpacing: "0.04em",
                  fontFamily: F,
                  transition: "all 0.12s",
                }}
              >
                Cancel
              </div>
              {wizardStep > 0 ? (
                <div
                  onClick={handleBack}
                  onMouseEnter={() => setHov("back")}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    height: 27,
                    padding: "0 14px",
                    display: "flex",
                    alignItems: "center",
                    border: `1px solid ${hov === "back" ? c.brH : c.br}`,
                    background: "transparent",
                    cursor: "default",
                    fontSize: 10,
                    fontWeight: 600,
                    color: hov === "back" ? c.tx : c.ts,
                    letterSpacing: "0.04em",
                    fontFamily: F,
                    transition: "all 0.12s",
                  }}
                >
                  Back
                </div>
              ) : null}
              {!isLastStep ? (
                <div
                  onClick={handleNext}
                  onMouseEnter={() => setHov("next")}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    height: 27,
                    padding: "0 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: `linear-gradient(135deg,${c.ac},${c.acL})`,
                    cursor: "default",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    letterSpacing: "0.05em",
                    boxShadow: "0 2px 10px rgba(38,67,247,0.35)",
                    filter: hov === "next" ? "brightness(1.12)" : "brightness(1)",
                    transition: "all 0.12s",
                    flexShrink: 0,
                    fontFamily: F,
                  }}
                >
                  Next
                  <svg width={8} height={8} viewBox="0 0 12 12" fill="none">
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                </div>
              ) : (
                <div
                  onClick={saving ? undefined : () => void handleSave()}
                  onMouseEnter={() => setHov("create")}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    height: 27,
                    padding: "0 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: saving ? "rgba(38,67,247,0.15)" : `linear-gradient(135deg,${c.ac},${c.acL})`,
                    cursor: saving ? "not-allowed" : "default",
                    fontSize: 10,
                    fontWeight: 700,
                    color: saving ? "rgba(255,255,255,0.25)" : "#fff",
                    letterSpacing: "0.05em",
                    boxShadow: saving ? "none" : "0 2px 10px rgba(38,67,247,0.35)",
                    filter: hov === "create" && !saving ? "brightness(1.12)" : "brightness(1)",
                    transition: "all 0.12s",
                    flexShrink: 0,
                    fontFamily: F,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <svg width={10} height={10} viewBox="0 0 20 20" fill="none">
                    <path
                      d="M4 2h9l3 3v13H4V2z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <rect x="7" y="2" width="6" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
                    <rect x="6" y="12" width="8" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                  {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Journal"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
