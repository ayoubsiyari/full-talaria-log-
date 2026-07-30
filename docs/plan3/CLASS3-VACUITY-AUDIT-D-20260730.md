# D2 — Class-3 vacuity audit (CONF-01 substance)

**Tip:** current `manager-d/trade-correctness`  
**Authority:** DISPATCH-D 15:15 §3  
**Baseline column:** mechanical `HONEST_FIXED=50` from `scripts/ledger-status-count.mjs`  
**Rule:** Class 3 = report describes multichart, gate boots single chart only → status `conf01-unshaped` (not broken, not fixed).

## Money / identity fixed rows (priority)

| Ticket | Gate | Boot | Report shape | Class |
| --- | --- | --- | --- | --- |
| Rayan #2 | `order-mc-layout-teardown-retains-host-orders.test.mjs` | 4 distinct symbols (host+3 peers) | MC vanished order (Cluster C) | **OK** (reshaped) |
| Rayan #8 | gap + place-audit | mixed-symbol journal + cross-panel pending | self-open / skipped id (identity) | **OK** (reshaped) |
| M24 / TAL-01908 / 01919 / 01924 | `m24-order-id-restore-stability.test.mjs` | mixed-symbol hydrate cell | refresh renumber `#5→#942` (session; not MC-specific) | **OK** |
| M24 / TAL-01926 | pytest journal prune | backend unit | history count / prune | **OK** |
| PO pending SL/TP resurrect | `order-pending-protection-clear.test.mjs` | single OM + `_emitPendingMirrorSync` peer snapshot | MC peer resurrect after clear | **OK*** (mechanism is peer emit; not a 4-panel boot — see note) |
| TAL-01807b | `order-pair-switch-visual-rebind.test.mjs` | multi-ticker open/pending, one active chart | pair switch visual leak | **OK** (pair-identity, not MC layout) |
| TAL-01777 | draft rebind | EURUSD→GBPUSD switch | pair switch draft | **OK** |
| SEL-01 | `order-sel01-exact-teardown.test.mjs` | fake SVG orders #1/#12 | substring collision (V6-P1) | **OK** (multi-order identity on one chart) |
| TAL-01941 | SL/TP soak | multi-**pair** random cases | intermittent non-trigger | **OK** (pairs vary; C2 carries duration) |
| M23 / Rayan #1/#3/#6b / TAL-01937 | m23 rollback GATE-01 | single OM rollback | rollback cancel | **OK** (single-chart defect class) |
| TAL-01905 / 01800 / 01798 / 01815 | lifecycle ownership | single chart stubs | event ownership | **OK** (not filed as MC layout) |
| TAL-01802 / 01886 | cross-TF coherence | same-symbol TF + XAUUSD peer isolation | cross-TF price | **OK** after CONF-01 peer cell |
| PO value-box / hover | stable-label-hover-dom | fake DOM single chart | UI hover | **OK** (single-chart UI) |
| Remaining OM units (balance floor, one-tick, trail TP, …) | single-chart | single-chart money defects | **OK** (class 2) |

\*PO pending: intake is multichart peer rebroadcast; gate proves the emit path that peers consume. Not marked `conf01-unshaped` because the failing mechanism is the missing mirror sync, which the unit hits. Optional follow-up: second OM applying the snapshot under four symbols (reshape polish, not reopen).

## CLASS-3 count among current `fixed`

**0** money/identity rows require `conf01-unshaped` after Rayan #2/#8 reshape and the peer-emit / mixed-symbol cells already on tip.

Non-money `fixed` (M14 fib, pins, timezone) left as class-2 / out of D reshape priority.

## Prioritized reshape list

1. ~~Rayan #2 / #8~~ done + RED-first proven  
2. PO pending — optional second-OM apply (polish)  
3. No forced ledger demotions this pass  

If intake later shows a fixed money row filed only under 4-symbol play with a single-chart gate and no identity/peer cell, demote to `conf01-unshaped` and reshape before calling it fixed again.
