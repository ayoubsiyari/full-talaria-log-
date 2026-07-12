# T3 Step 1 — Interaction-Parity Contract Report

**Task:** T3 step 1 (Lane 2) — interaction-parity contract draft (RC-4)  
**Worker prompt:** `docs/tickets-overhaul/worker-prompts/T3-step1-parity-contract.md`  
**Deliverable:** `docs/tickets-overhaul/T3-INTERACTION-PARITY-CONTRACT.md`  
**Date:** 2026-07-12

---

## Summary

Drafted the **interaction-parity contract** (12 surfaces) mirroring Plan 1's data-ownership table format. Each row cites today→target owner/transport with file:line evidence from `embed-bridge.js`, `panel-cmd-bridge.js`, `sync-bridge.js`, `multichart-manager.js`, `MultichartGrid.jsx`, `drawing-tools-manager.js`, and `order-manager.js`.

**Status:** Queued for **Director approval** (P4) before T3 step 2 RED scenarios or any fixes.

---

## Contract rows (12)

| # | Surface | T3 fix candidate (if retest fails) |
| --- | --- | --- |
| 1 | Panel focus | Verify |
| 2 | Selection (Ctrl-select) | **Yes** — TAL-01498 |
| 3 | Quick Menu | **Yes** — TAL-01499 |
| 4 | Settings dialog | Verify |
| 5 | Keyboard / replay | Harness regression |
| 6 | Order rail + `getActiveChart` | Verify |
| 7 | Drawing target | **Yes** — TAL-01495 |
| 8 | Indicator enable-state | **Yes** — TAL-01500, 01501 |
| 9 | Compare Symbol | **Yes** — TAL-01426 |
| 10 | Context menu | Low priority |
| 11 | Pan drag bounds | **Yes** — TAL-01491 |
| 12 | Chrome mirror (symbol label / crosshair) | If retest reopens |

**Primary T3 survivors aligned to contract:** 7 rows map directly to the 10 `LIKELY-SURVIVES` retest tickets.

---

## DEFER-T8 exclusions (not contract rows)

Replay mirror-frame, focus viewport re-sync during replay, RC-2 repaint-without-click, boot price mismatch, and out-of-scope feature tickets are listed in the contract's exclusion table — **not** T3 fix targets per I11.

---

## Open questions for Director

1. **Selection row:** Ctrl-collapse on panel B — coordinate decoration bug vs focus-cleanup race?
2. **Pan bounds row:** Host `#chartWrapper` slot geometry vs iframe cell — root of TAL-01491?
3. **Drawing sync default ON** — confirm intentional before gating cross-symbol apply.

---

## Evidence correction

ROOT-CAUSES `order-manager.js:16626-16643` (host order rail) is **stale** in current tree (those lines are TP-target HTML rendering). Updated evidence: `order-manager.js:7750-7756`, `13374-13430`; `MultichartGrid.jsx:5013-5015`, `5272-5276`, `5905-5914`.

---

## Worker confirmation

- **No engine files edited.**
- **Legacy `multichart/` not touched.**
- **Docs only:** `T3-INTERACTION-PARITY-CONTRACT.md` + this report.

---

## Next step

Director approves contract table → T3 step 2 harness scenarios for **retest survivors ∩ contract rows** → step 3 gated fixes.
