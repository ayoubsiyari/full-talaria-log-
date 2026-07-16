# T4-A6 — Order-interaction contract (READ-ONLY)

## 1. Task + RC

- **Task:** T4 amendment A6 (Lane 3) — contract-draft for four new order-interaction rows (Director intake 2026-07-15). Same discipline as T3 interaction-parity table.
- **RC:** **RC-5** (order-entry interaction + state ownership). Tooling/diagnostic — no fix landed.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/T4-A6-ORDER-INTERACTION-CONTRACT.md` | **New.** Four-row contract table: invariant, RED/I15, kill-switch, fix boundary, freeze-safe flags, #4/#5 ordering, A6-4 diagnostic. |
| `docs/tickets-overhaul/worker-reports/T4-A6-order-interaction-contract-report.md` | **New.** This report. |

**No other files touched.** No `order-manager.js`, `chart.js`, `replay-system.js`, multichart-parent, harness, or `PER-BUG-REGISTRY.csv` edits.

---

## 3. Kill-switch (I3 + I13) — proposed (not implemented)

| Row | Switch | Default (proposed) | Gated files |
|-----|--------|-------------------|-------------|
| A6-1 | `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | ON (fix active when unset) | `order-manager.js`, optional `order-entry-aggregates.mjs` |
| A6-2 | `__TALARIA_DISABLE_ORDER_RUNTIME_PERSIST_V2` | ON | `order-manager.js`, `chart.js` session save/load hooks |
| A6-3 | `__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` | ON | `order-manager.js`, `chart.js` price-axis drag |
| A6-4 | `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` | ON | `order-manager.js`, `MultichartGrid.jsx`, `panel-cmd-bridge.js` |

Switch OFF in each file must restore today's behavior (live SL mutation + replay fills, best-effort persist, axis-coupled lines, per-iframe clones).

**Ungatable (I13):** A6-4 requires parent↔iframe transport — full revert needs multichart shell coordinated OFF.

---

## 4. Proof — RED → GREEN

**N/A** — contract draft only. RED specs are in the contract table (Section per row).

**I15 summary for implement phase:**

| Row | Actuation | Measure |
|-----|-----------|---------|
| A6-1 | Real replay play + pointer drag-hold SL across price | Position open while held; close only after release if rules say so |
| A6-2 | Real F5 on built product with `?sessionId=` | Pending + open counts/ids/prices restored |
| A6-3 | Real price-axis label drag + double-tap | Store prices unchanged; view resets without mutating orders |
| A6-4 | Real 2-up multichart; drag SL on panel B iframe | Host + panel A SL converge |

No synthetic-only or proxy greens may be labeled DONE (proven).

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| Read-only guardrail | No product/harness/registry edits |
| I15 | Each row names real actuation + end-state measure in contract |
| I11 | Did not add replay mirror-frame guards; A6-1 uses order-manager drag guard only |
| Lane isolation | Named collision with `chart.js`, multichart-parent, replay-system (untouched) |

---

## 6. What I did NOT do / limits

- **No implementation** for any A6 row.
- **No harness / known-failing.json** scenarios registered (Lane 4 after contract approval).
- **No live PO repro** of the four tickets on built product this step.
- **A6-3 vs TAL-01566:** PO cancelled chart-pan half (D-019); order-isolation half remains spec'd — coordinate with T2 axis family without Defect D work.
- **Session persist root-cause for TAL-01616:** hypothesized flush/hydrate races from code read — confirm with PO F5 trace + network tab on session PATCH at implement time.

---

## 7. Live-verification handoff (post-implement)

**PO checklist (combined build, after A6 fixes land):**

1. **A6-1 / TAL-01602:** Replay play → drag open SL through price → hold 3+ ticks → release. Trade must not close while held.
2. **A6-2 / TAL-01616:** Pending + open on session chart → F5 → both restored.
3. **A6-3 / TAL-01615:** Drag price-axis scale → order prices unchanged in panel; double-tap restores view.
4. **A6-4 / TAL-01601:** 2-up layout → SL drag on panel 2 → panel 1 matches.

Toggle each `__TALARIA_DISABLE_ORDER_*` switch OFF to repro legacy bugs.

---

## 8. Status

**DIAGNOSTIC-ONLY** — contract drafted, fix not started.

---

## Summary highlights

### A6-2 PO question (D-019)

**No open PO question.** D-019 (2026-07-16) settled: persist **pending + open**, **session-scoped**. A6-2 is ready to spec for implementation per contract row.

### A6-4 diagnostic finding

**Panel 2 does not share a single order store with panel 1.** Host `orderManager` is canonical; iframes receive one-time `addOrder` clones. Pending orders have `order:pending-updated` fan-out; **open positions have no `opened-updated` path** — SL drag on an iframe mutates only the iframe-local `openPositions` entry (~29550). Fix target: host-canonical store + `opened-updated` snapshot broadcast (mirror pending pattern in `MultichartGrid.jsx` ~6502–6513 / `panel-cmd-bridge.js` ~3565).

### A6-1 mechanism (primary evidence)

TP hits suppressed during drag (`suppressTpHitsWhileDraggingTp` ~27367); SL hits **not** suppressed while `_draggingManagedOpenLineKind === 'sl'` despite live `stopLoss` mutation — explains TAL-01602.

### #4 / #5 ordering

- **#4 / #5** remain **held** for post-b1 order-manager slot.
- **A6-1** should land **first** (freeze-safe, establishes apply-on-release invariant).
- **#4** (preview limit×replay) is adjacent but separate from open-SL A6-1.

---

## Deliverable index

- Contract: [`T4-A6-ORDER-INTERACTION-CONTRACT.md`](../T4-A6-ORDER-INTERACTION-CONTRACT.md)
