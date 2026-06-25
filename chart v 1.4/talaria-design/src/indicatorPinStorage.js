/** Persist V9 Indicators dialog pinned rows across refresh (userStorage + localStorage). */

export const IND_PINNED_STORAGE_KEY = "talaria_v9_ind_pinned";
export const IND_PINNED_STORAGE_VERSION = 1;

function readRaw() {
  if (typeof window === "undefined") return null;
  try {
    return window.userStorage?.getItem?.(IND_PINNED_STORAGE_KEY) ?? localStorage.getItem(IND_PINNED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(payload) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(payload);
    if (window.userStorage?.setItem) window.userStorage.setItem(IND_PINNED_STORAGE_KEY, json);
    else localStorage.setItem(IND_PINNED_STORAGE_KEY, json);
  } catch {
    /* quota / private mode */
  }
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  ids.forEach((id) => {
    const key = id != null ? String(id).trim() : "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

export function loadIndPinned() {
  const raw = readRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeIds(parsed);
    if (parsed && Array.isArray(parsed.pinned)) return normalizeIds(parsed.pinned);
  } catch {
    /* ignore corrupt storage */
  }
  return [];
}

export function saveIndPinned(ids) {
  writeRaw({
    version: IND_PINNED_STORAGE_VERSION,
    pinned: normalizeIds(ids),
  });
}
