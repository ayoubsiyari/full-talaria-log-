# Lane 3 — A6-4 host-canonical order store IMPLEMENTATION (D-030 authorized)

Authorized by **D-030**. This is the #1 post-bless engineering item. Baseline: blessed `20260717b16`.

## Goal
Kill the cross-ticker price bleed: every multichart order must mark/close against **its own
owning panel's symbol/price feed**, never a peer panel's. Invert order state to a single
host-canonical store owned at the host level (per D-020 A6-4 design), not per-iframe.

## Sequence (STEP-GATED — do NOT batch)
### Step 0 — Diagnostic gate decides the stopgap branch (from `ORD-MULTICHART-CROSS-TICKER-PNL-diagnostic-report.md`)
- **If the price-source is cleanly isolatable** (wrong feed fixable without the full store inversion):
  land a **narrow gated stopgap first** — own kill-switch (e.g. `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`),
  no `MultichartGrid.jsx` / `panel-cmd-bridge.js` edits. This is a **bridge only**: A6-4 explicitly
  retires it — no orphaned guard left behind (plan-1 lesson). It must pass the same owning-panel-price RED.
- **If NOT cleanly isolatable:** SKIP the stopgap. No half-guards on money paths. Go straight to A6-4.

### Steps 1–6 — A6-4 migration (ratified 6-step design), one PR per step
- **One-phase-per-PR on `MultichartGrid.jsx` binds.** Disjoint file set: `MultichartGrid.jsx`,
  `panel-cmd-bridge.js`, order modules (`order-manager.js` / guard / store). Each step gated + built.
- Ownership inversion: host holds canonical order records keyed by owning panel/symbol; panels
  read/write through the host; marks resolve from the owning panel's feed only.
- A6-4 landing **retires the stopgap** (remove the bridge guard + switch in the same series).

## Proof bar (D-030 — all required before ship)
1. **Cross-ticker RED in multichart topology:** 2 panels, different symbols; assert every order
   mark/close price lies within the **owning symbol's** price range. Single-panel cannot carry this.
2. **Store-level property test:** an order's whole lifecycle (open→mark→close) consumes **exactly
   one symbol feed**. No peer-feed reads at any lifecycle point.
3. **Panel-B lockout/intermittent leg rides the same RED set** (same root — order add/interaction
   must apply to the correct panel).
4. **Full gate** + **re-run the D-026 interaction proof rows against the b16 baseline** (A6-4 touches
   re-migration files — prove no interaction regression).

## SHIP-GATE (D-030, binds stopgap too)
**No multichart-order build ships until the owning-panel-price RED is green.** Do not stamp/bless
any order-touching build otherwise.

## Guardrails
I15 honest actuation. Kill-switch per step. Report each step's build id, switch A/B, and proof-bar
rows. Deliverable reports per step under `docs/tickets-overhaul/worker-reports/`.
