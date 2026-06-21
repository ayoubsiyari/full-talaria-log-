"use client";

import * as React from "react";
import {
  liveJournalLimitLabel,
  liveJournalLimitMessage,
  type LiveJournalAccountTypeKey,
  type LiveJournalLimitsPayload,
} from "@/lib/liveJournalLimits";

const F = "'Exo 2', sans-serif";

const c = {
  acL: "#4A6AFF",
  sf: "#0A0C14",
  brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.70)",
  tm: "rgba(255,255,255,0.50)",
  rd: "#FF5068",
};

type Props = {
  open: boolean;
  accountType: LiveJournalAccountTypeKey;
  limits: LiveJournalLimitsPayload | null;
  onClose: () => void;
};

export function LiveJournalLimitModal({ open, accountType, limits, onClose }: Props) {
  const [closeHov, setCloseHov] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCloseHov(false);
  }, [open]);

  if (!open || !limits) return null;

  const bucket = limits[accountType];
  const title = `${liveJournalLimitLabel(accountType)} limit reached`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600000,
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
          width: "min(440px,90vw)",
          background: c.sf,
          border: `1px solid ${c.brH}`,
          boxShadow: "0 24px 72px rgba(0,0,0,0.9)",
          fontFamily: F,
        }}
      >
        <div style={{ height: 2, background: c.acL, flexShrink: 0 }} />
        <div style={{ padding: "18px 20px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: c.tx, letterSpacing: "0.02em" }}>{title}</div>
          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45, color: c.ts }}>
            {liveJournalLimitMessage(limits, accountType)}
          </div>
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "rgba(255,80,104,0.08)",
              border: "1px solid rgba(255,80,104,0.18)",
              fontSize: 11,
              color: c.rd,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {liveJournalLimitLabel(accountType)}: {bucket.count}/{bucket.max}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "0 16px 16px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            onMouseEnter={() => setCloseHov(true)}
            onMouseLeave={() => setCloseHov(false)}
            style={{
              padding: "8px 14px",
              border: `1px solid ${closeHov ? c.acL : c.brH}`,
              background: closeHov ? "rgba(74,106,255,0.12)" : "transparent",
              color: closeHov ? c.tx : c.ts,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: F,
              cursor: "default",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
