# Director Handoff — Strategy Page & Builder Audit + Fixes

Date: 2026-07-09
Prepared by: Manager
Scope: Strategy Bank page + Strategy Builder (modal, canvas, persistence)
Primary file: `Sources Handoff/TalariaV16.jsx` (+ `homepage/src/app/dashboard/v16/*`)

---

## 1. Executive summary
The strategy page and builder were audited against the director's plan and repaired across
four risk-ordered phases by a four-worker team under manager coordination. All fixes are
implemented, statically verified twice (lint + `tsc --noEmit` clean), and the full flow was
**verified live on the production server by the director — deployed and tested, all good.**

Outcome: the surface moved from *"can silently lose saved strategies and edits, and can
produce dishonest/broken states"* to *safe, consistent, and honest.*

Status: **SHIPPED / GO.** Two housekeeping items remain (§7).

---

## 2. Findings (what was wrong) → Fixes (what we did)

### 2.1 Critical — data loss
| # | Finding (before) | Fix (after) | Where |
|---|---|---|---|
| A1 | A failed/empty bank refresh was treated as an authoritative empty list and **wiped saved strategies**. | Failed fetch is flagged *stale*; local rows preserved. A genuine empty server response still clears correctly. | `mergeV16StrategyBankRows`, boot sync, `useV16LiveBootstrap.ts` |
| A2 | Delete removed the row **optimistically** and used `window.alert` on failure → UI desync. | Pessimistic delete: waits for API, keeps row on failure, in-app message, double-fire guard. | `runDelete`, `deleteStrategyFromBank`, `strategyDeleteInFlightRef` |
| A6 | A `/strategies` fetch failure silently returned `[]`, faking an empty bank. | Failure now throws and is isolated as `strategyBankError`; rest of journal survives. | `fetchJournalApiData` |
| A3 | Applying a template **silently destroyed** an in-progress edit. | Confirm dialog when edit/dirty before replacing. | `fillStrategyBuilderFromTemplate`, `applyTemplateToBuilder` |
| B1 | Closing the builder with unsaved changes lost them with no warning. | Dirty-signature snapshot → discard/keep-editing confirm on X and Cancel. | `StrategyBuilderModal` |
| C1 | Undo could **snap the canvas to empty** (history seeded from `[]`). | History seeded from mounted canvas, 50-entry cap, covers add/delete/rename/move/connect/keyboard-delete. | `StrategyCanvasWorkspaceInner` history |

### 2.2 Correctness
| # | Finding | Fix | Where |
|---|---|---|---|
| A4 | Saves could exceed the **16 MB backend limit** and fail after a long network wait. | Pre-save image + payload-byte budget blocks oversize **before** any request, with a clear message. | `estimateStrategySavePayloadBytes`, `saveBuilder` |
| A5 | Canvas conditions didn't round-trip; edit-mode didn't fully restore. | Save writes canvas-derived conditions (legacy fallback); reopen restores tree/markets/timeframes. | `deriveStrategyBuilder*FromCanvas`, `openBuilder`, `saveBuilder` |
| B2 / ICR-1 | Timeframes not capped/normalized consistently (`1h` vs `1H`, dupes, >6). | Canonicalize + dedupe + cap at 6 in UI **and** as a save backstop. | `GeneralInfoStepContent`, `normalizeStrategyTimeframes` |
| B3 | Instrument grids **clipped** selected symbols behind a fixed height. | Wrapping scrollable grid; at-cap clicks show "Max 10 symbols". | symbol picker/chip grids |
| B4 / D2 | Edit-mode custom timeframes + markets not restored cleanly (split state). | Lifted `stratBTfCustom` as the single source of truth; `stratBMarketsManualRef` guard. | modal props + call site |

### 2.3 Polish / honesty
| # | Finding | Fix |
|---|---|---|
| D1 (D-1) | Unfinished community-sharing UI showed dead buttons (Share, Use Strategy, saved/community tabs). | Gated off behind `COMMUNITY_ENABLED=false`; backend plumbing kept dormant for later. |
| D3/D4 | Dishonest sort options; badge counted template previews; shared sort state with Sessions; template row said "Delete". | Sort = Name + Net P&L only; badge = real `stratBankRows.length`; independent bank sort state; template action relabeled "Hide" (real deletes still "Delete" + confirm). |
| B5 | Missing required-field feedback; no per-tag length cap; mobile image tile over cap. | Missing-field labels; `MAX_TAG_LENGTH=28`; Add-image tile hidden at cap. |
| C2/C3/C4 (D-2) | Dead edge-drag plumbing; image-validation mismatch; PDF opened before save/name check; dead symbols. | Removed edge-drag plumbing (kept rendering); unified `validateStrategyImageFile`; PDF preflight before popup; dead code removed. |
| A7 | Duplicate-name check allowed case/punctuation-only variants. | Uses `normalizeStrategyBankNameKey` on both input and rows. |

---

## 3. Director decisions executed
- **D-1:** Strip/flag the dead community-share surface → done (flagged off, plumbing dormant).
- **D-2:** Accept AND/OR/OFF connectors, remove dead edge-drag plumbing → done.
- **D-3:** Keep name-uniqueness client-side this release → done.

---

## 4. Verification performed
- **Static, twice:** `tsc --noEmit` exit 0; lint clean on `TalariaV16.jsx` and `dashboard/v16/*`.
- **Cross-cutting Phase-4 traces** (Persistence, Bank, Builder, Canvas): all PASS —
  see `reports/D/PHASE4_*.md`, `reports/C/PHASE4_*.md`.
- **Backend contract proven live:** `/api/health` 200; `/api/strategies` + `/api/journal/list`
  enforce **401 unauthenticated** (auth guard intact); dev proxy reached backend.
- **Full live end-to-end verified by the director on the real server** (deployed + tested, all good).
- Zone compliance maintained; cross-zone edits tracked as ICR-1..8 (ICR-5/6/7 retroactive).

---

## 5. Known limitation (accepted)
- **ICR-8 (template-load undo):** applying a template from the modal header while the canvas is
  mounted replaces canvas content outside the canvas history stack, so undo/redo can desync after
  a template apply. Protected by the existing destructive-replace confirm (no silent data loss).
  Accepted as a known limitation this release; history bridge deferred.

---

## 6. Post-deploy finding — SECURITY (needs director attention)
During cleanup we found that commit `cd162b94` (which was pushed to the server) **included a
dev-only `docker-compose.override.yml`** that publishes `journal-backend` as `5000:5000`
(binds `0.0.0.0`). If the server brings the stack up with this file present, the Flask backend
is exposed directly to the internet, **bypassing the nginx security-headers/proxy layer.**

- The file was intended for local dev only and should **not** be in the deployed repo.
- Manager has removed it in the working tree (pending commit).
- **Recommendation:** commit the removal and redeploy without it (or confirm the server ignores
  this compose file). No product code is affected.

---

## 7. Outstanding items (housekeeping only)
1. **Commit the cleanup:** remove `docker-compose.override.yml`, revert the `next.config.mjs`
   dev flag (already reverted locally to plain `output: "export"`), and the manager doc updates.
2. **Style toggle decision:** an uncommitted one-line edit disables the builder "Style" selector
   via `{false && <ToggleRow label="Style" …/>}`. This was **not** part of the plan — confirm
   whether it's an intentional product decision or debug code to remove.

---

## 8. How to verify it's better (manual regression)
1. **Failed refresh:** stop backend, refresh bank → list stays (was: emptied).
2. **Delete offline:** delete with backend down → row stays + error (was: disappeared/desynced).
3. **Template over edit:** edit a strategy, apply template → confirm prompt (was: silent wipe).
4. **Undo:** build canvas, Ctrl+Z repeatedly → steps back correctly (was: could go blank).
5. **Oversize image save:** add huge image, save → blocked instantly (was: long wait then fail).
6. **Round-trip:** save w/ canvas conditions, reopen → conditions/markets/timeframes restored.

Full audit trail: `docs/strategy-ship-plan/reports/` (per-task) and `SHIP_REPORT.md`.
