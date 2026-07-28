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
| CACHE-STAMP-COHERENCE-V1 | `TALARIA_CACHE_STAMP_COHERENCE_V1` | `scripts/cache-stamp-coherence-gate.mjs`, `scripts/lib/cache-stamp-coherence.mjs`, `scripts/cache-stamp-module-baseline.json` | LIVE (W55) — content-hash vs sealed `?v=` stamp + cross-shell module stamp coherence |

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

## Queue item 8 — support passport degraded modules (W36, CONCLUSION-48H M6; W40, W42, W43, W44)

| Name | Signature token | Status |
|---|---|---|
| SUPPORT-PASSPORT-DEGRADED-MODULES-V1 | `TALARIA_SUPPORT_PASSPORT_DEGRADED_V1` | LIVE — `scripts/lib/support-passport-degraded.mjs`, `scripts/support-passport-degraded-gate.mjs`, `scripts/tests/support-passport-degraded.test.mjs`. Product territory pinned **read-only**: `supportUi.tsx`, `SupportInbox.tsx`, `V16SupportChatPopover.tsx` are executed or parsed, never edited by this gate |

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

**W42 re-authoring (R-M6-2 REJECT closed).** Three defects were named and all three are closed
by construction rather than by argument.

*Temporal hole.* Every W40 cell built a fresh realm and called the extractor exactly once, so a
passport memoised at module scope was invisible to the whole gate: the first support ticket of a
session carried the degraded modules and every later one silently did not.
`PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE` calls the real function three times in **one** realm,
degrading the runtime between calls, and mutant **M6** is that memoisation. M6 is killed by the
temporal cell and survives all six others — the recorded proof that the cell is load-bearing.

*Unfalsifiable source pins.* `window.__TALARIA_DEGRADED_STATE` is a **prefix** of
`window.__TALARIA_DEGRADED_STATE__`, so as a substring pin it could never go missing while the
longer alias existed. All three token pins are **deleted**, together with the string scanner that
served them (`SUPPORT_UI_DEGRADED_CONTRACT_TOKENS`, `assertSupportUiDegradedSourceContract`,
`stripCommentsAndStringLiterals` are withdrawn names and must not be reintroduced). Each alias is
now a behavioural fact: the realm publishes the degraded record under **exactly one** global,
deleting the other two before `supportUi.tsx` is evaluated, and the real function must still find
it. `NC-ALIAS-DROP-*` deletes one alias from the product source and requires that alias's own boot
cell to be the **sole** detector — the asymmetry the source pins claimed and could not prove.

*Consumer call path.* An extractor is only worth proving if something sends what it builds, and
deleting the call is an edit no behavioural cell can see. The passport is pinned onto the send path
**by AST**: a `CallExpression` named `buildSupportContext` in `SupportInbox.tsx` (the `context:`
field of the new-thread payload) and in `V16SupportChatPopover.tsx`. Both files are read-only to
this gate — pinned from `scripts/`, never edited. A comment, string literal, template literal,
**regex literal** and **JSX text** are none of them a `CallExpression`, so the decoy classes that
can pay a substring pin are structurally excluded here; `NC-CONSUMER-PIN-DECOYS` demonstrates that
for all five classes × both consumers rather than asserting it, and appends each decoy to the
intact file as well so a decoy that broke parsing cannot masquerade as a decoy correctly ignored.

**W43 re-authoring (R-M6-3 REJECT closed).** Three further holes named against W42.

*Realm readyState.* The document stayed permanently at `readyState: "loading"`, so a cache gated
on `document.readyState === "complete"` was dead code inside the gate and live in every real
browser (tickets are filed after load). The realm now advances to `"complete"` after
`DOMContentLoaded`. Mutant **M6** is that readyState-gated memoisation.

*Wall clock.* The temporal cell's three calls landed within ~1 ms, so a
`Date.now() - boot > 30_000` warm-up cache was invisible. The realm exposes a controllable
`Date.now`, and the temporal cell advances it by `TEMPORAL_CLOCK_ADVANCE_MS` (31s) between
observations. Mutant **M7** is that warm-up-gated memoisation.

*Call-site timing.* Counting `CallExpression`s anywhere left a
`React.useMemo(() => buildSupportContext(), [])` hoist GREEN while every later ticket from that
mount carried the mount-time snapshot. The consumer pin now requires ≥1 call whose enclosing
binding is `createThread` and that is not inside `useMemo`; `NC-CONSUMER-CALL-HOISTED-USEMEMO`
is the negative control.

**W44 re-authoring (R-M6-4 REJECT closed).** Unbounded unmodelled-API class.

*Modelled browser surfaces.* `sessionStorage`, `localStorage`, `performance.now` (tied to the
realm clock), and `document.visibilityState="visible"` are installed so caches that use them
are live inside the gate. Mutants **M8** (sessionStorage) and **M9** (`performance.now` warm-up)
are killed by TEMPORAL-RECOMPUTE.

*Fail-closed Proxy.* `window`/`document` are Proxies: any property read by `buildSupportContext`
that is not an own modelled/runtime property fails `PASSPORT-DEGRADED-REALM-FIDELITY` (and the
temporal cell's `noUnmodelledReads` guard). Mutant **M10** (`window.indexedDB`) is the carrier.

**W51-RUNTIME-FREEZE (Director C-4).** The W43-W50 consumer mutation/reassignment detector family
is inverted rather than extended. `supportUi.tsx` is the sole writer: `buildSupportContext` fully
populates `ctx` and deep-freezes the publication value at return (including the SSR `{}` path).
`SupportInbox.tsx` and `V16SupportChatPopover.tsx` remain consumers only: they call the builder and
attach the returned context to the payload. The gate now proves runtime immutability of the returned
object and nested `degradedModules` array. The W43-W50 mutation corpus is retained as eight runtime
attempts against the returned value, documented as rejection inheritance, not as a new AST detector
spec.

**W51b (R-W51 REJECT close).** Freeze + mutation-corpus cells run under sparse **and**
production-shaped realms (`app.talaria.io`, non-Gate UA) so an env-gated freeze cannot stay GREEN
under gate branding alone (mutant **M17**). Consumer wiring restores a **bounded value-flow** pin
(call result reaches request `context` / `append("context", …)`) without restoring mutation AST
walks; **NC-CONSUMER-CONTEXT-DISCARDED** is the carrier for R-W51 Break 2.

**W53 (C-RUL-M6-ENVELOPE / ORACLE-01).** Envelope integrity is now a transport-boundary oracle,
not another syntax detector. The gate extracts each real `const createThread = async () => { ... }`
declaration with the TypeScript AST only so it can execute the body. It binds the real
`buildSupportContext()` from the passport realm, stubs the consumer transport (`api` /
`supportApi`) and `FormData`, marks `OrderOverlay` degraded, then inspects the actual outgoing
JSON and multipart request bodies. The oracle is **non-blocking** (`blocking: false`): M6 ship
credit is scoped to freeze+corpus, and the envelope class remains an OPEN follow-on.

**W54 (ORACLE-01 residual).** `SUPPORT_PASSPORT_CONSUMERS` is no longer trusted as a complete
hand-maintained census. `SUPPORT-PASSPORT-CONSUMER-CENSUS` walks `homepage/src/**/*.{ts,tsx}`
with the TypeScript AST, excludes the definition site `supportUi.tsx`, discovers every direct
`buildSupportContext()` `CallExpression`, and requires exact path equality with the declared
consumer list. This cell is blocking because an undeclared caller is a ship-relevant regression
hazard for the transport and call-path cells. `NC-SUPPORT-PASSPORT-CONSUMER-CENSUS-UNDECLARED`
adds a synthetic third source file to the discovery input and requires the census detector to go
RED.

**M6 ship status (Director ruling 2026-07-28):** **SCOPED — freeze+corpus GRANTED.** Envelope
class OPEN as W53 follow-on (REACH-01: no live blanking producer per C-ASM-M6-LATE-WRITER).
Not "M6 complete."

CI: `.github/workflows/support-passport-degraded.yml` (gate self-test, then preflight, then
evidence artifact). W42 added both consumer `.tsx` paths to the trigger set.

| Cell | Asserts | Coverage (VER-01) | Status |
|---|---|---|---|
| PASSPORT-DEGRADED-KEY-ALWAYS | real `buildSupportContext()` on a healthy runtime returns `degradedModules` as a present, empty **array** — never an absent key, never a scalar | soundness | LIVE |
| PASSPORT-DEGRADED-ROUND-TRIP | runtime degrades itself (absent provider trips the tripwire) plus one `__talariaMarkMissingModule` call; the expectation is **read back from the runtime's own published list**, never injected | soundness | LIVE |
| PASSPORT-DEGRADED-BOUNDING-PROPERTIES | against the real function: output ⊆ input, no duplicates, junk ids rejected, bounded-id pattern held, and the cap binds **exactly** at 32 when more valid ids are offered | soundness | LIVE (W40) |
| PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE | **one realm, three calls** under post-load `readyState==="complete"` with `TEMPORAL_CLOCK_ADVANCE_MS` between tickets: call → mark `OrderOverlay` → call → mark `AlertSystem` → call. Each observation must equal the runtime list; runtime advances 0 → 1 → 2; clock advances ≥31s; **no unmodelled window/document reads** | soundness | LIVE (W44) |
| PASSPORT-DEGRADED-REALM-FIDELITY | modelled `sessionStorage`/`localStorage`/`performance.now`/`visibilityState` present; `buildSupportContext` reads zero unmodelled window/document properties | soundness | LIVE (W44) |
| PASSPORT-DEGRADED-ALIAS-CANONICAL / -DUNDER / -COMPAT | with the other two globals **deleted from the realm**, the real function still reads the degraded record from `__TALARIA_DEGRADED_STATE` / `__TALARIA_DEGRADED_STATE__` / `__TALARIA_DEGRADED_MODE__` respectively, non-empty and equal to what that alias published | soundness | LIVE (W42) |
| PASSPORT-CONTEXT-DEEP-FROZEN | after the real `buildSupportContext()` returns under sparse + browserRealistic + productionShaped, `Object.isFrozen(ctx)`, `Object.isFrozen(ctx.degradedModules)`, and nested object/array values are frozen; production profile must be `app.talaria.io` (not `.test` / Gate UA) | soundness | LIVE (W51b) |
| PASSPORT-CONTEXT-MUTATION-CORPUS | W43-W50 eight-rejection inheritance attempted against the returned context under sparse **and** production-shaped realms: dot/bracket assignment, `Object.assign(ctx, ...)`, array `push`/`splice`/`pop`, `Object.assign(ctx.degradedModules, {0:"X"})`, and `delete ctx.degradedModules`; each must throw in strict mode or no-op with values unchanged | soundness | LIVE (W51b) |
| SUPPORT-PASSPORT-CONSUMER-CALL-PATH | import + ≥1 `createThread` call not inside `useMemo` + call result reaches request `context` (property or `FormData.append`); mutation safety enforced at runtime publication, not by consumer mutation AST | wiring | LIVE (W51b) |
| SUPPORT-PASSPORT-CONSUMER-CENSUS | product-wide TypeScript AST census of direct `buildSupportContext()` callers under `homepage/src`, excluding `supportUi.tsx`, must exactly equal `SUPPORT_PASSPORT_CONSUMERS` by relative path | wiring | LIVE (W54) |
| NC-ALIAS-DROP-CANONICAL / -DUNDER / -COMPAT | one alias deleted from `supportUi.tsx` (the tail alias takes the preceding `??` with it, or the edit is a syntax error rather than a regression): its own boot cell goes RED and **no other behavioural cell moves**. An alias that cannot be uniquely aimed is RED, not a silent pass | wiring | LIVE (W42) |
| NC-SUPPORT-PASSPORT-CONSUMER-CENSUS-UNDECLARED | a synthetic third `homepage/src` source file containing `buildSupportContext()` is added to the discovery input; the census cell must report it as extra and go RED | wiring | LIVE (W54) |
| NC-CONSUMER-CALL-DELETED | the `buildSupportContext()` call removed from a consumer while the **import stays** turns the consumer cell RED — the pin keys on the call, not on the import | wiring | LIVE (W42) |
| NC-CONSUMER-CALL-HOISTED-USEMEMO | `React.useMemo(() => buildSupportContext(), [])` hoist at component body with submit-handler call replaced by the frozen binding: `callCount` stays ≥1 and import intact, but `submitHandlerCallCount` drops to 0 and the consumer cell goes RED | wiring | LIVE (W43) |
| NC-CONSUMER-CONTEXT-DISCARDED | call remains on `createThread` but payload `context` is emptied / discarded; `valueFlowCallCount` drops to 0 and the consumer cell goes RED (R-W51 Break 2) | wiring | LIVE (W51b) |
| NC-CONSUMER-CONTEXT-REASSIGNED | after bind, `payload.context = …` / `Object.assign(..., { context })` blanks the ticket while the frozen builder return stays pristine; wiring pin goes RED (R-W51b / W52) | wiring | LIVE (W52) |
| NC-CONSUMER-PIN-DECOYS | line comment, block comment, string literal, template literal, **regex literal** and **JSX text** each containing `buildSupportContext()` must not pay the pin, on both consumers; the same decoy appended to the intact file must leave the real call site still counted | wiring | LIVE (W42) |
| NC-MUTANT-NO-DEEP-FREEZE | strip the publication deep-freeze from `supportUi.tsx`; the runtime-freeze cells must go RED while round-trip/temporal extraction cells stay GREEN | soundness | LIVE (W51) |
| PASSPORT-TRANSPORT-DEGRADED-MODULES | execute both consumers' real `createThread` bodies with stubbed transport and `FormData`; JSON and multipart outgoing bodies must carry `context.degradedModules[]` including `OrderOverlay` after the realm marks it degraded | wiring | LIVE (W53, non-blocking follow-on) |
| NC-TRANSPORT-ENVELOPE-BLANKED | apply the existing context-discard/reassign negative-control mutations to the consumer sources, then run the same transport oracle; the NC passes only because the oracle goes RED on the outgoing body | wiring | LIVE (W53, non-blocking follow-on) |
| SUPPORT-UI-SOURCE-CONTRACT | — | WITHDRAWN (W42) — substring pin on `window.__TALARIA_DEGRADED_STATE`, a prefix of `..._STATE__`, therefore unfalsifiable; superseded by the alias boot cells |
| NC-ALIAS-PIN-REMOVAL | — | WITHDRAWN (W42) — negative control for a withdrawn pin; superseded by NC-ALIAS-DROP-* |
| NC-COMMENT-DOES-NOT-SATISFY-PIN | — | WITHDRAWN (W42) — covered only comments and string literals; the regex-literal and JSX-text decoys it missed are in NC-CONSUMER-PIN-DECOYS |
| NC-PASSPORT-DEGRADED-MUTATION | — | WITHDRAWN (W40) — tautological substring delete; superseded by the M1–M6 behavioural mutants below |
| hasContextReassignmentAfterCall | — | WITHDRAWN (W51) — consumer reassignment AST detector retired; publication deep-freeze is the blocking mechanism |
| hasHelperIndirectionFreeze | — | WITHDRAWN (W51) — helper-indirection mutation AST detector retired; publication deep-freeze is the blocking mechanism |
| hasHelperIndirectionFreeze / value-freeze AST family | — | WITHDRAWN (W51) — unbounded helper-indirection mutation AST stays retired under Director C-4 |
| valueFlow without envelope overwrite check | — | SUPERSEDED (W52) — W51b restored reaches-`context`; W52 adds `!contextReassignedAfter` for payload envelope integrity |

Behavioural mutants. Each edits `supportUi.tsx` into a plausible regression, re-runs the whole
behavioural suite against the mutated product source, and is RED unless a named cell kills it. A
mutant whose target no longer exists is RED, not a silent pass.

| Mutant | Cell | Mutation | Killed by | Status |
|---|---|---|---|---|
| M1 | NC-MUTANT-CAP-ZERO | `.slice(0, 32)` → `.slice(0, 0)` | ROUND-TRIP, BOUNDING-PROPERTIES, TEMPORAL-RECOMPUTE, all three ALIAS cells | LIVE (W40) |
| M2 | NC-MUTANT-DECOY-REGEX | bounded-id regex → permissive decoy `/[A-Za-z]/` | BOUNDING-PROPERTIES (sole detector) | LIVE (W40) |
| M3 | NC-MUTANT-POST-ASSIGNMENT-CLEAR | passport built correctly, then cleared before `return ctx` | ROUND-TRIP, BOUNDING-PROPERTIES, TEMPORAL-RECOMPUTE, all three ALIAS cells | LIVE (W40) |
| M4 | NC-MUTANT-DEDUPE-DROP | `new Set(` dropped, so a repeated id is reported twice | BOUNDING-PROPERTIES (sole detector) | LIVE (W40) |
| M5 | NC-MUTANT-ARRAY-STRING-COERCION | array `.join(",")` — the client-side twin of the server finding below | every behavioural cell | LIVE (W40) |
| M6 | NC-MUTANT-MEMOIZED-PASSPORT | readyState-gated module-scope cache (`if (__passportCache !== null && document.readyState === "complete") return __passportCache`) — the R-M6-3 carrier that stayed GREEN under a permanently-loading realm | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W43) |
| M7 | NC-MUTANT-MEMOIZED-AFTER-WARMUP | warm-up-gated module-scope cache (`Date.now() - boot > 30_000`) — invisible when temporal calls land within one millisecond | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W43) |
| M8 | NC-MUTANT-SESSION-STORAGE-CACHE | `sessionStorage` JSON cache — the R-M6-4 primary carrier | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W44) |
| M9 | NC-MUTANT-PERFORMANCE-NOW-WARMUP | warm-up cache keyed on `performance.now()` — Date.now controllability does not touch it | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W44) |
| M10 | NC-MUTANT-UNMODELLED-API-READ | `void window.indexedDB` — unmodelled API must trip REALM-FIDELITY | TEMPORAL-RECOMPUTE + REALM-FIDELITY | LIVE (W44) |
| W51 | NC-MUTANT-NO-DEEP-FREEZE | `return deepFreeze(ctx)` / SSR `deepFreeze({})` stripped back to mutable returns | PASSPORT-CONTEXT-DEEP-FROZEN + PASSPORT-CONTEXT-MUTATION-CORPUS only; extraction round-trip and temporal cells survive | LIVE (W51) |
| M11 | NC-MUTANT-PERFORMANCE-TIMEORIGIN-WARMUP | warm-up cache keyed on `performance.timeOrigin` | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W45) |
| M12 | NC-MUTANT-BODY-DATASET-CACHE | `document.body.dataset` cache | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W45) |
| M13 | NC-MUTANT-SERVICE-WORKER-GATED-CACHE | cache gated on `navigator.serviceWorker` presence | TEMPORAL-RECOMPUTE + REALM-FIDELITY | LIVE (W46) |
| M14 | NC-MUTANT-BARE-SESSION-STORAGE-CACHE | bare `sessionStorage` (not `window.sessionStorage`) | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W47) |
| M15 | NC-MUTANT-HOST-GATED-CACHE | identity/host-gated cache that stays GREEN under `.test` / Gate UA | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W48) |
| M16 | NC-MUTANT-SETTIMEOUT-TTL-CACHE | module-scope cache cleared by `setTimeout(60s)` | **TEMPORAL-RECOMPUTE, and nothing else** | LIVE (W49) |
| M17 | NC-MUTANT-ENV-GATED-FREEZE | `deepFreeze` no-ops outside `.test` hosts — GREEN under gate branding, unfrozen in production (R-W51 Break 1) | PASSPORT-CONTEXT-DEEP-FROZEN + PASSPORT-CONTEXT-MUTATION-CORPUS | LIVE (W51b) |

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

## Gate Note — A14.3 legacy de-route (W56)

`/chart/legacy-index.html` is de-routed, not fixed. `checkpoint-runtime-probe` now requires HTTP
404 for that path, `CACHE-STAMP-SHELLS` keeps only the retained chart-root canonical source, and
the shell-inventory ratchet is `conditional-exposure:2`,
`exclusion-count-undeclared:1`, `proof-of-derouting-unsatisfied:38`,
`shell-parse-incomplete:12` with no `removal-pending` allowance.

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

## Queue item 10 — M-6 replay leak browser acceptance (W57)

| Name | Signature token | Implementation | Status |
|---|---|---|---|
| M6-REPLAY-LEAK-GATE-V1 | `TALARIA_M6_REPLAY_LEAK_V1` | `scripts/m6-replay-leak-gate.mjs`, `scripts/lib/m6-replay-leak-probe.mjs`, `scripts/tests/m6-replay-leak-gate.test.mjs` | ESCALATED / UNPROVEN — PO workload armed (4 panels + indicators + order + live replay) still returns live=1 on unfixed HEAD; preflight mints UNPROVEN not GREEN; R-W57 ACCEPT is not the acceptance instrument |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| M6-PO-WORKLOAD-ARMED | four panels, ≥3 indicators each, host order placed, replay observed playing | LIVE (arm) |
| M6-REPLAY-LIVE-COUNT-RETURNS-TO-ONE | after N PO-workload cycles back to single-chart, live Q6 instances === 1 | UNPROVEN (cannot go RED on today's unfixed code) |
| M6-DETACHED-IFRAME-COUNT-NOT-GROWN | after return to single: connected iframes 0 and detachedLive 0 | UNPROVEN (same) |
| M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE | after PO-workload cycles return to single-chart and 60s soak, harness + open-panel scheduling residue stays within baseline + `M6_SCHEDULER_CENSUS_EPSILON` | LIVE as blocking instrument; if flat with live=1, verdict remains UNPROVEN / ESCALATE |
| NC-M6-TEARDOWN-REVERSAL | served mutant no-ops `m20Q6DrainState` + `destroy()`; acceptance cells must go RED | LIVE (machinery; not ship credit while UNPROVEN) |
| NC-M6-SCHEDULER-ORPHAN-INTERVAL | synthetic unclosed interval in scheduler census makes `M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE` RED while Q6 live may return to 1 | LIVE (unit fault-injection) |

## Queue item 10 extension — PO CPU A/B benchmark (W58c)

| Name | Signature token | Implementation | Status |
|---|---|---|---|
| PO-CPU-AB-BENCHMARK-V1 | `TALARIA_PO_CPU_AB_BENCHMARK_V1` | `scripts/po-cpu-ab-benchmark-gate.mjs`, `scripts/lib/po-cpu-ab-benchmark.mjs`, `scripts/tests/po-cpu-ab-benchmark.test.mjs` | LIVE — browser-hosted PO protocol benchmark; observables are main-thread callback and longtask work, not process CPU% |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| P1-IDLE-SINGLE-CHART-OBSERVED | single-chart idle workRatio is finite and below absolute `PO_CPU_AB_P1_IDLE_WORK_RATIO_MAX` | LIVE |
| P2-IDLE-STABLE-NO-UNBOUNDED-WORK | idle soak workRatio is below both P1-relative and absolute `PO_CPU_AB_P2_IDLE_WORK_RATIO_MAX`; high P1 cannot absorb high P2 | LIVE |
| P2-IDLE-MEMORY-NOT-GROWING | exposed heap delta during P2 stays bounded | LIVE |
| P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED | W62 four-panel replay phase remains armed and observed | LIVE |
| P6-REPLAY-10X-OR-NEAREST-OBSERVED | real replay activation succeeds, `isPlaying` is observed, nearest speed is known, and P6 has replay work over P1 or replay-active observables | LIVE (W58c hardening) |
| P7-PAUSE-STATE-NOT-PLAYING | product pause path leaves replay not playing | LIVE |
| P7-WORK-RETURNS-TO-P1-FLOOR | post-pause workRatio is below both P1-relative and absolute `PO_CPU_AB_P7_IDLE_WORK_RATIO_MAX` | LIVE |
| NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED | served `replay-system.js` pause/stop teardown reversal makes P7 state or work RED | LIVE |

## Queue item 11 — Hidden-tab replay regression (W59 / GATE-01)

| Name | Signature token | Implementation | Status |
|---|---|---|---|
| HIDDEN-TAB-REPLAY-GATE-V1 | `TALARIA_HIDDEN_TAB_REPLAY_V1` | `scripts/hidden-tab-replay-gate.mjs`, `scripts/lib/hidden-tab-replay.mjs`, `scripts/tests/hidden-tab-replay-gate.test.mjs` | LIVE instrument — must RED on today's zero-visibility replay; GREEN on unfixed = GATE-WRONG |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| HIDDEN-TAB-DOCUMENT-FORCED-HIDDEN | probe forced `document.hidden === true` | LIVE |
| HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE | playhead index/timestamp must not advance while hidden | LIVE (RED on unfixed product) |
| NC-HIDDEN-TAB-PAUSE-SHIM | positive-control pause-on-hidden shim makes the advance cell GREEN | LIVE |
