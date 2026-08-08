import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * React paint layer for selected Long/Short Position (RR) tools.
 * Visual language mirrors TradingView’s position tool (not Obsidian tape chips).
 * Engine keeps price math + SVG hit-testing; root is pointer-events: none.
 */
function readRrSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    if (typeof window.__v9GetRrOverlaySnapshot === "function") {
      const s = window.__v9GetRrOverlaySnapshot();
      if (s && s.reactChrome) return s;
    }
  } catch (_e) { /* ignore */ }
  const s = window.__v9RrOverlaySnapshot;
  return s && s.reactChrome ? s : null;
}

function useRrOverlaySnapshot(active) {
  const [snap, setSnap] = useState(() => (active ? readRrSnapshot() : null));
  useEffect(() => {
    if (!active) {
      setSnap(null);
      return undefined;
    }
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const next = readRrSnapshot();
      setSnap((prev) => {
        if (!next) return null;
        if (
          prev &&
          prev.id === next.id &&
          prev.ts === next.ts &&
          prev.zoneX1 === next.zoneX1 &&
          prev.entryY === next.entryY &&
          prev.stopY === next.stopY &&
          prev.targetY === next.targetY &&
          prev.hostRect?.left === next.hostRect?.left &&
          prev.hostRect?.top === next.hostRect?.top &&
          prev.hostRect?.width === next.hostRect?.width
        ) {
          return prev;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    const onEvt = () => {
      const next = readRrSnapshot();
      if (next) setSnap(next);
    };
    window.addEventListener("v9-rr-overlay-snapshot", onEvt);
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("v9-rr-overlay-snapshot", onEvt);
    };
  }, [active]);
  return snap;
}

/** TV-style compact label — dark box, no accent rail */
function TvLabel({ tone, children, style }) {
  return (
    <div data-rr-tv-label="" data-tone={tone || "entry"} style={style}>
      {children}
    </div>
  );
}

function TvHandle({ left, top }) {
  return <i data-rr-tv-handle="" style={{ left, top }} />;
}

export default function V9RrToolOverlay({ active = true, slAdvMode = "none" }) {
  const snap = useRrOverlaySnapshot(active);
  if (!active || !snap || !snap.reactChrome) return null;

  const host = snap.hostRect;
  if (!host || !(host.width > 0) || !(host.height > 0)) return null;

  const chartW = Number(snap.chartWidth) > 0 ? Number(snap.chartWidth) : host.width;
  const chartH = Number(snap.chartHeight) > 0 ? Number(snap.chartHeight) : host.height;
  const sX = host.width / chartW;
  const sY = host.height / chartH;
  const px = (x) => host.left + Number(x) * sX;
  const py = (y) => host.top + Number(y) * sY;

  const zoneLeft = px(snap.zoneX1);
  const zoneRight = px(snap.zoneX2);
  const zoneW = Math.max(1, zoneRight - zoneLeft);
  const riskTop = py(Math.min(snap.riskTop, snap.riskBot));
  const riskH = Math.max(0, Math.abs(py(snap.riskBot) - py(snap.riskTop)));
  const rewTop = py(Math.min(snap.rewTop, snap.rewBot));
  const rewH = Math.max(0, Math.abs(py(snap.rewBot) - py(snap.rewTop)));
  const hasMultiEntry = (snap.extraEntries || []).length > 0;
  const hasMultiTp = (snap.extraTargets || []).length > 0;
  const centerY = py(hasMultiEntry && Number.isFinite(snap.avgEntryY) ? snap.avgEntryY : snap.entryY);
  const stopY = py(snap.stopY);
  const targetY = py(snap.targetY);
  const midX = zoneLeft + zoneW / 2;
  const labels = snap.labels || {};
  const modeCue = slAdvMode === "breakeven" ? "BE" : slAdvMode === "trailing" ? "Trail" : null;

  const lotsTxt = labels.lots
    ? String(labels.lots).replace(/\s*lots?/i, "").trim()
    : snap.quantity != null
      ? String(snap.quantity)
      : "—";
  const rrTxt = labels.rr
    ? String(labels.rr).replace(/^R\s*/i, "").trim()
    : snap.rrRatio != null
      ? String(snap.rrRatio)
      : "—";
  const stopAbove = stopY <= centerY;
  const targetAbove = targetY <= centerY;

  const layer = (
    <div data-rr-overlay="" data-rr-style="tv" aria-hidden="true">
      <div
        data-rr-tv-zone=""
        data-tone="sl"
        style={{
          left: zoneLeft,
          top: riskTop,
          width: zoneW,
          height: riskH,
          background: snap.style?.riskColor || "rgba(242, 54, 69, 0.2)",
        }}
      />
      <div
        data-rr-tv-zone=""
        data-tone="tp"
        style={{
          left: zoneLeft,
          top: rewTop,
          width: zoneW,
          height: rewH,
          background: snap.style?.rewardColor || "rgba(8, 153, 129, 0.2)",
        }}
      />

      {/* Level lines — TV uses thin solid edges */}
      <div data-rr-tv-line="" data-tone="sl" style={{ left: zoneLeft, top: stopY, width: zoneW }} />
      <div data-rr-tv-line="" data-tone="entry" style={{ left: zoneLeft, top: centerY, width: zoneW }} />
      <div data-rr-tv-line="" data-tone="tp" style={{ left: zoneLeft, top: targetY, width: zoneW }} />
      {hasMultiEntry ? (
        <div
          data-rr-tv-line=""
          data-tone="entry"
          data-extra="1"
          style={{ left: zoneLeft, top: py(snap.entryY), width: zoneW }}
        />
      ) : null}
      {(snap.extraEntries || []).map((row) => (
        <div
          key={`e-${row.i}`}
          data-rr-tv-line=""
          data-tone="entry"
          data-extra="1"
          style={{ left: zoneLeft, top: py(row.y), width: zoneW }}
        />
      ))}
      {(snap.extraTargets || []).map((row) => (
        <div
          key={`t-${row.i}`}
          data-rr-tv-line=""
          data-tone="tp"
          data-extra="1"
          style={{ left: zoneLeft, top: py(row.y), width: zoneW }}
        />
      ))}
      {Number.isFinite(snap.beY) ? (
        <div
          data-rr-tv-line=""
          data-tone="be"
          style={{ left: zoneLeft, top: py(snap.beY), width: zoneW }}
        />
      ) : null}

      {/* TV labels: Stop / Qty·R / Target — centered on each edge */}
      <TvLabel
        tone="sl"
        style={{
          left: midX,
          top: stopAbove ? stopY - 6 : stopY + 6,
          transform: stopAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        }}
      >
        Stop {labels.stopPrice || "—"}
      </TvLabel>
      <TvLabel tone="entry" style={{ left: midX, top: centerY, transform: "translate(-50%, -50%)" }}>
        {hasMultiEntry && labels.avgEntry
          ? `${labels.avgEntry.replace(/^Avg\s*/i, "Avg ")} · ${lotsTxt} · ${rrTxt}`
          : `${lotsTxt} · ${rrTxt}`}
      </TvLabel>
      <TvLabel
        tone="tp"
        style={{
          left: midX,
          top: targetAbove ? targetY - 6 : targetY + 6,
          transform: targetAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        }}
      >
        Target {labels.targetPrice || "—"}
      </TvLabel>
      {hasMultiTp && labels.avgTp && Number.isFinite(snap.avgTpY) ? (
        <TvLabel tone="tp" style={{ left: midX, top: py(snap.avgTpY), transform: "translate(-50%, -50%)" }}>
          Avg TP
        </TvLabel>
      ) : null}
      {modeCue ? (
        <TvLabel
          tone="be"
          style={{
            left: zoneLeft + 6,
            top: Math.min(stopY, centerY) + Math.abs(stopY - centerY) / 2,
            transform: "translate(0, -50%)",
          }}
        >
          {modeCue}
        </TvLabel>
      ) : null}

      {/* TV-style handles — both edges of stop / entry / target */}
      <TvHandle left={zoneLeft} top={stopY} />
      <TvHandle left={zoneRight} top={stopY} />
      <TvHandle left={zoneLeft} top={centerY} />
      <TvHandle left={zoneRight} top={centerY} />
      <TvHandle left={zoneLeft} top={targetY} />
      <TvHandle left={zoneRight} top={targetY} />
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(layer, document.body);
}
