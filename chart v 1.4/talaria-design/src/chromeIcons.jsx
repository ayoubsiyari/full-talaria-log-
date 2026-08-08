/**
 * Unified HeroUI-style stroke icons for V9 chrome.
 * 24×24 viewBox, stroke 1.5, round caps — one visual weight everywhere.
 */
import React from "react";

const SW = 1.5;

function Svg({ s, cl, children, fill = "none" }) {
  return (
    <svg
      data-chrome-icon="1"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? cl : "none"}
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function L(props) {
  return <line {...props} />;
}
function P(props) {
  return <path {...props} />;
}
function C(props) {
  return <circle {...props} />;
}
function R(props) {
  return <rect {...props} />;
}

/** Map of icon name → render(s, cl) */
const ICONS = {
  crosshair: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="3" x2="12" y2="9" />
      <L x1="12" y1="15" x2="12" y2="21" />
      <L x1="3" y1="12" x2="9" y2="12" />
      <L x1="15" y1="12" x2="21" y2="12" />
      <C cx="12" cy="12" r="2.25" />
    </Svg>
  ),
  cursorDot: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <C cx="12" cy="12" r="3.5" fill={cl} stroke="none" />
    </Svg>
  ),
  cursorArrow: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M5 3 L5 17 L9 13 L12 20 L14.5 19 L11.5 12 L17 12 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  /* ── Drawing: lines (each silhouette unique at 16–18px) ── */
  trendline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="18" x2="20" y2="6" />
      <C cx="4" cy="18" r="2" fill={cl} stroke="none" />
      <C cx="20" cy="6" r="2" fill={cl} stroke="none" />
    </Svg>
  ),
  hray: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="4" cy="12" r="2" fill={cl} stroke="none" />
      <L x1="6" y1="12" x2="16.5" y2="12" />
      <P d="M16 8.5 L21 12 L16 15.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  hline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="6.5" y1="12" x2="17.5" y2="12" />
      <P d="M3 12 L6.5 9.2 V14.8 Z" fill={cl} stroke="none" />
      <P d="M21 12 L17.5 9.2 V14.8 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  vline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="6.5" x2="12" y2="17.5" />
      <P d="M12 3 L9.2 6.5 H14.8 Z" fill={cl} stroke="none" />
      <P d="M12 21 L9.2 17.5 H14.8 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  ray: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="5" cy="17" r="2" fill={cl} stroke="none" />
      <L x1="6.5" y1="15.5" x2="15" y2="7" />
      <P d="M14.2 4.2 L20.2 5.2 L16.2 10.2 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Infinite both ways — arrows past the two anchors. */
  extendedLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3.5" y1="18.5" x2="20.5" y2="5.5" />
      <C cx="9" cy="14" r="1.75" fill={cl} stroke="none" />
      <C cx="15" cy="9.5" r="1.75" fill={cl} stroke="none" />
      <P d="M3.2 15.2 L3.5 18.5 L6.8 18.2" />
      <P d="M17.2 5.8 L20.5 5.5 L20.2 8.8" />
    </Svg>
  ),
  /** Price × time cross through one point. */
  crossLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="12" x2="21" y2="12" />
      <L x1="12" y1="3" x2="12" y2="21" />
      <C cx="12" cy="12" r="2" fill={cl} stroke="none" />
    </Svg>
  ),
  polyline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 17.5 L8 7 L13.5 14.5 L20.5 5.5" />
      <C cx="3.5" cy="17.5" r="1.6" fill={cl} stroke="none" />
      <C cx="8" cy="7" r="1.6" fill={cl} stroke="none" />
      <C cx="13.5" cy="14.5" r="1.6" fill={cl} stroke="none" />
      <C cx="20.5" cy="5.5" r="1.6" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Directed multi-segment path (arrowed end). */
  pathTool: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 16 L8 7 L13 13 L17.5 7" />
      <C cx="4" cy="16" r="1.6" fill={cl} stroke="none" />
      <C cx="8" cy="7" r="1.6" fill={cl} stroke="none" />
      <C cx="13" cy="13" r="1.6" fill={cl} stroke="none" />
      <P d="M16.2 4.5 L21 7 L16.2 9.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  curve: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 C6 6 14 4 20 9" />
      <C cx="4" cy="18" r="1.6" fill={cl} stroke="none" />
      <C cx="20" cy="9" r="1.6" fill={cl} stroke="none" />
      <C cx="11" cy="6.5" r="1.25" />
    </Svg>
  ),
  /** S-curve with mid handle — distinct from single curve. */
  doubleCurve: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 18 C5 8 10 18 12 11 C14 4 18 12 20.5 6" />
      <C cx="3.5" cy="18" r="1.5" fill={cl} stroke="none" />
      <C cx="12" cy="11" r="1.5" fill={cl} stroke="none" />
      <C cx="20.5" cy="6" r="1.5" fill={cl} stroke="none" />
    </Svg>
  ),
  rect: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5.5" width="16" height="13" rx="2" />
    </Svg>
  ),
  triangle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 L20.5 19.5 H3.5 Z" />
    </Svg>
  ),
  circle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="8" />
    </Svg>
  ),
  ellipse: (s, cl) => (
    <Svg s={s} cl={cl}>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
    </Svg>
  ),
  arcShape: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 17.5 Q12 2.5 20 17.5" />
      <C cx="4" cy="17.5" r="1.5" fill={cl} stroke="none" />
      <C cx="20" cy="17.5" r="1.5" fill={cl} stroke="none" />
    </Svg>
  ),
  arrowMarker: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 3.5 L15 13.5 H18.5 L12 20.5 L5.5 13.5 H9 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Diagonal arrowed line (not a corner “external link”). */
  arrowLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="18" x2="15.5" y2="7.5" />
      <P d="M12.5 5 L19.5 5.5 L16 11.5 Z" fill={cl} stroke="none" />
      <C cx="5" cy="18" r="1.6" fill={cl} stroke="none" />
    </Svg>
  ),
  arrowUp: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 3.5 L5.5 12.5 H9.5 V20.5 H14.5 V12.5 H18.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  arrowDn: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 20.5 L5.5 11.5 H9.5 V3.5 H14.5 V11.5 H18.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  draw: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 19 C6.5 19 7.5 15.5 10 15.5 C12.5 15.5 13 19 16 19" />
      <P d="M13.5 4.5 L19.5 10.5 L10.5 19.5 H4.5 V13.5 Z" />
    </Svg>
  ),
  /** Highlighter — broad tip stroke. */
  brush: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 16.5 L14.5 4.5 L19.5 8 L12 20 H7 Z" />
      <P d="M7 16.5 C5.5 18 6 20.5 8.5 20.5" />
      <L x1="9" y1="14" x2="16" y2="6.5" opacity="0.45" />
    </Svg>
  ),
  eraser: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M15.5 4.5 L20 9 L11 18 H5.5 L4.5 17 L13.5 8 Z" />
      <L x1="6.5" y1="15.5" x2="11" y2="20" />
      <L x1="4" y1="20.5" x2="14" y2="20.5" opacity="0.55" />
    </Svg>
  ),
  channel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="17.5" x2="21" y2="11" />
      <L x1="3" y1="11.5" x2="21" y2="5" />
      <L x1="3" y1="14.5" x2="21" y2="8" strokeDasharray="2.5 2.5" opacity="0.55" />
    </Svg>
  ),
  regressionCh: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="18.5" x2="21" y2="12" />
      <L x1="3" y1="10.5" x2="21" y2="4" />
      <L x1="3" y1="14.5" x2="21" y2="8" strokeDasharray="2 2.5" />
      <C cx="7" cy="13.2" r="1.1" fill={cl} stroke="none" />
      <C cx="12" cy="11" r="1.1" fill={cl} stroke="none" />
      <C cx="17" cy="8.8" r="1.1" fill={cl} stroke="none" />
    </Svg>
  ),
  flatChannel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="6.5" x2="21" y2="6.5" />
      <L x1="3" y1="17.5" x2="21" y2="12.5" />
      <L x1="3" y1="12" x2="21" y2="9.5" strokeDasharray="2.5 2.5" opacity="0.5" />
    </Svg>
  ),
  disjointCh: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="7" x2="10" y2="5" />
      <L x1="14" y1="8.5" x2="21" y2="6.5" />
      <L x1="3" y1="16.5" x2="10" y2="14.5" />
      <L x1="14" y1="18" x2="21" y2="16" />
      <L x1="10.5" y1="5.5" x2="13.5" y2="8" strokeDasharray="1.5 2" opacity="0.45" />
      <L x1="10.5" y1="15" x2="13.5" y2="17.5" strokeDasharray="1.5 2" opacity="0.45" />
    </Svg>
  ),
  pitchfork: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="4.5" cy="12" r="1.6" fill={cl} stroke="none" />
      <C cx="19.5" cy="5" r="1.6" fill={cl} stroke="none" />
      <C cx="19.5" cy="19" r="1.6" fill={cl} stroke="none" />
      <L x1="4.5" y1="12" x2="19.5" y2="12" />
      <L x1="11.5" y1="8.5" x2="19.5" y2="5" />
      <L x1="11.5" y1="15.5" x2="19.5" y2="19" />
    </Svg>
  ),
  fib: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="5.5" x2="20" y2="5.5" />
      <L x1="4" y1="9.5" x2="20" y2="9.5" opacity="0.8" />
      <L x1="4" y1="14" x2="20" y2="14" opacity="0.55" />
      <L x1="4" y1="18.5" x2="20" y2="18.5" opacity="0.35" />
      <L x1="4" y1="5.5" x2="4" y2="18.5" opacity="0.4" />
    </Svg>
  ),
  /** Retracement base + projected extension levels. */
  fibExtension: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 16 L9 7 L14 12" />
      <C cx="4" cy="16" r="1.4" fill={cl} stroke="none" />
      <C cx="9" cy="7" r="1.4" fill={cl} stroke="none" />
      <C cx="14" cy="12" r="1.4" fill={cl} stroke="none" />
      <L x1="14" y1="8" x2="21" y2="8" opacity="0.85" />
      <L x1="14" y1="12" x2="21" y2="12" opacity="0.55" />
      <L x1="14" y1="16.5" x2="21" y2="16.5" opacity="0.35" />
    </Svg>
  ),
  fibChannel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="18.5" x2="21" y2="10" />
      <L x1="3" y1="15" x2="21" y2="6.5" opacity="0.7" />
      <L x1="3" y1="11.5" x2="21" y2="3" opacity="0.4" />
    </Svg>
  ),
  fibTimeZone: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5.5" y1="4" x2="5.5" y2="20" />
      <L x1="9.5" y1="4" x2="9.5" y2="20" opacity="0.8" />
      <L x1="14.5" y1="4" x2="14.5" y2="20" opacity="0.5" />
      <L x1="19" y1="4" x2="19" y2="20" opacity="0.3" />
      <L x1="4" y1="20" x2="20" y2="20" opacity="0.35" />
    </Svg>
  ),
  fibFan: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="4" cy="19" r="1.5" fill={cl} stroke="none" />
      <L x1="4" y1="19" x2="20" y2="4.5" />
      <L x1="4" y1="19" x2="20" y2="10" opacity="0.65" />
      <L x1="4" y1="19" x2="20" y2="15.5" opacity="0.4" />
    </Svg>
  ),
  fibCircles: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="3.2" />
      <C cx="12" cy="12" r="6.2" opacity="0.6" />
      <C cx="12" cy="12" r="9.2" opacity="0.35" />
    </Svg>
  ),
  fibSpiral: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 12 C12 10.2 13.8 9 15.4 9 C17.8 9 19.4 11 19.4 13.4 C19.4 17 16.4 20 12.4 20 C7.6 20 4.6 16 4.6 11.6 C4.6 6.2 9 3.2 14.4 3.2" />
    </Svg>
  ),
  fibArcs: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="4" cy="19" r="1.5" fill={cl} stroke="none" />
      <P d="M4 19 Q4 11.5 12 11.5" />
      <P d="M4 19 Q4 7.5 16 7.5" opacity="0.6" />
      <P d="M4 19 Q4 4 20 4" opacity="0.35" />
    </Svg>
  ),
  fibWedge: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 19 L12 4 L20 19" />
      <L x1="7" y1="13.5" x2="17" y2="13.5" opacity="0.55" />
      <L x1="8.5" y1="10" x2="15.5" y2="10" opacity="0.35" />
    </Svg>
  ),
  fibTime: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 17.5 L9 6.5 L14 13.5 L20 5" />
      <L x1="4" y1="4" x2="4" y2="20" opacity="0.4" />
      <L x1="9" y1="4" x2="9" y2="20" opacity="0.4" />
      <L x1="14" y1="4" x2="14" y2="20" opacity="0.4" />
      <L x1="20" y1="4" x2="20" y2="20" opacity="0.25" />
    </Svg>
  ),
  gannBox: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="16" height="16" rx="1.5" />
      <L x1="4" y1="12" x2="20" y2="12" opacity="0.45" />
      <L x1="12" y1="4" x2="12" y2="20" opacity="0.45" />
      <L x1="4" y1="8" x2="20" y2="8" opacity="0.25" />
      <L x1="4" y1="16" x2="20" y2="16" opacity="0.25" />
    </Svg>
  ),
  gannSquare: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="16" height="16" rx="1.5" />
      <L x1="4" y1="4" x2="20" y2="20" opacity="0.55" />
      <L x1="20" y1="4" x2="4" y2="20" opacity="0.55" />
    </Svg>
  ),
  gannFan: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="4" cy="20" r="1.4" fill={cl} stroke="none" />
      <L x1="4" y1="20" x2="20" y2="4" />
      <L x1="4" y1="20" x2="20" y2="9.5" opacity="0.65" />
      <L x1="4" y1="20" x2="20" y2="15.5" opacity="0.4" />
      <L x1="4" y1="20" x2="13.5" y2="4" opacity="0.65" />
    </Svg>
  ),
  /** Impulse 1–2–3–4–5. */
  elliott5: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 15 L6.5 6 L10 14 L14 4.5 L17.5 12.5 L21 7" />
      <C cx="3" cy="15" r="1.2" fill={cl} stroke="none" />
      <C cx="21" cy="7" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Correction A–B–C. */
  elliottABC: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 7 L9 17 L14.5 9 L20.5 16" />
      <C cx="3.5" cy="7" r="1.2" fill={cl} stroke="none" />
      <C cx="20.5" cy="16" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Contracting triangle A–B–C–D–E. */
  elliottTri: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 6 L7.5 17 L11.5 8 L15.5 15 L19 10.5 L20.5 13" />
      <L x1="3.5" y1="5" x2="20.5" y2="11" opacity="0.35" />
      <L x1="3.5" y1="19" x2="20.5" y2="13.5" opacity="0.35" />
    </Svg>
  ),
  /** Double combo W–X–Y. */
  elliottWXY: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 10 L6 16 L9 8 L12 14 L15 7 L18 15 L21 9" />
    </Svg>
  ),
  /** Triple combo W–X–Y–X–Z. */
  elliottWXYXZ: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M2.5 11 L5 17 L7.5 9 L10 15 L12.5 7 L15 14 L17.5 8 L20 16 L21.5 10" />
    </Svg>
  ),
  wave: (s, cl) => ICONS.elliott5(s, cl),
  xabcd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 9 L7.5 15.5 L12 4.5 L16.5 14 L21 3.5" />
      <C cx="3" cy="9" r="1.2" fill={cl} stroke="none" />
      <C cx="12" cy="4.5" r="1.2" fill={cl} stroke="none" />
      <C cx="21" cy="3.5" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  abcdPattern: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 7 L9 16 L14.5 6 L20.5 15" />
      <C cx="3.5" cy="7" r="1.2" fill={cl} stroke="none" />
      <C cx="20.5" cy="15" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  headShoulders: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 16.5 L6.5 11 L9.5 14.5 L12 4.5 L14.5 14.5 L17.5 11 L21 16.5" />
      <L x1="3.5" y1="16.5" x2="20.5" y2="16.5" opacity="0.5" />
    </Svg>
  ),
  triPattern: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="5" x2="21" y2="11.5" />
      <L x1="3" y1="19" x2="21" y2="12.5" />
      <P d="M5 7.5 L8 15.5 L11 9 L14 14 L17 10.5" opacity="0.55" />
    </Svg>
  ),
  threeDrives: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 15.5 L6 7 L9 14 L12.5 4.5 L16 13 L20.5 3.5" />
      <L x1="6" y1="7" x2="6" y2="17" opacity="0.3" />
      <L x1="12.5" y1="4.5" x2="12.5" y2="17" opacity="0.3" />
      <L x1="20.5" y1="3.5" x2="20.5" y2="17" opacity="0.3" />
    </Svg>
  ),
  text: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 6.5 H19" />
      <P d="M12 6.5 V19" />
      <P d="M8.5 19 H15.5" />
    </Svg>
  ),
  /** Sticky note with fold. */
  note: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 4 H15.5 L19 7.5 V20 H5 Z" />
      <P d="M15.5 4 V7.5 H19" />
      <L x1="8" y1="11" x2="16" y2="11" />
      <L x1="8" y1="14.5" x2="13.5" y2="14.5" opacity="0.55" />
    </Svg>
  ),
  /** Speech bubble — distinct from sticky note. */
  comment: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4.5 5.5 H19.5 V14.5 H11 L7 18.5 V14.5 H4.5 Z" />
      <L x1="8" y1="9" x2="16" y2="9" />
      <L x1="8" y1="12" x2="13" y2="12" opacity="0.55" />
    </Svg>
  ),
  priceNote: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 4 H15.5 L19 7.5 V20 H5 Z" />
      <P d="M15.5 4 V7.5 H19" />
      <P d="M10.5 10.5 H13.2 C14.1 10.5 14.7 11.1 14.7 11.9 C14.7 12.7 14.1 13.3 13.2 13.3 H10.5 V15.5 M10.5 10.5 V15.5 M9.3 12.1 H14.5 M9.3 14 H13.5" />
    </Svg>
  ),
  callout: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 5 H18 V12.5 H12.5 L9 17 V12.5 H4 Z" />
      <L x1="7" y1="8.5" x2="15" y2="8.5" />
      <P d="M16.5 14.5 L20.5 19.5" />
      <C cx="20.5" cy="19.5" r="1.4" fill={cl} stroke="none" />
    </Svg>
  ),
  priceLabel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 9 L8 5.5 H20.5 V18.5 H8 L3.5 15 Z" />
      <L x1="11" y1="10" x2="17" y2="10" />
      <L x1="11" y1="14" x2="15" y2="14" opacity="0.55" />
    </Svg>
  ),
  signpost: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7.5" y1="3.5" x2="7.5" y2="20.5" />
      <P d="M7.5 5 H18.5 L16.5 8.5 L18.5 12 H7.5" />
    </Svg>
  ),
  /** Pennant / flag mark — triangle on a pole. */
  flag: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7" y1="3.5" x2="7" y2="20.5" />
      <P d="M7 4.5 L18.5 8.5 L7 12.5 Z" />
    </Svg>
  ),
  image: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5.5" width="16" height="13" rx="2" />
      <C cx="9" cy="10" r="1.5" fill={cl} stroke="none" />
      <P d="M4.5 16 L9 12 L12 14.5 L16 11 L19.5 14.5" />
    </Svg>
  ),
  emoji: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="8" />
      <C cx="9.5" cy="10.5" r="0.9" fill={cl} stroke="none" />
      <C cx="14.5" cy="10.5" r="0.9" fill={cl} stroke="none" />
      <P d="M9 14.5 Q12 17 15 14.5" />
    </Svg>
  ),
  volProfile: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="4" x2="5" y2="20" />
      <R x="6" y="5.5" width="5.5" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.4" />
      <R x="6" y="9.5" width="10" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.7" />
      <R x="6" y="13.5" width="12" height="2" rx="0.5" fill={cl} stroke="none" />
      <R x="6" y="17.5" width="7.5" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.55" />
    </Svg>
  ),
  /** Volume profile with anchor point. */
  anchoredVol: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="5" cy="5" r="2" />
      <L x1="5" y1="7" x2="5" y2="20" />
      <R x="6.5" y="8" width="5" height="1.8" rx="0.4" fill={cl} stroke="none" opacity="0.45" />
      <R x="6.5" y="11.5" width="10" height="1.8" rx="0.4" fill={cl} stroke="none" opacity="0.75" />
      <R x="6.5" y="15" width="12" height="1.8" rx="0.4" fill={cl} stroke="none" />
      <R x="6.5" y="18.5" width="7" height="1.8" rx="0.4" fill={cl} stroke="none" opacity="0.55" />
    </Svg>
  ),
  /** Anchored VWAP — anchor + volume-weighted curve. */
  vwap: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="5" cy="6" r="2" />
      <P d="M5 8 C8 8 9 16 13 12 C16 9 18 15 21 11" />
      <L x1="3.5" y1="19.5" x2="20.5" y2="19.5" opacity="0.35" />
    </Svg>
  ),
  longPos: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="13.5" width="16" height="5.5" rx="1.2" />
      <R x="6" y="5" width="12" height="5.5" rx="1.2" opacity="0.45" />
      <P d="M12 13.5 V8.5 M9.5 10.5 L12 7.5 L14.5 10.5" />
    </Svg>
  ),
  shortPos: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5" width="16" height="5.5" rx="1.2" />
      <R x="6" y="13.5" width="12" height="5.5" rx="1.2" opacity="0.45" />
      <P d="M12 10.5 V15.5 M9.5 13.5 L12 16.5 L14.5 13.5" />
    </Svg>
  ),
  /** Range / measure — bidirectional bar with ticks. */
  measure: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="12" x2="20" y2="12" />
      <P d="M4 12 L7 9.2 V14.8 Z" fill={cl} stroke="none" />
      <P d="M20 12 L17 9.2 V14.8 Z" fill={cl} stroke="none" />
      <L x1="10" y1="9.5" x2="10" y2="14.5" />
      <L x1="14" y1="9.5" x2="14" y2="14.5" />
    </Svg>
  ),
  magnet: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 4 V10 C7 14 9.5 16 12 16 C14.5 16 17 14 17 10 V4" />
      <L x1="5" y1="4" x2="9" y2="4" />
      <L x1="15" y1="4" x2="19" y2="4" />
    </Svg>
  ),
  magnetOff: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 4 V10 C7 14 9.5 16 12 16 C14.5 16 17 14 17 10 V4" />
      <L x1="6" y1="18" x2="18" y2="20" />
      <L x1="18" y1="18" x2="6" y2="20" />
    </Svg>
  ),
  magnetWeak: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 4 V10 C7 14 9.5 16 12 16 C14.5 16 17 14 17 10 V4" />
      <P d="M8 18 Q12 21 16 18" />
    </Svg>
  ),
  magnetStrong: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 4 V10 C7 14 9.5 16 12 16 C14.5 16 17 14 17 10 V4" />
      <P d="M8 17.5 Q12 20.5 16 17.5" />
      <P d="M7 20.5 Q12 23.5 17 20.5" />
    </Svg>
  ),
  /** Project pin — simple HeroUI stroke thumbtack (head + needle). Used for rail pinbar, tool/TF/indicator pins. */
  pin: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="3" x2="12" y2="6" />
      <P d="M8 6 H16 L14.5 12 H9.5 Z" />
      <L x1="12" y1="12" x2="12" y2="20" />
    </Svg>
  ),
  pinFill: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="3" x2="12" y2="6" />
      <P d="M8 6 H16 L14.5 12 H9.5 Z" fill={cl} />
      <L x1="12" y1="12" x2="12" y2="20" />
    </Svg>
  ),
  eye: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 12 C6 7 9 5 12 5 C15 5 18 7 21 12 C18 17 15 19 12 19 C9 19 6 17 3 12 Z" />
      <C cx="12" cy="12" r="2.5" />
    </Svg>
  ),
  /** Hide drawings — eye + diagonal stroke. */
  eyeAll: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 11 C5.5 7.5 8.5 5.5 11 5.5 C13.5 5.5 16 7 18.5 11" />
      <C cx="11" cy="11" r="2.1" />
      <L x1="5" y1="16" x2="19" y2="16" />
      <C cx="5" cy="16" r="1.2" fill={cl} stroke="none" />
      <C cx="19" cy="16" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Hide indicators — eye + study curve. */
  eyeInd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 10.5 C5.5 7 8.5 5.5 11 5.5 C13.5 5.5 16 7 18.5 10.5" />
      <C cx="11" cy="10.5" r="2" />
      <P d="M4 18 C7.5 18 9 13 12.5 14.5 C15.5 15.8 17 18 20 16" />
    </Svg>
  ),
  eyePos: (s, cl) => ICONS.eye(s, cl),
  eyeHide: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 12 C6 7 9 5 12 5 C15 5 18 7 21 12 C18 17 15 19 12 19 C9 19 6 17 3 12 Z" />
      <C cx="12" cy="12" r="2.5" />
      <L x1="5" y1="19" x2="19" y2="5" />
    </Svg>
  ),
  trash: (s, cl) => (
    <Svg s={s} cl={cl}>
      {/* Slightly fuller viewBox so optical weight matches eye/settings at 15px */}
      <L x1="4.5" y1="6.5" x2="19.5" y2="6.5" />
      <P d="M9 6.5 V4.5 H15 V6.5" />
      <P d="M6.5 6.5 L7.5 20 H16.5 L17.5 6.5" />
    </Svg>
  ),
  /** Delete drawings — trash + line mark. */
  trashDraw: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="6.5" x2="15" y2="6.5" />
      <P d="M8 6.5 V5 H13 V6.5" />
      <P d="M6.5 6.5 L7.5 17 H13.5 L14.5 6.5" />
      <L x1="16" y1="12" x2="21" y2="18" />
      <C cx="16" cy="12" r="1.2" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Delete indicators — trash + bars. */
  trashInd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4.5" y1="6.5" x2="14.5" y2="6.5" />
      <P d="M7.5 6.5 V5 H12.5 V6.5" />
      <P d="M6 6.5 L7 17 H13 L14 6.5" />
      <L x1="17" y1="18" x2="17" y2="12" />
      <L x1="19.5" y1="18" x2="19.5" y2="9" />
      <L x1="22" y1="18" x2="22" y2="14" />
    </Svg>
  ),
  undo: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M9 14 L4 9 L9 4" />
      <P d="M4 9 H14 C17 9 19 11 19 14 C19 17 17 19 14 19 H10" />
    </Svg>
  ),
  redo: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M15 14 L20 9 L15 4" />
      <P d="M20 9 H10 C7 9 5 11 5 14 C5 17 7 19 10 19 H14" />
    </Svg>
  ),
  lock: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="6" y="11" width="12" height="9" rx="2" />
      <P d="M8 11 V8 C8 5.8 9.8 4 12 4 C14.2 4 16 5.8 16 8 V11" />
    </Svg>
  ),
  settings: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="3" />
      <P d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.3.8.48 1.26.48H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  ),
  config: (s, cl) => ICONS.settings(s, cl),
  user: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="9" r="3.5" />
      <P d="M5 19 C5 15.5 8 14 12 14 C16 14 19 15.5 19 19" />
    </Svg>
  ),
  help: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="8.5" />
      <P d="M9.5 9.5 C9.5 7.5 10.8 6.5 12.2 6.5 C13.7 6.5 15 7.5 15 9 C15 10.5 13.5 11.2 12.5 12 V13.5" />
      <C cx="12.5" cy="16.5" r="0.8" fill={cl} stroke="none" />
    </Svg>
  ),
  layout: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="7" height="7" rx="1.5" />
      <R x="13" y="4" width="7" height="7" rx="1.5" />
      <R x="4" y="13" width="7" height="7" rx="1.5" />
      <R x="13" y="13" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  /** Templates — 2×2 grid with + in the empty slot (shared trigger). */
  template: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <R x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <R x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <L x1="17" y1="14" x2="17" y2="20.5" strokeWidth={1.85} />
      <L x1="13.75" y1="17.25" x2="20.25" y2="17.25" strokeWidth={1.85} />
    </Svg>
  ),
  /** Alias used by older call sites. */
  templates: (s, cl) => ICONS.template(s, cl),
  /**
   * Line / border color — framed stroke (not the active tool glyph).
   * Pair with a color swatch in the quick bar.
   */
  lineColor: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <L x1="4.5" y1="4.5" x2="19.5" y2="19.5" opacity="0.35" />
      <P d="M8 16.5 L15.5 9 L18 11.5 L10.5 19 H8 Z" fill={cl} stroke="none" opacity="0.9" />
    </Svg>
  ),
  /** Fill / background color — paint bucket with drip. */
  fill: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M8 11.5 L13.5 4 L19 11.5 Z" />
      <P d="M7.5 12 H18.5 C19.6 12 20.2 12.8 20.2 14 C20.2 16.4 18 18.8 15.2 18.8 H10.8 C8 18.8 5.8 16.4 5.8 14 C5.8 12.8 6.4 12 7.5 12 Z" />
      <P d="M10 18.8 C10 20.6 11.2 21.8 12.6 21.8 C14 21.8 15.2 20.6 15.2 18.8" />
    </Svg>
  ),
  /** Stroke / line style — solid · dash · dot samples stacked. */
  strokeStyle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3.5" y1="6" x2="20.5" y2="6" strokeWidth={1.75} />
      <L x1="3.5" y1="12" x2="8" y2="12" strokeWidth={1.75} />
      <L x1="10.5" y1="12" x2="15" y2="12" strokeWidth={1.75} />
      <L x1="17.5" y1="12" x2="20.5" y2="12" strokeWidth={1.75} />
      <C cx="5" cy="18" r="1.35" fill={cl} stroke="none" />
      <C cx="10" cy="18" r="1.35" fill={cl} stroke="none" />
      <C cx="15" cy="18" r="1.35" fill={cl} stroke="none" />
      <C cx="20" cy="18" r="1.35" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Line thickness — three increasing weights. */
  lineWeight: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="6.5" x2="20" y2="6.5" strokeWidth={1.25} />
      <L x1="4" y1="12" x2="20" y2="12" strokeWidth={2.25} />
      <L x1="4" y1="17.5" x2="20" y2="17.5" strokeWidth={3.25} />
    </Svg>
  ),
  tree: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 V10 M12 10 H7 V16 M12 10 H17 V16 M7 16 H5 V20 M7 16 H9 V20 M17 16 H15 V20 M17 16 H19 V20" />
    </Svg>
  ),
  /** Stacked panes — Objects panel header (not org-tree). */
  layers: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 8.5 L12 4.5 L20 8.5 L12 12.5 Z" />
      <P d="M4 12.5 L12 16.5 L20 12.5" />
      <P d="M4 15.5 L12 19.5 L20 15.5" />
    </Svg>
  ),
  /** Moving-average study — smooth curve over price. */
  indMa: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3.5 17 C7 17 8 7 12 7 C16 7 17 15 20.5 11" />
      <L x1="3.5" y1="19.5" x2="20.5" y2="19.5" />
    </Svg>
  ),
  /** Oscillator (RSI / Stoch) — wave in a band. */
  indOsc: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="3.5" y="5" width="17" height="14" rx="2" />
      <L x1="5.5" y1="9" x2="18.5" y2="9" />
      <L x1="5.5" y1="15" x2="18.5" y2="15" />
      <P d="M5.5 13.5 C8 16 10 8 12.5 10.5 C15 13 16.5 7.5 18.5 9.5" />
    </Svg>
  ),
  /** MACD — histogram + signal. */
  indMacd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="12" x2="5" y2="17" />
      <L x1="9" y1="8" x2="9" y2="17" />
      <L x1="13" y1="10" x2="13" y2="17" />
      <L x1="17" y1="6" x2="17" y2="17" />
      <P d="M4 14.5 C8 14.5 10 9 14 9 C17 9 18 12 20 11" />
    </Svg>
  ),
  /** Volume — bar histogram. */
  indVolume: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="18" x2="5" y2="12" />
      <L x1="9" y1="18" x2="9" y2="7" />
      <L x1="13" y1="18" x2="13" y2="11" />
      <L x1="17" y1="18" x2="17" y2="5" />
      <L x1="3.5" y1="18.5" x2="20.5" y2="18.5" />
    </Svg>
  ),
  /** Channel / bands study. */
  indBands: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 8 C8 5 12 5 20 8" />
      <P d="M4 12 C9 12 12 11 20 12" />
      <P d="M4 16 C8 19 12 19 20 16" />
    </Svg>
  ),
  news: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5" width="16" height="14" rx="2" />
      <L x1="8" y1="9" x2="16" y2="9" />
      <L x1="8" y1="12" x2="14" y2="12" />
      <L x1="8" y1="15" x2="12" y2="15" />
    </Svg>
  ),
  screenshot: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 8 H8 L10 5 H14 L16 8 H20 V19 H4 Z" />
      <C cx="12" cy="13" r="3" />
    </Svg>
  ),
  expand: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M9 4 H4 V9 M15 4 H20 V9 M4 15 V20 H9 M20 15 V20 H15" />
    </Svg>
  ),
  compress: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 9 H9 V4 M15 4 V9 H20 M4 15 H9 V20 M20 15 H15 V20" />
    </Svg>
  ),
  /* Price candle + study curve — toolbar/window glyph for Indicators. */
  indicator: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7.5" y1="3.5" x2="7.5" y2="8" />
      <R x={5} y={8} width={5} height={8} rx={1} />
      <L x1="7.5" y1="16" x2="7.5" y2="20.5" />
      <P d="M13.5 18 C15 18 15.5 8.5 18 8.5 C20 8.5 20.5 15 23 11.5" />
    </Svg>
  ),
  search: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="11" cy="11" r="6" />
      <L x1="15.5" y1="15.5" x2="20" y2="20" />
    </Svg>
  ),
  download: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 V15" />
      <P d="M8 12 L12 16 L16 12" />
      <P d="M5 20 H19" />
    </Svg>
  ),
  x: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="6" y1="6" x2="18" y2="18" />
      <L x1="18" y1="6" x2="6" y2="18" />
    </Svg>
  ),
  check: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 12 L10 17 L19 7" />
    </Svg>
  ),
  plus: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="5" x2="12" y2="19" />
      <L x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  minus: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  chevDown: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 10 L12 15 L17 10" />
    </Svg>
  ),
  chevRight: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M10 7 L15 12 L10 17" />
    </Svg>
  ),
  grip: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      {[7, 12, 17].flatMap((y) =>
        [9, 15].map((x) => <C key={`${x}-${y}`} cx={x} cy={y} r="1.25" fill={cl} stroke="none" />)
      )}
    </Svg>
  ),
  /** Phone tools toggle — three-line menu. */
  menu: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="7" x2="19" y2="7" />
      <L x1="5" y1="12" x2="19" y2="12" />
      <L x1="5" y1="17" x2="19" y2="17" />
    </Svg>
  ),
  chat: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 5 H19 V14 H11 L6 18 V14 H5 Z" />
    </Svg>
  ),
  send: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 11 L20 5 L14 19 L12 13 Z" />
    </Svg>
  ),
  attach: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M15 7 V15 C15 17.2 13.2 19 11 19 C8.8 19 7 17.2 7 15 V7 C7 5.3 8.3 4 10 4 C11.7 4 13 5.3 13 7 V14" />
    </Svg>
  ),
  home: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 11 L12 4 L20 11 V19 H14 V14 H10 V19 H4 Z" />
    </Svg>
  ),
  link: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M10 13 C10.5 14.5 12 15.5 13.5 15.5 H16 C18 15.5 19.5 14 19.5 12 C19.5 10 18 8.5 16 8.5 H14" />
      <P d="M14 11 C13.5 9.5 12 8.5 10.5 8.5 H8 C6 8.5 4.5 10 4.5 12 C4.5 14 6 15.5 8 15.5 H10" />
    </Svg>
  ),
  bell: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M7 10 C7 7 9 5 12 5 C15 5 17 7 17 10 V15 H7 Z" />
      <P d="M10 17 C10.5 18.5 11.2 19 12 19 C12.8 19 13.5 18.5 14 17" />
      <L x1="5" y1="15" x2="19" y2="15" />
    </Svg>
  ),
  goto: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="16" height="16" rx="3" />
      <P d="M8 10 H13 M13 10 L11 8 M13 10 L11 12 M8 15 H16" />
    </Svg>
  ),
  /**
   * Rollback — go back in time on the chart.
   * History/restore mark: open CCW ring + corner arrow + clock hands (reads at 18px).
   */
  rollback: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 12 A8 8 0 1 0 6.5 6.2" />
      <P d="M4 4.2 V9.2 H9" />
      <L x1="12" y1="8" x2="12" y2="12.5" />
      <L x1="12" y1="12.5" x2="15.2" y2="14.5" />
    </Svg>
  ),
  /** Replay step interval — stopwatch (how long each step advances). */
  stepSize: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="2.5" x2="12" y2="5" />
      <L x1="9.5" y1="3.5" x2="14.5" y2="3.5" />
      <C cx="12" cy="13.5" r="7" />
      <L x1="12" y1="13.5" x2="12" y2="9.25" />
      <L x1="12" y1="13.5" x2="16.25" y2="12.25" />
      <L x1="18.2" y1="8.6" x2="19.7" y2="7.1" />
    </Svg>
  ),
  locate: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="11" r="3" />
      <P d="M12 21 C12 21 5 14.5 5 10.5 C5 6.9 8.1 4 12 4 C15.9 4 19 6.9 19 10.5 C19 14.5 12 21 12 21 Z" />
    </Svg>
  ),
  cut: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="7" cy="7" r="2.5" />
      <C cx="7" cy="17" r="2.5" />
      <L x1="9" y1="9" x2="20" y2="12" />
      <L x1="9" y1="15" x2="20" y2="12" />
    </Svg>
  ),
  play: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M8 6 L18 12 L8 18 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  pause: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="7" y="6" width="3.5" height="12" rx="1" fill={cl} stroke="none" />
      <R x="13.5" y="6" width="3.5" height="12" rx="1" fill={cl} stroke="none" />
    </Svg>
  ),
  star: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 L14 10 H20 L15.5 14 L17.5 20 L12 16.5 L6.5 20 L8.5 14 L4 10 H10 Z" />
    </Svg>
  ),
  starFill: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 4 L14 10 H20 L15.5 14 L17.5 20 L12 16.5 L6.5 20 L8.5 14 L4 10 H10 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  /** Solid OHLC candles — filled bodies. */
  candle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="8" y1="3.5" x2="8" y2="7.5" />
      <R x="5.5" y="7.5" width="5" height="9" rx="0.6" fill={cl} stroke="none" />
      <L x1="8" y1="16.5" x2="8" y2="20.5" />
      <L x1="16" y1="5" x2="16" y2="9" />
      <R x="13.5" y="9" width="5" height="7" rx="0.6" fill={cl} stroke="none" />
      <L x1="16" y1="16" x2="16" y2="20" />
    </Svg>
  ),
  /** Hollow candles — open bodies (stroke only). */
  hollowCandle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="8" y1="3.5" x2="8" y2="7.5" />
      <R x="5.5" y="7.5" width="5" height="9" rx="0.6" />
      <L x1="8" y1="16.5" x2="8" y2="20.5" />
      <L x1="16" y1="5" x2="16" y2="9" />
      <R x="13.5" y="9" width="5" height="7" rx="0.6" />
      <L x1="16" y1="16" x2="16" y2="20" />
    </Svg>
  ),
  /** Heikin Ashi — filled bodies with one-sided wicks (averaged HA look). */
  heikinAshi: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="8" y1="4" x2="8" y2="8" />
      <R x="5.5" y="8" width="5" height="10" rx="0.6" fill={cl} stroke="none" />
      <R x="13.5" y="6" width="5" height="10" rx="0.6" fill={cl} stroke="none" />
      <L x1="16" y1="16" x2="16" y2="20" />
    </Svg>
  ),
  bars: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7" y1="5" x2="7" y2="19" />
      <L x1="5" y1="8" x2="7" y2="8" />
      <L x1="7" y1="15" x2="9" y2="15" />
      <L x1="15" y1="4" x2="15" y2="18" />
      <L x1="13" y1="7" x2="15" y2="7" />
      <L x1="15" y1="14" x2="17" y2="14" />
    </Svg>
  ),
  lineChart: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 16 L9 10 L13 13 L20 5" />
    </Svg>
  ),
  area: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 16 L9 9 L14 12 L20 6 V18 H4 Z" />
    </Svg>
  ),
  baseline: (s, cl) => ICONS.area(s, cl),
  tick: (s, cl) => ICONS.bars(s, cl),
  edit: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 16.5 V20 H7.5 L18 9.5 L14.5 6 Z" />
      <L x1="12.5" y1="7.5" x2="16.5" y2="11.5" />
    </Svg>
  ),
  filter: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 6 H20 L14 12 V18 L10 20 V12 Z" />
    </Svg>
  ),
  palette: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 C7.5 4 4 7.8 4 12.5 C4 16.5 7 19.5 11 19.5 H13 C14.5 19.5 15.5 18.5 15.5 17 C15.5 16 15 15.2 14 15 H12.5 C10 15 8.5 13.2 8.5 11 C8.5 7.8 11 5.5 14.2 5.5 C17.5 5.5 20 8 20 11.5 C20 16 16.5 20 12 20" />
      <C cx="9" cy="10" r="1" fill={cl} stroke="none" />
      <C cx="12" cy="8" r="1" fill={cl} stroke="none" />
      <C cx="15.5" cy="9.5" r="1" fill={cl} stroke="none" />
    </Svg>
  ),
  pattern: (s, cl) => ICONS.lineChart(s, cl),
  scissors: (s, cl) => ICONS.cut(s, cl),
  skipBack: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5.5" y1="5.5" x2="5.5" y2="18.5" />
      <P d="M18.5 5.5 L9.5 12 L18.5 18.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  skipFwd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="18.5" y1="5.5" x2="18.5" y2="18.5" />
      <P d="M5.5 5.5 L14.5 12 L5.5 18.5 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  stepBack: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7" y1="5" x2="7" y2="19" />
      <P d="M17 7 L11 12 L17 17" />
    </Svg>
  ),
  /** Advance one step — leave current bar, land on the next. */
  stepFwd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="6" y1="5" x2="6" y2="19" />
      <P d="M10 7 L16 12 L10 17" />
      <L x1="19" y1="8" x2="19" y2="16" />
    </Svg>
  ),
};

/**
 * Drop-in replacement for the old Material-fill `I` component.
 * Unknown names render a minimal placeholder so missing keys fail loud visually.
 */
export function ChromeIcon({ n, s = 18, cl = "currentColor" }) {
  const render = ICONS[n];
  if (render) return render(s, cl);
  return (
    <Svg s={s} cl={cl}>
      <R x="5" y="5" width="14" height="14" rx="3" />
      <L x1="9" y1="12" x2="15" y2="12" />
    </Svg>
  );
}

export default ChromeIcon;
