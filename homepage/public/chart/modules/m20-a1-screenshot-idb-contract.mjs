/**
 * M20-A1 / W2 — screenshots → IndexedDB contract (additive D-030 / I16).
 *
 * STATUS 2026-07-24: A1 LANDED (Fable-authored) inside order-manager.js as
 * kill-switched prototype methods (_m20A1*) — a classic-script engine cannot
 * import ESM, so the "narrowly scoped module" lives as a delimited OM section;
 * this contract module remains the schema/kill/inventory source of truth.
 *
 * Kill-switch (default ON = fix active when unset/false):
 *   window.__TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1 = true  → restore today's
 *   in-row base64 retention + serialize-time bytes (switch-OFF contract).
 *
 * Probes:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a1-screenshot-idb.red.test.mjs"   (baseline + landed guard)
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a1-screenshot-idb.green.test.mjs" (GREEN + switch-OFF kill)
 */

export const M20_A1_KILL_SWITCH = '__TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1';

/** Proposed IndexedDB database / store names (additive; no migration of unrelated stores). */
export const M20_A1_IDB = Object.freeze({
  dbName: 'talaria_m20_a1_screenshots_v1',
  dbVersion: 1,
  storeName: 'screenshots',
  /** keyPath for object store records */
  keyPath: 'refId',
});

/**
 * Additive I16 row fields (never destroy legacy base64 keys on restore).
 * When A1 ON: producers write refs + optional deferred blob; consumers resolve via IDB.
 * When A1 OFF / legacy rows: entryScreenshot / exitScreenshot remain data-URL strings.
 */
export const M20_A1_SCHEMA_V1 = Object.freeze({
  markKey: 'm20_a1_screenshot_idb_v1',
  refFields: Object.freeze({
    entry: 'entryScreenshotRef',
    exit: 'exitScreenshotRef',
    entryList: 'entryScreenshotRefs',
    rail: 'railScreenshotRefs',
  }),
  /** Legacy keys retained for I16 restore + switch-OFF byte parity */
  legacyBlobFields: Object.freeze([
    'entryScreenshot',
    'exitScreenshot',
    'entryScreenshots',
    'railScreenshots',
    'screenshot',
    'screenshotBase64',
    'image',
    'chartImage',
    'thumbnail',
    'preview',
    'screenshots',
  ]),
});

/**
 * Ref record shape stored in IndexedDB (blob bytes live only in IDB).
 * v2 (A1-F1 correction) adds `owner` — the authenticated account id; v1
 * records without it are quarantined (readable only via reachability
 * adoption; expired by retention). Additive: dbVersion stays 1.
 * @typedef {{
 *   refId: string,
 *   owner: string|null,
 *   sessionId: string|null,
 *   tradeId: string|number|null,
 *   role: 'entry'|'exit'|'rail'|'entryScaled'|string,
 *   mime: string,
 *   byteLength: number,
 *   createdAt: number,
 *   blob: Blob|ArrayBuffer|string,
 * }} M20A1ScreenshotRecord
 */

/**
 * A1-F1..F4 correction contract (2026-07-24, supersedes the quarantined
 * first land). Mirrors the _m20A1* implementation in order-manager.js.
 */
export const M20_A1_OWNER_V2 = Object.freeze({
  /**
   * Trustworthy owner key: window.__talariaUserId (set by the dist index
   * auth bootstrap from the authenticated /api/auth/me response) with the
   * localStorage '_uid' mirror as fallback — the exact identity pair the
   * repo's window.userKey()/userStorage per-user isolation already uses.
   * NEVER email/password-derived; NEVER forged. No owner ⇒ zero IDB writes
   * (rows keep legacy in-row blobs).
   */
  ownerSources: Object.freeze(['window.__talariaUserId', "localStorage['_uid']"]),
  /** v2 refId format (owner-namespaced). v1: a1:<sess>:<tid>:<role>[:<idx>] */
  refIdV2: 'a1:u<owner>:<sess>:<tid>:<role>[:<idx>]',
  /** every put/get/sweep validates record.owner against the current owner */
  ownerValidatedOps: Object.freeze(['put', 'get', 'retainedSweep', 'retentionSweep']),
  /**
   * v1 ownerless migration: adopt (stamp owner, durable put) ONLY when the
   * refId is referenced by the current account's loaded journal/closed
   * rows; otherwise quarantined (unreadable) until age expiry.
   */
  legacyMigration: 'adopt-if-reachable-else-quarantine-expire',
});

/** A1-F2 retention bounds (reachable refs are never deleted). */
export const M20_A1_RETENTION_V1 = Object.freeze({
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxRecords: 512,
  maxTotalBytes: 128 * 1024 * 1024,
  unreachableGraceMs: 10 * 60 * 1000,
  /** offline/failure: keep records (fail-soft); never bulk-delete without
   *  explicit confirmDurable from the logout lifecycle owner. */
  offlinePolicy: 'retain-fail-soft',
  logoutApi: '_m20A1PrivacyCleanOnLogout({ confirmDurable })',
});

/**
 * Release-gate correction contract (2026-07-24 second correction — the
 * reviewer BLOCK items beyond F1–F4). Mirrors the _m20A1* implementation.
 */
export const M20_A1_PERSIST_ORDERING_V1 = Object.freeze({
  /** owner + active session + row snapshot captured AT persistJournal() invocation */
  scopeCapture: Object.freeze(['owner', 'sessionId', 'journalSnapshotClone']),
  /** per-(owner|session) monotonic sequence; stale completions are dropped */
  sequencing: 'serialized-last-write-wins',
  /** completions after a session switch are DROPPED, never re-routed */
  sessionSwitchPolicy: 'drop-stale-completion-no-reroute',
  /** persistJournal() resolves { hotQueued, durableQueued, reason } */
  truthfulCompletion: 'promise-with-queue-result',
});

export const M20_A1_KILL_TRANSITION_V1 = Object.freeze({
  /** kill before A1 ever ran: rows carry no refs → ZERO IDB traffic, exact legacy */
  killBeforeA1: 'zero-idb-exact-legacy',
  /**
   * kill flipped AFTER externalization (runtime or boot): first display /
   * persist / export touch schedules ONE explicit recovery transition that
   * re-embeds refs from IDB back into rows (documented IDB reads — no false
   * zero-traffic claim), then closes the connection. Steady state afterwards
   * is exact legacy with zero IDB traffic. Durable persist + export FAIL
   * CLOSED (never null-blob+ref rows) until recovery completes; unresolved
   * refs stay in-row for byte preservation with a 30s retry backoff.
   */
  killAfterExternalize: 'one-time-reembed-transition-then-zero-idb',
  transitionApi: '_m20A1RunKillTransitionNow()',
});

export const M20_A1_MISSING_REF_POLICY_V1 = Object.freeze({
  /** durable/server queue: unresolved refs ⇒ patch NOT queued (server keeps last good state) */
  durablePersist: 'fail-closed-defer-and-retry',
  /** JSON export: unresolved refs ⇒ explicit error notification, NO download */
  export: 'fail-closed-explicit-error',
  /** rehydrate reports { unresolved } per batch; refs stay in-row (byte preservation) */
  reporting: '_m20A1RehydrateRowsForDurablePersist(rows, report)',
});

export const M20_A1_SPLIT_GROUP_GUARD_V1 = Object.freeze({
  /** open scaled AND split groups protect their legs from externalization */
  guard: '_m20A1RowInOpenScaledGroup: tradeGroupId(scaledTrades) + splitGroupId(splitTrades) + scaledGroupId',
  /** aggregate close resolves any leg refs back to bytes before collection */
  aggregatePropagation: '_m20A1RestoreLegBlobs(entries)',
});

export const M20_A1_DISPLAY_OVERLAY_V1 = Object.freeze({
  /** LRU cache stays 32 entries / 24 MB; overlay covers >cache groups + oversized values */
  overlay: Object.freeze({ maxEntries: 256, maxBytes: 64 * 1024 * 1024, ttlMs: 10_000 }),
  /** in-flight prefetch joiners each register a rerender; ALL fire on landing */
  fanOut: 'per-ref-waiter-list',
  /** trade-details rerender reopens ONLY while the modal still shows the same trade */
  staleSelectionGuard: '__m20A1DetailsShownKey',
});

export const M20_A1_SWEEP_SCAN_BOUNDS_V1 = Object.freeze({
  maxRowsPerPass: 16,
  maxScanPerPass: 4000,
  /** persistent resume cursor: 50k rows are walked incrementally, never rescanned per trigger */
  cursor: '__m20A1SweepCursor (reset on non-continue triggers)',
});

export const M20_A1_IMG_DATAURL_CONTRACT_V1 = Object.freeze({
  /** strict contract validated on EVERY IDB-rehydrated payload before HTML/src/persist use */
  pattern: '^data:image\\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$',
  minLength: 96,
  maxLength: 34 * 1024 * 1024,
  /** only strict-valid blobs are externalized; corrupt IDB values resolve null (miss) */
  choke: Object.freeze(['_m20A1IsExternalizableShot', '_m20A1ResolveRefBlob', '_m20A1CachePut']),
  /** export object URLs revoked (10s after download click) */
  objectUrlRevoke: true,
});

export const M20_A1_LOGOUT_BRIDGE_V1 = Object.freeze({
  channel: 'talaria:m20-a1:privacy-clean',
  requestType: 'talaria:m20-a1:privacy-clean:request',
  resultType: 'talaria:m20-a1:privacy-clean:result',
  /**
   * Architecture: DashboardShell navigates to /chart/ (no iframe, no window
   * handle) → BroadcastChannel is the transport (same-origin by
   * construction). The window 'message' listener (origin === own origin
   * only, reply to explicit event.origin — never '*') covers embedded hosts.
   */
  transports: Object.freeze(['BroadcastChannel(same-origin)', "window message (origin-validated, explicit-target reply)"]),
  /** the chart validates msg.owner === its own authenticated owner key */
  ownerValidation: true,
  /**
   * NO UNVERIFIED BULK DELETION: confirmDurable is never accepted from a
   * message — a durable server ack is not observable in this architecture,
   * so the reply is truthful: confirmDurable:false +
   * 'durable-ack-unavailable-bulk-delete-refused'. Records stay owner-locked
   * and expire via retention. PO decision needed for ack plumbing (chart.js
   * lane) before logout bulk wipe can ever be confirmed.
   */
  bulkDeletionPolicy: 'refused-without-verified-durable-ack',
  shellTimeoutMs: 1500,
  shellPolicy: 'fail-soft-logout-always-proceeds',
});

/**
 * In-row pointer written when A1 ON (additive alongside cleared/null legacy keys).
 * @typedef {{
 *   refId: string,
 *   mime?: string,
 *   byteLength?: number,
 *   role?: string,
 * }} M20A1ScreenshotRef
 */

export function m20A1ScreenshotIdbEnabled(scope = globalThis) {
  try {
    return !(scope && scope[M20_A1_KILL_SWITCH] === true);
  } catch (_) {
    return true;
  }
}

/** True when a string looks like an embedded chart screenshot data-URL. */
export function isEmbeddedScreenshotDataUrl(value) {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  return t.startsWith('data:image/') && t.length > 80;
}

/** Byte length of one screenshot-bearing value (string / array / rail objects). */
export function screenshotValueBytes(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    let n = 0;
    for (let i = 0; i < value.length; i++) n += screenshotValueBytes(value[i]);
    return n;
  }
  if (typeof value === 'object') {
    if (typeof value.dataUrl === 'string') return value.dataUrl.length;
    if (typeof value.screenshot === 'string') return value.screenshot.length;
    if (isEmbeddedScreenshotDataUrl(value.refId)) return 0;
    let n = 0;
    for (const k of M20_A1_SCHEMA_V1.legacyBlobFields) {
      if (Object.prototype.hasOwnProperty.call(value, k)) n += screenshotValueBytes(value[k]);
    }
    return n;
  }
  return 0;
}

/**
 * Sum embedded screenshot bytes retained on a list of order/journal rows
 * (in-memory retention proxy for M20-B A1).
 */
export function measureEmbeddedScreenshotBytes(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let total = 0;
  let rowsWithShots = 0;
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== 'object') continue;
    const before = total;
    for (const k of M20_A1_SCHEMA_V1.legacyBlobFields) {
      if (Object.prototype.hasOwnProperty.call(row, k)) total += screenshotValueBytes(row[k]);
    }
    // Nested journal metadata paths observed in durable rows.
    if (row.metadata && typeof row.metadata === 'object') {
      total += screenshotValueBytes(row.metadata);
    }
    if (row.journalEntry && typeof row.journalEntry === 'object') {
      total += screenshotValueBytes(row.journalEntry);
    }
    if (total > before) rowsWithShots += 1;
  }
  return { totalBytes: total, rowsWithShots, rowCount: list.length };
}

function stripLegacyScreenshotFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = { ...obj };
  for (const k of M20_A1_SCHEMA_V1.legacyBlobFields) {
    if (Object.prototype.hasOwnProperty.call(out, k)) delete out[k];
  }
  return out;
}

/**
 * Project the A1-ON serialize shape: strip legacy blob keys (incl. nested
 * metadata/journalEntry), keep additive refs.
 * Pure helper for future GREEN / switch discrimination — does not mutate product state.
 */
export function projectA1SlimRow(row, refs = {}) {
  if (!row || typeof row !== 'object') return row;
  const out = stripLegacyScreenshotFields(row);
  if (out.metadata && typeof out.metadata === 'object') {
    out.metadata = stripLegacyScreenshotFields(out.metadata);
  }
  if (out.journalEntry && typeof out.journalEntry === 'object') {
    out.journalEntry = stripLegacyScreenshotFields(out.journalEntry);
  }
  if (refs.entry) out[M20_A1_SCHEMA_V1.refFields.entry] = refs.entry;
  if (refs.exit) out[M20_A1_SCHEMA_V1.refFields.exit] = refs.exit;
  if (refs.entryList) out[M20_A1_SCHEMA_V1.refFields.entryList] = refs.entryList;
  if (refs.rail) out[M20_A1_SCHEMA_V1.refFields.rail] = refs.rail;
  out[M20_A1_SCHEMA_V1.markKey] = true;
  return out;
}

/**
 * Switch-OFF contract: when kill is true, serialize must retain today's embedded
 * base64 keys (byte parity with pre-A1 durable rows). Used by Fable GREEN/kill probes.
 */
export function switchOffRequiresEmbeddedBlobs(scope = globalThis) {
  return m20A1ScreenshotIdbEnabled(scope) === false;
}

/** Build a deterministic fat data-URL fixture (not a real image; byte-stable). */
export function makeFatScreenshotFixture(tag = 'A1', padChars = 48_000) {
  const pad = String(tag).charAt(0).repeat(Math.max(0, padChars));
  return `data:image/jpeg;base64,${pad}`;
}

/**
 * Q4 pre-stage anchors (trail_sl_path / sl_modifications) — Fable re-verified
 * 2026-07-24 a THIRD time after the A1 release-gate correction land (region
 * shifts +5 / +514 / +569 / +604 below the edited A1/persist/display/export
 * sites). Lines shift; re-verify before Q4 edit.
 */
export const M20_Q4_ANCHORS_PRESTAGE = Object.freeze({
  killSwitchProposed: '__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1',
  schemaMarkKey: 'm20_q4_trail_sl_path_cap_v1',
  additiveFields: Object.freeze([
    'trail_sl_path_archive',
    'trail_sl_path_tail_max',
    'sl_modifications_archive',
    'sl_modifications_tail_max',
  ]),
  sites: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: '_logSLTPModification → sl_modifications.push',
      line: 6192,
      needle: 'sl_modifications.push',
      note: 'uncapped audit log push',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'split-entry leg seed trail_sl_path: []',
      line: 29256,
      needle: 'trail_sl_path: []',
      note: 'additional seed site found during Fable re-verify',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'order init trail_sl_path: [] / sl_modifications: []',
      line: 29744,
      needle: 'trail_sl_path: []',
      note: 'market open seed',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'pending→market seed trail_sl_path / sl_modifications',
      line: 31744,
      needle: 'trail_sl_path: []',
      note: 'activation seed',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'trail_sl_path.push (BUY trail path)',
      line: 32330,
      needle: 'trail_sl_path.push',
      note: 'per-bar append; Q4 cap site',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'trail_sl_path.push (SELL trail path)',
      line: 32643,
      needle: 'trail_sl_path.push',
      note: 'per-bar append; Q4 cap site',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'heavy-field list includes trail_sl_path',
      line: 3989,
      needle: "'post_checkpoints', 'trail_sl_path'",
      note: 'M19-C already omits from hot persist; Q4 caps in-memory growth',
    },
  ]),
});

/**
 * A1 producer / consumer / serializer inventory (file:line, verified
 * 2026-07-24 pre-correction). NOTE: line numbers are the ORIGINAL survey
 * coordinates and have drifted with the A1 correction lands (+5/+514/+569/* +604 by region); the needles/symbols remain authoritative — the landed
 * RED guard resolves them by content, never by line.
 * Product files listed for Fable ownership — this module does not edit them.
 */
export const M20_A1_INVENTORY = Object.freeze({
  producers: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/screenshot-manager.js',
      symbol: 'captureChartSnapshot → toDataURL(jpeg/png)',
      line: 1576,
      note: 'canonical silent capture; returns data-URL string',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'place market → order.entryScreenshot = screenshot',
      line: 28569,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'pending activate → order.entryScreenshot = screenshot',
      line: 30626,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'scaled/split entry screenshot assign',
      line: 28983,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'close path exitScreenshot = captureChartSnapshot()',
      line: 11068,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'close path exitScreenshot (alt)',
      line: 11122,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: '_consumeV9RailScreenshotsForOrder → railScreenshots dataUrl',
      line: 23117,
    },
  ]),
  consumers: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'journal list UI <img src=entry/exitScreenshot>',
      line: 8333,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'trade detail screenshots grid + showScreenshotPreview',
      line: 9265,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'saveTradeToJournal embeds entry/exit/rail blobs',
      line: 11238,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'manual close journalEntry.entryScreenshot copy',
      line: 29695,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'upsertJournalEntry / tradeJournal.push retention',
      line: 38461,
    },
    {
      file: 'homepage/src/app/dashboard/sessionJournalUtils.ts',
      symbol: 'formatJournalCell* compact labels for base64',
      line: 40,
      note: 'dashboard display only; truncates tooltips',
    },
  ]),
  serializers: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'persistJournal durable JSON clone (full blobs)',
      line: 6027,
      note: 'critical queue keeps base64; hot trim omits via M19-C',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: '_m19HotPersistHeavyFieldKeys includes screenshot keys',
      line: 3975,
    },
    {
      file: 'chart v 1.4/chart/modules/order-host-store.mjs',
      symbol: 'buildHostOrderStoreSnapshot clones journal w/ blobs',
      line: 123,
    },
    {
      file: 'chart v 1.4/chart/modules/order-host-store.mjs',
      symbol: 'buildHostRuntimePnlSnapshot omits screenshots',
      line: 96,
      note: 'already bounded; A1 must not regress',
    },
    {
      file: 'chart v 1.4/chart/chart.js',
      symbol: 'local backup serializer (Q3 sibling; DO NOT EDIT in W2 prep)',
      line: 11125,
      note: 'listed for boundary only — W2 must not touch chart.js',
    },
  ]),
  storagePatternsToday: Object.freeze([
    'userStorage / localStorage dual-tier session backup (hot slim + durable full)',
    'session PATCH critical path carries durable journal with base64 (A1 rehydrates before queue)',
    'pre-A1 baseline: NO IndexedDB utilities existed (A1 store now lives in order-manager.js)',
    'sessionStorage used for dismiss tokens / drawings-403 — not a screenshot store',
  ]),
});
