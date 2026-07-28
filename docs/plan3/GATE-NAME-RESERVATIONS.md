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
| DIFFERENTIAL-PARITY-ORACLE-V1 | `TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1` | RESERVED |

Cells:

| Cell | Asserts | Status |
|---|---|---|
| PARITY-ROLLING-SUBTRACTION | optimized vs fallback for SMA/WMA/Bollinger/Donchian/stochastic within per-family epsilon | RESERVED |
| PARITY-RECURSIVE | EMA/MACD/RSI/ATR/ADX within per-family epsilon, seed and warm-up declared | RESERVED |
| PARITY-CUMULATIVE | VWAP/OBV over long ranges | RESERVED |
| DRIFT-SMA-100K / DRIFT-SMA-500K / DRIFT-SMA-1M | divergence does not grow with series length on the running-sum path (`rollingSmaFast`) | RESERVED |
| DRIFT-WMA-CONTROL | `rollingWmaFast` recomputes its window and must show no length-dependent drift — the control that proves the drift cells measure drift | RESERVED |
| PAINTED-SUBPIXEL-MAXZOOM | painted divergence is sub-pixel at maximum zoom on the fixture's price scale | RESERVED |
| BUCKET-IMMUTABILITY-5M / -15M / -1H / -4H | a finalised bucket's OHLC never changes for the remainder of a replay | RESERVED |
| NC-PARITY-EPSILON-INVERTED | with the epsilon comparison inverted, every parity cell must go RED | RESERVED |

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

Epsilon constants are declared and justified in the packet, per family, and are **reserved
names too** so that a later widening is visible as a diff: `EPS-ROLLING-NONRECURSIVE`,
`EPS-RECURSIVE-EMA`, `EPS-RECURSIVE-MACD`, `EPS-RECURSIVE-RSI`, `EPS-RECURSIVE-ATR`,
`EPS-RECURSIVE-ADX`, `EPS-CUMULATIVE-VWAP`, `EPS-CUMULATIVE-OBV`.

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
