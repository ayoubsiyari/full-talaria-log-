/** V9 / V16 chart color template persistence (local userStorage + preferences cloud sync). */

export const V9_CHART_TEMPLATES_STORAGE_KEY = "v9CustomChartTemplates";

export function normalizeV9ChartTemplateEntry(t, fallbackSettings = {}) {
  if (!t || typeof t.n !== "string" || !t.n.trim()) return null;
  const tplSettings = t.settings && typeof t.settings === "object" ? t.settings : {};
  const merged = { ...fallbackSettings, ...tplSettings };
  delete merged.chartTemplate;
  const fallbackCols = [merged.bullBody, merged.bearBody, merged.background];
  return {
    n: t.n.trim(),
    cols: Array.isArray(t.cols) && t.cols.length === 3 ? t.cols : fallbackCols,
    settings: merged,
  };
}

export function normalizeV9ChartTemplates(parsed, fallbackSettings = {}) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((t) => normalizeV9ChartTemplateEntry(t, fallbackSettings))
    .filter(Boolean);
}

export function readV9ChartTemplatesLocal(fallbackSettings = {}) {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.userStorage?.getItem?.(V9_CHART_TEMPLATES_STORAGE_KEY) ??
      localStorage.getItem(V9_CHART_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    return normalizeV9ChartTemplates(JSON.parse(raw), fallbackSettings);
  } catch {
    return [];
  }
}

export function writeV9ChartTemplatesLocal(templates) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify(Array.isArray(templates) ? templates : []);
    if (window.userStorage?.setItem) {
      window.userStorage.setItem(V9_CHART_TEMPLATES_STORAGE_KEY, payload);
    } else {
      localStorage.setItem(V9_CHART_TEMPLATES_STORAGE_KEY, payload);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function persistV9ChartTemplates(templates) {
  const list = Array.isArray(templates) ? templates : [];
  writeV9ChartTemplatesLocal(list);
  if (typeof window !== "undefined" && typeof window.saveV9ChartTemplates === "function") {
    window.saveV9ChartTemplates(list);
    return;
  }
  scheduleV9ChartTemplatesCloudSync(list);
}

let _v9TplCloudTimer = null;

function scheduleV9ChartTemplatesCloudSync(templates) {
  if (typeof window === "undefined") return;
  if (_v9TplCloudTimer) clearTimeout(_v9TplCloudTimer);
  _v9TplCloudTimer = setTimeout(() => {
    syncV9ChartTemplatesCloudDirect(templates).catch(() => {});
  }, 2000);
}

async function resolveJournalTokenForPreferences() {
  if (typeof window === "undefined") return null;
  try {
    const existing = localStorage.getItem("token");
    if (existing) return existing;
    const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const t = data?.journal_token;
    if (typeof t !== "string" || !t.trim()) return null;
    localStorage.setItem("token", t.trim());
    return t.trim();
  } catch {
    return null;
  }
}

export async function syncV9ChartTemplatesCloudDirect(templates) {
  if (typeof window === "undefined") return false;
  const token = await resolveJournalTokenForPreferences();
  if (!token) return false;
  const list = Array.isArray(templates) ? templates : [];
  try {
    const res = await fetch("/api/chart/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ v9_chart_templates: list }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function hydrateV9ChartTemplatesFromCloud(fallbackSettings = {}) {
  const local = readV9ChartTemplatesLocal(fallbackSettings);
  if (typeof window === "undefined") return local;

  if (window.preferencesSync?.isReady?.()) {
    const cloud = normalizeV9ChartTemplates(
      window.preferencesSync.get("v9_chart_templates", []),
      fallbackSettings
    );
    const merged = mergeV9ChartTemplatesByName(local, cloud);
    if (merged.length > 0) writeV9ChartTemplatesLocal(merged);
    return merged.length > 0 ? merged : local;
  }

  const token = await resolveJournalTokenForPreferences();
  if (!token) return local;

  try {
    const res = await fetch("/api/chart/preferences", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return local;
    const data = await res.json();
    const cloud = normalizeV9ChartTemplates(
      data?.preferences?.v9_chart_templates,
      fallbackSettings
    );
    const merged = mergeV9ChartTemplatesByName(local, cloud);
    if (merged.length > 0) writeV9ChartTemplatesLocal(merged);
    if (cloud.length === 0 && local.length > 0) {
      scheduleV9ChartTemplatesCloudSync(local);
    }
    return merged.length > 0 ? merged : local;
  } catch {
    return local;
  }
}

export function loadV9ChartTemplatesInitial(fallbackSettings = {}) {
  if (typeof window !== "undefined" && window.preferencesSync?.isReady?.()) {
    const cloud = window.preferencesSync.get("v9_chart_templates", null);
    if (Array.isArray(cloud) && cloud.length > 0) {
      return normalizeV9ChartTemplates(cloud, fallbackSettings);
    }
  }
  if (typeof window !== "undefined" && typeof window.loadV9ChartTemplates === "function") {
    const cloud = window.loadV9ChartTemplates();
    if (Array.isArray(cloud) && cloud.length > 0) {
      return normalizeV9ChartTemplates(cloud, fallbackSettings);
    }
  }
  return readV9ChartTemplatesLocal(fallbackSettings);
}

export function mergeV9ChartTemplatesByName(existing, incoming) {
  const byName = new Map();
  (Array.isArray(existing) ? existing : []).forEach((t) => {
    if (t?.n) byName.set(t.n, t);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((t) => {
    if (t?.n) byName.set(t.n, t);
  });
  return Array.from(byName.values());
}

export function snapshotV9TemplateSettings(src) {
  const snap = { ...(src || {}) };
  delete snap.chartTemplate;
  return snap;
}

export function buildV9ChartTemplateSnapshot(name, srcSettings, fallbackSettings = {}) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  const settings = snapshotV9TemplateSettings({ ...fallbackSettings, ...(srcSettings || {}) });
  return {
    n: cleanName,
    cols: [settings.bullBody, settings.bearBody, settings.background],
    settings,
  };
}

/** Update list, persist locally + cloud immediately (safe to call from setState updater). */
export function upsertV9ChartTemplateList(prev, name, srcSettings, fallbackSettings = {}) {
  const snap = buildV9ChartTemplateSnapshot(name, srcSettings, fallbackSettings);
  if (!snap) return Array.isArray(prev) ? prev : [];
  const next = [...(Array.isArray(prev) ? prev : []).filter((t) => t.n !== snap.n), snap];
  persistV9ChartTemplates(next);
  return next;
}

/** Remove one template by index and persist. */
export function deleteV9ChartTemplateAtIndex(prev, index) {
  const list = Array.isArray(prev) ? prev : [];
  const next = list.filter((_, i) => i !== index);
  persistV9ChartTemplates(next);
  return next;
}
