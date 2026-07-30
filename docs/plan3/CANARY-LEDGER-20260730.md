# Canary Ledger — 2026-07-30

Rule: no `unknown` state. Every row is either `fixed` with a commit and gate, or `open`. Open rows are ordered by blast radius: money path, data integrity, stability/replay, visual, cosmetic.

This checkout does not contain the earlier `TICKET-STATUS-LEDGER-20260729.md`, so this file is the current D-owned canary authority until that file is restored or superseded by commit.

## Money Path — Open

- `M24` / Rayan `#4/#5/#9`, Rayan `#11`, `TAL-01908`, `TAL-01911`, `TAL-01919`, `TAL-01924`, `TAL-01926`: open. Branch packet for restore-time display identity is gated and TOP accepted, but it is uncommitted in this checkout and still requires cache-busted deployed-build verification with `docs/plan3/CANARY-CRITICAL-MONEY-DATA-TESTS-20260730.md` Script 1.
- `M23` / Rayan `#1`, Rayan `#3`, Rayan `#6b`, `TAL-01937`, `TAL-01800`: open. Requires deployed-build Script 2; no branch/local gate can close this row.
- `M10` / `TAL-01933`, `TAL-01932`, `TAL-01904`, `TAL-01905`, `TAL-01809`, `TAL-01810`, `TAL-01796`: open until deployed-build Script 3 passes on the current stamp.
- `TAL-01896`: fixed for source once committed and deployed with gate `orderManagerTradeRows.test.mjs`; open for canary until deployed-build Script 4 confirms duration on the live stamp.
- `TAL-01927`, `TAL-01940`: open. Covered by deployed-build Script 5.
- Rayan `#8`: open / NEEDS-INFO. No reproducible steps; do not invent a script.
- `TAL-01941`: open / NEEDS-INFO. Instrumentation/repro lane only; pair/timeframe/click sequence missing.

## Data Integrity — Open

- `TAL-01918`: open. RED gate exists for completed-bar mutation; product fix is owned outside D territory until granted.
- `TAL-01922`: open. Covered by deployed-build Data Scripts 1 and 3.
- `TAL-01802`, `TAL-01886`, `TAL-01917`, `TAL-01936`: open. Covered by deployed-build Data Script 2.
- `TAL-01864`, `TAL-01925`, `TAL-01898`: open. Covered by deployed-build Data Script 3.
- `TAL-01929`, `TAL-01909`: open. Covered by deployed-build Data Script 4.
- `TAL-01899`, `TAL-01900`, `TAL-01902`, `TAL-01718`: open. Covered by deployed-build Data Script 5.

## Visual / Order-Line Interaction — Open Until Commit And Deploy

- `TAL-01699`: open in this checkout until the hit-region-only packet is committed and deployed. Gates: `order-multi-tp-coincident-stack.test.mjs` canonical/homepage.
- `TAL-01885`: open in this checkout until the SL edge/full-width packet is committed and deployed. Gates: `order-line-edge-visibility.test.mjs` canonical/homepage.
- PO visual finding "value boxes shaky on pending-to-placed": open in this checkout until the stable label DOM packet is committed and deployed. Gates: `order-stable-label-hover-dom.test.mjs` canonical/homepage.
- PO visual finding "hover controls appear one by one": open in this checkout until the stable hover batch packet is committed and deployed. Gates: `order-stable-label-hover-dom.test.mjs` canonical/homepage.

## Fixed Rows With Commit And Gate

- `M14` / `TAL-01930`, `TAL-01888`, `TAL-01813`, `TAL-01758`: fixed. Commit `a4f388296`; gates `m14-fibonacci-settings-levels-persist.test.mjs` canonical/homepage.
- `M24` allocator collision slice: fixed for allocation only, not hydrate identity. Commits `b21d236d3`, `f1ddb2e64`, `5f3e68368`; gate `m24-order-id-allocator.test.mjs`. This does not close restore-time renumbering.

## Persistence / Backend Coordination — Open

- `TAL-01865`, `TAL-01747`: open. Symbol persistence owner is A (`chart.js` write/read).
- `TAL-01895`, `TAL-01792`: open until B merge/backend acceptance is cited with commit and gate.
- `TAL-01759`: open. Layout/session isolation requires its own evidence.
- `TAL-01903`: open. Check against M24/persistence after backend result.

## Cosmetic / Lower Blast Radius — Open

All remaining intake rows not listed above remain open until a commit and gate or a deployed-build script closes their mechanism cluster. Reports without reproducible steps stay in NEEDS-INFO and do not receive invented click paths.
