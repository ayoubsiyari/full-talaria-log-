/** Persist V16 dashboard library source selection across page refresh (embedded live only). */

export const V16_APPLIED_SOURCE_STORAGE_KEY = "talaria_v16_applied_source_v1";

/** @typedef {{ kind: string, id: string|number, sessionId?: string|number, label?: string, rollbackAllowed?: boolean, liveAccountId?: number, profileId?: number, accountTypeKey?: string, journalCat?: string, hasEditedTrades?: boolean }} V16AppliedSourceLike */

/**
 * @param {unknown} raw
 * @returns {V16AppliedSourceLike|null}
 */
export function normalizeAppliedSource(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const kind = String(rec.kind || "").trim();
  const id = rec.id;
  if (!kind || id == null || id === "") return null;
  return {
    kind,
    id,
    sessionId: rec.sessionId ?? rec.session_id ?? undefined,
    label: rec.label != null ? String(rec.label) : undefined,
    rollbackAllowed: rec.rollbackAllowed != null ? !!rec.rollbackAllowed : undefined,
    liveAccountId: rec.liveAccountId != null ? Number(rec.liveAccountId) : undefined,
    profileId: rec.profileId != null ? Number(rec.profileId) : undefined,
    accountTypeKey: rec.accountTypeKey != null ? String(rec.accountTypeKey) : undefined,
    journalCat: rec.journalCat != null ? String(rec.journalCat) : undefined,
    hasEditedTrades: rec.hasEditedTrades != null ? !!rec.hasEditedTrades : undefined,
  };
}

/**
 * @returns {V16AppliedSourceLike|null}
 */
export function readPersistedAppliedSource() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(V16_APPLIED_SOURCE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAppliedSource(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @param {V16AppliedSourceLike|null|undefined} source
 */
export function writePersistedAppliedSource(source) {
  if (typeof window === "undefined") return;
  try {
    if (!source?.kind || source.id == null) {
      localStorage.removeItem(V16_APPLIED_SOURCE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(V16_APPLIED_SOURCE_STORAGE_KEY, JSON.stringify(source));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {V16AppliedSourceLike|null|undefined} source
 * @param {{ sessions?: { id?: string|number }[], journal?: { accounts?: { id?: string|number, isLiveJournalAccount?: boolean }[] }, strategies?: { id?: string }[] }} boot
 * @returns {V16AppliedSourceLike|null}
 */
export function validateAppliedSourceAgainstBoot(source, boot) {
  const normalized = normalizeAppliedSource(source);
  if (!normalized) return null;
  const sessions = Array.isArray(boot?.sessions) ? boot.sessions : [];
  const accounts = Array.isArray(boot?.journal?.accounts) ? boot.journal.accounts : [];
  const strategies = Array.isArray(boot?.strategies) ? boot.strategies : [];

  if (normalized.kind === "session" || normalized.kind === "strategyJournal") {
    const sid = String(normalized.sessionId ?? normalized.id);
    const match = sessions.find((s) => String(s?.id) === sid);
    if (!match) return null;
    return {
      ...normalized,
      sessionId: match.id,
      id: normalized.kind === "session" ? match.id : normalized.id,
      label: normalized.label || String(match.name || "Backtest"),
      rollbackAllowed: normalized.rollbackAllowed ?? true,
    };
  }

  if (normalized.kind === "journalAccount") {
    const match = accounts.find(
      (a) =>
        a?.isLiveJournalAccount !== false
        && (String(a?.id) === String(normalized.id)
          || (normalized.liveAccountId != null && String(a?.liveAccountId) === String(normalized.liveAccountId)))
    );
    if (!match) return null;
    return {
      ...normalized,
      id: match.id,
      label: normalized.label || String(match.name || "Journal").split(" / ")[0],
      liveAccountId: match.liveAccountId ?? normalized.liveAccountId,
      profileId: match.profileId ?? normalized.profileId,
      accountTypeKey: match.accountTypeKey ?? normalized.accountTypeKey,
    };
  }

  if (normalized.kind === "strategy") {
    const match = strategies.find((s) => String(s?.id) === String(normalized.id));
    if (!match) return null;
    return {
      ...normalized,
      id: match.id,
      label: normalized.label || String(match.label || "Strategy"),
    };
  }

  if (normalized.kind === "journalEntry") {
    return normalized;
  }

  return null;
}

/**
 * @param {V16AppliedSourceLike|null|undefined} source
 * @param {{ sessions?: { id?: string|number }[], journal?: { accounts?: { id?: string|number, isLiveJournalAccount?: boolean }[] }, strategies?: { id?: string }[] }} boot
 * @returns {V16AppliedSourceLike|null}
 */
export function resolvePersistedAppliedSourceForBoot(boot) {
  return validateAppliedSourceAgainstBoot(readPersistedAppliedSource(), boot);
}
