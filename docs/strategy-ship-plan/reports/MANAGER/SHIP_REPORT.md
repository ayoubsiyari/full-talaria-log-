# SHIP REPORT — Strategy Page & Builder — Manager summary for Director sign-off

Date: 2026-07-09
Prepared by: Manager
Scope: Strategy Bank page + Strategy Builder (modal, canvas, persistence) in
`Sources Handoff/TalariaV16.jsx` and `homepage/src/app/dashboard/v16/*`.

## 1. Recommendation
**CONDITIONAL GO.** All implementation is complete and statically verified (lint + `tsc --noEmit`
clean, twice). The single remaining gate is the **live-runtime pass on the Docker stack** (deferred
by director decision). Recommend booting the lean stack, clearing the runtime checklist in §5, then
final GO. One accepted known-limitation (ICR-8) is documented in §6.

## 2. Phase results
| Phase | Focus | Gate | Notes |
|---|---|---|---|
| P1 | Data-loss criticals | PASSED | A1/A2/A3, B1, C1, D1; live-runtime deferred → P4 |
| P2 | Correctness | PASSED (static) | A4/A5/A6, B2/B3/B4, C2, D2, ICR-1/2/3/4, double-confirm |
| P3 | Polish | PASSED (static) | C3/C4, B5, D3/D4, A7 |
| P4 | Integration | STATIC COMPLETE | cross-cutting traces + C5 fix; runtime pending |

## 3. What shipped (by area)
- **Persistence/lifecycle (A):** failed-refresh no longer vanishes strategies (stale-flag + local
  preserve); pessimistic delete with in-app error (no window.alert) + double-fire guard; template
  application confirm; pre-save payload/image budget vs 16MB; canvas-derived root conditions + tree
  restore; strategies-fetch failure isolated (journal survives); TF normalize/dedupe/cap backstop;
  duplicate-name normalized key.
- **Builder modal (B):** unsaved-close confirm; timeframe cap+normalization end-to-end; instrument
  grids show all + at-cap feedback; full edit-mode restoration (lifted `stratBTfCustom` sole state,
  markets manual-ref guard); missing-field names, mobile image tile cap, per-tag length cap.
- **Canvas (C):** history seeded from mounted state (undo no longer empties canvas), 50-cap, covers
  add/delete/rename/move/connect/keyboard-delete; **section reorder now undoable (C5)**; delete-last
  notice neutral styling; outline status outside-click dismiss; board image-validation parity; PDF
  preflight before popup; edge-drag plumbing removed (D-2), edge rendering kept; dead code removed.
- **Bank page (D):** community surface gated off (D-1, COMMUNITY_ENABLED=false) with plumbing kept
  dormant; sort honesty (Name/Net P&L only), independent bank sort state, badge = real rows;
  dead-state sweep; template "Hide" vs real "Delete" + confirm.

## 4. Verification performed
- Static cross-cutting traces (Phase 4): Persistence, Bank, Builder, Canvas — all PASS, recorded in
  `reports/D/PHASE4_PERSISTENCE.md`, `reports/D/PHASE4_VERIFY.md`, `reports/C/PHASE4_BUILDER.md`,
  `reports/C/PHASE4_VERIFY.md`.
- Manager static regression x2: `tsc --noEmit` exit 0; `ReadLints` clean on `TalariaV16.jsx` and
  `dashboard/v16/*`.
- Zone compliance maintained throughout; cross-zone edits tracked as ICRs (ICR-1..8, ICR-5/6/7
  retroactive).

## 5. PENDING GATE — live-runtime pass (Docker)
Boot lean stack (see `prompts/P4_PLAN.md`): `docker compose up -d db redis journal-backend` +
`cd homepage && npm run dev`. Then clear:
- A1 failed `/strategies` refresh → strategies persist, stale surfaced; 200 empty → authoritative empty.
- A2 delete with backend 500 → row stays + in-app error; success → row removed post-API.
- A6 `/strategies` 500 while `/journal/list` ok → journal/entries still render, only bank stale.
- A4 oversized-image save → blocked pre-network.
- A5 save→reload field-by-field round-trip (incl. canvas conditions, tree, custom TFs).
- A7 "My Strat!" vs "My Strat" → duplicate blocked.
- B1–B5, C1–C4 (undo/redo stress incl. section reorder), D1/D3/D4 UI in live + demo.
- Double-confirm: template apply while editing → exactly one confirm.

## 6. Known limitations (accepted by director)
- **ICR-8 (template-load undo):** applying a template from the modal header while the canvas is
  mounted replaces canvas content outside the canvas history stack, so undo/redo can desync after a
  template apply. Guarded by the existing destructive-replace confirm (no silent data loss).
  Accepted as known-limitation this release; bridge deferred.

## 7. Risks / notes
- All four original workers (A/B/C/D) went offline during P3/P4; remaining tasks were completed by
  fresh workers via self-contained reassignment prompts, manager-verified. No work lost.
- All changes are UNCOMMITTED on the current checkout (per branch directive); manager to handle the
  final commit centrally on director approval.
- Runtime proofs (§5) are the only behavior not yet exercised against a live backend.

## 8. Sign-off
- [ ] Director approves proceeding to the live-runtime pass (§5).
- [ ] Runtime pass clears with no new criticals.
- [ ] Director final GO to commit.
