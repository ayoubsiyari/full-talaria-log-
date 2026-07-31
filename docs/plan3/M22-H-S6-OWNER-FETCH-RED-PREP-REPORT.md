# M22 / H-S6 owner-fetch RED-prep report

**Status:** `RED-PREP-ONLY-M21-1-LOCKED`  
**Audit ref:** `db9ddd96`  
**Product GREEN:** not claimed — M21-1 owns `chart.js`

## Defect summary

During same-pair 4-panel **interval-sync ON** host TF fan-out **1m→1h**, audit `db9ddd96` confirmed all panels **A/B/C/D** perform data fetches instead of the intended single-owner contract. Root cause: `_applyFinerPanelHostCommit` allows peers still at **1m** to enter **finer-self-own** via `_multichartFinerSamePairPanelSelfOwns` while the host is committing the **1h** fan-out frame. The **1h→1m** cached return path currently meets the zero/low-fetch expectation and must be preserved on GREEN.

## Intended GREEN invariants (future)

| Phase | Owner fetch | Peer B/C/D | Target-TF network |
|-------|-------------|------------|-------------------|
| 1m→1h fan-out | exactly **A**, ≤1 | **0** | **1** bars/smart/candles @ 1h |
| 1h→1m cached | ≤1 owner | **0** | **0** (1m warm) |

## Known RED signature (current product, both trees)

| Phase | panelsThatFetched | target-TF requests | peer `_mcFinerPanelSelfOwner` |
|-------|-------------------|--------------------|-------------------------------|
| 1m→1h | `["A","B","C","D"]` | ≥4 | B/C/D true at settle |
| 1h→1m | ≤1 | 0 | n/a |

## Future fix switch (predeclared, not implemented)

| Switch | Default | Meaning |
|--------|---------|---------|
| `__TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD` | **ON** (fix active when unset/false) | Guard declines transient finer-self-own during host interval fan-out |
| same switch `= true` | OFF | Legacy A/B/C/D storm for kill discrimination |

## Future product hunk scope

Limited to **`_applyFinerPanelHostCommit`** and, only if indispensable, helper context in `chart.js`. Must distinguish **`_mcIntervalSyncOn` / `__fromHostFanout` host interval fan-out** from legitimate **BL-15 / H-S21 / H-S23** panel-initiated finer self-ownership. **No blanket disable** of `_multichartFinerSamePairPanelSelfOwns`.

See [M22-H-S6-OWNER-FETCH-FUTURE-HUNK-MANIFEST.json](./M22-H-S6-OWNER-FETCH-FUTURE-HUNK-MANIFEST.json).

## New artifacts (hash-bound)

| Path | Role |
|------|------|
| `chart v 1.4/chart/modules/m22-hs6-dual-tree-root.mjs` | Dual-tree + pinlock |
| `chart v 1.4/chart/modules/m22-hs6-owner-fetch-contract.mjs` | Contract + GREEN suite list |
| `chart v 1.4/chart/modules/m22-hs6-owner-fetch-oracle.mjs` | Pure oracle |
| `chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs` | Real harness browser runner |
| `chart v 1.4/chart/modules/m22-hs6-owner-fetch.red.test.mjs` | Meta RED acceptance wrapper |
| `chart v 1.4/chart/modules/m22-hs6-owner-fetch-evidence-io.mjs` | Declared evidence I/O |

## Commands

```bash
# Syntax + pure oracle parity + dual-tree pinlock
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m22-hs6-owner-fetch.red.test.mjs"

# Real product/browser RED cell (both trees)
node "chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs"

# Optional evidence write
M22_HS6_WRITE_EVIDENCE=1 node "chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs"
```

## Meta-test vs product RED

- **Meta-test PASS:** wrapper + oracle agree `PRODUCT-RED-CONFIRMED` (exit **11**), identical `ABCD-4FETCH-STORM` on v14 + homepage.
- **Product RED:** engine still fails GREEN invariants; **no implementation claim**.

## Required future GREEN suite (worker handoff)

H-S6, H-S64, H-S21, H-S23, interval switch, cache/no-cache, same/different pair/file, replay/static/live, delayed/reordered host commit, 4-panel network count, kill-OFF legacy discrimination, Q1/Q2/Q8, M21-1 regressions.

## Serialization handoff

Runner stdout JSON + `serializeHandoff()` in `m22-hs6-owner-fetch-oracle.mjs` — fields: `verdict`, `exitCode`, `signature`, `dualTreeParity`, per-tree `fetched`/`deltas`/`targetTfRequests`/`peerSelfOwn`, `pinlock`, `nextWorker`.

## Forbidden edits (this lane)

`chart.js`, `scenarios.mjs`, `known-failing.json`, `panel-cmd-bridge.js`, `sync-bridge.js`, W5/W6, existing product/tests.
