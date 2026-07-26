/**
 * M20-Q4 / W2 — trail_sl_path + sl_modifications bounded-tail cap contract
 * (additive D-030 / I16). TEST/CONTRACT/RED-PREP ONLY — NOT wired into
 * order-manager.js (both trees LOCKED pending Manager's A1 commit).
 *
 * Status: FABLE-Q4-RED-READY-PENDING-A1-COMMIT (inventory independently
 * re-verified and signed by W2 Fable 2026-07-24; supersedes the capacity-
 * fallback draft, which mislabeled persistence sites and modeled trail
 * archiving as lossless-forever — NOT the M19-B sibling semantics).
 *
 * Kill-switch (single, proposed; default ON = fix active when unset/false):
 *   window.__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1 = true
 *   → restore today's uncapped per-bar / per-mod append + persist byte class.
 *   Pre-existing archives are NEVER destroyed under kill; reconstruct stays valid.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RETENTION SEMANTICS v2 (justified from the full consumer audit below)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * trail_sl_path — per-bar numeric DIAGNOSTIC series (one float per trailing
 * bar). EXACT M19-B `_m19ArchiveAndBoundExcursionSeries` mirror (two-phase):
 *   1. live tail rolls at 256 (`trailSlPathTailMax`, same constant class as
 *      the excursion tail — same per-bar cadence, same UI window);
 *   2. FIRST activation archives the dropped legacy prefix and stamps
 *      `trail_sl_path_legacy_pending` = legacy samples still in the tail;
 *      while pending > 0, legacy samples continue to archive as they roll
 *      off (no dups, order preserved) — I16: restored uncapped rows lose
 *      NOTHING;
 *   3. after legacy pending drains, the archive FREEZES; new drops fold into
 *      running scalars only: `trail_sl_last`, `trail_sl_min`, `trail_sl_max`,
 *      `trail_sl_path_count`.
 * Consumer proof this is safe:
 *   - OM analytics (L6635) needs presence only → `trail_sl_path_count` ≥ live
 *     length always suffices;
 *   - dashboard path cloud (tradePathCloudUtils.js L85) plots the path; it
 *     ALREADY reconstructs archive‖tail for the six excursion series
 *     (EXCURSION_SERIES_KEYS L30–67) which landed GREEN with these exact
 *     two-phase semantics — trail joins the same acceptance class;
 *   - extrema/earliest/latest needed by UI/summary are preserved as scalars
 *     (min/max/last/count) — bump-on-append, never rescanned;
 *   - MONEY PATH never reads trail_sl_path: stop enforcement uses the
 *     `stopLoss` scalar; accounting uses `initial_sl` / `active_sl_at_exit`.
 *
 * sl_modifications — AUDIT/DISCIPLINE event log (objects: bar, time, field,
 * old, new, trigger). LOSSLESS archive‖tail — the archive NEVER freezes:
 *   1. live tail rolls at 64 (`slModificationsTailMax`);
 *   2. EVERY dropped event is appended to `sl_modifications_archive` in
 *      order (concat reproduces exact append order);
 *   3. `sl_modifications_count` + `sl_mod_trigger_counts` (per-trigger
 *      tallies) stamped additively.
 * Why lossless (asymmetric vs trail): D-030/audit binding — OM discipline
 * analytics (L6648–6650) does WHOLE-ARRAY trigger scans (MANUAL,
 * MANUAL+TP-field, MANUAL_OVERRIDE_TRAIL); v16JournalMappers passes the
 * array through to the journal UI. Silent loss of a MANUAL event would
 * corrupt discipline stats. Cost is bounded in practice: event cadence is
 * ~1 per 12 trailing bars + rare MANUAL drags (≈437 events per 5 000-bar
 * session ≈ 60 KB), and BOTH `sl_modifications` and its archive leave the
 * hot persist tier via heavy keys (H4/H7) so serialize cost is zero.
 *
 * Shared rules:
 *   - Storage stays DISJOINT (live + archive); reconstruct = archive.concat(live).
 *   - Export/UI projection reconstructs into the base key exactly once and
 *     drops archive keys from the view — idempotent (P(P(row)) === P(row)),
 *     mirroring `_m19ProjectTradeExcursionFields`.
 *   - Grouped trades (scaled/split): aggregate close copies flatMap the
 *     PER-LEG RECONSTRUCT in leg order (today they flatMap raw arrays —
 *     L32752/L32960); single close copies the reconstruct (L33085).
 *   - Restore (I16): legacy uncapped rows restore untouched; first NEW
 *     append triggers the first-activation wave. Q4-shaped rows restore
 *     verbatim (copyIfMissing set mirrors M19 block at ~L5176).
 *   - Hot persist: add `sl_modifications`, `trail_sl_path_archive`,
 *     `sl_modifications_archive` to `_m19HotPersistHeavyFieldKeys` (L3980)
 *     AND to the server mirror `_HOT_PERSIST_HEAVY_KEYS` in
 *     session_journal_store.py (L459) — prefer-richer merge then protects
 *     rows when hot patches omit them.
 *
 * Run RED probe:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q4-trail-sl-path-cap.red.test.mjs"
 */

export const M20_Q4_KILL_SWITCH = '__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1';

export const M20_Q4_SCHEMA_V1 = Object.freeze({
  markKey: 'm20_q4_trail_sl_path_cap_v1',
  /** Match M19-B excursion live tail (same per-bar cadence + UI window). */
  trailSlPathTailMax: 256,
  /** Audit-event log — smaller live window; archive is lossless. */
  slModificationsTailMax: 64,
  liveFields: Object.freeze(['trail_sl_path', 'sl_modifications']),
  additiveFields: Object.freeze([
    'trail_sl_path_archive',
    'trail_sl_path_count',
    'trail_sl_path_tail_max',
    'trail_sl_last',
    'trail_sl_min',
    'trail_sl_max',
    'trail_sl_path_legacy_pending',
    'sl_modifications_archive',
    'sl_modifications_count',
    'sl_modifications_tail_max',
    'sl_mod_trigger_counts',
    'm20_q4_trail_sl_path_cap_v1',
  ]),
  /** Must be added to `_m19HotPersistHeavyFieldKeys` AND the server mirror when Q4 lands. */
  heavyKeysToAdd: Object.freeze([
    'sl_modifications',
    'trail_sl_path_archive',
    'sl_modifications_archive',
  ]),
  /** Known trigger vocabulary (from the 7 verified `_logSLTPModification` callers). */
  slModTriggers: Object.freeze([
    'AUTO_BE', 'AUTO_BE_RECALC', 'TRAIL', 'MANUAL', 'MANUAL_OVERRIDE_TRAIL',
  ]),
});

export function m20Q4TrailSlPathCapEnabled(scope = globalThis) {
  try {
    return !(scope && scope[M20_Q4_KILL_SWITCH] === true);
  } catch (_) {
    return true;
  }
}

export function switchOffRequiresUnboundedArrays(scope = globalThis) {
  return m20Q4TrailSlPathCapEnabled(scope) === false;
}

/** Today's producer behavior: uncapped push of trailing SL sample. */
export function appendTrailSlPathUnbounded(position, stopLoss) {
  if (!position) return;
  if (!Array.isArray(position.trail_sl_path)) position.trail_sl_path = [];
  position.trail_sl_path.push(stopLoss);
}

/** Today's producer behavior: uncapped SL/TP modification audit push. */
export function appendSlModificationUnbounded(position, entry) {
  if (!position) return;
  if (!Array.isArray(position.sl_modifications)) position.sl_modifications = [];
  position.sl_modifications.push(entry);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTABLE SPEC MODELS — the state machines the future product helpers
// (`_m20Q4BoundTrailSlPath` / `_m20Q4BoundSlModifications`) must implement.
// Pure JS on plain rows; RED tests drive long synthetic sessions through
// these so GREEN can later assert product ≡ model.
// ═══════════════════════════════════════════════════════════════════════════

function bumpTrailScalars(position, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  position.trail_sl_last = v;
  if (position.trail_sl_min == null || v < position.trail_sl_min) position.trail_sl_min = v;
  if (position.trail_sl_max == null || v > position.trail_sl_max) position.trail_sl_max = v;
}

/**
 * Model append for trail_sl_path under Q4 (kill-aware).
 * Two-phase M19-B mirror: first-activation legacy archive → pending drain →
 * archive freeze (new drops fold into scalars only). Trim keeps the SAME
 * array identity (shift / copyWithin), matching the M19-G allocation rule.
 */
export function modelQ4AppendTrail(position, stopLoss, opts = {}) {
  if (!position) return;
  const scope = opts.scope !== undefined ? opts.scope : globalThis;
  if (!m20Q4TrailSlPathCapEnabled(scope)) {
    appendTrailSlPathUnbounded(position, stopLoss);
    return;
  }
  const max = Number(opts.trailMax) > 0
    ? Number(opts.trailMax)
    : M20_Q4_SCHEMA_V1.trailSlPathTailMax;

  if (!Array.isArray(position.trail_sl_path)) position.trail_sl_path = [];
  position.trail_sl_path.push(stopLoss);
  position.trail_sl_path_count = (Number(position.trail_sl_path_count) || 0) + 1;
  position.trail_sl_path_tail_max = max;
  bumpTrailScalars(position, stopLoss);
  position[M20_Q4_SCHEMA_V1.markKey] = true;

  const arr = position.trail_sl_path;
  if (arr.length <= max) return;
  const drop = arr.length - max;
  const firstActivation = !Array.isArray(position.trail_sl_path_archive);

  if (firstActivation) {
    // Samples that existed before this append (exclude the brand-new tip).
    const preCount = Math.max(0, arr.length - 1);
    position.trail_sl_path_archive = arr.slice(0, drop);
    position.trail_sl_path_legacy_pending = Math.max(0, preCount - drop);
    // Count bootstrap: legacy samples were never counted through this model.
    if (position.trail_sl_path_count < arr.length) {
      position.trail_sl_path_count = arr.length;
    }
    // Extrema bootstrap from the full pre-existing history (one-time scan).
    for (let i = 0; i < arr.length; i++) bumpTrailScalars(position, arr[i]);
    position.trail_sl_last = Number(arr[arr.length - 1]);
  } else {
    let pending = Number(position.trail_sl_path_legacy_pending);
    if (!Number.isFinite(pending) || pending < 0) pending = 0;
    const archiveLegacy = Math.min(drop, pending);
    for (let i = 0; i < archiveLegacy; i++) {
      position.trail_sl_path_archive.push(arr[i]);
    }
    position.trail_sl_path_legacy_pending = pending - archiveLegacy;
    // Non-legacy drops: scalars already bumped on append — archive FROZEN.
  }

  // In-place trim, same identity (M19-G allocation rule).
  const removeCount = arr.length - max;
  if (removeCount === 1) {
    arr.shift();
  } else {
    arr.copyWithin(0, removeCount);
    arr.length = max;
  }
}

function bumpTriggerCount(position, trigger) {
  if (!position.sl_mod_trigger_counts || typeof position.sl_mod_trigger_counts !== 'object') {
    position.sl_mod_trigger_counts = {};
  }
  const key = String(trigger || 'UNKNOWN');
  position.sl_mod_trigger_counts[key] = (Number(position.sl_mod_trigger_counts[key]) || 0) + 1;
}

/**
 * Model append for sl_modifications under Q4 (kill-aware).
 * LOSSLESS archive‖tail: every dropped event is archived in order — the
 * archive never freezes (audit log; D-030 binding).
 */
export function modelQ4AppendSlMod(position, entry, opts = {}) {
  if (!position) return;
  const scope = opts.scope !== undefined ? opts.scope : globalThis;
  if (!m20Q4TrailSlPathCapEnabled(scope)) {
    appendSlModificationUnbounded(position, entry);
    return;
  }
  const max = Number(opts.modMax) > 0
    ? Number(opts.modMax)
    : M20_Q4_SCHEMA_V1.slModificationsTailMax;

  if (!Array.isArray(position.sl_modifications)) position.sl_modifications = [];
  position.sl_modifications.push(entry);
  position.sl_modifications_count = (Number(position.sl_modifications_count) || 0) + 1;
  position.sl_modifications_tail_max = max;
  bumpTriggerCount(position, entry && entry.trigger);
  position[M20_Q4_SCHEMA_V1.markKey] = true;

  const arr = position.sl_modifications;
  if (arr.length <= max) return;
  const drop = arr.length - max;
  if (!Array.isArray(position.sl_modifications_archive)) {
    position.sl_modifications_archive = [];
    // First activation on a legacy row: earlier events were never counted
    // through this model — bootstrap count and trigger tallies losslessly.
    if (position.sl_modifications_count < arr.length) {
      position.sl_modifications_count = arr.length;
      position.sl_mod_trigger_counts = {};
      for (let i = 0; i < arr.length; i++) bumpTriggerCount(position, arr[i] && arr[i].trigger);
    }
  }
  for (let i = 0; i < drop; i++) {
    position.sl_modifications_archive.push(arr[i]);
  }
  if (drop === 1) {
    arr.shift();
  } else {
    arr.copyWithin(0, drop);
    arr.length = max;
  }
}

/** Reconstruct archive ‖ live (disjoint partition — exact append order, no dups). */
export function reconstructQ4Series(row, key) {
  const archive = Array.isArray(row?.[`${key}_archive`]) ? row[`${key}_archive`] : [];
  const live = Array.isArray(row?.[key]) ? row[key] : [];
  return archive.concat(live);
}

/**
 * Export/UI projection: reconstruct once into the base key, drop archive keys
 * from the view. Idempotent — P(P(row)) === P(row). Never used for persist.
 */
export function projectQ4RowForExport(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of M20_Q4_SCHEMA_V1.liveFields) {
    const archKey = `${key}_archive`;
    if (Array.isArray(row[key]) || Array.isArray(row[archKey])) {
      out[key] = reconstructQ4Series(row, key);
    }
    if (Object.prototype.hasOwnProperty.call(out, archKey)) delete out[archKey];
  }
  return out;
}

/**
 * Model of the CLOSE-time journal copy under Q4:
 * - single close: copy the per-position reconstruct;
 * - scaled/split aggregate: flatMap PER-LEG reconstruct in leg order
 *   (today's product flatMaps raw arrays — L32752 / L32960 / L33085).
 * Returns the two audit fields only (callers merge into the journal row).
 */
export function modelQ4JournalCopyFields(entries) {
  const legs = Array.isArray(entries) ? entries : [entries];
  return {
    sl_modifications: legs.flatMap((e) => reconstructQ4Series(e, 'sl_modifications')),
    trail_sl_path: legs.flatMap((e) => reconstructQ4Series(e, 'trail_sl_path')),
  };
}

/**
 * Model of the discipline analytics scans (OM L6648–6650) made archive-aware.
 * GREEN requirement: results identical to running today's `.some()` scans on
 * the unbounded arrays.
 */
export function modelQ4DisciplineScan(row) {
  const mods = reconstructQ4Series(row, 'sl_modifications');
  return {
    slModified: mods.some((m) => m && m.trigger === 'MANUAL'),
    tpModified: mods.some((m) => m && m.trigger === 'MANUAL' && String(m.field || '').includes('TP')),
    trailOverridden: !!row?.trail_disabled_by_manual
      || mods.some((m) => m && m.trigger === 'MANUAL_OVERRIDE_TRAIL'),
  };
}

/** JSON byte length of trail + mod arrays (live + archive if present). */
export function measureTrailModPayloadBytes(row) {
  if (!row || typeof row !== 'object') {
    return {
      trailLiveLen: 0,
      trailArchiveLen: 0,
      modLiveLen: 0,
      modArchiveLen: 0,
      payloadBytes: 0,
    };
  }
  const trail = Array.isArray(row.trail_sl_path) ? row.trail_sl_path : [];
  const trailArch = Array.isArray(row.trail_sl_path_archive) ? row.trail_sl_path_archive : [];
  const mods = Array.isArray(row.sl_modifications) ? row.sl_modifications : [];
  const modArch = Array.isArray(row.sl_modifications_archive) ? row.sl_modifications_archive : [];
  const payload = {
    trail_sl_path: trail,
    trail_sl_path_archive: trailArch.length ? trailArch : undefined,
    sl_modifications: mods,
    sl_modifications_archive: modArch.length ? modArch : undefined,
    trail_sl_path_count: row.trail_sl_path_count,
    sl_modifications_count: row.sl_modifications_count,
    trail_sl_last: row.trail_sl_last,
    trail_sl_min: row.trail_sl_min,
    trail_sl_max: row.trail_sl_max,
  };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });
  return {
    trailLiveLen: trail.length,
    trailArchiveLen: trailArch.length,
    modLiveLen: mods.length,
    modArchiveLen: modArch.length,
    payloadBytes: JSON.stringify(payload).length,
  };
}

/**
 * In-memory live-array growth proxy: only live tails count toward the hot
 * heap (archives are cold and leave hot persist via heavy keys).
 */
export function measureLiveHeapProxyBytes(row) {
  if (!row || typeof row !== 'object') return 0;
  return JSON.stringify({
    trail_sl_path: Array.isArray(row.trail_sl_path) ? row.trail_sl_path : [],
    sl_modifications: Array.isArray(row.sl_modifications) ? row.sl_modifications : [],
  }).length;
}

/** Build a realistic sl_modifications entry (matches the OM push shape at L5251). */
export function makeSlModEntry(i, trigger = 'TRAIL') {
  const t0 = 1_720_000_000_000 + i * 60_000;
  return {
    bar: t0,
    time: new Date(t0).toISOString(),
    field: 'SL',
    old: 1.1 - i * 0.00001,
    new: 1.1 - (i + 1) * 0.00001,
    trigger,
  };
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * FULL producer / consumer / persistence inventory.
 * Independently re-verified + SIGNED by W2 Fable 2026-07-24 against the
 * post-A1 order-manager.js (48 642 lines; OM SHA-256 187294FC…3EDD085F).
 * Corrections vs the capacity-fallback draft:
 *   - MANUAL callers are TWO sites at L33824 (MANUAL_OVERRIDE_TRAIL) and
 *     L33827 (MANUAL) inside the SL-drag release handler (draft said 33134);
 *   - "journal close copy" is the single-position copy at L33085 — the
 *     draft's L32395 anchor actually pointed at the SCALED aggregate
 *     (now L32752); split aggregate is L32960;
 *   - the draft's "preview/other seed" (27543) is the split-entry leg seed,
 *     now L28224 (splitGroupId/splitIndex context);
 *   - ADDED missing consumers: server heavy-key mirror + prefer-richer merge
 *     in session_journal_store.py; m19-persist-trim-contract heavy fixture;
 *     export/sample generator scripts.
 * Product files listed for land-time ownership — this module edits none.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const M20_Q4_INVENTORY = Object.freeze({
  producers: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: '_logSLTPModification body → sl_modifications.push (SOLE mod producer)',
      line: 5251,
      note: 'also sets _slIsBreakevenPlacement from trigger — Q4 must not disturb',
    },
    { file: 'chart v 1.4/chart/modules/order-manager.js', symbol: 'caller AUTO_BE_RECALC', line: 30807 },
    { file: 'chart v 1.4/chart/modules/order-manager.js', symbol: 'caller BUY AUTO_BE', line: 31170 },
    { file: 'chart v 1.4/chart/modules/order-manager.js', symbol: 'caller BUY TRAIL', line: 31263 },
    { file: 'chart v 1.4/chart/modules/order-manager.js', symbol: 'caller SELL AUTO_BE', line: 31488 },
    { file: 'chart v 1.4/chart/modules/order-manager.js', symbol: 'caller SELL TRAIL', line: 31576 },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'caller MANUAL_OVERRIDE_TRAIL (SL drag while trailing)',
      line: 33824,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'caller MANUAL (SL drag release)',
      line: 33827,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'trail_sl_path.push (BUY, per activated bar)',
      line: 31299,
      note: 'primary unbounded growth site — one float per bar while trailing',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'trail_sl_path.push (SELL, per activated bar)',
      line: 31612,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'seed [] (split-entry leg build)',
      line: 28224,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'seed [] (market order init)',
      line: 28712,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'seed [] (pending→market activation)',
      line: 30712,
    },
  ]),
  consumers: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'analytics: trailTrades presence (trail_sl_path.length > 0)',
      line: 6635,
      note: 'count scalar suffices under cap',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'analytics: discipline trigger scans (.some MANUAL / MANUAL+TP / MANUAL_OVERRIDE_TRAIL)',
      line: 6648,
      note: 'WHOLE-ARRAY semantics → sl_modifications archive must be lossless AND scans archive-aware at land (H4)',
    },
    {
      file: 'chart v 1.4/talaria-design/src/tradePathCloudUtils.js',
      symbol: 'extractPathFieldsFromJournal → parseNumArray(trail_sl_path ?? trailSlPath)',
      line: 85,
      note: 'already reconstructs archive‖tail for the six excursion series — trail archive reconstruct is additive H8',
    },
    {
      file: 'homepage/src/app/dashboard/v16/v16JournalMappers.ts',
      symbol: 'sl_modifications / slModifications pass-through',
      line: 243,
    },
    {
      file: 'chart v 1.4/chart/session_journal_store.py',
      symbol: '_HOT_PERSIST_HEAVY_KEYS server mirror (has trail_sl_path, MISSING sl_modifications + archives)',
      line: 484,
      note: 'prefer-richer merge (L491) protects heavy keys only when incoming empty/missing — archives must always ride durable rows together (H7)',
    },
    {
      file: 'chart v 1.4/chart/modules/m19-persist-trim-contract.test.mjs',
      symbol: 'heavy-key fixture list (trail_sl_path)',
      line: 233,
      note: 'update fixture when Q4 adds heavy keys (H6 scope)',
    },
    {
      file: 'chart v 1.4/chart/scripts/generate_milestone4_json_export.py',
      symbol: '_build_trail_sl_path + export header seeds',
      line: 100,
    },
    {
      file: 'chart v 1.4/chart/scripts/generate_dashboard_session_samples.py',
      symbol: 'sample header includes sl_modifications + trail_sl_path',
      line: 55,
    },
  ]),
  persistence: Object.freeze([
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'M19-C heavy keys include trail_sl_path but NOT sl_modifications / archives',
      line: 3984,
      note: 'gap: sl_modifications rides hot persist today — Q4-H4 must add 3 keys',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'SCALED aggregate close: flatMap raw sl_modifications + trail_sl_path',
      line: 32752,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'SPLIT aggregate close: flatMap raw sl_modifications + trail_sl_path',
      line: 32960,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'SINGLE close journal copy: position.sl_modifications || [] / trail_sl_path || []',
      line: 33085,
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'restore copyIfMissing precedent block (M19 archive/peak/pending keys)',
      line: 5176,
      note: 'Q4-H4 adds its additive keys to the same restore path',
    },
    {
      file: 'chart v 1.4/chart/modules/order-manager.js',
      symbol: 'persistJournal durable tier (full rows; A1 rehydrate precedent for parity)',
      line: 5600,
    },
  ]),
});

/**
 * Exact FUTURE hunk manifest (product edits FORBIDDEN until Manager commits
 * A1 and releases order-manager.js — re-verify all lines then).
 */
export const M20_Q4_HUNK_MANIFEST = Object.freeze([
  {
    id: 'Q4-H1',
    file: 'chart v 1.4/chart/modules/order-manager.js',
    title: 'Kill-switch + tail-max helpers (mirror M19-B accessors)',
    anchors: ['after _m19ExcursionTailMaxV1 (~L3951)'],
    change: [
      'Add _m20Q4TrailSlPathCapV1Enabled() reading M20_Q4_KILL_SWITCH',
      'Add _m20Q4TrailSlPathTailMaxV1() → 256',
      'Add _m20Q4SlModificationsTailMaxV1() → 64',
    ],
  },
  {
    id: 'Q4-H2',
    file: 'chart v 1.4/chart/modules/order-manager.js',
    title: 'Bound helpers ≡ contract models (two-phase trail / lossless mods)',
    anchors: ['near _m19ArchiveAndBoundExcursionSeries (~L4906)'],
    change: [
      'Add _m20Q4BoundTrailSlPath(position) ≡ modelQ4AppendTrail compaction',
      'Add _m20Q4BoundSlModifications(position) ≡ modelQ4AppendSlMod compaction',
      'Add _m20Q4ReconstructSeries / _m20Q4ProjectTradeTrailFields (idempotent)',
      'Stamp scalars: *_count, *_tail_max, trail_sl_{last,min,max}, sl_mod_trigger_counts, markKey',
      'In-place trim (shift / copyWithin) — M19-G allocation rule',
    ],
  },
  {
    id: 'Q4-H3',
    file: 'chart v 1.4/chart/modules/order-manager.js',
    title: 'Wire the 3 producers behind the switch',
    anchors: ['L31299 (BUY trail push)', 'L31612 (SELL trail push)', 'L5251 (_logSLTPModification push)'],
    change: [
      'After each push → call the bound helper when Q4 ON',
      'Kill path: bare push only (today, byte class preserved)',
      '_slIsBreakevenPlacement side effect untouched',
    ],
  },
  {
    id: 'Q4-H4',
    file: 'chart v 1.4/chart/modules/order-manager.js',
    title: 'Heavy keys + close copies + analytics + restore (I16)',
    anchors: ['L3980–3985', 'L32752–32753', 'L32960–32961', 'L33085–33086', 'L6648–6650', 'copyIfMissing block ~L5176'],
    change: [
      'Add sl_modifications + trail_sl_path_archive + sl_modifications_archive to _m19HotPersistHeavyFieldKeys',
      'Close copies flatMap/copy the RECONSTRUCT per leg (≡ modelQ4JournalCopyFields)',
      'Discipline scans archive-aware (≡ modelQ4DisciplineScan; results identical to legacy)',
      'Restore copyIfMissing adds all Q4 additive keys; legacy rows untouched until first append',
    ],
  },
  {
    id: 'Q4-H5',
    file: 'homepage/public/chart/modules/order-manager.js',
    title: 'Dual-tree I8 mirror of H1–H4',
    anchors: ['same symbols'],
    change: ['Byte-identical regions vs chart tree'],
  },
  {
    id: 'Q4-H6',
    file: 'chart v 1.4/chart/modules/m20-q4-trail-sl-path-cap.red.test.mjs',
    title: 'Flip RED→GREEN + kill discrimination + persist-trim fixture update',
    anchors: ['this prep file', 'm19-persist-trim-contract.test.mjs L230'],
    change: [
      'Assert product ≡ contract models on the same synthetic sessions',
      'Assert switch-OFF restores unbounded growth / byte class, zero compaction',
      'Write green.json + kill.json evidence',
    ],
  },
  {
    id: 'Q4-H7',
    file: 'chart v 1.4/chart/session_journal_store.py',
    title: 'Server heavy-key mirror (parity with H4)',
    anchors: ['_HOT_PERSIST_HEAVY_KEYS (~L459–485)'],
    change: [
      'Append "sl_modifications", "trail_sl_path_archive", "sl_modifications_archive"',
      'Prefer-richer merge then protects rows when hot patches omit them',
    ],
  },
  {
    id: 'Q4-H8',
    file: 'chart v 1.4/talaria-design/src/tradePathCloudUtils.js',
    title: 'Dashboard trail archive reconstruct (additive, non-blocking)',
    anchors: ['extractPathFieldsFromJournal (~L85)'],
    change: [
      'trail_sl_path resolves archive‖tail like the six excursion series',
      'v16JournalMappers may additively pass sl_modifications_archive through',
    ],
  },
]);
