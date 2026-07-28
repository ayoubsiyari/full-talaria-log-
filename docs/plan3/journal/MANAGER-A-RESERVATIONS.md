# Manager A — name reservation registry

Required by §A13: every kill-switch name, global symbol, storage key, message name, oracle and
fixture name is reserved **here, before dispatch**, so parallel briefs cannot collide on naming.
Append-only. A name is released only by a `RELEASED` line with the reason.

Scope: Manager A territory only. Managers B and C reserve in their own registries; anything below
that turns out to be contended across territories is an escalation, not a rename I decide alone.

Polarity convention, inherited from the existing `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1`: the fix is
ON by default and setting the switch to `true` restores the pre-fix behaviour. Correctness-class
switches per §A4c must have a demonstrated switch-OFF cell, not a declared one.

---

## Packet: `session-calendar-red` → `session-calendar-wiring`

| Kind | Reserved name |
|---|---|
| Module file | `chart v 1.4/chart/modules/session-calendar.js` |
| Deploy mirror | `homepage/public/chart/modules/session-calendar.js` |
| Global symbol | `SessionCalendar` |
| Kill-switch | `window.__TALARIA_DISABLE_SESSION_CALENDAR_V1` |
| Oracle | `chart v 1.4/chart/modules/session-calendar-bucketing.test.mjs` |
| Negative control | `chart v 1.4/chart/modules/session-calendar-switch-off.test.mjs` |
| Fixture prefix | `session-calendar-fx-` (e.g. `session-calendar-fx-2013-01-eurusd`) |
| Evidence dir | `tests/evidence/manager-a-session-calendar/` |
| Instrument class ids | `fx-ny1700`, `cme-index`, `crypto-utc` |

## Packet: `trim-overlay-unification` (not yet dispatched — design first)

| Kind | Reserved name |
|---|---|
| Kill-switch | `window.__TALARIA_DISABLE_RENDER_TIME_PLAYHEAD_TRIM_V1` |
| Overlay state field | `_playheadTrimOverlay` on the chart instance |
| Oracle | `chart v 1.4/chart/modules/completed-bucket-immutability.test.mjs` |
| Diagnostic counter | `_mcDiag.finalizedBucketMutations` |
| Evidence dir | `tests/evidence/manager-a-completed-bucket-immutability/` |

## Packet: `mcdiag-resample-measurement`

| Kind | Reserved name |
|---|---|
| Existing counter (do not rename) | `_mcDiag.resamples` |
| New instrumentation counter | `_mcDiag.incrementalResamples` |
| Harness | `chart v 1.4/chart/multichart-prod/harness/mcdiag-resample-measurement.mjs` |
| Evidence dir | `tests/evidence/manager-a-mcdiag-resample/` |

## Packet: `shell-control-inventory`

| Kind | Reserved name |
|---|---|
| Findings doc | `docs/plan3/SHELL-CONTROL-INVENTORY-20260728.md` |
| Machine-readable inventory | `scripts/shell-control-inventory.json` |

---

## Contended files, with the owner named

`scripts/module-contracts.json` is written by **`session-calendar-red` only** (it registers the new
module's §A4c contract). The `shell-control-inventory` packet may read it but must not write it; if
its worktree contains a change to that file, the change is dropped during reconciliation rather than
merged. Recorded because two of my in-flight packets were briefed to look at that file and only one
may own it.

---

## Packet: `render-resample-identity-guard` (proposed, boards with completed-bucket immutability)

| Kind | Reserved name |
|---|---|
| Kill-switch | `window.__TALARIA_DISABLE_RENDER_RESAMPLE_IDENTITY_GUARD_V1` |
| Oracle | `chart v 1.4/chart/modules/render-resample-idempotence.test.mjs` |
| Evidence dir | `tests/evidence/manager-a-render-resample-guard/` |

Independently switchable from `__TALARIA_DISABLE_RENDER_TIME_PLAYHEAD_TRIM_V1` so the performance
half can be disabled without reverting the correctness half.

## Packet: `mcdiag-resample-measurement` — names as landed

`_mcDiag.replayTicks`, `_mcDiag.fullResamples` (inside `_resampleDataFull`, so pipeline-internal
callers are counted), `_mcDiag.incrementalResamples`. The pre-existing `_mcDiag.resamples` field is
retained untouched and is now formally **not usable for any verdict** — see the journal entry of
2026-07-28T00:40.

---

## Rows opened 2026-07-28, not yet dispatched (write cap is the constraint)

| Row | Territory | Class |
|---|---|---|
| Weekly-map indicator computes a 14-week average from ~3.5 days of 1m data, silently | **Manager A** | §A4c, painted as a value, live today |
| `_tryIncrementalResample` mis-buckets out-of-order appends | **Manager A** | data integrity, pre-existing |
| `parseTimeframe('1wk')` returns 60000 ms; `1wk` listed as weekly elsewhere | **Manager A** | latent |
| Non-converging journal-marker restore cascade (90-second freeze) | **Manager B** | escalated, not mine |
| `_retainCurrentOrderExecutionSeries` pins whole master arrays by reference | **Manager B** | escalated, not mine |
| Single-layout 1m at 3.5 GB — retention source unidentified | **unassigned** | escalated; no manager owns it yet |

## Frozen shared interface

`_trimBarOhlcToReplayPlayhead` must be treated as a published contract, not a private helper.
`order-manager.js` calls it itself at read time on two separate branches, which is *why* the trim
overlay is money-path-safe and needs no Manager B co-merge. If the overlay packet ever changes that
function's signature or its idempotence, those call sites break silently. Recorded here so the
constraint survives the packet that discovered it.

---

## 2026-07-28T02:30 · Reservations for TAL-01918 RED and the overnight cheap tier

Reserved before dispatch per §A13.3, so parallel briefs cannot collide.

| Name | Kind | Packet | Notes |
|---|---|---|---|
| `m21-b-tal01918-` | harness file prefix | `tal01918-red` | all harness and evidence files under this prefix |
| `m21-b-bar-immutability-oracle` | oracle | `tal01918-red` | §A7 differential + immutability assertion |
| `m21-b-last-bar-window-oracle` | oracle | `tal01918-red` | the wrong-window limb; deliberately a **separate** oracle from the immutability one, see below |
| `_m21bBarWindowProbe` | instance method | `tal01918-red` | probe only, must not survive into a fix packet |
| `__TALARIA_TRIM_WINDOW_DIAG` | global symbol | `tal01918-red` | diagnostic read-out, not a kill-switch |
| `m21-b-mcdiag-tabulation-` | harness/evidence prefix | `mcdiag-tabulation` | cheap tier |
| `m21-b-legacy-deroute-` | evidence prefix | `legacy-deroute` | cheap tier, read-only phase |
| `m21-b-a10-residue-` | evidence prefix | `a10-residue` | cheap tier |

**Why two oracles and not one.** The obvious design is a single "the bar did not change" oracle. That
design is now known to be dangerous: the indicator-lag diagnostic reports historical buckets moving 0
pips in both kill-switch states, so an immutability-only oracle would go **GREEN on a product the PO can
see is broken**. The two limbs assert different things and must be able to disagree — immutability
covers "a finalised bucket never changes again", window covers "the last bar is computed over
`[bucketStart, bucketEnd]` and not `[bucketStart, playhead]`". Collapsing them into one name would let a
pass on the first be read as a pass on the second.

**Not reserved and deliberately so:** no kill-switch name for the trim-overlay fix. The fix shape is not
decided — it depends on whether the review upholds one defect or two — and reserving a name for it now
would imply a design decision I have not made.

## 2026-07-28 10:40 — reservations for the 15:15 chain measurements

| Name | Kind | Packet | Note |
|---|---|---|---|
| `m21-a2-rebaseline-runner.mjs` | harness | a2-rebaseline | new, A worktree only |
| `m21-a2-rebaseline-20260728.json` | evidence file | a2-rebaseline | written inside the packet worktree, never the main checkout |
| `m20-q9-mcdiag-atip-20260728.json` | evidence file | a2-rebaseline | `_mcDiag` cross-check pinned to A tip |
| `__TALARIA_A2_REBASELINE_PROBE_V1` | global symbol | a2-rebaseline | probe only, must not ship |

## 2026-07-28 12:04 — reservations for the residue census (FINDING-LAG-IS-RESIDUE)

| Name | Kind | Packet | Note |
|---|---|---|---|
| `m22-residue-census.mjs` | harness | residue-census | new; instrumentation only, injects nothing into product files |
| `m22-residue-census-20260728.json` | evidence file | residue-census | written inside the packet worktree only |
| `__TALARIA_RESIDUE_CENSUS_V1` | global symbol | residue-census | injected at page-init by the harness; must never appear in product source |

## 2026-07-28 13:10 — reservations for the CPU attribution probe (PRIORITY ZERO, §1.5)

| Name | Kind | Packet | Note |
|---|---|---|---|
| `m23-cpu-attribution-probe.mjs` | harness | cpu-attribution | new; instrumentation only, no product edits |
| `m23-cpu-attribution-20260728.json` | evidence file | cpu-attribution | written inside the packet worktree only |
| `__TALARIA_CPU_PROBE_V1` | global symbol | cpu-attribution | injected at page-init; must never appear in product source |

## 2026-07-28 13:58 — reservations for the idle CPU profile (supersedes cpu-attribution)

| Name | Kind | Packet | Note |
|---|---|---|---|
| `m24-idle-cpu-profile.mjs` | harness | idle-cpu | new; trace capture + handle census at rest |
| `m24-idle-cpu-20260728.json` | evidence file | idle-cpu | written inside the packet worktree only |
| `m24-idle-cpu-trace-20260728.json` | evidence file | idle-cpu | raw Chrome trace, worktree only |
| `__TALARIA_IDLE_PROBE_V1` | global symbol | idle-cpu | injected at page-init; never in product source |
