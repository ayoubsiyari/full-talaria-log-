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
