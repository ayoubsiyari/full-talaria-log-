/** Go To replay-bar menu — persistence, repeat resolution, chart execution. */

export const GOTO_STORAGE_KEY = "talaria_v9_goto_state";
export const GOTO_STORAGE_VERSION = 1;

/** Engine shortcuts (chart.js handleGoToAction / goToPreset keys). */
export const GOTO_ENGINE_PRESETS = [
  { id: "eng-day", label: "Day Open", engineAction: "preset-next-day-open", color: "#4A6AFF" },
  { id: "eng-week", label: "Week Open", engineAction: "next-week-open", color: "#4A6AFF" },
  { id: "eng-month", label: "Month Open", engineAction: "next-month-open", color: "#4A6AFF" },
  { id: "eng-prev-hi", label: "Prev Day High", engineAction: "prev-high", color: "#00D4A1" },
  { id: "eng-prev-lo", label: "Prev Day Low", engineAction: "prev-low", color: "#FF5068" },
  { id: "eng-asian", label: "Asian Session", engineAction: "preset-asian", color: "#FF8C42" },
  { id: "eng-london", label: "London Session", engineAction: "preset-london", color: "#00D4A1" },
  { id: "eng-ny", label: "New York Session", engineAction: "preset-new-york", color: "#4A6AFF" },
];

export const DEFAULT_GOTO_PINNED = [
  { id: 1, type: "datetime", label: "09 Jan 2009", time: "07:00", repeat: "none", pinned: true, dateIso: "2009-01-09", color: "#4A6AFF" },
  { id: 2, type: "session", label: "NY Open", time: "08:00", repeat: "none", pinned: true, color: "#4A6AFF" },
  { id: 4, type: "price", label: "126.500", pinned: true, color: "#C9A84C" },
];

export const DEFAULT_GOTO_PRESETS = [
  { id: "ny", label: "New York Open", time: "08:00", type: "session", color: "#4A6AFF" },
  { id: "lon", label: "London Open", time: "02:00", type: "session", color: "#00D4A1" },
  { id: "tok", label: "Tokyo Open", time: "00:00", type: "session", color: "#FF8C42" },
  { id: "syd", label: "Sydney Open", time: "22:00", type: "session", color: "#B06AFF" },
  { id: "fra", label: "Frankfurt Open", time: "07:00", type: "session", color: "#C9A84C" },
  ...GOTO_ENGINE_PRESETS,
];

function readStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.userStorage?.getItem?.(GOTO_STORAGE_KEY) ?? localStorage.getItem(GOTO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function writeStorage(payload) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(payload);
    if (window.userStorage?.setItem) window.userStorage.setItem(GOTO_STORAGE_KEY, json);
    else localStorage.setItem(GOTO_STORAGE_KEY, json);
  } catch (_e) { /* ignore quota */ }
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = item.type === "price" || item.type === "session" ? item.type : "datetime";
  return {
    ...item,
    type,
    time: item.time != null ? String(item.time) : undefined,
    repeat: item.repeat || "none",
    pinned: !!item.pinned,
  };
}

export function loadGotoState() {
  const stored = readStorage();
  const pinned = Array.isArray(stored?.pinned)
    ? stored.pinned.map(normalizeItem).filter(Boolean)
    : DEFAULT_GOTO_PINNED.map((x) => ({ ...x }));
  const presets = Array.isArray(stored?.presets)
    ? stored.presets.map(normalizeItem).filter(Boolean)
    : DEFAULT_GOTO_PRESETS.map((x) => ({ ...x }));
  return { pinned, presets };
}

export function saveGotoState(pinned, presets) {
  writeStorage({
    version: GOTO_STORAGE_VERSION,
    pinned: Array.isArray(pinned) ? pinned : [],
    presets: Array.isArray(presets) ? presets : [],
    updatedAt: new Date().toISOString(),
  });
}

export function parseGotoTimeParts(timeStr) {
  if (!timeStr) return [0, 0];
  const s = String(timeStr).replace(/\s*UTC\s*/gi, "").trim();
  const segs = s.split(":");
  return [parseInt(segs[0], 10) || 0, parseInt(segs[1], 10) || 0];
}

export function buildGotoTimestampMs(dateIso, timeStr) {
  if (!dateIso || typeof dateIso !== "string") return null;
  const p = dateIso.split("-").map((x) => parseInt(x, 10));
  if (p.length < 3 || !p.every((n) => Number.isFinite(n))) return null;
  const [y, mo, d] = p;
  const [hh, mm] = parseGotoTimeParts(timeStr);
  const tm = typeof window !== "undefined" ? window.timezoneManager : null;
  if (tm && typeof tm.wallClockToUtcMillis === "function") {
    return tm.wallClockToUtcMillis(y, mo, d, hh, mm, 0);
  }
  const utc = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  return tm && typeof tm.getOffsetMs === "function"
    ? utc - tm.getOffsetMs()
    : new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
}

export function defaultGotoDateIsoFromChart() {
  const ch = typeof window !== "undefined" ? window.chart : null;
  if (!ch) return null;
  const rs = ch.replaySystem;
  const idx = rs?.isActive && Number.isFinite(rs.currentIndex)
    ? rs.currentIndex
    : (ch.data?.length ? ch.data.length - 1 : -1);
  const t = Number.isFinite(rs?.replayTimestamp)
    ? rs.replayTimestamp
    : (idx >= 0 ? ch.data?.[idx]?.t : null) ??
      rs?.fullRawData?.[0]?.t ??
      ch.rawData?.[0]?.t ??
      ch.data?.[0]?.t;
  if (!Number.isFinite(t)) return null;
  const tm = window.timezoneManager;
  if (tm && typeof tm.convertToTimezone === "function") {
    const d = tm.convertToTimezone(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getChartPlayheadMs(ch) {
  if (!ch) return null;
  const rs = ch.replaySystem;
  if (rs?.isActive && Number.isFinite(rs.replayTimestamp)) {
    return typeof ch.normalizeTimestampMs === "function"
      ? ch.normalizeTimestampMs(rs.replayTimestamp)
      : rs.replayTimestamp;
  }
  const idx = rs?.currentIndex ?? (ch.data?.length ? ch.data.length - 1 : -1);
  if (idx >= 0 && ch.data?.[idx]) {
    const t = ch.data[idx].t;
    return typeof ch.normalizeTimestampMs === "function" ? ch.normalizeTimestampMs(t) : t;
  }
  return null;
}

function advanceWallClockYmd(y, mo, d, repeat) {
  if (repeat === "daily") {
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
  }
  if (repeat === "weekly") {
    const next = new Date(Date.UTC(y, mo - 1, d + 7));
    return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
  }
  if (repeat === "monthly") {
    const next = new Date(Date.UTC(y, mo, d));
    return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
  }
  return [y, mo, d];
}

export function resolveGotoTimestampMs(item, { fallbackDateIso, playheadMs } = {}) {
  const [hh, mm] = parseGotoTimeParts(item?.time || "00:00");
  const repeat = item?.repeat && item.repeat !== "none" ? item.repeat : "none";
  const timeLabel = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

  if (repeat === "none") {
    const dateIso = item?.dateIso || fallbackDateIso || defaultGotoDateIsoFromChart();
    return buildGotoTimestampMs(dateIso, timeLabel);
  }

  const playhead = Number.isFinite(playheadMs) ? playheadMs : getChartPlayheadMs(typeof window !== "undefined" ? window.chart : null);
  if (!Number.isFinite(playhead)) {
    const dateIso = item?.dateIso || fallbackDateIso || defaultGotoDateIsoFromChart();
    return buildGotoTimestampMs(dateIso, timeLabel);
  }

  const tm = typeof window !== "undefined" ? window.timezoneManager : null;
  const wall = tm && typeof tm.convertToTimezone === "function"
    ? tm.convertToTimezone(playhead)
    : new Date(playhead);
  let y = wall.getUTCFullYear();
  let mo = wall.getUTCMonth() + 1;
  let d = wall.getUTCDate();

  let targetMs = buildGotoTimestampMs(
    `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    timeLabel
  );

  let guard = 0;
  while (Number.isFinite(targetMs) && targetMs <= playhead && guard < 500) {
    [y, mo, d] = advanceWallClockYmd(y, mo, d, repeat);
    targetMs = buildGotoTimestampMs(
      `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      timeLabel
    );
    guard += 1;
  }
  return targetMs;
}

function notifyChart(message, kind = "warning") {
  const ch = typeof window !== "undefined" ? window.chart : null;
  if (ch && typeof ch.showNotification === "function") {
    ch.showNotification(message, kind);
    return;
  }
  if (typeof window.showNotification === "function") {
    window.showNotification(message, kind);
  }
}

function validateGotoOnChart(ch, { targetTimestamp, targetIndex } = {}) {
  if (!ch || typeof ch.validateGoToJump !== "function") return { ok: true };
  return ch.validateGoToJump({ targetTimestamp, targetIndex });
}

/** Session date bounds for Go To UI (backtest start/end). */
export function getGotoDateBounds() {
  const ch = typeof window !== "undefined" ? window.chart : null;
  if (!ch || typeof ch.getBacktestSessionBounds !== "function") return null;
  const b = ch.getBacktestSessionBounds();
  if (!b?.isBacktest) return null;

  const toIso = (ms) => {
    if (!Number.isFinite(ms)) return null;
    const tm = window.timezoneManager;
    if (tm && typeof tm.convertToTimezone === "function") {
      const d = tm.convertToTimezone(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  let minDateIso = toIso(b.startMs);
  let maxDateIso = toIso(b.endMs);

  if (b.allowBackNavigation === false && Number.isFinite(b.playheadMs)) {
    const playIso = toIso(b.playheadMs);
    if (playIso && (!minDateIso || playIso > minDateIso)) {
      minDateIso = playIso;
    }
  }

  return {
    minDateIso,
    maxDateIso,
    allowBackNavigation: b.allowBackNavigation !== false,
    playheadMs: b.playheadMs,
  };
}

function isGotoDateIsoDisabled(iso, bounds) {
  if (!bounds || !iso) return false;
  if (bounds.minDateIso && iso < bounds.minDateIso) return true;
  if (bounds.maxDateIso && iso > bounds.maxDateIso) return true;
  return false;
}

/** True when calendar day (YYYY-MM-DD) is outside backtest session window. */
export function isGotoCalendarDayDisabled(dateIso) {
  return isGotoDateIsoDisabled(dateIso, getGotoDateBounds());
}

/**
 * Execute a Go To item using existing chart replay APIs (no custom seek logic).
 */
export function executeGotoItem(item, { fallbackDateIso } = {}) {
  if (!item) return false;
  const ch = typeof window !== "undefined" ? window.chart : null;
  if (!ch) return false;

  if (item.engineAction && typeof ch.handleGoToAction === "function") {
    ch.handleGoToAction(item.engineAction);
    return true;
  }

  if (item.type === "price") {
    const raw = String(item.price ?? item.label ?? "").replace(/[^0-9.-]/g, "");
    const p = parseFloat(raw);
    if (!Number.isFinite(p)) {
      notifyChart("Enter a valid price level", "warning");
      return false;
    }
    if (typeof ch.jumpToPrice === "function") {
      const ok = ch.jumpToPrice(p) !== false;
      return ok;
    }
    return false;
  }

  if (item.type === "session") {
    const [hh, mm] = parseGotoTimeParts(item.time || "00:00");
    if (typeof ch.goToNextSession === "function") {
      ch.goToNextSession(hh, mm);
      return true;
    }
    return false;
  }

  const playhead = getChartPlayheadMs(ch);
  const ms = resolveGotoTimestampMs(item, { fallbackDateIso, playheadMs: playhead });
  if (ms == null || !Number.isFinite(ms)) {
    notifyChart("Could not resolve date/time for Go To", "warning");
    return false;
  }

  const jumpCheck = validateGotoOnChart(ch, { targetTimestamp: ms });
  if (!jumpCheck.ok) {
    notifyChart(jumpCheck.message || "Go To blocked by session rules", "warning");
    return false;
  }

  if (typeof ch.jumpToTimestamp === "function") {
    void ch.jumpToTimestamp(ms, { showLoadingOverlay: true });
    return true;
  }
  return false;
}

export function presetToGotoItem(preset, fallbackDateIso) {
  if (!preset) return null;
  if (preset.engineAction) {
    return { type: "engine", engineAction: preset.engineAction, label: preset.label, color: preset.color };
  }
  if (preset.type === "session") {
    return { type: "session", label: preset.label, time: preset.time, color: preset.color };
  }
  if (preset.type === "price") {
    return { type: "price", label: preset.label, color: preset.color };
  }
  return {
    type: "datetime",
    label: preset.label,
    time: preset.time,
    dateIso: preset.dateIso || fallbackDateIso || defaultGotoDateIsoFromChart(),
    repeat: preset.repeat || "none",
    color: preset.color,
  };
}
