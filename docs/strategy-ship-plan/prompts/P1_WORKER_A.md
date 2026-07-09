# PROMPT — Worker A — Phase 1 (Persistence & Lifecycle)

You are **Worker A** on the Strategy ship-ready effort. You fix bugs; you do not redesign.
Work only inside your ownership zone. Report after every task. Read this whole prompt
before touching code.

## 0. Working rules (read first)

- **Isolation:** work in your own git worktree/branch (`ship/worker-a`). Do NOT commit to
  `main`. Do NOT merge. The Manager integrates later.
- **File under work:** `Sources Handoff/TalariaV16.jsx` (~58,847 lines) + supporting files
  listed below. **Line numbers drift — re-locate every symbol by name before editing** and
  record the actual current line ranges in your report.
- **Do not edit outside your zone.** If a fix needs a change elsewhere, STOP and write an
  Interface Change Request note in your report instead (no cross-zone edits in Phase 1 —
  none of your Phase 1 tasks should need one; if one does, mark the task BLOCKED).
- **Security guardrails are non-negotiable:** never weaken/remove `@jwt_required`, CSRF,
  redirect checks, rate limits, size limits, or webhook verification to make something pass.
  No new dependencies. No DB migrations.
- **No console errors introduced.** Behavior-preserving except the intended fix.

## 1. Your ownership zone (WRITE access only here)

- `Sources Handoff/TalariaV16.jsx`:
  - top-of-file helpers **~lines 1–1523**: `getV16StrategyBank`, `mergeV16StrategyBankRows`,
    `getV16StrategyBankRows`, `strategyRowKey`, `parseStratApiId`, name/TF helpers
    (`normalizeStrategyBankNameKey`, `findStrategyBankNameDuplicate`) ~392–430.
  - builder lifecycle block **~46016–46392**: `resetStrategyBuilderForm`,
    `fillStrategyBuilderFromTemplate`, `openBuilder`, `copyStrategyIntoBank`,
    `copyCommunityStrategyIntoBank`, `runDelete`, `saveBuilder`.
- `homepage/src/app/dashboard/v16/` — all files.
- `homepage/src/app/dashboard/strategies/**`.
- `journal-backend/` — strategy/template routes + schemas ONLY. Never touch auth decorators,
  security config, or unrelated routes.

## 2. Tasks (Phase 1 — critical, all 🔴)

### A1 — Failed/empty bank refresh must not vanish saved strategies
- **Bug:** `mergeV16StrategyBankRows` drops local rows with server IDs, trusting the boot
  bank; `useV16LiveBootstrap.ts` (~line 233) catches fetch failures into
  `EMPTY_JOURNAL_PAYLOAD`, so a failed refresh empties "My Strategies" while data still
  exists server-side.
- **Fix intent:** distinguish *fetch failed* from *bank genuinely empty* (error/staleness
  flag on the boot object, or a null-vs-`[]` contract). On failure: keep last-known rows and
  expose an error flag consumers can render. **You define the flag/contract** (Worker D will
  consume it in Phase 2 — describe it precisely in your report so the Manager can relay it).
- **Acceptance:** network blocked → refresh keeps list intact + error flag set; genuinely
  empty server bank → list correctly shows empty.
- **Verify:** DevTools offline → trigger refresh → list unchanged + flag set; restore network
  → refresh reconciles; round-trip save/reload still works.

### A2 — Pessimistic delete with real error UX
- **Bug:** `runDelete` removes the row locally before the API call; failure → `window.alert`
  + swallowed refresh; row can be wrongly gone or flicker back.
- **Fix intent:** await the API before removing (or roll back on failure); replace
  `window.alert` with the in-app notice mechanism already in the file (`openAppConfirm`/toast
  pattern); surface refresh failure; guard against double-fire (a second click can't trigger
  a second delete).
- **Acceptance:** failed delete leaves the row in place with a visible message; success
  removes it; double-click can't fire twice.
- **Verify:** simulate 500/offline on DELETE → row persists + message; success path removes
  row; if the deleted strategy was being edited, the builder still closes (existing behavior).

### A3 — Template application must not silently destroy an edit session
- **Bug:** `fillStrategyBuilderFromTemplate` always `setStratEditId(null)` and wipes fields;
  reachable from inside the builder while editing → the edit silently becomes a new unsaved
  strategy.
- **Fix intent:** if `stratEditId` is set OR the form is dirty, require confirmation before
  applying (reuse `openAppConfirm`). Clearing the edit-id after the user confirms is
  acceptable; declining must change nothing.
- **SHARED CONFIRM-COPY LOCK (must match Worker B's B1 exactly in tone/mechanism):**
  use `openAppConfirm`; the cancel/dismiss action is labeled **"Keep editing"**; the
  destructive action verb is **"Replace"**; message conveys "Applying this template will
  discard your unsaved changes to this strategy." Report the exact call you wrote verbatim so
  the Manager can reconcile it against B1.
- **Acceptance:** applying a template mid-edit always warns; declining changes nothing.
- **Verify:** edit an existing strategy → Templates → pick → decline (state intact) → accept
  (replaced; save behaves as the confirm text promised).

## 3. Do NOT do in Phase 1
- Do not start A4/A5/A6/A7 (later phases). You may *read* to prepare, but no edits.
- Do not implement backend name-uniqueness (Director decision D-3 = client-side only).

## 4. Reporting (required for EACH task: A1, A2, A3)

Produce a task report per the structure below (one report per task). Save to
`docs/strategy-ship-plan/reports/A/<TASK_ID>.md` AND paste the full report text into your
final message back to the Manager (so it can be verified even from your isolated worktree).

Report must contain:
1. **What changed** — table of File | Symbol(s) | current line range | nature of change; plus
   a 2–5 sentence plain summary (bug → fix → any intentional behavior change).
2. **Zone compliance** — checkboxes: all hunks inside zone; no security/limits weakened; no
   new deps; ICRs raised (should be none).
3. **Verification evidence** — a table of the exact reproducible steps you ran | expected |
   observed | pass. Claims without runnable steps will be rejected as REWORK. Include lint
   result on touched files and "console errors introduced: none/<list>".
4. **Risks & notes** — especially: document the new `mergeV16StrategyBankRows` failure-flag
   contract from A1 in full (the Manager relays it to Worker D).
5. **Blocked?** — only if status BLOCKED.

Set each report **Status:** DONE / BLOCKED. Then hand back to the Manager.
