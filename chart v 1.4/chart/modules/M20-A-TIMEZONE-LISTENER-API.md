# M20-A — Timezone Listener Subscribe API (R4 correction)

**Status:** `PENDING-FRESH-GPT-REVIEW` — R4 correction after binding verdict `BLOCK-TIMEZONE-API-R3`. No self-accept; fresh strong-GPT review required.
**Caller lifecycle:** `RED-PENDING-SHARED-FILE-UNLOCK` — `chart.js`, `replay-system.js`, `economic-news-sidebar.js` unchanged and locked.
**Owner:** W4 / file-disjoint `timezone-manager.js` lane.

## Kill-switch

| Flag | Default | Effect |
|---|---|---|
| `window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1` | unset / `false` → fix **ON** | `subscribe()` returns real idempotent unsubscribe; `AbortSignal` honored |
| `true` | kill **ON** | `subscribe()` delegates to legacy `addListener` (exact-legacy census parity proven against the executed HEAD blob); returned cleanup is intentional **no-op** |

Kill mode applies the **same fail-closed signal validation**, then registers with no signal attach (trivially opaque). Notify bounding and same-timezone idempotence are product hardening, not kill-gated.

## API contract

### `addListener(callback)` / `removeListener(callback)` (legacy, unchanged surface)

- Push/remove by reference on the shared listener list; non-functions ignored.
- Callers today use anonymous arrows → cannot `removeListener` → listener leak **RED at caller phase** (by design until shared files unlock).

### `subscribe(callback, options?)` → `unsubscribe`

| Input | Behavior |
|---|---|
| non-function `callback` | no-op `unsubscribe`; **no registration** |
| throwing `options.signal` getter | fail-closed: no registration, no outward throw |
| malformed signal (missing/non-function `addEventListener`/`removeEventListener`, throwing `aborted` getter, partial object, non-object) | fail-closed: no registration, no outward throw |
| `signal.aborted === true` | no-op; no registration |
| fix ON (default) | phase-machine registration (below); idempotent `unsubscribe` removing **one** handle |
| fix OFF (kill) | validation as above, then `addListener(callback)` once; no-op `unsubscribe` |

**Phase-machine registration (`ATTACHING → LIVE → SETTLED`, sticky abort-seen).** Round 1 "wrapper-first" was disproven (wrapper visible during hostile attach). Round 2 "two-phase" was disproven by the **lost-abort recheck** attack: the code copied its pending-abort flag *before* invoking the post-attach `aborted` getter, so a hostile second getter that synchronously dispatched the retained abort handler and then returned `false` laundered the abort away (measured pre-fix: afterReturn census = 1, later notify hits = 1). Round 3 still committed through mutable/dynamically dispatchable `this.listeners.push`. R4 contract:

1. **Validate** `options.signal` getter, `aborted` getter, and both method lookups defensively (throw/malformed → fail closed, nothing registered).
2. **ATTACHING:** the abort handler is attached while the manager wrapper is **not** in the listener list. During **any** user-controlled call (attach body, method getters, the post-attach recheck getter, reentrant `setTimezone`) the subscription is invisible to census/notifications and the callback cannot fire before `subscribe` returns. **Any abort dispatch in this phase sets a sticky `abortSeen` flag** — it can never be un-set — and is otherwise inert.
3. **Captured primordials + private store:** WeakMap accessors and Array `push`/`slice`/`splice`/`indexOf` are captured at script load before storage/signal/callback-capable operations. Internal add/remove/notify/census uses a module-private WeakMap-backed genuine Array store, never dynamically dispatched `this.listeners.*`.
4. **Sticky reread + final gate:** the sticky flag is reread after every user-controlled call returns; one final `abortSeen || observedAborted` check executes immediately before captured-primordial private-store insertion, with no user-controlled call possible between that check and insertion.
5. **Failure paths** (throwing attach, sticky abort-seen, recheck true/unreadable): the registration **settles terminal-first** (so even a dispatch provoked by the detach itself is inert), then detaches **fail-soft** — no visible half-registration, no callback invocation, final census unchanged.
6. **LIVE / after commit:** successful insertion publishes atomically. If genuine store insertion fails (frozen/nonwritable store), the registration settles inactive, census/hits stay zero, the abort handler detaches once fail-soft, and the original insertion error is rethrown. A later abort/unsubscribe removes the manager wrapper first, then detaches the abort handler exactly once, then settles.

Direct hostile probes assert census 0 + hits 0 **during** every hostile call and forever after on aborted paths, no outward throw, and exactly-once detach. The sticky matrix covers: second-getter dispatch-return-false (**named regression row** `sticky-abort-post-attach-getter-dispatch-return-false`), dispatch-return-true, dispatch-then-throw, repeated dispatch, method-getter dispatch during detach, `addEventListener` dispatch, detach throw, retained-handler re-invocation, reentrant forced notify during every phase, and a successful-attach control.

### Bounded notification contract (`notifyListeners` / `setTimezone`)

- `setTimezone(sameId)` is **idempotent**: returns `true`, no duplicate save, no notify.
- Reentrant notifies coalesce into trailing snapshot passes: at most **`NOTIFY_PASS_BUDGET = 8`** passes per externally initiated generation; each pass calls every listener registered at pass start **at most once** with the currently accepted timezone; listener throws are contained per callback.
- Once the budget is exhausted, reentrant (listener-initiated) `setTimezone` is **rejected loudly** (`false` + `console.warn`) — never silently dropped — so the final pass always delivers the final accepted timezone to every listener.
- Externally initiated changes always start a fresh generation with a fresh budget.
- Proven: unconditional same-timezone callbacks finish in 1 pass / 1 write; unconditional alternating callbacks finish in ≤ 8 passes / ≤ 8 writes; no recursion, no CPU monopoly, no unbounded writes.

## Provenance chain

| Artifact | SHA256 |
|---|---|
| Committed HEAD blob (`git show HEAD:"chart v 1.4/chart/modules/timezone-manager.js"`, raw bytes; HEAD `f8ef6a001`, file-touch `c50175b28`) — **executed RED baseline** | `960fc401629be4a486c7356da5b74b6664e5db9f754d196d19ada062a26c7b0a` |
| Composer-claimed pre-land hash | same value — **VERIFIED recoverable** (an earlier mismatch was a PowerShell-redirection measurement artifact) |
| Quarantined Composer product (blocked land) | `46b8c8cd36fd8c53089af6d1aeae0e0e1742911f6e0cb343029bda692f559469` |
| Round-1 corrected product (blocked: wrapper-first attach) | `877ecce938dba5cb12184732d65dd560ece2c78d802c35d81bb5afe33e4f79bd` |
| Round-2 corrected product (blocked: lost abort during post-attach recheck) | `3aa258830535028722e6f248ab84e5cdecaf7fb091703bd753f7b4a6188d9456` |
| Round-3 corrected product (blocked: dynamic `this.listeners.push` commit) | `d8446036fbf6f820c5966c56b4da8bbe2eaf55791fc4d57ca55029dfd5e6318e` |
| **R4 corrected product** (both trees, byte-identical) | `94ae7fa26e3455923f40f3ae337100d696da51fd513881394917ca9ca0e692c4` |

**Unrelated pre-existing timezone-manager changes:** none — the HEAD→working diff contains only API-owned hunks.

## Quarantined Composer hunk inventory

| Hunk | Disposition | Note |
|---|---|---|
| H1 kill-switch helper | RETAINED | verbatim |
| H2 `addListener` typeof guard | RETAINED | legacy surface unchanged for real callers |
| H3 `removeListener` typeof guard | RETAINED | identity filter unchanged |
| H4 `subscribe()` | REWRITTEN | Composer: unguarded getter/attach. Round 1: wrapper-first (disproven — visible during hostile attach). Round 2: two-phase (disproven — lost abort during post-attach recheck). Round 3: `ATTACHING→LIVE→SETTLED` phase machine + sticky abort-seen + final pure-local pre-commit gate |
| H5 `notifyListeners` do-while | REWRITTEN | unbounded livelock loop → `NOTIFY_PASS_BUDGET = 8` bounded trailing generation |
| H6 `setTimezone` idempotence + budget rejection | NEW-IN-CORRECTION | same-tz idempotent; over-budget reentrant changes rejected loudly |
| H7 contract/test/docs/evidence | REWRITTEN | RED executes committed HEAD blob; per-mode single-source row arrays; exact counts |
| H8 claimed pre-land hash | RETAINED | verified equal to committed HEAD blob bytes; pins the RED baseline |

## Probes

```bash
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-timezone-listener-api.red.test.mjs"
# also valid as the homepage entrypoint, from any cwd:
node --test --test-concurrency=1 "homepage/public/chart/modules/m20-a-timezone-listener-api.red.test.mjs"
```

Evidence (no-write default; explicit opt-in; canonical-root validated; atomic tmp+rename; declared rels only):

```bash
M20_A_TZ_EVIDENCE=red|green|kill node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-timezone-listener-api.red.test.mjs"
M20_A_TZ_EVIDENCE=browser node "chart v 1.4/chart/modules/m20-a-timezone-browser-gate.mjs"
node "chart v 1.4/chart/modules/m20-a-timezone-browser-gate.mjs" --print-root   # root probe, no browser, no writes
```

Gate coverage (27 tests, 26 pass + 1 opt-in skip; run from repo root **and** arbitrary temp cwd via both tree entrypoints): fresh Node VM realms for HEAD-blob RED (7 rows) / corrected GREEN (**120** rows, including R4 replaced public push, whole-property replacement, replaced `Array.prototype.push`, frozen/nonwritable store insertion failure, success/repeated cancellation/retained inertness) / kill discrimination (8 rows); hostile-attach opacity probes **plus the sticky-abort matrix** (11 rows: second-getter dispatch-return-false/true, dispatch-then-throw, repeated/method-getter/addEventListener dispatch, detach throw, retained handler, reentrant forced notify per phase, control); malformed-signal suite; 1,000/10,000-cycle census; **606** DST/formatting comparisons vs the executed HEAD blob; child-process timeout/livelock gates (incl. fault-injection of the exact Composer do-while); strict 4-marker repo-root resolution (`.git` + board + both trees, ambiguity fail-closed); real headless Edge/Chrome on **both trees** (**34** rows, incl. sticky-abort and R4 insertion rows). Evidence records Node/V8/OS/arch and browser UA.

### Browser-gate cleanup contract (R4 retained)

- The per-tree race **timeout handle is stored and cleared on every path** — a successful 24/24 run returns in ~3.4 s instead of idling out two 60 s timers (~66 s pre-fix).
- Cleanup ladder in `finally` on **every** success/failure path: clear timer → `taskkill /T /F` the exact spawned browser tree (pid-gone verified) → close the loopback server/port → remove the run-owned `m20a-tz-gate-<generated>` temp profile with **bounded retry/backoff** (8 attempts, 100 ms → 2 s). Removal failure **marks the run failed** (`FAIL-BROWSER-CLEANUP`) and reports the profile basename + error class — never swallowed.
- Self-spawned **injection matrix** (success, report-error, page-crash, forced timeout, server failure, kill-tree double-kill, injected cleanup removal failure) asserts after each child: ports 8981/8982 free, no surviving browser pid, timeout cleared, profile removed or truthfully classified, **zero newly created `m20a-tz-gate-*` directories**. The cleanup-removal-failure child exits nonzero with `FAIL-BROWSER-CLEANUP`, proving no false success; results are recorded in `…-browser.json` (`cleanupMatrix`, `cleanupCensus`, `durations`).
- **Leaked-profile audit:** the 11 pre-existing `m20a-tz-gate-*` directories under the OS temp root (leaked by the pre-fix swallowed `rm`) were audited — exact basename match, temp-root location, no live-process command-line reference — and all 11 removed, 0 residual. No user browser profile or unrelated temp entry was touched. Basenames are recorded in the correction report.

**Closed external seal:** `docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-SEAL.json` hashes every product/contract/test/gate/doc/report/evidence artifact after final bytes; the seal itself is the single unavoidable self-reference (cannot contain its own hash — verify out-of-band).

## Caller blockers (locked phase — residual owners)

| Owner | Register site | Teardown (not wired) |
|---|---|---|
| `Chart.init` | `chart.js` ~1549 anonymous `addListener` | `Chart.destroy` (W3) |
| Go-To menu | `chart.js` ~21015 anonymous `addListener` | Go-To teardown / `Chart.destroy` (W3) |
| `ReplaySystem.setup` | `replay-system.js` ~330 anonymous `addListener` | `ReplaySystem.destroy` (W1/W4 serialized) |
| Economic news | `economic-news-sidebar.js` ~1493 once-guard `addListener` | singleton teardown (W4 follow-up) |

## Independent-review handoff (fresh GPT)

- **RED:** executed committed HEAD blob only (7 single-source rows) — leak census grows, `subscribe` absent, unbounded same-tz recursion.
- **GREEN:** corrected product (120 rows incl. opacity + sticky-abort + R4 private-store insertion matrix) + browser gate (34 rows + cleanup matrix), 0 failures.
- **kill:** exact-legacy discrimination vs the executed HEAD blob (8 rows).
- **R4 regression:** replaced public `listeners.push`, whole-property replacement, replaced `Array.prototype.push`, frozen store, and nonwritable store are covered in Node and real browser rows; insertion failure rethrows the original `TypeError` after inert settlement and one fail-soft detach.
- **Do not claim** chart/replay/news leak fixed until caller lifecycle lands — caller-phase rows travel separately in every evidence file and never enter mode verdicts.
- Verify: seal, hashes above, `docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-{red,green,kill,browser}.json`, `…-HUNK-MANIFEST.json`, `docs/plan3/worker-reports/W4-M20-A-TIMEZONE-API-20260724-CORRECTION.md`.

Contract source: `modules/m20-a-timezone-listener-api-contract.mjs`
