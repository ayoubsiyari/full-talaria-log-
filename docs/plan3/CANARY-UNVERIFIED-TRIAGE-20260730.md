# Canary Unverified Triage — 2026-07-30 10:40

Scope: Director's 102 unverified rows. No rows are closed in this document.

Buckets:
- `(a)` closes by running a gate that already exists.
- `(b)` closes by a code read plus a new gate.
- `(c)` genuinely needs PO eyes on the deployed build, or is NEEDS-INFO because no reproducible steps exist.

## Counts Before Closing

- `(a)` existing gate: **15**
- `(b)` code read + new gate: **14**
- `(c)` PO eyes / NEEDS-INFO: **73**
- Total: **102**

Counting note: the three read-only passes directly classified 76 row/groups. The remaining 26 are low-blast cosmetic/superseded/feature-or-question rows from the 102-row ledger set; none has a named existing gate or a code-read close path in this checkout, so they are counted in `(c)` until PO reconfirms or reclassifies them.

## (a) Existing Gate — 15

- `TAL-01918`: completed-bar mutation gates exist on the M17-DI2 branch; run the RED/guard gate set before closure.
- `TAL-01922`: session-boundary bucketing gates exist on the session-calendar branch; run before closure.
- `TAL-01899`: `m25-tal-01899-ohlc-order.red.test.mjs`.
- `TAL-01718`: `m25-tal-01718-tick-speed.red.test.mjs`.
- `TAL-01900`: `m25-tal-01900-substep-stall.red.test.mjs`.
- `TAL-01902`: `m25-tal-01902-session-calendar.red.test.mjs`.
- `TAL-01733`: multichart harness scenarios `H-S19` / `H-S83`.
- `TAL-01910`, `TAL-01887`, `TAL-01939`: multichart harness scenarios `H-S18` / `H-S83`.
- `TAL-01699` plus PO multi-TP drift: `order-multi-tp-coincident-stack.test.mjs` canonical/homepage.
- `TAL-01885` plus PO SL partial disappearance: `order-line-edge-visibility.test.mjs` canonical/homepage.
- PO value boxes shaky: `order-stable-label-hover-dom.test.mjs` canonical/homepage.
- PO hover controls one-by-one: `order-stable-label-hover-dom.test.mjs` canonical/homepage.

## (b) Code Read + New Gate — 14

- `TAL-01777`: order-symbol binding / SL orphan across pair switch.
- `TAL-01807b`: SL/entry leak across pair switch.
- `TAL-01799`: order appears on newly added layout.
- `TAL-01903`: PnL changes after refresh; persistence/M24-adjacent.
- `TAL-01886`, `TAL-01802`: cross-timeframe price consistency.
- `TAL-01864`: requested 10-year history vs loaded range.
- `TAL-01936`: time-alignment setting not honored.
- `TAL-01931`: step-forward batching.
- PO pending order SL/TP resurrect after re-drag then cancel.
- `TAL-01759`: layout/session isolation.
- `TAL-01935` / `TAL-01914` / `TAL-01921`: indicator/level labels absent on step/pause, appear on Play.
- `TAL-01938`: ORB size changes across timeframe switch.
- `TAL-01913`: daily-open vertical lines missing.

## (c) PO Eyes / NEEDS-INFO — 73

High blast:
- M24 deployed Script 1: Rayan `#4/#5/#9`, Rayan `#11`, `TAL-01908`, `TAL-01911`, `TAL-01919`, `TAL-01924`, `TAL-01926`.
- M23 deployed Script 2: Rayan `#1`, Rayan `#3`, Rayan `#6b`, `TAL-01937`, `TAL-01800`.
- M10 deployed Script 3: `TAL-01933`, `TAL-01932`, `TAL-01904`, `TAL-01905`, `TAL-01809`, `TAL-01810`, `TAL-01796`.
- Duration deployed Script 4: `TAL-01896`.
- Journal side-effects deployed Script 5: `TAL-01927`, `TAL-01940`.

Data/replay:
- `TAL-01917`.
- `TAL-01925`, `TAL-01898`.
- `TAL-01929`, `TAL-01909`.
- `TAL-01934`, `TAL-01700`.
- `TAL-01717`.
- `TAL-01923`.

Persistence / restore:
- `TAL-01865`, `TAL-01747`.
- `TAL-01895`, `TAL-01792`.

Order-line leftovers needing deployed PO confirmation:
- `TAL-01897`, `TAL-01698`, `TAL-01697`, `TAL-01696`, `TAL-01617`.

UI / viewport / scale:
- `TAL-01916`, `TAL-01821`, `TAL-01928`, `TAL-01838`, `TAL-01724`, `TAL-01755`, `TAL-01734`, `TAL-01862`, `TAL-01823`, `TAL-01768`, `TAL-01735`.

NEEDS-INFO / no invented steps:
- Rayan `#8`.
- `TAL-01941`.
- Old-layout superseded set unless PO confirms on the new build.
- Feature questions/requests unless PO reclassifies them as bugs with steps.
- Remaining low-blast cosmetic/superseded rows from the 102-row ledger set not named above.

## Gate-Green-Product-Broken Spot Check

Known reopen: `TAL-01908`, `TAL-01919`, and `TAL-01924` cannot remain fixed behind `m24-order-id-allocator.test.mjs`; that gate covers allocation, not restore/hydrate display identity. Reopen count so far: **3 of 41 fixed rows**.

Other suspicious money-path gates to audit before closure:
- `order-lifecycle-event-ownership.test.mjs` does not close M23 rollback / `TAL-01800` user path.
- `b75-m23-rollback-mechanism-oracle.test.mjs` is a classifier, not a product rollback execution gate.

## Bucket (a) Run Results In This Checkout

GREEN on 2026-07-30:
- `node "chart v 1.4/chart/modules/m14-fibonacci-settings-levels-persist.test.mjs"`
- `node "homepage/public/chart/modules/m14-fibonacci-settings-levels-persist.test.mjs"`
- `node "chart v 1.4/chart/modules/order-multi-tp-coincident-stack.test.mjs"`
- `node "homepage/public/chart/modules/order-multi-tp-coincident-stack.test.mjs"`
- `node "chart v 1.4/chart/modules/order-line-edge-visibility.test.mjs"`
- `node "homepage/public/chart/modules/order-line-edge-visibility.test.mjs"`
- `node "chart v 1.4/chart/modules/order-stable-label-hover-dom.test.mjs"`
- `node "homepage/public/chart/modules/order-stable-label-hover-dom.test.mjs"`

M24 restore gate, GREEN on 2026-07-30:
- `node "chart v 1.4/chart/modules/m24-order-id-restore-stability.test.mjs"`
- `node "homepage/public/chart/modules/m24-order-id-restore-stability.test.mjs"`

Bucket (b) completed after triage:
- PO pending order SL/TP resurrect after re-drag then cancel: corrected packet TOP accepted. Gates GREEN:
  - `node "chart v 1.4/chart/modules/order-pending-protection-clear.test.mjs"`
  - `node "homepage/public/chart/modules/order-pending-protection-clear.test.mjs"`
  - `node "chart v 1.4/chart/modules/order-stable-label-hover-dom.test.mjs"`
  - `node "homepage/public/chart/modules/order-stable-label-hover-dom.test.mjs"`
  - Residual: `homepage/out/chart/modules/order-manager.js` is a stale export copy until rebuilt; deployed build must include the regenerated bundle before PO can close the row.

Not runnable from this checkout because the named gate files are not present here:
- M17-DI2 completed-bar guard gate branch files.
- M22 session-calendar branch files.
- M25 `m25-tal-*` branch files.

Present but not run as a one-command closure gate:
- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` and homepage mirror; triage identifies `H-S18`, `H-S19`, and `H-S83`, but this checkout needs the harness runner invocation before a closure result can be claimed.
