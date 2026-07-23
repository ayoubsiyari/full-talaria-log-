/**
 * Indicator settings templates — personal (profile sync) + global share-by-ID.
 * Used by V9 indicator settings (Talaria FVG / Ratio+Gap / Weekly Map, etc.).
 */

export const INDICATOR_SETTINGS_TEMPLATES_KEY = "indicator_settings_templates";

/**
 * Copy text with Clipboard API + legacy textarea fallback.
 * navigator.clipboard often fails inside chart iframes / non-secure origins.
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? "");
  if (!value) return false;

  try {
    if (typeof navigator !== "undefined"
      && navigator.clipboard
      && typeof navigator.clipboard.writeText === "function"
      && typeof window !== "undefined"
      && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_e) { /* fall through */ }

  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch (_e) {
    return false;
  }
}

function userStorageGet(key) {
  try {
    if (typeof window !== "undefined" && window.userStorage?.getItem) {
      return window.userStorage.getItem(key);
    }
  } catch (_e) { /* ignore */ }
  try {
    return localStorage.getItem(key);
  } catch (_e) {
    return null;
  }
}

function userStorageSet(key, value) {
  try {
    if (typeof window !== "undefined" && window.userStorage?.setItem) {
      window.userStorage.setItem(key, value);
      return;
    }
  } catch (_e) { /* ignore */ }
  try {
    localStorage.setItem(key, value);
  } catch (_e) { /* ignore */ }
}

function authHeaders() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function newLocalId() {
  return `ist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Snapshot draft params suitable for save/share (plain JSON). */
export function snapshotIndicatorSettingsDraft(draft) {
  if (!draft || typeof draft !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(draft));
  } catch (_e) {
    return { ...draft };
  }
}

export function loadAllIndicatorSettingsTemplates() {
  if (typeof window !== "undefined" && window.preferencesSync?.get) {
    const fromSync = window.preferencesSync.get(INDICATOR_SETTINGS_TEMPLATES_KEY, null);
    if (fromSync && typeof fromSync === "object") return fromSync;
  }
  try {
    const raw = userStorageGet(INDICATOR_SETTINGS_TEMPLATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

export function loadIndicatorSettingsTemplates(indicatorType) {
  const key = String(indicatorType || "").toLowerCase();
  if (!key) return [];
  const all = loadAllIndicatorSettingsTemplates();
  return Array.isArray(all[key]) ? all[key] : [];
}

export function saveIndicatorSettingsTemplatesForType(indicatorType, templates) {
  const key = String(indicatorType || "").toLowerCase();
  if (!key) return;
  const all = { ...loadAllIndicatorSettingsTemplates() };
  all[key] = Array.isArray(templates) ? templates : [];
  if (typeof window !== "undefined" && window.preferencesSync?.updatePreference) {
    window.preferencesSync.updatePreference(INDICATOR_SETTINGS_TEMPLATES_KEY, all);
    return;
  }
  userStorageSet(INDICATOR_SETTINGS_TEMPLATES_KEY, JSON.stringify(all));
}

export function saveNamedIndicatorSettingsTemplate(indicatorType, name, draft, opts = {}) {
  const key = String(indicatorType || "").toLowerCase();
  const label = String(name || "").trim();
  if (!key || !label) return null;
  const list = loadIndicatorSettingsTemplates(key).slice();
  const row = {
    id: opts.id || newLocalId(),
    name: label,
    indicatorType: key,
    params: snapshotIndicatorSettingsDraft(draft),
    shareId: opts.shareId || null,
    updatedAt: new Date().toISOString(),
  };
  const existingIdx = list.findIndex((t) => String(t.name).toLowerCase() === label.toLowerCase());
  if (existingIdx >= 0) {
    row.id = list[existingIdx].id;
    list[existingIdx] = row;
  } else {
    list.push(row);
  }
  saveIndicatorSettingsTemplatesForType(key, list);
  return row;
}

export function deleteIndicatorSettingsTemplate(indicatorType, templateId) {
  const key = String(indicatorType || "").toLowerCase();
  const list = loadIndicatorSettingsTemplates(key).filter((t) => t.id !== templateId);
  saveIndicatorSettingsTemplatesForType(key, list);
}

/**
 * Publish current settings as a global shareable template ID.
 * @returns {Promise<{ shareId: string, name: string, indicatorType: string }>}
 */
export async function publishIndicatorSettingsTemplate({ indicatorType, name, params }) {
  const body = {
    indicator_type: String(indicatorType || "").toLowerCase(),
    name: String(name || "").trim() || "Untitled",
    params: snapshotIndicatorSettingsDraft(params),
  };
  const res = await fetch("/api/chart/indicator-settings-templates", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const err = new Error(data?.error || `Publish failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return {
    shareId: data.share_id || data.shareId,
    name: data.name || body.name,
    indicatorType: data.indicator_type || body.indicator_type,
  };
}

/**
 * Load a globally shared template by ID (any user with the id).
 */
export async function fetchIndicatorSettingsTemplateByShareId(shareId) {
  const id = String(shareId || "").trim();
  if (!id) throw new Error("Enter a template ID");
  const res = await fetch(`/api/chart/indicator-settings-templates/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const err = new Error(data?.error || `Template not found (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return {
    shareId: data.share_id || id,
    name: data.name || "Shared template",
    indicatorType: String(data.indicator_type || "").toLowerCase(),
    params: data.params && typeof data.params === "object" ? data.params : {},
  };
}

/**
 * Import shared template into personal profile list (and return payload for apply).
 */
export async function importSharedIndicatorSettingsTemplate(shareId, { saveToProfile = true } = {}) {
  const remote = await fetchIndicatorSettingsTemplateByShareId(shareId);
  if (saveToProfile && remote.indicatorType) {
    saveNamedIndicatorSettingsTemplate(
      remote.indicatorType,
      remote.name,
      remote.params,
      { shareId: remote.shareId }
    );
  }
  return remote;
}
