/**
 * TAL-01865 per-panel slice: persist each panel's identity and configuration
 * across a refresh — symbol/file, timeframe, chart type, zoom, price scale, and
 * which panel is focused.
 *
 * Three decisions worth knowing before editing:
 *
 * 1. This extends the existing `chart_panel_state` blob rather than adding a
 *    second store, because the layout id already lives there and a layout that
 *    disagrees with its own panel states is worse than no restore at all. The
 *    legacy `panels` ARRAY is preserved untouched — panel-managerv2 still reads
 *    it as an array — so the letter-keyed map is a new sibling field. Every
 *    write is read-modify-write and unknown keys survive, so another lane
 *    adding a field does not lose it to us and we do not lose ours to them.
 *
 * 2. Zoom is persisted as a market-time window plus a candle width, never as
 *    `offsetX` or a bar index. Bars reload and indices shift under a restored
 *    offset, which is DEF-04's mechanism and the same trap the drawing-tool
 *    round trip just had. Candle width is a pixels-per-bar zoom level and is
 *    index-independent, so it travels as-is.
 *
 * 3. Auto-scaled price min/max are NOT persisted. They are derived from
 *    whichever bars happen to be loaded, and the manifest ruling is that
 *    derived state reloads fresh. Manual min/max are user configuration and do
 *    persist.
 */

export const PANEL_STATE_STORAGE_KEY = "chart_panel_state";
export const PANEL_STATE_VERSION = 1;

/** Layout slots are fixed letters (LAYOUT_TEMPLATES tiles), not generated ids. */
export const VALID_PANEL_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const HOST_PANEL_ID = "A";

/** Every field this module persists per panel. The gate reads this list. */
export const PERSISTED_PANEL_FIELDS = [
  "fileId",
  "symbol",
  "timeframe",
  "chartType",
  "candleWidth",
  "viewStartSec",
  "viewEndSec",
  "priceScaleMode",
  "priceScaleAuto",
  "priceScaleMin",
  "priceScaleMax",
];

const VALID_ID_SET = new Set(VALID_PANEL_IDS);
const PRICE_SCALE_MODES = new Set(["linear", "log"]);
const MAX_STRING_LEN = 64;

function readRaw() {
  if (typeof window === "undefined") return null;
  try {
    // userStorage.getItem already falls back to the unscoped key and migrates,
    // so existing saved layouts are adopted rather than orphaned.
    return window.userStorage?.getItem?.(PANEL_STATE_STORAGE_KEY)
      ?? localStorage.getItem(PANEL_STATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(json) {
  if (typeof window === "undefined") return false;
  try {
    if (window.userStorage?.setItem) window.userStorage.setItem(PANEL_STATE_STORAGE_KEY, json);
    else localStorage.setItem(PANEL_STATE_STORAGE_KEY, json);
    return true;
  } catch {
    return false; // quota / private mode — a lost preference must not throw
  }
}

/** @returns {object} the whole blob, or {} when absent or corrupt. */
export function readPanelStateBlob() {
  const raw = readRaw();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Read-modify-write. `mutate` receives the live blob and may edit it in place;
 * anything it does not touch is written back unchanged.
 */
export function updatePanelStateBlob(mutate) {
  const blob = readPanelStateBlob();
  if (typeof mutate === "function") {
    try { mutate(blob); } catch { return false; }
  }
  try {
    return writeRaw(JSON.stringify(blob));
  } catch {
    return false;
  }
}

function cleanString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > MAX_STRING_LEN ? s.slice(0, MAX_STRING_LEN) : s;
}

function cleanFinite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Keep only recognised fields, in a known shape. A partially-invalid entry
 * degrades field by field rather than being dropped whole: a bad zoom must not
 * cost the user their symbol.
 */
export function normalizePanelEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const out = {};

  const fileId = cleanString(entry.fileId);
  if (fileId) out.fileId = fileId;
  const symbol = cleanString(entry.symbol);
  if (symbol) out.symbol = symbol;
  const timeframe = cleanString(entry.timeframe);
  if (timeframe) out.timeframe = timeframe;
  const chartType = cleanString(entry.chartType);
  if (chartType) out.chartType = chartType;

  const candleWidth = cleanFinite(entry.candleWidth);
  if (candleWidth != null && candleWidth > 0) out.candleWidth = candleWidth;

  // Market-time window. An inverted or half-present range is dropped whole —
  // a start without an end cannot position a viewport.
  const startSec = cleanFinite(entry.viewStartSec);
  const endSec = cleanFinite(entry.viewEndSec);
  if (startSec != null && endSec != null && endSec > startSec) {
    out.viewStartSec = startSec;
    out.viewEndSec = endSec;
  }

  const mode = cleanString(entry.priceScaleMode);
  if (mode && PRICE_SCALE_MODES.has(mode.toLowerCase())) {
    out.priceScaleMode = mode.toLowerCase();
  }
  if (typeof entry.priceScaleAuto === "boolean") {
    out.priceScaleAuto = entry.priceScaleAuto;
  }
  // Manual bounds only. Under auto-scale these are a readout of the loaded
  // bars, and persisting a readout is persisting derived state.
  if (out.priceScaleAuto === false) {
    const min = cleanFinite(entry.priceScaleMin);
    const max = cleanFinite(entry.priceScaleMax);
    if (min != null && max != null && max > min) {
      out.priceScaleMin = min;
      out.priceScaleMax = max;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

function normalizeSessionId(sessionId) {
  return sessionId != null && String(sessionId).trim() !== "" ? String(sessionId).trim() : "";
}

/**
 * True when a blob's stored session is a different session from `sessionId`.
 * An absent stored session is not a mismatch — it predates session stamping.
 */
export function isForeignSession(blob, sessionId) {
  const saved = normalizeSessionId(blob && blob.sessionId);
  const current = normalizeSessionId(sessionId);
  return !!(saved && current && saved !== current);
}

/**
 * @returns {{panelsById: object, focusedPanelId: string|null}} empty when the
 *   stored state belongs to a different session — one session's panel layout
 *   must not bleed into another's.
 */
export function loadPanelStates(sessionId) {
  const blob = readPanelStateBlob();
  if (isForeignSession(blob, sessionId)) return { panelsById: {}, focusedPanelId: null };

  const src = blob.panelsById;
  const panelsById = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    VALID_PANEL_IDS.forEach((id) => {
      if (!Object.prototype.hasOwnProperty.call(src, id)) return;
      const entry = normalizePanelEntry(src[id]);
      if (entry) panelsById[id] = entry;
    });
  }

  const focusRaw = cleanString(blob.focusedPanelId);
  const focusedPanelId = focusRaw && VALID_ID_SET.has(focusRaw) ? focusRaw : null;
  return { panelsById, focusedPanelId };
}

export function loadPanelState(panelId, sessionId) {
  const id = cleanString(panelId);
  if (!id || !VALID_ID_SET.has(id)) return null;
  return loadPanelStates(sessionId).panelsById[id] || null;
}

/**
 * Merge `patch` into a panel's stored state. Explicit null clears a field;
 * absent keys leave the stored value alone, because chart-state messages
 * report a subset (timeframe + fileId) and must not erase the rest.
 */
export function savePanelState(panelId, patch, sessionId) {
  const id = cleanString(panelId);
  if (!id || !VALID_ID_SET.has(id)) return false;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  return updatePanelStateBlob((blob) => {
    if (isForeignSession(blob, sessionId)) {
      // Session changed under us: start this session's map clean rather than
      // layering a new session's panels on top of another's.
      blob.panelsById = {};
      blob.focusedPanelId = null;
    }
    const sid = normalizeSessionId(sessionId);
    if (sid) blob.sessionId = sid;
    blob.panelStateVersion = PANEL_STATE_VERSION;
    if (!blob.panelsById || typeof blob.panelsById !== "object" || Array.isArray(blob.panelsById)) {
      blob.panelsById = {};
    }

    const merged = { ...(blob.panelsById[id] || {}) };
    Object.keys(patch).forEach((key) => {
      if (!PERSISTED_PANEL_FIELDS.includes(key)) return;
      if (patch[key] === null) delete merged[key];
      else merged[key] = patch[key];
    });

    const normalized = normalizePanelEntry(merged);
    if (normalized) blob.panelsById[id] = normalized;
    else delete blob.panelsById[id];
  });
}

export function saveFocusedPanelId(panelId, sessionId) {
  const id = cleanString(panelId);
  if (!id || !VALID_ID_SET.has(id)) return false;
  return updatePanelStateBlob((blob) => {
    if (isForeignSession(blob, sessionId)) {
      blob.panelsById = {};
    }
    const sid = normalizeSessionId(sessionId);
    if (sid) blob.sessionId = sid;
    blob.panelStateVersion = PANEL_STATE_VERSION;
    blob.focusedPanelId = id;
  });
}

/** Drop one panel's state — used when a tile is removed or retired. */
export function clearPanelState(panelId) {
  const id = cleanString(panelId);
  if (!id || !VALID_ID_SET.has(id)) return false;
  return updatePanelStateBlob((blob) => {
    if (blob.panelsById && typeof blob.panelsById === "object") delete blob.panelsById[id];
    if (blob.focusedPanelId === id) blob.focusedPanelId = null;
  });
}

/** Drop states for tiles that no longer exist in the live layout. */
export function prunePanelStates(livePanelIds) {
  const keep = new Set(
    (Array.isArray(livePanelIds) ? livePanelIds : [])
      .map((id) => cleanString(id))
      .filter((id) => id && VALID_ID_SET.has(id)),
  );
  return updatePanelStateBlob((blob) => {
    const map = blob.panelsById;
    if (!map || typeof map !== "object" || Array.isArray(map)) return;
    Object.keys(map).forEach((id) => {
      if (!keep.has(id)) delete map[id];
    });
    if (blob.focusedPanelId && !keep.has(blob.focusedPanelId)) blob.focusedPanelId = null;
  });
}
