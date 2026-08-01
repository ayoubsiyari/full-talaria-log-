# Release Parity Oracle — Cycle 2 Non-Contamination + Breadth

**Date:** 2026-07-31  
**Manager:** D  
**Oracle:** `docs/plan3/oracles/release-parity-non-contamination-v1.mjs`  
**Compact evidence:** `docs/plan3/RELEASE-PARITY-NON-CONTAMINATION-CYCLE2-20260731.json`  
**Evidence mirror:** `_evidence/manager-D/RELEASE-PARITY-NON-CONTAMINATION-CYCLE2-20260731.json`

## Verdict

Cycle 2 scaffold is present, RED-first, and broadened beyond non-contamination:

- Normal scoped non-contamination fixture: **GREEN**.
- Parity breadth fixture: **GREEN** across eight surfaces under CONF-01.
- Contamination RED controls proven:
  - `NC-UNSCOPED-H1-CACHE` → `indicator-cross-contamination`
  - `NC-GLOBAL-CHARTDATALOADED` → `peer-mutated`
- Breadth RED controls proven:
  - `NC-PARITY-KEYBOARD-HOST-ROUTED` → `single-realm-reference-mismatch`
  - `NC-PARITY-CONTEXT-MENU-HOST-ROUTED` → `single-realm-reference-mismatch`
  - `NC-PARITY-CROSSHAIR-HOST-ABS-PRICE` → `single-realm-reference-mismatch`

This is a model oracle. It does **not** earn final release credit until wired to the real single-realm app.

## CONF-01 Shape

Every cell starts from four panels, four different symbols, four different timeframes:

- A: `XAUUSD`, `1m`
- B: `HOG`, `5m`
- C: `ETHBTC`, `15m`
- D: `BTCEUR`, `1h`

Same-symbol panels carry no acceptance weight.

## Surfaces Covered

Non-contamination operations on one panel leave peers bit-identical:

- `change-symbol`, `change-timeframe`, `load-data`, `draw-shape`, `place-order`, `seek-playhead`

Parity breadth compares multi-realm reference vs single-realm candidate for:

- `drawing-tools`
- `indicators`
- `orders`
- `replay`
- `crosshair-sync`
- `range-sync`
- `keyboard`
- `context-menus`

Local surfaces must not mutate peers. Sync surfaces may update peers, but multi-realm and scoped single-realm must match bit-for-bit.

## Release Authority

D holds stop authority. Current limitation remains: model scaffold only. Final release waits until these cells drive the real single-realm product build.

## Checks

- `npm run preflight:release-parity-non-contamination` — PASS
- `npm run test:release-parity-non-contamination` — PASS (8/8)
