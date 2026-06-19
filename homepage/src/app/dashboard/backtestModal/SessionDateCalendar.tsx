// @ts-nocheck
"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type CalendarColors = {
  sf: string;
  br: string;
  brH: string;
  tx: string;
  ts: string;
  tm: string;
  ac: string;
  acL: string;
  acG: string;
  acB?: string;
  rd: string;
};

export type SessionDateCalendarProps = {
  open: boolean;
  pos: { top: number; left: number; width?: number };
  label: string;
  minIso: string;
  maxIso: string;
  valueIso: string;
  viewY: number;
  viewM: number;
  mode: "days" | "months" | "years";
  yearBase: number;
  onViewY: (y: number) => void;
  onViewM: (m: number) => void;
  onMode: (m: "days" | "months" | "years") => void;
  onYearBase: (b: number) => void;
  onSelect: (iso: string) => void;
  onClose: () => void;
  colors: CalendarColors;
  fontFamily: string;
  IconClose: React.ComponentType<{ s?: number; cl?: string }>;
};

function isoForDay(y: number, m: number, day: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function SessionDateCalendar({
  open,
  pos,
  label,
  minIso,
  maxIso,
  valueIso,
  viewY,
  viewM,
  mode,
  yearBase,
  onViewY,
  onViewM,
  onMode,
  onYearBase,
  onSelect,
  onClose,
  colors: c,
  fontFamily: F,
  IconClose,
}: SessionDateCalendarProps) {
  const [hov, setHov] = useState<string | null>(null);

  if (!open) return null;

  const isDisabled = (iso: string) => {
    if (!iso) return true;
    if (minIso && iso < minIso) return true;
    if (maxIso && iso > maxIso) return true;
    return false;
  };

  const sel = valueIso ? new Date(valueIso.split("T")[0] + "T00:00:00") : null;
  const selY = sel?.getFullYear();
  const selMo = sel?.getMonth();
  const selD = sel?.getDate();

  const NavBtn = ({ label: navLabel, onClick }: { label: string; onClick: () => void }) => (
    <div
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHov(`cal-nav-${navLabel}`)}
      onMouseLeave={() => setHov(null)}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        color: hov === `cal-nav-${navLabel}` ? c.tx : c.ts,
        fontSize: 14,
        fontWeight: 700,
        transition: "color 0.1s",
      }}
    >
      {navLabel}
    </div>
  );

  const cellSx = (isSel: boolean, isH: boolean, disabled: boolean) => ({
    textAlign: "center" as const,
    cursor: disabled ? "not-allowed" : "default",
    borderRadius: 2,
    opacity: disabled ? 0.22 : 1,
    pointerEvents: disabled ? ("none" as const) : ("auto" as const),
    background: isSel ? "rgba(74,106,255,0.22)" : isH && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
    color: isSel ? c.acL : isH && !disabled ? c.tx : c.ts,
    transition: "background 0.1s, color 0.1s",
  });

  const pickDay = (day: number) => {
    const iso = isoForDay(viewY, viewM, day);
    if (isDisabled(iso)) return;
    onSelect(iso);
    onClose();
    onMode("days");
  };

  const layer = (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 600000 }}
        onClick={e => {
          e.stopPropagation();
          onClose();
          onMode("days");
        }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 600001,
          width: pos.width || 224,
          background: c.sf,
          border: `1px solid ${c.brH}`,
          boxShadow: `0 12px 40px rgba(0,0,0,0.8),0 0 14px ${c.acG}`,
          fontFamily: F,
          animation: "tlrPopIn 0.12s ease both",
        }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})` }} />
        <div style={{ display: "flex", alignItems: "center", padding: "7px 10px 6px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.tx, flex: 1 }}>{label}</span>
          <div
            onClick={e => {
              e.stopPropagation();
              onClose();
              onMode("days");
            }}
            onMouseEnter={() => setHov("cal-x")}
            onMouseLeave={() => setHov(null)}
            style={{ cursor: "default", padding: 3, display: "flex", alignItems: "center" }}
          >
            <IconClose s={14} cl={hov === "cal-x" ? c.rd : c.ts} />
          </div>
        </div>
        <div style={{ height: 2, background: `linear-gradient(90deg,transparent,${c.acB || "rgba(38,67,247,0.22)"},rgba(74,106,255,0.4),${c.acB || "rgba(38,67,247,0.22)"},transparent)` }} />

        <div style={{ display: "flex", alignItems: "center", padding: "5px 4px", borderBottom: `1px solid ${c.br}` }}>
          {mode === "days" && (
            <NavBtn
              label="‹"
              onClick={() => {
                const d = new Date(viewY, viewM - 1, 1);
                onViewY(d.getFullYear());
                onViewM(d.getMonth());
              }}
            />
          )}
          {mode === "months" && <NavBtn label="‹" onClick={() => onViewY(viewY - 1)} />}
          {mode === "years" && <NavBtn label="‹" onClick={() => onYearBase(yearBase - 12)} />}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {(mode === "days" || mode === "months") && (
              <span
                onClick={e => {
                  e.stopPropagation();
                  onMode(mode === "months" ? "days" : "months");
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: mode === "months" ? c.acL : c.tx,
                  cursor: "default",
                  padding: "2px 4px",
                  background: mode === "months" ? "rgba(74,106,255,0.12)" : "transparent",
                }}
              >
                {MON_SHORT[viewM]}
              </span>
            )}
            <span
              onClick={e => {
                e.stopPropagation();
                if (mode !== "years") {
                  onYearBase(Math.floor(viewY / 12) * 12);
                  onMode("years");
                } else {
                  onMode("days");
                }
              }}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: mode === "years" ? c.acL : c.tx,
                cursor: "default",
                padding: "2px 4px",
                background: mode === "years" ? "rgba(74,106,255,0.12)" : "transparent",
              }}
            >
              {mode === "years" ? `${yearBase} – ${yearBase + 11}` : viewY}
            </span>
          </div>
          {mode === "days" && (
            <NavBtn
              label="›"
              onClick={() => {
                const d = new Date(viewY, viewM + 1, 1);
                onViewY(d.getFullYear());
                onViewM(d.getMonth());
              }}
            />
          )}
          {mode === "months" && <NavBtn label="›" onClick={() => onViewY(viewY + 1)} />}
          {mode === "years" && <NavBtn label="›" onClick={() => onYearBase(yearBase + 12)} />}
        </div>

        {mode === "days" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "5px 6px 2px" }}>
              {DOW.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: c.tm }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 6px 8px", gap: 2 }}>
              {Array.from({ length: new Date(viewY, viewM, 1).getDay() }).map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: new Date(viewY, viewM + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const iso = isoForDay(viewY, viewM, day);
                const disabled = isDisabled(iso);
                const isSel = selY === viewY && selMo === viewM && selD === day;
                const isH = hov === `cal-d-${day}`;
                return (
                  <div
                    key={day}
                    onClick={e => {
                      e.stopPropagation();
                      pickDay(day);
                    }}
                    onMouseEnter={() => !disabled && setHov(`cal-d-${day}`)}
                    onMouseLeave={() => setHov(null)}
                    style={{ ...cellSx(isSel, isH, disabled), fontSize: 12, padding: "4px 0", fontWeight: isSel ? 700 : 400 }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === "months" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, padding: 8 }}>
            {MON_SHORT.map((m, i) => {
              const isSel = i === viewM && selY === viewY;
              const isH = hov === `cal-m-${i}`;
              return (
                <div
                  key={m}
                  onClick={e => {
                    e.stopPropagation();
                    onViewM(i);
                    onMode("days");
                  }}
                  onMouseEnter={() => setHov(`cal-m-${i}`)}
                  onMouseLeave={() => setHov(null)}
                  style={{ ...cellSx(isSel, isH, false), padding: "7px 0", fontSize: 12, fontWeight: isSel ? 700 : 500 }}
                >
                  {m}
                </div>
              );
            })}
          </div>
        )}

        {mode === "years" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, padding: 8 }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const yr = yearBase + i;
              const isSel = yr === viewY;
              const isH = hov === `cal-y-${yr}`;
              return (
                <div
                  key={yr}
                  onClick={e => {
                    e.stopPropagation();
                    onViewY(yr);
                    onMode("months");
                  }}
                  onMouseEnter={() => setHov(`cal-y-${yr}`)}
                  onMouseLeave={() => setHov(null)}
                  style={{ ...cellSx(isSel, isH, false), padding: "7px 0", fontSize: 12, fontWeight: isSel ? 700 : 500 }}
                >
                  {yr}
                </div>
              );
            })}
          </div>
        )}

        {minIso && maxIso && (
          <div style={{ padding: "4px 10px 8px", fontSize: 9, color: c.tm, textAlign: "center", borderTop: `1px solid ${c.br}` }}>
            {minIso} → {maxIso}
          </div>
        )}
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(layer, document.body);
}
