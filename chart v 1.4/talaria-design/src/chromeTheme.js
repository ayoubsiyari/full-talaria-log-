/**
 * V9 chrome theme helpers — maps DESIGN.md / chrome-tokens.css into the Live shell.
 * Canvas paint paths must not import decorative chrome styles from here.
 */

/** Helvetica Now board — system stack until licensed files land. */
export const CHROME_FONT_UI =
  '"Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif';
/** Blauer Nue board — Exo 2 self-hosted interim. */
export const CHROME_FONT_DISPLAY = '"Blauer Nue", "Exo 2", "Helvetica Neue", sans-serif';
export const CHROME_FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Black prime + board secondaries — flat fills only, no button gradients. */
export const CHROME_BRAND = {
  black: "#000000",
  white: "#FFFFFF",
  blue: "#3090FF",
  blueDeep: "#232CF4",
  slate: "#2C537A",
  lilac: "#A2A1CD",
  mist: "#EBE9FE",
};

/** Display timeframe with lowercase unit letters: 1h 4h 1d (month stays 1M). */
export function formatTfLabel(t) {
  if (!t || typeof t !== "string") return t;
  return t.replace(/H\b/g, "h").replace(/D\b/g, "d").replace(/W\b/g, "w");
}

/** Title-case HUD date to match canvas time-axis style: Tue 26 Nov '12 */
export function formatV9HudDateLineTitle(ms, convertToTimezone) {
  if (!Number.isFinite(ms)) return "—";
  const d =
    typeof convertToTimezone === "function" ? convertToTimezone(ms) : new Date(ms);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const dow = d.getUTCDay();
  const year = d.getUTCFullYear();
  return `${days[dow]} ${String(day).padStart(2, "0")} ${months[month]} '${String(year % 100).padStart(2, "0")}`;
}

/**
 * CSS-variable chrome palette (theme via data-chrome-theme on [data-v9-app]).
 * Components should prefer these over hardcoded hex.
 */
export function chromeTokens(colorMode = "dark") {
  return {
    ac: "var(--accent)",
    acL: "var(--accent-hover)",
    acD: "var(--accent-quiet)",
    acB: "var(--accent-quiet)",
    acG: "transparent",
    acDeep: "var(--accent-deep)",
    slate: "var(--brand-slate)",
    lilac: "var(--brand-lilac)",
    mist: "var(--brand-mist)",
    black: "var(--brand-black)",
    white: "var(--brand-white)",
    gold: "var(--warn)",
    goldD: "oklch(0.78 0.14 85 / 0.10)",
    bg: "var(--bg)",
    sf: "var(--surface)",
    el: "var(--surface-raised)",
    well: "var(--surface-sunken)",
    br: "var(--line)",
    brL: "var(--line)",
    brH: "var(--line-strong)",
    tx: "var(--text)",
    ts: "var(--text-muted)",
    tm: "var(--text-faint)",
    gn: "var(--up)",
    gnD: "oklch(0.72 0.14 155 / 0.10)",
    gnB: "oklch(0.72 0.14 155 / 0.18)",
    rd: "var(--down)",
    rdD: "oklch(0.63 0.18 25 / 0.10)",
    rdB: "oklch(0.63 0.18 25 / 0.18)",
    axTx: "var(--text-muted)",
    grid: "var(--line)",
    hv: "var(--surface-raised)",
    hv2: "var(--accent-quiet)",
    trk: "var(--line-strong)",
    hvLn: "var(--line-strong)",
    inputScheme: colorMode === "dark" ? "dark" : "light",
    radiusControl: 6,
    radiusPanel: 8,
    radiusCta: 6,
  };
}

/** @deprecated use chromeTokens — kept for older imports */
export function chromeDarkTokens() {
  return chromeTokens("dark");
}

/**
 * Four chrome presets the user can cycle one-by-one from the left rail.
 * 1 dock + true light · 2 dock + true light (order focus) · 3 float · 4 dock + soft gray
 */
export const CHROME_PRESETS = [
  {
    id: 1,
    key: "dock-right-true-light-full",
    short: "1",
    label: "Dock · True light · Full",
    orderMode: "dock",
    lightTheme: "light",
  },
  {
    id: 2,
    key: "dock-right-true-light-order-first",
    short: "2",
    label: "Dock · True light · Order focus",
    orderMode: "dock",
    lightTheme: "light",
  },
  {
    id: 3,
    key: "floating-ticket-true-light-full",
    short: "3",
    label: "Float · True light · Full",
    orderMode: "float",
    lightTheme: "light",
  },
  {
    id: 4,
    key: "dock-right-soft-gray-full",
    short: "4",
    label: "Dock · Soft gray · Full",
    orderMode: "dock",
    lightTheme: "light-soft",
  },
];

export function chromePresetById(id) {
  return CHROME_PRESETS.find((p) => p.id === id) || CHROME_PRESETS[0];
}

/** Resolve data-chrome-theme attribute from color mode + active preset. */
export function resolveChromeThemeAttr(colorMode, presetId) {
  if (colorMode === "dark") return "dark";
  return chromePresetById(presetId).lightTheme;
}

const LS_THEME = "talaria_v9_chrome_theme";
const LS_PRESET = "talaria_v9_chrome_preset";

export function readStoredChromeColorMode() {
  try {
    const v = localStorage.getItem(LS_THEME);
    return v === "light" || v === "dark" ? v : "dark";
  } catch (_) {
    return "dark";
  }
}

export function readStoredChromePresetId() {
  try {
    const n = parseInt(localStorage.getItem(LS_PRESET) || "1", 10);
    return n >= 1 && n <= 4 ? n : 1;
  } catch (_) {
    return 1;
  }
}

export function persistChromeColorMode(mode) {
  try {
    localStorage.setItem(LS_THEME, mode);
  } catch (_) {}
}

export function persistChromePresetId(id) {
  try {
    localStorage.setItem(LS_PRESET, String(id));
  } catch (_) {}
}

/** Left rail clusters per work order §3.2 */
export function chromeToolClusters() {
  const cursor = [
    {
      id: "crosshair",
      icon: "crosshair",
      label: "Cursor",
      dd: [
        { h: "CURSOR" },
        { icon: "crosshair", label: "Cross" },
        { icon: "cursorDot", label: "Dot" },
        { icon: "cursorArrow", label: "Arrow" },
        { icon: "eraser", label: "Eraser" },
      ],
    },
  ];
  const drawing = [
    {
      id: "brush2",
      icon: "draw",
      label: "Brushes",
      dd: [
        { h: "BRUSHES" },
        { icon: "draw", label: "Brush" },
        { icon: "brush", label: "Highlighter" },
      ],
    },
    {
      id: "trendline",
      icon: "trendline",
      label: "Lines",
      dd: [
        { h: "LINES" },
        { icon: "trendline", label: "Trend Line" },
        { icon: "hray", label: "Horizontal Ray" },
        { icon: "hline", label: "Horizontal Line" },
        { icon: "vline", label: "Vertical Line" },
        { icon: "ray", label: "Ray" },
        { icon: "extendedLine", label: "Extended Line" },
        { icon: "crossLine", label: "Cross Line" },
        { icon: "polyline", label: "Polyline" },
        { icon: "pathTool", label: "Path" },
        { icon: "curve", label: "Curve" },
        { icon: "doubleCurve", label: "Double Curve" },
      ],
    },
    {
      id: "rect",
      icon: "rect",
      label: "Shapes",
      dd: [
        { h: "SHAPES" },
        { icon: "rect", label: "Rectangle" },
        { icon: "triangle", label: "Triangle" },
        { icon: "arcShape", label: "Arc" },
        { icon: "ellipse", label: "Ellipse" },
        { icon: "circle", label: "Circle" },
        { h: "ARROWS" },
        { icon: "arrowMarker", label: "Arrow Marker" },
        { icon: "arrowLine", label: "Arrow" },
        { icon: "arrowUp", label: "Arrow Mark Up" },
        { icon: "arrowDn", label: "Arrow Mark Down" },
      ],
    },
    {
      id: "channel",
      icon: "channel",
      label: "Channels",
      dd: [
        { h: "CHANNELS" },
        { icon: "channel", label: "Parallel Channel" },
        { icon: "regressionCh", label: "Regression Channel" },
        { icon: "flatChannel", label: "Flat Top/Bottom" },
        { icon: "disjointCh", label: "Disjoint Channel" },
        { h: "PITCHFORKS" },
        { icon: "pitchfork", label: "Pitchfork" },
      ],
    },
    {
      id: "fib",
      icon: "fib",
      label: "Fibonacci & Gann",
      dd: [
        { h: "FIBONACCI" },
        { icon: "fib", label: "Fib Retracement" },
        { icon: "fibExtension", label: "Trend-Based Fib Extension" },
        { icon: "fibChannel", label: "Fib Channel" },
        { icon: "fibTimeZone", label: "Fib Time Zone" },
        { icon: "fibFan", label: "Fib Speed Resistance Fan" },
        { icon: "fibTime", label: "Trend-Based Fib Time" },
        { icon: "fibCircles", label: "Fib Circles" },
        { icon: "fibSpiral", label: "Fib Spiral" },
        { icon: "fibArcs", label: "Fib Speed Resistance Arcs" },
        { icon: "fibWedge", label: "Fib Wedge" },
        { h: "GANN" },
        { icon: "gannBox", label: "Gann Box" },
        { icon: "gannSquare", label: "Gann Square Fixed" },
        { icon: "gannFan", label: "Gann Fan" },
      ],
    },
    {
      id: "text",
      icon: "text",
      label: "Text & Labels",
      dd: [
        { h: "TEXT" },
        { icon: "text", label: "Text" },
        { icon: "note", label: "Note" },
        { icon: "priceNote", label: "Price Note" },
        { icon: "callout", label: "Callout" },
        { icon: "comment", label: "Comment" },
        { h: "LABELS" },
        { icon: "pin", label: "Pin" },
        { icon: "signpost", label: "Signpost" },
        { icon: "flag", label: "Flag Mark" },
        { icon: "image", label: "Image" },
        { h: "EMOJIS" },
        { icon: "emoji", label: "Emojis & Stickers" },
      ],
    },
    {
      id: "pattern",
      icon: "wave",
      label: "Patterns & Waves",
      dd: [
        { h: "ELLIOTT WAVES" },
        { icon: "elliott5", label: "Elliott Impulse (12345)" },
        { icon: "elliottABC", label: "Elliott Correction (ABC)" },
        { icon: "elliottTri", label: "Elliott Triangle (ABCDE)" },
        { icon: "elliottWXY", label: "Elliott Double Combo (WXY)" },
        { icon: "elliottWXYXZ", label: "Elliott Triple Combo (WXYXZ)" },
        { h: "PATTERNS" },
        { icon: "xabcd", label: "XABCD Pattern" },
        { icon: "headShoulders", label: "Head and Shoulders" },
        { icon: "abcdPattern", label: "ABCD Pattern" },
        { icon: "triPattern", label: "Triangle Pattern" },
        { icon: "threeDrives", label: "Three Drives Pattern" },
      ],
    },
    {
      id: "brush",
      icon: "bars",
      label: "Volume Tools",
      dd: [
        { h: "VOLUME-BASED" },
        { icon: "vwap", label: "Anchored VWAP" },
        { icon: "volProfile", label: "Fixed Range Volume Profile" },
        { icon: "anchoredVol", label: "Anchored Volume Profile" },
      ],
    },
  ];
  const analysis = [
    {
      id: "measure",
      icon: "measure",
      label: "Projections",
      dd: [
        { h: "PROJECTIONS" },
        { icon: "shortPos", label: "Short Position" },
        { icon: "longPos", label: "Long Position" },
        { icon: "measure", label: "Range Tool" },
      ],
    },
    {
      id: "magnet",
      icon: "magnet",
      label: "Magnet",
      dd: [
        { h: "MAGNET STRENGTH" },
        { icon: "magnetOff", label: "Off" },
        { icon: "magnetWeak", label: "Weak" },
        { icon: "magnetStrong", label: "Strong" },
      ],
    },
  ];
  const management = [
    {
      id: "eye",
      icon: "eye",
      label: "Visibility",
      dd: [
        { h: "VISIBILITY" },
        { icon: "eyeAll", label: "Hide Drawings" },
        { icon: "eyeInd", label: "Hide Indicators" },
        { icon: "eyeHide", label: "Hide All" },
      ],
    },
    { id: "lock", icon: "lock", label: "Lock" },
    {
      id: "trash",
      icon: "trash",
      label: "Delete",
      danger: true,
      dd: [
        { h: "DELETE" },
        { icon: "trashDraw", label: "Delete Drawings" },
        { icon: "trashInd", label: "Delete Indicators" },
        { icon: "trash", label: "Delete All Objects" },
      ],
    },
    { id: "pinbar", icon: "pin", label: "Pinned Tools" },
    { id: "undo", icon: "undo", label: "Undo", action: true },
    { id: "redo", icon: "redo", label: "Redo", action: true },
  ];
  return { cursor, drawing, analysis, management };
}
