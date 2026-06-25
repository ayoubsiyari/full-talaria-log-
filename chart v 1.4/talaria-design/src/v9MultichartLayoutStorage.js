/** Persist V9 multichart layout (panel count + variant + sync toggles) across refresh. */

export const V9_MULTICHART_LAYOUT_KEY = "v9_multichart_layout";
export const LEGACY_PANEL_STATE_KEY = "chart_panel_state";
export const V9_MULTICHART_LAYOUT_VERSION = 1;

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

function clampPanelTuple(n, li) {
  const panels = Number(n);
  const variant = Number(li);
  if (!Number.isFinite(panels) || panels < 1 || panels > 8) return { n: 1, li: 0 };
  const maxLi = Math.max(0, panels - 1);
  if (!Number.isFinite(variant) || variant < 0) return { n: panels, li: 0 };
  return { n: panels, li: Math.min(variant, maxLi) };
}

/**
 * @param {(layoutId: string) => { n: number, li: number } | null} layoutTupleFromId
 * @param {Record<string, boolean>} defaultSync
 */
export function loadV9MultichartLayout(layoutTupleFromId, defaultSync = {}) {
  const raw = readRaw(V9_MULTICHART_LAYOUT_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const tuple = clampPanelTuple(parsed.n, parsed.li);
        const sync = { ...defaultSync };
        if (parsed.sync && typeof parsed.sync === "object") {
          for (const k of Object.keys(defaultSync)) {
            if (typeof parsed.sync[k] === "boolean") sync[k] = parsed.sync[k];
          }
        }
        return { panels: tuple, sync };
      }
    } catch {
      /* fall through */
    }
  }

  const legacyRaw = readRaw(LEGACY_PANEL_STATE_KEY);
  if (legacyRaw && typeof layoutTupleFromId === "function") {
    try {
      const legacy = JSON.parse(legacyRaw);
      const layoutId = legacy && legacy.layout ? String(legacy.layout) : "";
      if (layoutId && layoutId !== "1") {
        const tuple = layoutTupleFromId(layoutId);
        if (tuple) return { panels: tuple, sync: { ...defaultSync } };
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function saveV9MultichartLayout(panels, sync, layoutId = null) {
  if (!panels || typeof panels !== "object") return;
  const tuple = clampPanelTuple(panels.n, panels.li);
  const payload = {
    version: V9_MULTICHART_LAYOUT_VERSION,
    n: tuple.n,
    li: tuple.li,
    sync: sync && typeof sync === "object" ? { ...sync } : {},
  };
  writeRaw(V9_MULTICHART_LAYOUT_KEY, payload);

  // Keep legacy chart_panel_state.layout in sync for older code paths.
  const legacyLayoutId = layoutId || (tuple.n <= 1 ? "1" : null);
  if (legacyLayoutId && legacyLayoutId !== "1") {
    try {
      const legacyRaw = readRaw(LEGACY_PANEL_STATE_KEY);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : {};
      if (legacy && typeof legacy === "object") {
        legacy.layout = legacyLayoutId;
        writeRaw(LEGACY_PANEL_STATE_KEY, JSON.stringify(legacy));
      }
    } catch {
      /* ignore */
    }
  }
}
