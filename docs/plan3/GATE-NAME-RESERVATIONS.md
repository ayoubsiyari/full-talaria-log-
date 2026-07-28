# Gate, oracle and fixture name reservations

Owner: Manager C. Authority: A11.2 operating rules — *reserve all gate, oracle and fixture
names before use; a renamed or duplicated oracle is how a gate quietly stops guarding.*

Rules for this registry:

1. **Reserve before authoring.** A name appears here before the file that implements it.
2. **A reserved name is never renamed.** If a gate is superseded, the successor takes a new
   name with an incremented version suffix and the predecessor is marked `SUPERSEDED-BY`,
   never deleted. Deleting a row loses the evidence that a gate once existed.
3. **One name, one mechanism.** Two gates asserting the same thing under different names is
   the duplication failure this registry exists to prevent.
4. **Signature tokens are part of the reservation.** Evidence JSON carries the signature, so
   changing it silently orphans every prior evidence file.

Status vocabulary: `RESERVED` (name taken, not yet authored) · `LIVE` (authored and green)
· `SUPERSEDED-BY <name>` · `WITHDRAWN <reason>`.

## Pre-existing names inherited by Manager C — must not be renamed

| Name | Signature token | Implementation | Status |
|---|---|---|---|
| MODULE-CONTRACT-PREFLIGHT-V1 | `TALARIA_MODULE_CONTRACT_PREFLIGHT_V1` | `scripts/module-contract-preflight.mjs` | LIVE (landed 90e0e0cf8, pre-dates this registry) |

## Queue item 1 — territory and journal (A11.2 item 1)

| Name | Signature token | Implementation | Status |
|---|---|---|---|
| TERRITORY-OWNERSHIP-PREFLIGHT-V1 | `TALARIA_TERRITORY_PREFLIGHT_V1` | `scripts/territory-preflight.mjs`, `scripts/lib/territory-manifest.mjs` | LIVE (enabled; A16.1 journal-owner cells; parent-manifest B1) |
| JOURNAL-APPEND-ONLY-GATE-V1 | `TALARIA_JOURNAL_APPEND_ONLY_V1` | `scripts/lib/journal-append-only.mjs` | LIVE |

Negative-control cells reserved under these gates:

| Cell | Asserts | Status |
|---|---|---|
| NC-TERRITORY-SELF-GRANT | with `director_only` emptied, a C-authored `TERRITORY.yml` edit passes — proving that rule is what catches it | LIVE |
| NC-TERRITORY-EMPTY-GRANT | with every `owned_paths` stripped, no packet can pass as `owned` | LIVE |

## Queue item 2 — module presence and servable-shell inventory (A4c, A6)

| Name | Signature token | Status |
|---|---|---|
| SHELL-MODULE-PRESENCE-PREFLIGHT-V2 | `TALARIA_SHELL_PRESENCE_PREFLIGHT_V2` | RESERVED — extends MODULE-CONTRACT-PREFLIGHT-V1 to the full servable-shell inventory; V1 is not renamed |
| SERVABLE-SHELL-INVENTORY-V1 | `TALARIA_SERVABLE_SHELL_INVENTORY_V1` | RESERVED — fail-closed enumeration; an undeclared shell under a public root is RED |
| RUNTIME-SYMBOL-TRIPWIRE-V1 | `TALARIA_RUNTIME_SYMBOL_TRIPWIRE_V1` | RESERVED — asserts required symbols from `window.__TALARIA_LOADED_MODULES` on host and panel |
| NC-SHELL-UNDECLARED | — | RESERVED — an unknown shell added under a public root must go RED |
| NC-SYMBOL-ABSENT | — | RESERVED — with the module response blocked, the tripwire must go RED |

### Item 2 dispatch reservations — PACKET-C-002, claimed 2026-07-28T00:30Z

Reserved ahead of dispatch so three parallel subagents cannot collide on naming. File sets are
disjoint by construction; `scripts/module-contracts.json` and `scripts/module-contract-preflight.mjs`
are deliberately **not** in any brief's write set this wave, so the live V1 gate stays green.

| Reserved for | Writable files | Exported / signature names |
|---|---|---|
| W1 discovery library | `scripts/lib/servable-shell-discovery.mjs`, `scripts/tests/servable-shell-discovery.test.mjs` | `discoverShells`, `shellFacts`, `normalizeLoaderOrder`, `DISCOVERY_SIGNATURE = TALARIA_SERVABLE_SHELL_DISCOVERY_V1` |
| W2 inventory classification | `scripts/servable-shell-inventory.json` | schema id `talaria.servable-shell-inventory.v1` |
| W3 inventory preflight | `scripts/shell-inventory-preflight.mjs`, `scripts/tests/shell-inventory-preflight.test.mjs` | `validateShellInventory`, signature `TALARIA_SHELL_PRESENCE_PREFLIGHT_V2` |

Role id vocabulary, fixed by the manager so W2 and W3 cannot diverge: `v9-host-source`,
`v9-host-built`, `v9-host-public`, `legacy-host-source`, `legacy-host-public`,
`multichart-embed-source`, `multichart-embed-public`, `dist-legacy-fallback`, `admin-dist`,
`pointer-stub`, `sandbox-multichart`, `browser-harness`, `frozen-evidence`,
`public-test-fixture`, `non-chart-app`, `image-built-export`.

Status vocabulary, fixed by the manager: `owned-stamped`, `image-verified`, `excluded`,
`denied-route-pending`, `removal-pending`, `removed`.

## Queue item 3 — differential parity oracle (A7)

| Name | Signature token | Status |
|---|---|---|
| DIFFERENTIAL-PARITY-ORACLE-V1 | `TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1` | LIVE — `docs/plan3/oracles/differential-parity-oracle-v1.mjs`, `scripts/tests/differential-parity-oracle.test.mjs` (W29 drift + W37 M5 canary parity + W41 fail-closed rebuild) |

Verdict vocabulary for every cell below, fixed by the manager so a cell cannot report
absence of evidence as evidence: `GREEN` (compared over the full expected span, agreed within
epsilon), `RED` (compared, disagreed), `UNPROVEN` (nothing trustworthy compared — zero
compared values, length mismatch, one-sided null, non-finite compared value, short compared
population, or a compare that discriminated nothing where the reference claims independence).
`UNPROVEN` is never counted as parity evidence and never aggregates to a ship-gate GREEN.

Reference-independence classes, declared per family in `PARITY_FAMILY_INDEPENDENCE` and
reproduced on every emitted cell: `independent-algorithm` (SMA — stateless resum vs the
product's incremental running sum), `independent-numerics` (EMA/DEMA — closed-form geometric
expansion vs the product's recurrence; the definition itself is shared spec),
`code-clone` (WMA — same algorithm written twice; divergence is identically zero by
construction and is **not** evidence about WMA numerics).

Cells:

| Cell | Asserts | Status |
|---|---|---|
| PARITY-ROLLING-SUBTRACTION | optimized vs fallback for Bollinger/Donchian/stochastic within per-family epsilon | RESERVED (full rolling-subtraction matrix post-M5) |
| PARITY-SMA-SHORT / PARITY-SMA-MEDIUM | `rollingSmaFast` vs stateless resum reference within `EPS-ROLLING-NONRECURSIVE`, UNIT scale | LIVE (W37 M5 canary; short may GREEN while DRIFT-SMA ladder RED. UNIT-scale window sums are exactly representable, so this pair is bit-exact — structural agreement, not numeric evidence; the `-JPY` cell carries the numeric claim) |
| PARITY-WMA-SHORT / PARITY-WMA-MEDIUM | `rollingWmaFast` vs weighted resum reference within `EPS-ROLLING-NONRECURSIVE`, UNIT scale | LIVE (W37 M5 canary; `code-clone` — divergence identically zero by construction) |
| PARITY-EMA-SHORT / PARITY-EMA-MEDIUM | chart-indicators `calculateEMA` (read-only extract) vs closed-form EMA expansion within `EPS-ROLLING-NONRECURSIVE` — IndicatorPerf has no fast EMA | LIVE (W37 M5 canary; W41 reference re-derived independently) |
| PARITY-DEMA-SHORT / PARITY-DEMA-MEDIUM | chart-indicators `calculateDEMA` (read-only extract) vs closed-form DEMA reference within `EPS-ROLLING-NONRECURSIVE` | LIVE (W37 M5 canary; W41 reference re-derived independently) |
| PARITY-{SMA,WMA,EMA,DEMA}-{SHORT,MEDIUM}-JPY | same compares on the 1e6-magnitude fixture, where window sums round and the compare has bit patterns to discriminate | LIVE (W41) — a cell whose family claims reference independence fails closed to UNPROVEN if every compared pair was bit-identical |
| PARITY-RECURSIVE | MACD/RSI/ATR/ADX within per-family epsilon, seed and warm-up declared | RESERVED |
| PARITY-CUMULATIVE | VWAP/OBV over long ranges | RESERVED |
| DRIFT-SMA-100K / DRIFT-SMA-500K / DRIFT-SMA-1M | divergence does not grow with series length on the running-sum path (`rollingSmaFast`) | LIVE (W29 drift ladder; SMA may RED — EXPECTED-RED on uncompensated sum) |
| DRIFT-WMA-CONTROL | `rollingWmaFast` recomputes its window and must show no length-dependent drift | LIVE — but `code-clone`: reference and product are the same algorithm, so this measures identically zero and only shows the ladder is not unconditionally RED. The load-bearing attribution control is DRIFT-SMA-REFERENCE-SELF-ERROR |
| DRIFT-SMA-REFERENCE-SELF-ERROR | at every ladder rung, the reference's own error (stateless resum vs compensated resum) must not grow with length (`REF_SELF_ERROR_GROWTH_CAP`) and must sit at least `REF_SELF_ERROR_DOMINANCE_MIN`× below the measured divergence — otherwise the DRIFT-SMA growth is harness noise, not product drift | LIVE (W41) |
| PAINTED-SUBPIXEL-MAXZOOM | painted divergence is sub-pixel at maximum zoom on the fixture's price scale | RESERVED |
| BUCKET-IMMUTABILITY-5M / -15M / -1H / -4H | a finalised bucket's OHLC never changes for the remainder of a replay | RESERVED |
| NC-PARITY-EPSILON-INVERTED | with the epsilon comparison inverted, every parity cell must go RED | LIVE (short SMA sanity path in W29 oracle) |
| NC-PARITY-{family}-{tier}-INJECTED-REL-ERROR | one compared value of the optimized output is scaled by `NC_INJECTED_RELATIVE_ERROR` (1e-6, 1000× epsilon) — the cell must go RED | LIVE (W41; every canary family × tier, injected into the same pair the positive cell graded) |
| NC-PARITY-{family}-{tier}-ALL-NULL-OPTIMIZED | an all-null optimized output must fail closed to UNPROVEN, never GREEN | LIVE (W41) |
| NC-PARITY-{family}-{tier}-NONFINITE-OPTIMIZED | a NaN/±Infinity compared value must fail closed to UNPROVEN, not be skipped | LIVE (W41) |
| NC-PARITY-{family}-{tier}-LENGTH-MISMATCH | a shorter optimized span must fail closed to UNPROVEN, not compare the overlap | LIVE (W41) |
| NC-PARITY-{family}-{tier}-ZERO-COMPARED | `comparedCount === 0` must fail closed to UNPROVEN — an empty compare is never a divergence of 0 | LIVE (W41) |

Fixtures:

| Fixture | Content | Status |
|---|---|---|
| FIX-ADV-WEEKEND-BOUNDARY | Friday close to Sunday open, session gap preserved | RESERVED |
| FIX-ADV-GAP-BOUNDARY | intraday gaps and missing bars | RESERVED |
| FIX-ADV-FLAT-ZEROVOL | flat bars and zero-volume bars | RESERVED |
| FIX-ADV-EXTREME-VOL | extreme volatility excursions | RESERVED |
| FIX-SCALE-JPY | JPY-quoted pair, large magnitude, few decimals | RESERVED |
| FIX-SCALE-INDEX-FUTURES | index futures, large magnitude | RESERVED |
| FIX-SCALE-CRYPTO-MANYDEC | crypto, small magnitude, many decimals | RESERVED |
| FIX-A7-PRNG-UNIT | deterministic PRNG walk, unit scale — prices are multiples of 2⁻³¹ below 2⁹ so every 20-bar window sum is exactly representable; parity there is structural, labelled `exactly-representable` | LIVE (`docs/plan3/fixtures/a7-prng-series.mjs`) |
| FIX-A7-PRNG-JPY | same walk at 1e6 magnitude — window sums round, so the compare discriminates bit patterns; labelled `rounding-exercised` and used for the drift ladder and every negative control | LIVE (`docs/plan3/fixtures/a7-prng-series.mjs`) |

Epsilon constants are declared and justified in the packet, per family, and are **reserved
names too** so that a later widening is visible as a diff: `EPS-ROLLING-NONRECURSIVE`,
`EPS-RECURSIVE-EMA`, `EPS-RECURSIVE-MACD`, `EPS-RECURSIVE-RSI`, `EPS-RECURSIVE-ATR`,
`EPS-RECURSIVE-ADX`, `EPS-CUMULATIVE-VWAP`, `EPS-CUMULATIVE-OBV`.

The other numeric thresholds this oracle gates on are reserved for the same reason — loosening
any of them must show up as a diff, not as a quieter gate: `LENGTH_GROWTH_FACTOR` (ladder growth
cap), `GROWTH_BASE_NOISE_FLOOR` (growth baseline floor, never the parity epsilon),
`DIVERGENCE_DENOM_FLOOR` (relative-divergence denominator floor),
`REF_SELF_ERROR_GROWTH_CAP` and `REF_SELF_ERROR_DOMINANCE_MIN` (drift attribution control), and
`NC_INJECTED_RELATIVE_ERROR` (negative-control value defect, pinned far above epsilon).

## Queue item 4 — reachability, negative controls, staleness (A8, A5)

| Name | Signature token | Status |
|---|---|---|
| REACHABILITY-SWEEP-V1 | `TALARIA_REACHABILITY_SWEEP_V1` | RESERVED |
| ORACLE-STALENESS-STAMP-V1 | `TALARIA_ORACLE_STALENESS_V1` | RESERVED — records authored-against build and last-proven-RED build; `UNPROVEN` is never reported as GREEN |
| GUARD-SITE-AUDIT-V1 | `TALARIA_GUARD_SITE_AUDIT_V1` | RESERVED — enumerates every `global.X &&` guard site, scope: everything |

## Queue item 5 — journal tooling (A11.2 item 5, A12.1, A10)

| Name | Signature token | Status |
|---|---|---|
| BOARD-VIEW-GENERATOR-V1 | `TALARIA_BOARD_VIEW_V1` | RESERVED — generates `docs/plan3/BOARD-VIEW.md` from the four append-only journals |
| PO-QUEUE-GENERATOR-V1 | `TALARIA_PO_QUEUE_V1` | RESERVED — generates `docs/plan3/PO-QUEUE.md` from `PO-REQ` entries, rejecting any that fails A12.2 |
| TRAIN-DIGEST-GENERATOR-V1 | `TALARIA_TRAIN_DIGEST_V1` | RESERVED |
| UI-CONTROL-INVENTORY-DIFF-V1 | `TALARIA_UI_CONTROL_INVENTORY_V1` | RESERVED — enumerates interactive controls in `legacy-index.html` and diffs against the current shell (A10) |

## Wave-2 reservations — manifest split and evidence derivation

The Director ruled one compromise manifest into two internally consistent ones. Both names are reserved, and the name they replace is retired rather than reused, so a stale import fails loudly instead of reading a file that means something else.

| Name | Kind | Status |
|---|---|---|
| `scripts/servable-surface-inventory.json` | manifest, schema `talaria.servable-surface-inventory.v1` | RESERVED — broad: every HTML file under the three roots |
| `scripts/chart-shell-inventory.json` | manifest, schema `talaria.chart-shell-inventory.v1` | RESERVED — narrow: only chart-referencing shells, carrying roles and module contracts |
| `scripts/servable-shell-inventory.json` | manifest | RETIRED — superseded by the two above; the name must not be reused |

**`status` vocabulary — fixed and closed.** `owned-stamped`, `image-verified`, `removal-pending`, `denied-route-pending`, `removed`, `no-routing-evidence`. `excluded` is **abolished** by Director ruling; encountering it in a manifest is RED with kind `status-abolished`.

**`routingEvidence` channels — fixed and closed.** `fastapiAllowlist`, `fastapiMount`, `dockerCopy`, `nginxRoot`. `servable` is derived as the OR of the four `present` flags and is never asserted; a declared value that disagrees is RED with kind `servable-not-derived`.

**Violation kinds reserved for the shell gate.** `servable-not-derived`, `routing-evidence-uncited`, `retained-file-missing`, `status-abolished`, alongside the existing `undeclared-shell`, `required-module-count` and the `NC-SHELL-UNDECLARED` negative control.

**`retainFile` / `retainReason`.** Reserved as the machine-readable form of the A10 retention dependency. A row with `retainFile: true` whose path is absent from disk is RED with kind `retained-file-missing`. This is what stops `legacy-index.html` being tidied away before the A10 control inventory has harvested its magnet-mode controls.

## Wave-3 reservations — A14 conditional exposure and retainPath

| Name | Signature / key | Status |
|---|---|---|
| CONDITIONAL-EXPOSURE-ASSERTION-V1 | `TALARIA_CONDITIONAL_EXPOSURE_V1` | RESERVED — A14.3: if a shell lacks correctness-class required modules then routed must be false |
| `retainPath` | inventory field | RESERVED — A14.2: retain-file assertion keys on declared retainPath, not original location |
| NC-EXPOSURE-REROUTE | — | RESERVED — re-routing a shell that lacks correctness modules must go RED |

| STATUS-EVIDENCE-CONSISTENCY-V1 | `TALARIA_STATUS_EVIDENCE_V1` | RESERVED — A14.1: status must derive from same evidence as servable; RED on divergence |
| LIVE-ROUTE-PROBE-V1 | `TALARIA_LIVE_ROUTE_PROBE_V1` | RESERVED — A14.1 tiebreaker: HTTP GET against built image; record status and final URL |

| ORDER-OVERLAY-BROWSER-RUNNER-V1 | `TALARIA_ORDER_OVERLAY_BROWSER_V1` | LIVE — A15.3/A15.4 browser-hosted order-overlay runner |
| ORDER-REGISTRY-EVICTION-INVARIANT-V1 | `TALARIA_ORDER_REGISTRY_EVICTION_V1` | LIVE — A15.2 hosted by C; B author of record; multi-writer |

## Queue item 6 — bar / tick class invariants (A16.3 / A16.3b, W33)

| Name | Signature token | Status |
|---|---|---|
| BAR-TICK-INVARIANTS-V1 | `TALARIA_BAR_TICK_INVARIANTS_V1` | LIVE — `docs/plan3/oracles/bar-tick-invariants-v1.mjs`, `scripts/tests/bar-tick-invariants.test.mjs` |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| BAR-NO-TICKS-INVARIANT | every bar has ≥1 tick in `[open, nextOpen)` (or `[open, open+duration)`) | LIVE |
| FUTURES-MAINTENANCE-GAP-NQ-ES-GC | NQ, ES, GC (+ `NQ1!`, `ES1!`, `GC1!`) bar open not in `[17:00, 18:00)` America/New_York Mon–Fri | LIVE |
| NC-BAR-NO-TICKS-MUTATION | tickless injected bar → RED; fixture without injection → GREEN | LIVE |
| NC-MAINTENANCE-GAP-MUTATION | 17:00 ET bar on NQ → RED; same timestamp on EURUSD → futures cell stays GREEN | LIVE |
| NC-XAUUSD-NOT-GC | XAUUSD at 17:00 ET must not classify as GC | LIVE |

Fixtures (session-faithful synthetic; not live `_resampleDataFull` until A calendar lands):

| Fixture | Content | Status |
|---|---|---|
| `a16-green-eth-stream.mjs` | weekday hourly bars each with ticks | LIVE |
| `a16-futures-maintenance-stream.mjs` | NQ bars outside maintenance; EURUSD control | LIVE |
| `a16-tz-anchors.mjs` | winter + summer 17:00 ET anchors (DST proof) | LIVE |

## Queue item 7 — teardown census + lag session-history (W34, FINDING-LAG-IS-RESIDUE-20260728)

| Name | Signature token | Status |
|---|---|---|
| TEARDOWN-CENSUS-GATE-V1 | `TALARIA_TEARDOWN_CENSUS_V1` | LIVE — `scripts/teardown-census-gate.mjs`, `scripts/lib/teardown-census-probe.mjs`, `scripts/lib/teardown-census-harness.mjs`, `scripts/fixtures/teardown-census/` |
| LAG-SESSION-HISTORY-CONTROL-V1 | `TALARIA_LAG_SESSION_HISTORY_V1` | LIVE — `scripts/lib/lag-session-history-control.mjs` |
| INDICATOR-LAG-ORACLE-V1 | `TALARIA_INDICATOR_LAG_ORACLE_V1` (scaffold) | LIVE — `docs/plan3/oracles/indicator-lag-oracle-v1.mjs`; refuses GREEN/RED unless sealed via session-history control |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| HERMETIC-TEARDOWN-CYCLE | census baseline restored after hermetic multichart sim teardown + settle | LIVE |
| BROWSER-TEARDOWN-CYCLE | browser fixture census after sim teardown + settle (REAL browser; else UNPROVEN) | LIVE |
| NC-TEARDOWN-ORPHAN-INTERVAL | one uncleared interval across teardown → RED | LIVE |
| NC-TEARDOWN-ORPHAN-LISTENER | orphan window/document listener → RED | LIVE |
| NC-TEARDOWN-ORPHAN-RAF | uncancelled rAF loop → RED | LIVE |
| NC-TEARDOWN-ORPHAN-CHANNEL | open MessageChannel ports across teardown → RED | LIVE |
| REAL-SETTLE | documents 60s browser soak settle; hermetic CI uses configurable settleMs (default 50ms) | LIVE |

Follow-up hang point (not in this packet’s write set): product multichart open/teardown census on `chart.js` / `multichart-manager.js`.

### Queue item 7 extension — rest-state census (W35, FINDING-CPU-NOT-MEMORY-20260728)

Standing gate: **no scheduled work at idle rest**, **no render without a data commit**, and
**idle main-thread budget** (zero-commit observe window) on the hermetic host and browser fixture.
Catches the class of idle CPU loops (standing intervals/rAF, render-without-commit, periodic rAF
cadence without commits); product root-cause (Q2 countdown etc.) remains chart authoring (Manager A).
Absolute tab CPU% acceptance remains **PO-PROTOCOL-CPU-AB P1**; `REST-IDLE-MAIN-THREAD-BUDGET`
keeps D1 fixed once periodic idle work is removed.

| Name | Signature token | Status |
|---|---|---|
| REST-STATE-CENSUS-V1 | `TALARIA_REST_STATE_CENSUS_V1` | LIVE — extends `scripts/lib/teardown-census-probe.mjs`, `scripts/lib/teardown-census-harness.mjs`, `scripts/teardown-census-gate.mjs` (`--rest-state`), `scripts/fixtures/teardown-census/host.html?mode=rest` |

Pinned idle observe budgets (hermetic window — structural, not fitted to Task Manager CPU%):

| Constant | Value | Justification |
|---|---|---|
| `REST_IDLE_RAF_TICKS_MAX` | `0` | True idle rest has no self-sustaining rAF chain during zero-commit observe |
| `REST_IDLE_INTERVAL_CALLBACKS_MAX` | `0` | No interval firings without data commits at pinned zero-interval rest |
| `REST_IDLE_LONGTASK_MAX` | `0` | Browser fixture: no sustained main-thread long tasks during zero-commit observe |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| REST-SCHEDULED-WORK-ZERO | at rest, timeouts/intervals/rAF are zero or pinned allowlist (`HERMETIC-REST-PINNED-ZERO-V1`) | LIVE |
| REST-NO-RENDER-WITHOUT-DATA | render counter stable across settle window when commit count unchanged | LIVE |
| REST-IDLE-MAIN-THREAD-BUDGET | zero-commit observe: rAF tick / interval callback / longtask deltas within pinned budgets | LIVE (W39) |
| REST-ALLOWLIST-PINNED | raised allowlist limit alone cannot silence undeclared standing interval | LIVE |
| BROWSER-REST-STATE-CYCLE | browser fixture idle rest census incl. idle budget (REAL browser; else UNPROVEN) | LIVE |
| NC-REST-ORPHAN-INTERVAL | orphan interval while at rest → RED | LIVE |
| NC-IDLE-RENDER-WITHOUT-DATA | idle timer calling render without commit → RED | LIVE |
| NC-IDLE-PERIODIC-RAF-WITHOUT-COMMIT | self-sustaining rAF loop with zero commits during observe → RED | LIVE (W39) |

## Queue item 8 — support passport degraded modules (W36, CONCLUSION-48H M6)

| Name | Signature token | Status |
|---|---|---|
| SUPPORT-PASSPORT-DEGRADED-MODULES-V1 | `TALARIA_SUPPORT_PASSPORT_DEGRADED_V1` | LIVE — `scripts/lib/support-passport-degraded.mjs`, `scripts/support-passport-degraded-gate.mjs`, `scripts/tests/support-passport-degraded.test.mjs` |

Cells:

**W40 re-authoring (R-M6 REJECT closed).** The gate no longer contains a hand-copied mirror of
`buildSupportContext()`. `supportUi.tsx` is transpiled with the TypeScript compiler API and the
**real exported function** is executed inside a `vm` realm whose `window` is the one published by
`module-presence-runtime.js` (with `indicator-performance.js` as the provider). A mirror can only
prove that the mirror agrees with itself, so it is gone: `extractDegradedModulesForPassport` and
`passportDegradedModulesSlice` are withdrawn names and must not be reintroduced. The compiler is
taken from the **homepage** workspace, which owns `supportUi.tsx` and pins the version that file is
written against, so the gate adds no dependency and no lockfile churn at the workspace root. It is
a hard dependency all the same: when it cannot be resolved the gate reports RED via
`SUPPORT-PASSPORT-REALM-BOOT` rather than degrading to a re-implementation.

CI: `.github/workflows/support-passport-degraded.yml` (gate self-test, then preflight, then
evidence artifact).

| Cell | Asserts | Coverage (VER-01) | Status |
|---|---|---|---|
| PASSPORT-DEGRADED-KEY-ALWAYS | real `buildSupportContext()` on a healthy runtime returns `degradedModules` as a present, empty **array** — never an absent key, never a scalar | soundness | LIVE |
| PASSPORT-DEGRADED-ROUND-TRIP | runtime degrades itself (absent provider trips the tripwire) plus one `__talariaMarkMissingModule` call; the expectation is **read back from the runtime's own published list**, never injected | soundness | LIVE |
| PASSPORT-DEGRADED-BOUNDING-PROPERTIES | against the real function: output ⊆ input, no duplicates, junk ids rejected, bounded-id pattern held, and the cap binds **exactly** at 32 when more valid ids are offered | soundness | LIVE (W40) |
| SUPPORT-UI-SOURCE-CONTRACT | the three degraded-state aliases survive in `supportUi.tsx`, scanned with comments **and string literals stripped**. Scope deliberately narrowed to tokens execution cannot observe: all three aliases point at one object today, so their loss is behaviourally silent. The cap, regex, dedupe and always-array key are no longer pinned — they are executed | wiring | LIVE (W40) |
| NC-ALIAS-PIN-REMOVAL | deleting the trailing alias turns the pin RED **while every behavioural cell stays GREEN** — the asymmetry that justifies keeping a source pin at all | wiring | LIVE (W40) |
| NC-COMMENT-DOES-NOT-SATISFY-PIN | the deleted alias re-added as a line comment, a block comment, or a string literal must **not** pay the pin | wiring | LIVE (W40) |
| NC-PASSPORT-DEGRADED-MUTATION | — | WITHDRAWN (W40) — tautological substring delete; superseded by the M1–M5 behavioural mutants below |

Behavioural mutants. Each edits `supportUi.tsx` into a plausible regression, re-runs the whole
behavioural suite against the mutated product source, and is RED unless a named cell kills it. A
mutant whose target no longer exists is RED, not a silent pass.

| Mutant | Cell | Mutation | Killed by | Status |
|---|---|---|---|---|
| M1 | NC-MUTANT-CAP-ZERO | `.slice(0, 32)` → `.slice(0, 0)` | ROUND-TRIP, BOUNDING-PROPERTIES | LIVE (W40) |
| M2 | NC-MUTANT-DECOY-REGEX | bounded-id regex → permissive decoy `/[A-Za-z]/` | BOUNDING-PROPERTIES | LIVE (W40) |
| M3 | NC-MUTANT-POST-ASSIGNMENT-CLEAR | passport built correctly, then cleared before `return ctx` | ROUND-TRIP, BOUNDING-PROPERTIES | LIVE (W40) |
| M4 | NC-MUTANT-DEDUPE-DROP | `new Set(` dropped, so a repeated id is reported twice | BOUNDING-PROPERTIES | LIVE (W40) |
| M5 | NC-MUTANT-ARRAY-STRING-COERCION | array `.join(",")` — the client-side twin of the server finding below | KEY-ALWAYS, ROUND-TRIP, BOUNDING-PROPERTIES | LIVE (W40) |

### FINDING-SUPPORT-CONTEXT-STR-COERCION-20260728 — escalate to A / Director

**Out of Manager C territory. Not fixed here; `chart v 1.4/chart/api_server.py` is product.**

This gate proves the *client* passport: `buildSupportContext()` emits `degradedModules` as a
`string[]`. The *server* persistence path then does
`extra["context"] = {str(k)[:64]: str(v)[:500] for k, v in list(context_in.items())[:20]}`
at `chart v 1.4/chart/api_server.py:15595`, so the array is stored as its Python repr —
`"['IndicatorPerf']"` — and support tooling cannot read it back as a list. The degraded-module
evidence the passport was built to carry survives the client and dies in the database.

Reported by the non-blocking cell `FINDING-SERVER-CONTEXT-STR-COERCION` (`coverage: boundary`,
`blocking: false`, `pass: null`, excluded from `allPass`), with states `OPEN` / `RESOLVED` /
`UNPROVEN`. It is deliberately non-blocking: C may not edit product code, and a gate that goes RED
over a defect its owner is forbidden to fix teaches people to ignore it. The escalation, not the
red light, is the mechanism. A hard cell can be promoted once A or the Director takes the fix.

## Queue item 9 — storage growth census (W38, FINDING-CPU-NOT-MEMORY Correction 1)

Measurement infra for bounded-retention policy evidence. Product retention fixes remain A/B
territory. Memory magnitude claims must declare browser storage profile (clean vs uncleared).

| Name | Signature token | Status |
|---|---|---|
| STORAGE-GROWTH-CENSUS-V1 | `TALARIA_STORAGE_GROWTH_CENSUS_V1` | LIVE — `scripts/storage-growth-census-gate.mjs`, `scripts/lib/storage-growth-census.mjs`, `scripts/lib/storage-growth-harness.mjs`, `scripts/fixtures/storage-growth/` |

Cells:

| Cell | Asserts | Coverage (VER-01) | Status |
|---|---|---|---|
| STORAGE-GROWTH-PER-SESSION | hermetic ladder open → replay → N sessions yields per-step deltas and avgBytesPerSession within pinned budget when bounded retention sim enabled | soundness | LIVE |
| NC-STORAGE-UNBOUNDED-MUTATION | unbounded session/cache growth exceeds `HERMETIC_STORAGE_BUDGET_V1` → RED; bounded baseline stays GREEN | soundness | LIVE |
| BOUNDARY-STORAGE-PROFILE-ON-MEMORY-CLAIMS | evidence documents clean vs dirty storage profile requirement on idle memory comparisons | boundary | LIVE |
| BROWSER-STORAGE-GROWTH-LADDER | browser fixture runs hermetic-in-page storage ladder (REAL browser; else UNPROVEN) | soundness | LIVE |

Pinned budget name (hermetic): `HERMETIC_STORAGE_BUDGET_V1` — changing limits is a visible diff.
