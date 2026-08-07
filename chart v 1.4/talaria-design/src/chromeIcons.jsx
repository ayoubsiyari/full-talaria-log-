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
  trendline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="18" x2="20" y2="6" />
      <C cx="4" cy="18" r="2" fill={cl} stroke="none" />
      <C cx="20" cy="6" r="2" fill={cl} stroke="none" />
    </Svg>
  ),
  hray: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="12" x2="17" y2="12" />
      <C cx="4" cy="12" r="2" fill={cl} stroke="none" />
      <P d="M17 8 L21 12 L17 16 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  hline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="6" y1="12" x2="18" y2="12" />
      <P d="M3 12 L6 9 L6 15 Z" fill={cl} stroke="none" />
      <P d="M21 12 L18 9 L18 15 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  vline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="12" y1="6" x2="12" y2="18" />
      <P d="M12 3 L9 6 L15 6 Z" fill={cl} stroke="none" />
      <P d="M12 21 L9 18 L15 18 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  ray: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="17" x2="15" y2="7" />
      <C cx="4.5" cy="17.5" r="2" fill={cl} stroke="none" />
      <P d="M15 4 L20 5 L16 9 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  extendedLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="18" x2="20" y2="6" />
      <C cx="8" cy="14" r="2" fill={cl} stroke="none" />
      <C cx="16" cy="8" r="2" fill={cl} stroke="none" />
    </Svg>
  ),
  crossLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="12" x2="20" y2="12" />
      <L x1="12" y1="4" x2="12" y2="20" />
    </Svg>
  ),
  polyline: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 L8 8 L14 15 L20 5" />
      <C cx="4" cy="18" r="1.75" fill={cl} stroke="none" />
      <C cx="8" cy="8" r="1.75" fill={cl} stroke="none" />
      <C cx="14" cy="15" r="1.75" fill={cl} stroke="none" />
      <C cx="20" cy="5" r="1.75" fill={cl} stroke="none" />
    </Svg>
  ),
  pathTool: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 5 H16 L7 18 H17" />
      <C cx="4" cy="5" r="1.75" fill={cl} stroke="none" />
      <P d="M17 15 L21 18 L17 21 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  curve: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 C4 8 10 4 20 8" />
      <C cx="4" cy="18" r="1.75" fill={cl} stroke="none" />
      <C cx="20" cy="8" r="1.75" fill={cl} stroke="none" />
    </Svg>
  ),
  doubleCurve: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 C4 8 20 14 20 5" />
      <C cx="4" cy="18" r="1.75" fill={cl} stroke="none" />
      <C cx="20" cy="5" r="1.75" fill={cl} stroke="none" />
    </Svg>
  ),
  rect: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5" width="16" height="14" rx="2" />
    </Svg>
  ),
  triangle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 4 L20 19 H4 Z" />
    </Svg>
  ),
  circle: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="8" />
    </Svg>
  ),
  ellipse: (s, cl) => (
    <Svg s={s} cl={cl}>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
    </Svg>
  ),
  arcShape: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 Q12 3 20 18" />
    </Svg>
  ),
  arrowMarker: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 3 L14.5 14 H18 L12 21 L6 14 H9.5 Z" fill={cl} stroke="none" transform="rotate(20 12 12)" />
    </Svg>
  ),
  arrowLine: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="5" y1="19" x2="19" y2="5" />
      <P d="M12 5 H19 V12" />
    </Svg>
  ),
  arrowUp: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 4 L5 13 H9 V20 H15 V13 H19 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  arrowDn: (s, cl) => (
    <Svg s={s} cl={cl} fill={cl}>
      <P d="M12 20 L5 11 H9 V4 H15 V11 H19 Z" fill={cl} stroke="none" />
    </Svg>
  ),
  draw: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 20 C7 20 8 16 10 16 C12 16 12 20 15 20" />
      <P d="M14 4 L20 10 L10 20 H4 V14 Z" />
    </Svg>
  ),
  brush: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M14 4 L20 10 L11 19 L5 19 L5 13 Z" />
      <P d="M5 19 C5 21 8 21 9 19" />
    </Svg>
  ),
  eraser: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M16 4 L20 8 L10 18 H5 L4 17 L14 7 Z" />
      <L x1="7" y1="15" x2="11" y2="19" />
    </Svg>
  ),
  channel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="18" x2="21" y2="12" />
      <L x1="3" y1="12" x2="21" y2="6" />
    </Svg>
  ),
  regressionCh: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="19" x2="21" y2="13" />
      <L x1="3" y1="11" x2="21" y2="5" />
      <L x1="3" y1="15" x2="21" y2="9" strokeDasharray="2 3" />
    </Svg>
  ),
  flatChannel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="7" x2="21" y2="7" />
      <L x1="3" y1="17" x2="21" y2="13" />
    </Svg>
  ),
  disjointCh: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="7" x2="10" y2="5" />
      <L x1="14" y1="8" x2="21" y2="6" />
      <L x1="3" y1="16" x2="10" y2="14" />
      <L x1="14" y1="17" x2="21" y2="15" />
    </Svg>
  ),
  pitchfork: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="5" cy="12" r="1.5" fill={cl} stroke="none" />
      <C cx="19" cy="5" r="1.5" fill={cl} stroke="none" />
      <C cx="19" cy="19" r="1.5" fill={cl} stroke="none" />
      <L x1="5" y1="12" x2="19" y2="12" />
      <L x1="12" y1="9" x2="19" y2="5" />
      <L x1="12" y1="15" x2="19" y2="19" />
    </Svg>
  ),
  fib: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="6" x2="20" y2="6" />
      <L x1="4" y1="10" x2="20" y2="10" opacity="0.75" />
      <L x1="4" y1="14" x2="20" y2="14" opacity="0.5" />
      <L x1="4" y1="18" x2="20" y2="18" opacity="0.35" />
    </Svg>
  ),
  fibExtension: (s, cl) => ICONS.fib(s, cl),
  fibChannel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="19" x2="21" y2="11" />
      <L x1="3" y1="16" x2="21" y2="8" opacity="0.7" />
      <L x1="3" y1="13" x2="21" y2="5" opacity="0.45" />
    </Svg>
  ),
  fibTimeZone: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="6" y1="4" x2="6" y2="20" />
      <L x1="10" y1="4" x2="10" y2="20" opacity="0.75" />
      <L x1="15" y1="4" x2="15" y2="20" opacity="0.5" />
      <L x1="19" y1="4" x2="19" y2="20" opacity="0.35" />
    </Svg>
  ),
  fibFan: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="19" x2="20" y2="5" />
      <L x1="4" y1="19" x2="20" y2="11" opacity="0.65" />
      <L x1="4" y1="19" x2="20" y2="16" opacity="0.4" />
      <C cx="4" cy="19" r="1.5" fill={cl} stroke="none" />
    </Svg>
  ),
  fibCircles: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="12" r="3.5" />
      <C cx="12" cy="12" r="6.5" opacity="0.6" />
      <C cx="12" cy="12" r="9.5" opacity="0.35" />
    </Svg>
  ),
  fibSpiral: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M12 12 C12 10 14 9 15.5 9 C18 9 19.5 11 19.5 13.5 C19.5 17 16.5 20 12.5 20 C7.5 20 4.5 16 4.5 11.5 C4.5 6 9 3 14.5 3" />
    </Svg>
  ),
  fibArcs: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 19 Q4 11 12 11" />
      <P d="M4 19 Q4 7 16 7" opacity="0.6" />
      <P d="M4 19 Q4 4 20 4" opacity="0.35" />
      <C cx="4" cy="19" r="1.5" fill={cl} stroke="none" />
    </Svg>
  ),
  fibWedge: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 19 L12 4 L20 19" />
      <L x1="7" y1="14" x2="17" y2="14" opacity="0.5" />
    </Svg>
  ),
  fibTime: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 18 L9 7 L14 14 L20 5" />
      <L x1="4" y1="4" x2="4" y2="20" opacity="0.35" />
      <L x1="9" y1="4" x2="9" y2="20" opacity="0.35" />
      <L x1="14" y1="4" x2="14" y2="20" opacity="0.35" />
    </Svg>
  ),
  gannBox: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="16" height="16" rx="1.5" />
      <L x1="4" y1="12" x2="20" y2="12" opacity="0.45" />
      <L x1="12" y1="4" x2="12" y2="20" opacity="0.45" />
    </Svg>
  ),
  gannSquare: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="4" width="16" height="16" rx="1.5" />
      <L x1="4" y1="4" x2="20" y2="20" opacity="0.5" />
      <L x1="20" y1="4" x2="4" y2="20" opacity="0.5" />
    </Svg>
  ),
  gannFan: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="4" y1="20" x2="20" y2="4" />
      <L x1="4" y1="20" x2="20" y2="10" opacity="0.6" />
      <L x1="4" y1="20" x2="20" y2="16" opacity="0.4" />
      <L x1="4" y1="20" x2="14" y2="4" opacity="0.6" />
    </Svg>
  ),
  elliott5: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 14 L7 5 L11 14 L15 5 L19 12 L21 7" />
    </Svg>
  ),
  elliottABC: (s, cl) => ICONS.elliott5(s, cl),
  elliottTri: (s, cl) => ICONS.elliott5(s, cl),
  elliottWXY: (s, cl) => ICONS.elliott5(s, cl),
  elliottWXYXZ: (s, cl) => ICONS.elliott5(s, cl),
  wave: (s, cl) => ICONS.elliott5(s, cl),
  xabcd: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 8 L7 13 L12 4 L17 12 L21 3" />
    </Svg>
  ),
  abcdPattern: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 6 L8 14 L14 5 L21 13" />
    </Svg>
  ),
  headShoulders: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 17 L6 12 L9 15 L12 5 L15 15 L18 12 L21 17" />
    </Svg>
  ),
  triPattern: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="3" y1="5" x2="21" y2="12" />
      <L x1="3" y1="19" x2="21" y2="12" />
    </Svg>
  ),
  threeDrives: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 16 L6 8 L9 14 L12 5 L16 13 L20 4" />
    </Svg>
  ),
  text: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 7 H19" />
      <P d="M12 7 V19" />
      <P d="M8 19 H16" />
    </Svg>
  ),
  note: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 4 H19 V15 H10 L5 19 V4 Z" />
      <L x1="8" y1="9" x2="16" y2="9" />
    </Svg>
  ),
  comment: (s, cl) => ICONS.note(s, cl),
  priceNote: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M5 4 H19 V15 H10 L5 19 V4 Z" />
      <P d="M12 8 V13 M10.5 9.5 H13.5 M10.5 11.5 H13" />
    </Svg>
  ),
  callout: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M4 5 H20 V14 H13 L9 18 V14 H4 Z" />
      <L x1="7" y1="9" x2="17" y2="9" />
    </Svg>
  ),
  priceLabel: (s, cl) => (
    <Svg s={s} cl={cl}>
      <P d="M3 9 L7 6 H20 V18 H7 L3 15 Z" />
    </Svg>
  ),
  signpost: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="8" y1="4" x2="8" y2="20" />
      <P d="M8 5 H18 L16 9 L18 13 H8" />
    </Svg>
  ),
  flag: (s, cl) => (
    <Svg s={s} cl={cl}>
      <L x1="7" y1="4" x2="7" y2="20" />
      <P d="M7 4 H18 L15 9 L18 14 H7" />
    </Svg>
  ),
  image: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5" width="16" height="14" rx="2" />
      <C cx="9" cy="10" r="1.5" fill={cl} stroke="none" />
      <P d="M4 16 L9 12 L12 15 L16 11 L20 15" />
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
      <R x="6" y="5" width="6" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.4" />
      <R x="6" y="9" width="10" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.7" />
      <R x="6" y="13" width="12" height="2" rx="0.5" fill={cl} stroke="none" />
      <R x="6" y="17" width="8" height="2" rx="0.5" fill={cl} stroke="none" opacity="0.55" />
    </Svg>
  ),
  anchoredVol: (s, cl) => ICONS.volProfile(s, cl),
  vwap: (s, cl) => (
    <Svg s={s} cl={cl}>
      <C cx="12" cy="5" r="2" />
      <L x1="7" y1="8" x2="17" y2="8" />
      <L x1="12" y1="8" x2="12" y2="18" />
      <P d="M6 14 H9 V19 M18 14 H15 V19" />
    </Svg>
  ),
  longPos: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="13" width="16" height="6" rx="1.5" />
      <P d="M12 13 V6 M9 9 L12 6 L15 9" />
    </Svg>
  ),
  shortPos: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="5" width="16" height="6" rx="1.5" />
      <P d="M12 11 V18 M9 15 L12 18 L15 15" />
    </Svg>
  ),
  measure: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="4" y="9" width="16" height="6" rx="1" transform="rotate(-35 12 12)" />
      <L x1="8" y1="10" x2="8" y2="13" transform="rotate(-35 12 12)" />
      <L x1="12" y1="10" x2="12" y2="14" transform="rotate(-35 12 12)" />
      <L x1="16" y1="10" x2="16" y2="13" transform="rotate(-35 12 12)" />
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
  eyeAll: (s, cl) => ICONS.eye(s, cl),
  eyeInd: (s, cl) => ICONS.eye(s, cl),
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
      <L x1="5" y1="7" x2="19" y2="7" />
      <P d="M9 7 V5 H15 V7" />
      <P d="M7 7 L8 19 H16 L17 7" />
    </Svg>
  ),
  trashDraw: (s, cl) => ICONS.trash(s, cl),
  trashInd: (s, cl) => ICONS.trash(s, cl),
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
  /** Templates / presets — three slots + add (not copy/clone). Shared trigger. */
  template: (s, cl) => (
    <Svg s={s} cl={cl}>
      <R x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <R x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <R x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <L x1="17.25" y1="13.5" x2="17.25" y2="21" />
      <L x1="13.5" y1="17.25" x2="21" y2="17.25" />
    </Svg>
  ),
  /** Alias used by older call sites. */
  templates: (s, cl) => ICONS.template(s, cl),
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
