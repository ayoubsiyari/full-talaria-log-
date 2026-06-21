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

type WizardStepId = "info" | "account" | "rules" | "review";

type WizardStepDef = { id: number; stepId: WizardStepId; label: string; hint: string };

const PERSONAL_WIZARD_STEPS: WizardStepDef[] = [
  { id: 1, stepId: "info", label: "General Info", hint: "Name your journal and add optional notes." },
  { id: 2, stepId: "account", label: "Account Settings", hint: "Set starting balance and primary market." },
  { id: 3, stepId: "review", label: "Review", hint: "Confirm details before creating the journal." },
];

const PROP_WIZARD_STEPS: WizardStepDef[] = [
  { id: 1, stepId: "info", label: "General Info", hint: "Name the journal, prop firm, and account phase." },
  { id: 2, stepId: "account", label: "Account Settings", hint: "Choose account size and primary market." },
  { id: 3, stepId: "rules", label: "Challenge Rules", hint: "Configure drawdown, profit target, and step format." },
  { id: 4, stepId: "review", label: "Review", hint: "Confirm your prop journal before saving." },
];

const STEP_SECTION: Record<Exclude<WizardStepId, "review">, string> = {
  info: "General Info",
  account: "Account Settings",
  rules: "Challenge Rules",
};

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
    hv: "rgba(255,255,255,0.03)",
    hv2: "rgba(255,255,255,0.04)",
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
  const [wizardStep, setWizardStep] = React.useState(1);
  const [hov, setHov] = React.useState<string | null>(null);

  const effectiveType = lockedType || accountTypeKey;
  const resolvedPropFirm =
    effectiveType === "prop" ? (propFirm === "Other" ? propFirmCustom.trim() : propFirm) : null;
  const parsedBalance = parseBalanceInput(startingBalance) ?? (effectiveType === "prop" ? 50000 : 10000);
  const STEPS = effectiveType === "prop" ? PROP_WIZARD_STEPS : PERSONAL_WIZARD_STEPS;
  const stepCount = STEPS.length;
  const currentStep = STEPS.find((s) => s.id === wizardStep) ?? STEPS[0];
  const currentStepId = currentStep.stepId;
  const isLastStep = wizardStep >= stepCount;
  const accent = effectiveType === "prop" ? c.gold : c.acL;
  const accentD = effectiveType === "prop" ? "rgba(201,168,76,0.10)" : c.acD;
  const accentG = effectiveType === "prop" ? "rgba(201,168,76,0.35)" : c.acG;
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
    setWizardStep(1);
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
    setWizardStep(1);
  }, [open, initialState?.accountTypeKey, initialState?.editAccount]);

  React.useEffect(() => {
    if (effectiveType === "personal") setAccountSubtype("Live");
    else if (accountSubtype === "Live") setAccountSubtype("Challenge");
  }, [effectiveType, accountSubtype]);

  React.useEffect(() => {
    setWizardStep((prev) => Math.min(Math.max(1, prev), stepCount));
  }, [stepCount]);

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
    if (stepId === "rules" || stepId === "review") return null;
    return null;
  };

  const stepComplete = (stepId: WizardStepId): boolean => {
    if (stepId === "info") {
      if (!name.trim()) return false;
      if (effectiveType === "prop" && !resolvedPropFirm) return false;
      return true;
    }
    if (stepId === "account") return parseBalanceInput(startingBalance) != null;
    return true;
  };

  const canGoToStep = (targetId: number) => {
    for (const step of STEPS) {
      if (step.id >= targetId) break;
      if (!stepComplete(step.stepId)) return false;
    }
    return true;
  };

  const handleNext = () => {
    const err = validateStep(currentStepId);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setWizardStep((s) => Math.min(stepCount, s + 1));
  };

  const goPrev = () => {
    setError(null);
    setWizardStep((s) => Math.max(1, s - 1));
  };

  const goToStep = (id: number) => {
    if (saving) return;
    if (id > wizardStep && !canGoToStep(id)) {
      const err = validateStep(currentStepId);
      if (err) setError(err);
      return;
    }
    if (id <= wizardStep || canGoToStep(id)) {
      setError(null);
      setWizardStep(id);
    }
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
                setWizardStep(1);
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
      {secH(STEP_SECTION.info)}
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
        {secH(STEP_SECTION.account, isProp ? c.gold : c.acL)}
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
      {secH(STEP_SECTION.rules, c.gold)}
      <LiveJournalPropRulesForm
        embedded
        rules={propRules}
        onChange={setPropRules}
        balance={parsedBalance}
        market={market}
      />
    </div>
  );

  const reviewRow = (label: string, value: string, valueColor = c.tx) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${c.br}`,
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, color: c.tm, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: F }}>
        {label}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: valueColor, fontFamily: F, wordBreak: "break-word" }}>{value}</span>
    </div>
  );

  const renderReviewStep = () => (
    <div style={{ border: `1px solid ${c.brH}`, padding: "12px 14px" }}>
      {secH("Review", accent)}
      <div style={{ fontSize: 10, color: c.ts, lineHeight: 1.45, marginBottom: 12, fontFamily: F }}>
        {currentStep.hint}
      </div>
      {reviewRow("Journal type", effectiveType === "prop" ? "Prop Firm" : "Personal", effectiveType === "prop" ? c.gold : c.acL)}
      {reviewRow("Journal name", name.trim() || "—")}
      {effectiveType === "prop" && resolvedPropFirm ? reviewRow("Prop firm", resolvedPropFirm, c.gold) : null}
      {effectiveType === "prop" ? reviewRow("Account phase", accountSubtype, c.gold) : null}
      {reviewRow("Starting balance", `$${parsedBalance.toLocaleString()}`)}
      {reviewRow("Primary market", market || "—")}
      {stepFormatLabel ? reviewRow("Challenge format", stepFormatLabel, c.gold) : null}
      {notes.trim() ? reviewRow("Notes", notes.trim()) : null}
    </div>
  );

  const builderTitle = isEdit
    ? effectiveType === "prop"
      ? "Edit Prop Journal"
      : "Edit Personal Journal"
    : effectiveType === "prop"
      ? "Prop Journal"
      : "Live Journal";

  const secondaryBtnStyle: React.CSSProperties = {
    height: 32,
    minWidth: 86,
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    fontFamily: F,
    borderRadius: 0,
    textTransform: "uppercase",
    color: c.ts,
    border: "1px solid rgba(140,160,255,0.22)",
    background: "rgba(140,160,255,0.04)",
    boxShadow: "none",
    cursor: "default",
    boxSizing: "border-box",
    lineHeight: 1,
    outline: "none",
    userSelect: "none",
    transition: "background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.08s ease",
  };

  const primaryBtnStyle = (enabled = true): React.CSSProperties => ({
    height: 32,
    minWidth: 86,
    padding: "0 16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    fontFamily: F,
    borderRadius: 0,
    textTransform: "uppercase",
    color: enabled ? "rgba(255,255,255,0.96)" : c.tm,
    background: enabled ? `linear-gradient(135deg,${c.ac},${c.acL})` : "rgba(140,160,255,0.10)",
    border: `1px solid ${enabled ? "rgba(74,106,255,0.55)" : "rgba(140,160,255,0.18)"}`,
    boxShadow: enabled ? "0 2px 8px rgba(38,67,247,0.25)" : "none",
    cursor: "default",
    opacity: enabled ? 1 : 0.55,
    boxSizing: "border-box",
    lineHeight: 1,
    outline: "none",
    userSelect: "none",
    transition: "background 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease, transform 0.08s ease",
  });

  const saveBtnStyle = (enabled = true): React.CSSProperties => ({
    height: 32,
    padding: "0 16px",
    minWidth: 132,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.04em",
    fontFamily: F,
    borderRadius: 0,
    textTransform: "uppercase",
    color: enabled ? "#fff" : c.tm,
    background: enabled
      ? `linear-gradient(135deg,${effectiveType === "prop" ? "#B8922E" : "#00A882"},${effectiveType === "prop" ? c.gold : c.gn})`
      : "rgba(140,160,255,0.10)",
    border: `1px solid ${enabled ? (effectiveType === "prop" ? "rgba(201,168,76,0.5)" : "rgba(0,212,161,0.5)") : "rgba(140,160,255,0.18)"}`,
    boxShadow: enabled ? `0 2px 8px ${effectiveType === "prop" ? "rgba(201,168,76,0.25)" : "rgba(0,212,161,0.25)"}` : "none",
    cursor: saving ? "not-allowed" : "default",
    opacity: enabled ? 1 : 0.55,
    boxSizing: "border-box",
    outline: "none",
    userSelect: "none",
  });

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
            width: "min(900px, 94vw)",
            height: "min(90vh, 720px)",
            background: c.bg,
            border: `1px solid ${c.brH}`,
            display: "flex",
            flexDirection: "column",
            animation: "tlrPopIn 0.18s ease",
            boxShadow: "0 32px 96px rgba(0,0,0,0.9), 0 0 0 1px rgba(140,160,255,0.13)",
            fontFamily: F,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 2,
              background: `linear-gradient(90deg,${accent},${effectiveType === "prop" ? "#E8C96A" : c.acL},${accent})`,
              flexShrink: 0,
            }}
          />

          {/* Wizard header — matches Strategy Builder */}
          <div style={{ flexShrink: 0, borderBottom: `1px solid ${c.brH}`, background: c.bg }}>
            <div style={{ height: 44, display: "flex", alignItems: "center", gap: 12, padding: "0 18px" }}>
              <img src="/LOGO-07.png" alt="Talaria" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: c.tx, fontFamily: F, flex: 1 }}>
                {builderTitle}
                <span style={{ color: accent, fontWeight: 600, marginLeft: 8 }}>
                  — Step {wizardStep} of {stepCount}
                </span>
              </div>
              <div
                onClick={saving ? undefined : onClose}
                style={{
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                  color: c.tm,
                  opacity: saving ? 0.45 : 1,
                  transition: "color 0.12s, background 0.12s, transform 0.08s",
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.color = c.rd;
                    e.currentTarget.style.background = "rgba(255,80,104,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = c.tm;
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.transform = "scale(1)";
                }}
                onMouseDown={(e) => {
                  if (!saving) e.currentTarget.style.transform = "scale(0.92)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Step tabs */}
            <div style={{ display: "flex", borderTop: `1px solid ${c.brH}` }}>
              {STEPS.map((step) => {
                const isActive = wizardStep === step.id;
                const isDone = wizardStep > step.id;
                return (
                  <div
                    key={step.stepId}
                    onClick={() => goToStep(step.id)}
                    style={{
                      flex: 1,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      cursor: "default",
                      position: "relative",
                      opacity: saving && !isActive ? 0.62 : 1,
                      transition: "background 0.12s, opacity 0.12s",
                      background: isActive ? accentD : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive && !saving) e.currentTarget.style.background = c.hv;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isActive ? accent : isDone ? c.gn : "rgba(255,255,255,0.1)",
                        flexShrink: 0,
                        transition: "background 0.15s",
                      }}
                    >
                      {isDone ? (
                        <svg width={10} height={10} viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l4 4 6-7" stroke="rgba(4,5,15,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span style={{ fontSize: 9, fontWeight: 900, color: isActive ? "#fff" : "rgba(255,255,255,0.4)", fontFamily: F }}>
                          {step.id}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? accent : isDone ? c.gn : c.tm, fontFamily: F }}>
                      {step.label}
                    </span>
                    {isActive ? (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: 2,
                          background: `linear-gradient(90deg,transparent,${accent},transparent)`,
                          boxShadow: `0 0 6px ${accentG}`,
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tlr-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px", minHeight: 0 }}>
            <div style={{ maxWidth: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
              {currentStepId === "info" ? renderInfoStep() : null}
              {currentStepId === "account" ? renderAccountStep() : null}
              {currentStepId === "rules" ? renderRulesStep() : null}
              {currentStepId === "review" ? renderReviewStep() : null}
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

          {/* Footer — Strategy Builder pattern */}
          <div
            style={{
              flexShrink: 0,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              borderTop: `1px solid ${c.brH}`,
              background: c.el,
            }}
          >
            <button
              type="button"
              onClick={saving ? undefined : wizardStep === 1 ? onClose : goPrev}
              disabled={saving}
              style={{ ...secondaryBtnStyle, opacity: saving ? 0.5 : 1 }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.background = "rgba(140,160,255,0.07)";
                  e.currentTarget.style.borderColor = "rgba(140,160,255,0.40)";
                  e.currentTarget.style.color = c.tx;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(140,160,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(140,160,255,0.22)";
                e.currentTarget.style.color = c.ts;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {wizardStep > 1 && (
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {wizardStep === 1 ? "Cancel" : "Back"}
            </button>

            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {STEPS.map((step) => (
                <div
                  key={`dot_${step.id}`}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: wizardStep === step.id ? accent : c.brH,
                    transition: "background 0.15s",
                  }}
                />
              ))}
            </div>

            {!isLastStep ? (
              <button
                type="button"
                onClick={saving ? undefined : handleNext}
                disabled={saving}
                style={primaryBtnStyle(!saving)}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.background = `linear-gradient(135deg,${c.acL},#6A8AFF)`;
                    e.currentTarget.style.boxShadow = "0 2px 14px rgba(38,67,247,0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.background = `linear-gradient(135deg,${c.ac},${c.acL})`;
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(38,67,247,0.25)";
                    e.currentTarget.style.transform = "scale(1)";
                  }
                }}
              >
                Next
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={saving ? undefined : () => void handleSave()}
                disabled={saving}
                style={saveBtnStyle(!saving)}
              >
                {saving ? (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      border: "2px solid rgba(255,255,255,0.22)",
                      borderTopColor: "rgba(255,255,255,0.95)",
                      borderRadius: "50%",
                      animation: "tlrLoadRotate 0.7s linear infinite",
                    }}
                  />
                ) : (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                )}
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Journal"}
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes tlrLoadRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
