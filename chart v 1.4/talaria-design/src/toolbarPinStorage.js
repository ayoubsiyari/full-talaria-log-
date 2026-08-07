/**
 * TAL-01865: persist V9 toolbar pins (timeframes, drawing tools) across refresh.
 *
 * Same shape as indicatorPinStorage, with one difference that matters: these two
 * have non-empty defaults, so "absent" and "present but empty" are different
 * states. A user who unpins everything must get an empty toolbar back after a
 * refresh, not the factory defaults — so the loaders return null for absent and
 * the caller supplies the default, rather than collapsing both to [].
 */

export const TF_PINNED_STORAGE_KEY = "talaria_v9_tf_pinned";
export const TF_CUSTOM_STORAGE_KEY = "talaria_v9_tf_custom";
export const TOOL_PINNED_STORAGE_KEY = "talaria_v9_tool_pinned";
export const TOOLBAR_PIN_STORAGE_VERSION = 1;

/** Mirrors the pin-button caps in the V9 toolbar UI. */
export const TF_PINNED_MAX = 10;
export const TF_CUSTOM_MAX = 24;
export const TOOL_PINNED_MAX = 20;

export const DEFAULT_TF_PINNED = ["1m", "5m", "15m", "1H", "4H", "1D"];
export const DEFAULT_TOOL_PINNED = [
  "Trend Line",
  "Horizontal Line",
  "Fib Retracement",
  "Rectangle",
  "Text",
];

function readRaw(key) {
  if (typeof window === "undefined") return null;
  try {
    return window.userStorage?.getItem?.(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key, payload) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(payload);
    if (window.userStorage?.setItem) window.userStorage.setItem(key, json);
    else localStorage.setItem(key, json);
  } catch {
    /* quota / private mode */
  }
}

function normalizeIds(ids, max) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  ids.forEach((id) => {
    const key = id != null ? String(id).trim() : "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return Number.isFinite(max) && max > 0 ? out.slice(0, max) : out;
}

/** @returns {string[]|null} null when nothing has been stored yet. */
function loadPins(key, max) {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeIds(parsed, max);
    if (parsed && Array.isArray(parsed.pinned)) return normalizeIds(parsed.pinned, max);
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function savePins(key, ids, max) {
  writeRaw(key, {
    version: TOOLBAR_PIN_STORAGE_VERSION,
    pinned: normalizeIds(ids, max),
  });
}

export function loadTfPinned() {
  const stored = loadPins(TF_PINNED_STORAGE_KEY, TF_PINNED_MAX);
  return stored === null ? DEFAULT_TF_PINNED.slice() : stored;
}

export function saveTfPinned(ids) {
  savePins(TF_PINNED_STORAGE_KEY, ids, TF_PINNED_MAX);
}

/** Custom intervals the user added in the timeframe menu (survive refresh). */
export function loadTfCustom() {
  const stored = loadPins(TF_CUSTOM_STORAGE_KEY, TF_CUSTOM_MAX);
  return stored === null ? [] : stored;
}

export function saveTfCustom(ids) {
  savePins(TF_CUSTOM_STORAGE_KEY, ids, TF_CUSTOM_MAX);
}

export function loadToolPinned() {
  const stored = loadPins(TOOL_PINNED_STORAGE_KEY, TOOL_PINNED_MAX);
  return stored === null ? DEFAULT_TOOL_PINNED.slice() : stored;
}

export function saveToolPinned(ids) {
  savePins(TOOL_PINNED_STORAGE_KEY, ids, TOOL_PINNED_MAX);
}
