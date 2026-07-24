/**
 * M20-A — timezone-manager.js listener subscribe/unsubscribe API contract.
 *
 * STATUS: PENDING-FRESH-GPT-REVIEW (Fable correction of GPT-blocked Composer
 * land BLOCK-TIMEZONE-API; no self-accept).
 * Caller lifecycle: RED-PENDING-SHARED-FILE-UNLOCK.
 *
 * File-disjoint: owns timezone-manager.js + this contract + gate tests +
 * browser gate + unique timezone evidence/manifest only.
 * chart.js / replay-system.js / economic-news-sidebar.js remain LOCKED until
 * caller lifecycle phase.
 *
 * Kill-switch (default ON = fix active when unset/false):
 *   window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1 = true
 *
 * Bounded notification contract (corrected product):
 * - notifyListeners coalesces reentrant notifies into trailing snapshot
 *   passes; at most M20_A_TZ_NOTIFY_PASS_BUDGET passes per externally
 *   initiated generation; each pass invokes each listener registered at pass
 *   start at most once with the currently accepted timezone.
 * - setTimezone(sameId) is idempotent: no duplicate save, no notify.
 * - Reentrant setTimezone during the final budget pass is rejected (returns
 *   false + console.warn) — never silently dropped — so the final pass always
 *   delivers the final accepted timezone to every listener.
 * - Externally initiated changes (outside a notify generation) are always
 *   accepted and start a fresh generation with a fresh budget.
 *
 * Fail-closed signal contract (corrected product, explicit
 * ATTACHING → LIVE → SETTLED phase machine + STICKY abort-seen flag):
 * - options.signal getter, signal.aborted getter and add/removeEventListener
 *   lookups are read defensively; a throw or malformed signal → no
 *   registration, no outward throw, no-op unsubscribe.
 * - ATTACHING: the abort handler is attached while the manager wrapper is
 *   NOT in the listener list. During ANY hostile user-controlled call
 *   (addEventListener body, method getters, the post-attach aborted recheck
 *   getter, reentrant setTimezone) the subscription is invisible to census
 *   and notifications and the callback cannot fire before subscribe returns.
 *   ANY abort dispatch in this phase sets a STICKY abort-seen flag (it can
 *   never be un-set) and is otherwise inert — a hostile getter that
 *   dispatches the retained handler and then returns false cannot launder
 *   the abort away.
 * - Primordials (WeakMap accessors + Array push/slice/splice/indexOf) are
 *   captured at script load before storage/signal/callback-capable operations.
 *   Internal add/remove/notify/census use a module-private WeakMap-backed
 *   genuine Array store, never dynamically dispatched `this.listeners.*`.
 * - The sticky flag is reread after every user-controlled call returns, and
 *   one final `abortSeen || observedAborted` gate executes immediately
 *   before captured-primordial private-store insertion; no user-controlled
 *   code can run between that final gate and insertion.
 * - Failure paths (throwing attach, sticky abort-seen, post-attach aborted
 *   recheck true/unreadable) SETTLE first (terminal, handler inert) and then
 *   detach fail-soft — no visible half-registration, no callback invocation,
 *   even if the detach itself provokes another dispatch.
 * - LIVE: successful insertion publishes atomically. If genuine store
 *   insertion fails (frozen/nonwritable store), the registration settles
 *   inactive, census/hits stay zero, the abort handler detaches once
 *   fail-soft, and the original insertion error is rethrown. A later abort/
 *   unsubscribe removes the manager wrapper first, then detaches the abort
 *   handler exactly once, then SETTLES; an externally retained handler is
 *   inert once settled; throwing removeEventListener stays contained.
 * - Kill mode applies the same fail-closed signal validation, then registers
 *   via exact legacy addListener with no signal attach (trivially opaque).
 *
 * Probes:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a-timezone-listener-api.red.test.mjs"
 *
 * Evidence (no-write by default; explicit opt-in only):
 *   M20_A_TZ_EVIDENCE=red|green|kill
 *   → docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-<mode>.json
 *   Browser gate (real headless Chromium-based browser, both trees):
 *   node "chart v 1.4/chart/modules/m20-a-timezone-browser-gate.mjs"
 *   M20_A_TZ_EVIDENCE=browser → …-browser.json
 */

export const M20_A_TZ_KILL_SWITCH = '__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1';

export const M20_A_TZ_STATUS = 'PENDING-FRESH-GPT-REVIEW';

export const M20_A_TZ_CALLER_PHASE = 'RED-PENDING-SHARED-FILE-UNLOCK';

/** Max snapshot delivery passes per externally initiated notify generation. */
export const M20_A_TZ_NOTIFY_PASS_BUDGET = 8;

/**
 * Provenance chain (honest, independently recoverable):
 * - headCommit / fileTouchCommit: committed tree containing the pre-API
 *   listener behavior. RED evidence must execute this blob
 *   (`git show HEAD:chart v 1.4/chart/modules/timezone-manager.js`, raw
 *   bytes — do NOT round-trip through PowerShell redirection, which
 *   re-encodes and corrupts the hash).
 * - headBlobSha256: sha256 of the exact HEAD blob bytes. VERIFIED equal to
 *   the Composer-recorded pre-land hash: the quarantined land's pre-land
 *   claim was accurate and is independently recoverable from git.
 * - quarantinedComposerSha256: the blocked Composer product this correction
 *   replaced (on-disk bytes at quarantine time).
 * - correctedSha256: the corrected product bound to GREEN evidence.
 * - unrelated pre-existing changes: NONE — the working-tree diff of
 *   timezone-manager.js vs HEAD contains only the API-owned hunks.
 */
export const M20_A_TZ_PROVENANCE = Object.freeze({
  headCommit: 'f8ef6a0017b3087070c3e2bc098fc92e3aa10413',
  fileTouchCommit: 'c50175b28',
  headBlobSha256: '960fc401629be4a486c7356da5b74b6664e5db9f754d196d19ada062a26c7b0a',
  composerClaimedPreLandSha256:
    '960fc401629be4a486c7356da5b74b6664e5db9f754d196d19ada062a26c7b0a',
  composerClaimedPreLandRecoverable: true,
  quarantinedComposerSha256:
    '46b8c8cd36fd8c53089af6d1aeae0e0e1742911f6e0cb343029bda692f559469',
  round1CorrectedSha256:
    '877ecce938dba5cb12184732d65dd560ece2c78d802c35d81bb5afe33e4f79bd',
  round2CorrectedSha256:
    '3aa258830535028722e6f248ab84e5cdecaf7fb091703bd753f7b4a6188d9456',
  round3CorrectedSha256:
    'd8446036fbf6f820c5966c56b4da8bbe2eaf55791fc4d57ca55029dfd5e6318e',
  correctedSha256:
    '94ae7fa26e3455923f40f3ae337100d696da51fd513881394917ca9ca0e692c4',
  unrelatedPreExistingChanges: 'none — HEAD→working diff is API-owned hunks only',
});

/**
 * Quarantined Composer hunk inventory (forensic input → disposition in the
 * corrected product). Every hunk of the blocked land is accounted for.
 */
export const M20_A_TZ_COMPOSER_HUNKS = Object.freeze([
  Object.freeze({
    id: 'H1-kill-switch-helper',
    summary: '_m20ATimezoneListenerUnsubEnabled() gate',
    disposition: 'RETAINED',
    note: 'Verbatim; window read already guarded.',
  }),
  Object.freeze({
    id: 'H2-addListener-typeof-guard',
    summary: 'addListener ignores non-functions',
    disposition: 'RETAINED',
    note: 'Legacy surface for real callers unchanged.',
  }),
  Object.freeze({
    id: 'H3-removeListener-typeof-guard',
    summary: 'removeListener ignores non-functions',
    disposition: 'RETAINED',
    note: 'Identity filter semantics unchanged.',
  }),
  Object.freeze({
    id: 'H4-subscribe',
    summary: 'subscribe(callback, { signal }) → unsubscribe',
    disposition: 'REWRITTEN',
    note: 'Composer read signal.aborted and called addEventListener unguarded '
      + '(throwing getter/attach escaped outward; half-registration possible). '
      + 'Round-1 correction pushed the wrapper before attach (visible during '
      + 'hostile addEventListener) — disproven. Round-2 two-phase registration '
      + 'copied pendingAbort BEFORE the post-attach recheck getter ran, so a '
      + 'hostile second aborted getter that dispatched the retained handler '
      + 'and returned false laundered the abort away (census=1, hits=1) — '
      + 'disproven. Round 3: explicit ATTACHING→LIVE→SETTLED phase machine '
      + 'with a STICKY abort-seen flag reread after every user-controlled '
      + 'call, plus a final pure-local abortSeen||observedAborted gate '
      + 'immediately before commit. Round 4: the commit itself no longer '
      + 'uses dynamically dispatched this.listeners.push; all internal '
      + 'add/remove/notify/census paths use a module-private WeakMap-backed '
      + 'genuine Array store and captured primordials. Genuine insertion '
      + 'failure settles inactive, detaches once fail-soft, and rethrows the '
      + 'original insertion error.',
  }),
  Object.freeze({
    id: 'H5-notifyListeners-trailing-loop',
    summary: 'do-while trailing notify with _notifyDepth/_pendingNotify',
    disposition: 'REWRITTEN',
    note: 'Composer loop was unbounded (synchronous livelock under an '
      + 'unconditional reentrant alternating-timezone callback) and used '
      + 'uninitialized fields; corrected: constructor-initialized state and '
      + 'M20_A_TZ_NOTIFY_PASS_BUDGET-bounded trailing generation.',
  }),
  Object.freeze({
    id: 'H6-setTimezone-idempotence-and-budget',
    summary: 'same-timezone idempotence + budget-exhausted reentrant rejection',
    disposition: 'NEW-IN-CORRECTION',
    note: 'Composer kept HEAD setTimezone (unconditional save+notify): an '
      + 'unconditional same-timezone callback produced unbounded writes/loops. '
      + 'Corrected product short-circuits same-id sets and loudly rejects '
      + 'over-budget reentrant changes.',
  }),
  Object.freeze({
    id: 'H7-contract-test-docs-evidence',
    summary: 'contract mjs, red test, API md, red/green/kill evidence, hunk manifest',
    disposition: 'REWRITTEN',
    note: 'Composer evidence labeled post-land caller-RED rows as product RED '
      + 'and pinned an unrecoverable pre-land hash; rebuilt honestly against '
      + 'the committed HEAD blob.',
  }),
  Object.freeze({
    id: 'H8-claimed-pre-land-hash',
    summary: 'M20_A_TZ_PRE_LAND_SHA256 = 960fc401…',
    disposition: 'RETAINED',
    note: 'Independently VERIFIED equal to the committed HEAD blob bytes via '
      + 'raw git show (an earlier PowerShell-redirected hash mismatch was a '
      + 'measurement artifact, not a provenance defect); now lives in '
      + 'M20_A_TZ_PROVENANCE.headBlobSha256 and pins the executed RED baseline.',
  }),
]);

export const M20_A_TZ_EVIDENCE_ENV = 'M20_A_TZ_EVIDENCE';

export const M20_A_TZ_EVIDENCE_RELS = Object.freeze([
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-red.json',
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-green.json',
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-kill.json',
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-browser.json',
]);

export const M20_A_TZ_MANIFEST_REL =
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-HUNK-MANIFEST.json';

/**
 * Closed external seal: sha256 of every listed product/contract/test/gate/
 * doc/report/evidence artifact, generated ONLY after final bytes. The seal
 * file itself is the single unavoidable self-reference (it cannot contain its
 * own hash) and must be verified out-of-band.
 */
export const M20_A_TZ_SEAL_REL =
  'docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-SEAL.json';

/**
 * Caller lifecycle phase owners (LOCKED files — manifest for independent review).
 * Teardown must use subscribe() handles or named removeListener refs after land.
 */
export const M20_A_TZ_CALLER_MANIFEST = Object.freeze({
  chartInit: Object.freeze({
    owner: 'chart.js Chart.init',
    file: 'chart v 1.4/chart/chart.js',
    line: 1549,
    register: 'timezoneManager.addListener anonymous arrow',
    teardownPoint: 'Chart.destroy (not wired — RED caller phase)',
    locked: true,
  }),
  chartGoTo: Object.freeze({
    owner: 'chart.js setupDateSearch / Go-To menu',
    file: 'chart v 1.4/chart/chart.js',
    line: 21015,
    register: 'timezoneManager.addListener anonymous arrow',
    teardownPoint: 'Go-To menu teardown / Chart.destroy (not wired — RED caller phase)',
    locked: true,
  }),
  replaySetup: Object.freeze({
    owner: 'replay-system.js ReplaySystem.setup',
    file: 'chart v 1.4/chart/modules/replay-system.js',
    line: 330,
    register: 'timezoneManager.addListener anonymous arrow',
    teardownPoint: 'ReplaySystem.destroy (not wired — RED caller phase)',
    locked: true,
  }),
  economicNews: Object.freeze({
    owner: 'economic-news-sidebar.js once-guard bind',
    file: 'chart v 1.4/chart/modules/economic-news-sidebar.js',
    line: 1493,
    register: 'timezoneManager.addListener once-guard function',
    teardownPoint: 'economic-news singleton teardown (not wired — RED caller phase)',
    locked: true,
  }),
});

export const M20_A_TZ_HASH_BIND_PATHS = Object.freeze([
  'chart v 1.4/chart/modules/timezone-manager.js',
  'homepage/public/chart/modules/timezone-manager.js',
  'chart v 1.4/chart/modules/m20-a-timezone-listener-api-contract.mjs',
  'homepage/public/chart/modules/m20-a-timezone-listener-api-contract.mjs',
  'chart v 1.4/chart/modules/m20-a-timezone-listener-api.red.test.mjs',
  'homepage/public/chart/modules/m20-a-timezone-listener-api.red.test.mjs',
  'chart v 1.4/chart/modules/m20-a-timezone-browser-gate.mjs',
  'homepage/public/chart/modules/m20-a-timezone-browser-gate.mjs',
]);

export function m20ATzListenerUnsubEnabled(scope = globalThis) {
  try {
    return !(scope && scope[M20_A_TZ_KILL_SWITCH] === true);
  } catch (_) {
    return true;
  }
}
