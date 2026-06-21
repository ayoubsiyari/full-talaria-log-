"use client";

import * as React from "react";
import type { LiveJournalPropRules } from "@/lib/liveJournalPropRules";

const F = "'Exo 2', sans-serif";
const C = {
  el: "#0F1119",
  brH: "rgba(140,160,255,0.22)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.55)",
  tm: "rgba(255,255,255,0.38)",
  gold: "#C9A84C",
} as const;

type Props = {
  rules: LiveJournalPropRules;
  onChange: (rules: LiveJournalPropRules) => void;
  balance: number;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 900, color: C.tm, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {children}
    </span>
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
          border: `1px solid ${checked ? C.gold : C.brH}`,
          background: checked ? `${C.gold}33` : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: C.gold,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, color: checked ? C.ts : C.tm }}>{label}</span>
    </button>
  );
}

export function LiveJournalPropRulesForm({ rules, onChange, balance }: Props) {
  const isAmount = rules.limitMode === "amount";
  const cap = Math.max(1000, balance || 50000);
  const phase = isAmount ? rules.p1Amt : rules.p1Pct;

  const setPhase = (key: "dl" | "dd" | "pt", val: string) => {
    if (isAmount) {
      onChange({ ...rules, p1Amt: { ...rules.p1Amt, [key]: val } });
    } else {
      onChange({ ...rules, p1Pct: { ...rules.p1Pct, [key]: val } });
    }
  };

  const approx = (pct: string) => {
    const n = Number(pct);
    if (!Number.isFinite(n)) return "";
    return isAmount ? "" : `≈ $${Math.round(cap * (n / 100)).toLocaleString()}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        border: `1px solid ${C.gold}44`,
        background: `${C.gold}08`,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 950, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Challenge rules
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Daily loss ($)" : "Daily loss (%)"}</FieldLabel>
          <NumInput
            value={phase.dl}
            onChange={(v) => setPhase("dl", v)}
            suffix={isAmount ? undefined : "%"}
            disabled={!rules.dailyLossEnabled}
          />
          {!isAmount ? (
            <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.dl)}</span>
          ) : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Max drawdown ($)" : "Max drawdown (%)"}</FieldLabel>
          <NumInput value={phase.dd} onChange={(v) => setPhase("dd", v)} suffix={isAmount ? undefined : "%"} />
          {!isAmount ? (
            <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.dd)}</span>
          ) : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isAmount ? "Profit target ($)" : "Profit target (%)"}</FieldLabel>
          <NumInput value={phase.pt} onChange={(v) => setPhase("pt", v)} suffix={isAmount ? undefined : "%"} />
          {!isAmount ? (
            <span style={{ fontSize: 8, color: C.tm, fontFamily: F }}>{approx(phase.pt)}</span>
          ) : null}
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <Toggle checked={rules.dailyLossEnabled} onChange={(v) => onChange({ ...rules, dailyLossEnabled: v })} label="Daily loss limit" />
        <Toggle checked={rules.trailingDrawdown} onChange={(v) => onChange({ ...rules, trailingDrawdown: v })} label="Trailing drawdown" />
        <Toggle checked={rules.weekendHold} onChange={(v) => onChange({ ...rules, weekendHold: v })} label="Allow weekend hold" />
      </div>

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
