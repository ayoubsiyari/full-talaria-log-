# Unverified Mechanism Clusters — 2026-07-30

Source files available in this checkout: `docs/plan3/TICKETS-INTAKE-20260727.md` and `docs/plan3/PLAN3-BOARD.md`. The prior 102-row ledger file is not present here, so this clusters the active intake rows by mechanism and does not claim fixed/broken status.

## First Pass Rule

Verify mechanisms, not symptom wording. A passing mechanism check closes every member in that cluster; a failing mechanism check becomes one engineering packet. Reports without reproducible steps move to NEEDS-INFO and do not receive invented click scripts.

## Cluster 1: Persistence / Backend Write-Read

Owner check before any frontend work: coordinate with Manager B on backend/session-state write failures. If B confirms one backend write/read defect, treat this cluster as one backend packet before opening separate frontend persistence fixes.

Sub-mechanisms:
- P1 symbol persist: `TAL-01865`, `TAL-01747`. Pair switch writes only in-memory `currentFileId`; boot resolves URL/session primary file. Owner is A because the write/read path is `chart.js`; D must not patch it.
- P2 timezone residuals: D's V9 bridge fix covers the EST to CST override, but dual-store/session reapply and M20-A sha re-pin residuals belong to A/M20-A. Do not couple these to symbol persist.
- P3 pins/favorites: `TAL-01895`, `TAL-01792` are ledger-fixed by the preference merge packet but still need B merge acceptance. Backend has `timeframe_favorites`; drawing/tool favorites backend column/API remains a B/backend migration gap.
- P4 layout/session isolation: `TAL-01759` remains the open Cluster E row. It is not closed by a pins pass or a symbol pass; verify as its own layout-isolation check.
- P5 owner-identity/app shell resets: B findings include React pin remount-to-default, missing `timeframe-favorites.js` on the V9 shell, `_uid` not cleared on logout, and unscoped writes before `/api/auth/me`. Split shell/React to A, prefs facade to B, homepage logout to homepage, backend prefs to backend owner.
- Related restore rows to check against session-state write/read: `TAL-01929`, `TAL-01909`.

Decision gate:
- First run one backend/session persistence write-read audit covering symbol, timezone, pinned favorites/tools, layout state, and journal-derived PnL/screenshot idempotency.
- If backend write/read fails, route to B/backend owner. If backend passes and only one surface fails, split the remaining frontend owner after evidence.
- Do not treat a Cluster E PO pass as closing every sub-mechanism. Symbol, pins, layout isolation, timezone, and screenshot/PnL idempotency have separate owners and evidence.

## Cluster 2: Trade Ledger Integrity / M24

Members:
- Rayan `#4/#5/#9`, Rayan `#11`, `TAL-01908`, `TAL-01911`, `TAL-01919`, `TAL-01924`, `TAL-01926`, `TAL-01940`.

Current evidence:
- Trade-loss and count-stability are separate from display identity. PO b103 proved count can survive while display ID changes.
- Corrected D gate `m24-order-id-restore-stability.test.mjs` covers the real hydrate/display identity shape and was TOP accepted. These rows still need a redeployed/cache-busted module plus PO Script 1 on the deployed build before the cluster can close.

NEEDS-INFO inside this cluster:
- Rayan `#8`: self-opened sell order after idle plus skipped ID, no reproducible sequence available. Keep watch lane until steps exist.

## Cluster 3: Replay Rollback Trade State / M23

Members:
- Rayan `#1`, Rayan `#3`, Rayan `#6b`, `TAL-01937`, `TAL-01800`.

Mechanism hypothesis:
- Trade/order state is keyed to insertion or wall-clock state instead of replay timeline. Rolling back candles does not roll back the order ledger.

Verification shape:
- One rollback script from Rayan's spec: execute a trade, roll back before execution, confirm/cancel, then advance again. Pass means no original trade/order reactivates without a new manual order.

## Cluster 4: Order-Line Interaction And Visuals / M6

Members:
- `TAL-01897`, `TAL-01885`, `TAL-01699`, `TAL-01698`, `TAL-01697`, `TAL-01696`, `TAL-01617`, plus PO b101/b103 visual findings.

Current D cuts:
- Multi-TP drift: visible line remains at true price, invisible hit row separates.
- Placed SL partial disappearance: near-edge executed SL rows clamp inside the price pane.
- Value-box shaky and hover controls sequential: mechanism named in D journal, D territory, no product cut yet.

Verification shape:
- One order-line visual script can close the visible subset after a new build: stacked TP at one price, place order with SL near pane edge, pending-to-placed labels stable, hover controls appear together.

## Cluster 5: Execution And PnL / M10

Members:
- `TAL-01933`, `TAL-01932`, `TAL-01904`, `TAL-01896`, `TAL-01905`, `TAL-01809`, `TAL-01810`, `TAL-01796`.

Risk:
- Money path. Requires TOP review for any engineering packet and PO verification on the exact build stamp.

NEEDS-INFO:
- `TAL-01941`: recurring slippage / SL miss across testers but pair, timeframe, and steps are undocumented. Keep as instrumentation/repro lane only; no speculative fix.

## Cluster 6: Candle/Data Integrity

Members:
- `TAL-01922`, `TAL-01918`, `TAL-01886`, `TAL-01802`, `TAL-01917`, `TAL-01864`, `TAL-01936`, `TAL-01925`, `TAL-01898`.

Mechanism families:
- Completed-bar immutability and resample/session-boundary correctness.
- Cross-timeframe price consistency.
- Weekly-to-lower-timeframe viewport date jump.

Verification shape:
- Use data/oracle gates first, not PO clicks, for completed-bar and cross-TF data integrity.

## Cluster 7: Replay / Multichart Cadence And Restore

Members:
- `TAL-01910`, `TAL-01887`, `TAL-01939`, `TAL-01733`, `TAL-01934`, `TAL-01700`, `TAL-01717`, `TAL-01718`, `TAL-01931`, `TAL-01900`, `TAL-01899`, `TAL-01902`, `TAL-01923`.

Mechanism families:
- Cross-panel replay cadence/freeze.
- Step-forward event batching.
- Tick-path fidelity.
- Drawing/indicator render cadence during replay.

## Cluster 8: Tool Settings And UI/Viewport

Members:
- `TAL-01930`, `TAL-01888`, `TAL-01813`, `TAL-01758` for Fibonacci settings.
- `TAL-01916`, `TAL-01821`, `TAL-01928`, `TAL-01838`, `TAL-01724`, `TAL-01755`, `TAL-01734`, `TAL-01862`, `TAL-01823`, `TAL-01768`, `TAL-01735` for viewport/scale/responsive UI.
- `TAL-01935`, `TAL-01914`, `TAL-01921`, `TAL-01938`, `TAL-01913` for indicator/label visibility.

Verification shape:
- Treat these as visual/interaction clusters unless the row proves data loss or order execution impact.

## NEEDS-INFO Lane

Rows that should not receive invented steps:
- Rayan `#8`: random sell order self-opened after idle plus skipped ID, no repro info.
- `TAL-01941`: recurring SL/slippage reports without pair/timeframe/click sequence; instrumentation only.
- Old-layout superseded set from intake cluster M unless PO confirms the same symptom on the new build.
- Feature questions/requests: `TAL-01907`, `TAL-01906`, `TAL-01915`, `TAL-01852`, `TAL-01851`, `TAL-01850`, `TAL-01849`, `TAL-01784`; not canary bug-verification rows unless PO reclassifies.
