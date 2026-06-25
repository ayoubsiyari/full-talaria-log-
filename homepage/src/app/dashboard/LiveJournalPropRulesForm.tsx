"use client";

import * as React from "react";
import type { LiveJournalPropRules, LiveJournalPropStepFormat } from "@/lib/liveJournalPropRules";
import {
  applyLiveJournalPropStepFormat,
  futuresPresetForBalance,
  liveJournalPropStepFormat,
} from "@/lib/liveJournalPropRules";

const F = "'Exo 2', sans-serif";
const C = {
  el: "#0F1119",
  brH: "rgba(140,160,255,0.22)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.55)",
  tm: "rgba(255,255,255,0.38)",
  ac: "#4A6AFF",
  acD: "rgba(38,67,247,0.08)",
} as const;

const STEP_OPTIONS: { id: LiveJournalPropStepFormat; label: string }[] = [
  { id: "1-step", label: "1 Step" },
  { id: "2-step", label: "2 Step" },
  { id: "instant", label: "Instant" },
];

type Props = {
  rules: LiveJournalPropRules;
  onChange: (rules: LiveJournalPropRules) => void;
  balance: number;
  market: string;
  embedded?: boolean;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function TabBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 12px",
        background: active ? `${C.ac}18` : "transparent",
        color: active ? C.ac : C.ts,
        border: `1px solid ${active ? `${C.ac}55` : C.brH}`,
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
        fontFamily: F,
      }}
    >
      {label}
    </button>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
  disabled,
  width = 72,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  disabled?: boolean;
  width?: number;
}) {
  return (
    <div style={{ position: "relative", width, flexShrink: 0 }}>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
        style={{
          width: "100%",
          height: 28,
          background: C.el,
          border: `1px solid ${C.brH}`,
          color: C.tx,
          padding: suffix ? "0 22px 0 8px" : "0 8px",
          fontFamily: F,
          fontSize: 11,
          fontWeight: 800,
          boxSizing: "border-box",
          opacity: disabled ? 0.45 : 1,
        }}
      />
      {suffix ? (
        <span
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 9,
            fontWeight: 700,
            color: C.tm,
            pointerEvents: "none",
          }}
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontFamily: F,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${checked ? C.ac : C.brH}`,
          background: checked ? `${C.ac}33` : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: C.ac,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, color: checked ? C.ts : C.tm }}>{label}</span>
    </button>
  );
}

function PhaseLimits({
  title,
  isAmount,
  phase,
  cap,
  dailyLossEnabled,
  onChangePhase,
}: {
  title: string;
  isAmount: boolean;
  phase: { dl: string; dd: string; pt: string };
  cap: number;
  dailyLossEnabled: boolean;
  onChangePhase: (key: "dl" | "dd" | "pt", val: string) => void;
}) {
  const approx = (pct: string) => {
    const n = Number(pct);
    if (!Number.isFinite(n) || isAmount) return "";
    return `≈ $${Math.round(cap * (n / 100)).toLocaleString()}`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title ? (
        <div style={{ fontSize: 8, fontWeight: 950, color: C.ac, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {title}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Daily loss ($)" : "Daily loss (%)"}</FieldLabel>
          <NumInput
            value={phase.dl}
            onChange={(v) => onChangePhase("dl", v)}
            suffix={isAmount ? undefined : "%"}
            disabled={!dailyLossEnabled}
          />
          {!isAmount ? <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.dl)}</span> : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Max drawdown ($)" : "Max drawdown (%)"}</FieldLabel>
          <NumInput value={phase.dd} onChange={(v) => onChangePhase("dd", v)} suffix={isAmount ? undefined : "%"} />
          {!isAmount ? <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.dd)}</span> : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Profit target ($)" : "Profit target (%)"}</FieldLabel>
          <NumInput value={phase.pt} onChange={(v) => onChangePhase("pt", v)} suffix={isAmount ? undefined : "%"} />
          {!isAmount ? <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.pt)}</span> : null}
        </label>
      </div>
    </div>
  );
}

export function LiveJournalPropRulesForm({ rules, onChange, balance, market, embedded = false }: Props) {
  const isAmount = rules.limitMode === "amount" || market.toLowerCase() === "futures";
  const cap = Math.max(1000, balance || 50000);
  const stepFormat = liveJournalPropStepFormat(rules);
  const isFutures = market.toLowerCase() === "futures";
  const stepOptions = isFutures ? STEP_OPTIONS.filter((opt) => opt.id !== "2-step") : STEP_OPTIONS;
  const showPhase2 = rules.numPhases === 2 && stepFormat === "2-step";

  const setPhase = (phaseNum: 1 | 2, key: "dl" | "dd" | "pt", val: string) => {
    if (phaseNum === 2) {
      if (isAmount) onChange({ ...rules, p2Amt: { ...rules.p2Amt, [key]: val } });
      else onChange({ ...rules, p2Pct: { ...rules.p2Pct, [key]: val } });
      return;
    }
    if (isAmount) onChange({ ...rules, p1Amt: { ...rules.p1Amt, [key]: val } });
    else onChange({ ...rules, p1Pct: { ...rules.p1Pct, [key]: val } });
  };

  React.useEffect(() => {
    const nextLimit = market.toLowerCase() === "futures" ? "amount" : "percent";
    if (rules.limitMode === nextLimit) return;
    const preset = market.toLowerCase() === "futures" ? futuresPresetForBalance(cap) : null;
    onChange({
      ...rules,
      limitMode: nextLimit,
      ...(preset
        ? {
            p1Amt: preset,
            p2Amt: { ...preset, pt: String(Math.round(cap * 0.05)) },
          }
        : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        ...(embedded
          ? {}
          : {
              padding: 12,
              border: `1px solid ${C.ac}44`,
              background: C.acD,
            }),
      }}
    >
      {!embedded ? (
        <div style={{ fontSize: 9, fontWeight: 950, color: C.ac, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Challenge rules
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <FieldLabel>Challenge steps</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {stepOptions.map((opt) => (
            <TabBtn
              key={opt.id}
              active={stepFormat === opt.id}
              label={opt.label}
              onClick={() => onChange(applyLiveJournalPropStepFormat(rules, opt.id))}
            />
          ))}
        </div>
        <span style={{ fontSize: 8, color: C.tm, fontFamily: F, lineHeight: 1.45 }}>
          {stepFormat === "instant"
            ? isFutures
              ? "Instant funding for futures — funded account limits, no evaluation steps."
              : "Instant funding — single funded-style limits, no min-day rule by default."
            : stepFormat === "2-step"
              ? "Two evaluation steps — set limits for Step 1 and Step 2."
              : isFutures
                ? "Single evaluation step — futures accounts use 1-step only."
                : "Single evaluation step before funded account."}
        </span>
      </div>

      {showPhase2 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <FieldLabel>Checker uses step</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            <TabBtn active={rules.currentPhase === 1} label="Step 1" onClick={() => onChange({ ...rules, currentPhase: 1 })} />
            <TabBtn active={rules.currentPhase === 2} label="Step 2" onClick={() => onChange({ ...rules, currentPhase: 2 })} />
          </div>
        </div>
      ) : null}

      <PhaseLimits
        title={showPhase2 ? "Step 1 limits" : stepFormat === "instant" ? "Instant limits" : "Step limits"}
        isAmount={isAmount}
        phase={isAmount ? rules.p1Amt : rules.p1Pct}
        cap={cap}
        dailyLossEnabled={rules.dailyLossEnabled}
        onChangePhase={(key, val) => setPhase(1, key, val)}
      />

      {showPhase2 ? (
        <PhaseLimits
          title="Step 2 limits"
          isAmount={isAmount}
          phase={isAmount ? rules.p2Amt : rules.p2Pct}
          cap={cap}
          dailyLossEnabled={rules.dailyLossEnabled}
          onChangePhase={(key, val) => setPhase(2, key, val)}
        />
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <Toggle checked={rules.dailyLossEnabled} onChange={(v) => onChange({ ...rules, dailyLossEnabled: v })} label="Daily loss limit" />
        <Toggle checked={rules.trailingDrawdown} onChange={(v) => onChange({ ...rules, trailingDrawdown: v })} label="Trailing drawdown" />
        <Toggle checked={rules.weekendHold} onChange={(v) => onChange({ ...rules, weekendHold: v })} label="Allow weekend hold" />
      </div>

      {stepFormat !== "instant" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Toggle
            checked={rules.minTradingDaysEnabled}
            onChange={(v) => onChange({ ...rules, minTradingDaysEnabled: v })}
            label="Min trading days"
          />
          <NumInput
            value={rules.minTradingDays}
            onChange={(v) => onChange({ ...rules, minTradingDays: v })}
            disabled={!rules.minTradingDaysEnabled}
            width={52}
          />
          <span style={{ fontSize: 9, color: C.tm, fontFamily: F }}>days</span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Toggle
          checked={rules.consistencyEnabled}
          onChange={(v) => onChange({ ...rules, consistencyEnabled: v })}
          label="Consistency rule"
        />
        <NumInput
          value={rules.consistencyPct}
          onChange={(v) => onChange({ ...rules, consistencyPct: v })}
          suffix="%"
          disabled={!rules.consistencyEnabled}
          width={52}
        />
        <span style={{ fontSize: 8, color: C.tm, fontFamily: F, lineHeight: 1.4 }}>
          No single day may exceed this % of total profits (when enabled).
        </span>
      </div>
    </div>
  );
}
