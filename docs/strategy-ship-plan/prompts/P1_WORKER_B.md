# PROMPT — Worker B — Phase 1 (Strategy Builder Modal)

You are **Worker B** on the Strategy ship-ready effort. You fix bugs; you do not redesign.
Work only inside your ownership zone. Report after the task. Read this whole prompt first.

## 0. Working rules (read first)

- **Isolation:** work in your own git worktree/branch (`ship/worker-b`). Do NOT commit to
  `main`. Do NOT merge. The Manager integrates later.
- **File under work:** `Sources Handoff/TalariaV16.jsx`. **Line numbers drift — re-locate
  every symbol by name before editing** and record actual current line ranges in your report.
- **Do not edit outside your zone.** `saveBuilder`, `openBuilder`, and parent state
  (~11720–11970) are NOT yours — those go through ICRs (none needed for Phase 1 B1). If B1
  somehow needs an out-of-zone edit, mark the task BLOCKED and explain.
- **Security guardrails non-negotiable;** no new dependencies; no loosening of any validation
  (image types/sizes, name limits). Keep existing visual language (colors from `c`, font `F`,
  existing button styles). No console errors introduced.

## 1. Your ownership zone (WRITE access only here)

`Sources Handoff/TalariaV16.jsx` **~lines 5680–8421 only**:
- Image/payload helpers (~5680–6245): `isStrategyBuilderMobileDevice`,
  `validateStrategyImageFile`, `validateCompressedStrategyDataUrl`,
  `estimateStrategyBuilderPayloadBytes`, `summarizeStrategyBuilderImages`,
  `compressCoverImage`, `STRATEGY_BUILDER_MOBILE_COVER_LIMIT`.
- `GeneralInfoStepContent` (~6246–8127): step-1 form.
- `StrategyBuilderModal` (~8128–8421): step navigation, gating, save/close buttons, error
  boundary.

## 2. Task (Phase 1)

### B1 — Unsaved-changes confirmation on close
- **Bug:** Cancel/X discards everything (name, canvas, images, tags) with no warning.
- **Fix intent:** implement a dirty check **inside `StrategyBuilderModal`** — compare current
  form/canvas state against a snapshot taken at open (you may compute a cheap dirty signature
  from the props you already receive). If dirty, show a confirm before invoking `onClose`.
  Keep backdrop-click ignored (do not make backdrop close the modal).
- **SHARED CONFIRM-COPY LOCK (must match Worker A's A3 exactly in tone/mechanism):**
  use the existing `openAppConfirm` pattern; the cancel/dismiss action is labeled
  **"Keep editing"**; the destructive action verb is **"Discard"**; message conveys
  "Your unsaved changes to this strategy will be lost." Report the exact call you wrote
  verbatim so the Manager can reconcile it against A3.
- **Acceptance:** closing a dirty builder always warns; a pristine builder closes instantly;
  confirming discards; canceling returns with state intact.
- **Verify:** open → type a name → close via X → confirm dialog appears; repeat via Cancel
  button → dialog appears; open → touch nothing → close → no dialog; dirty + cancel →
  everything still there.

## 3. Do NOT do in Phase 1
- Do not start B2/B3/B4/B5 (later phases). No edits toward the timeframe cap, instrument
  grids, edit-restoration, or feedback tasks yet. Reading to prepare is fine.
- Do not touch `saveBuilder`/`openBuilder`/parent state.

## 4. Reporting (required)

Produce a task report for B1. Save to `docs/strategy-ship-plan/reports/B/B1.md` AND paste the
full report text into your final message to the Manager.

Report must contain:
1. **What changed** — table File | Symbol(s) | current line range | nature; + 2–5 sentence
   summary.
2. **Zone compliance** — all hunks in zone; no validation loosened; no new deps; ICRs (none).
3. **Verification evidence** — reproducible steps table (step | expected | observed | pass);
   lint result on touched file; "console errors introduced: none/<list>".
4. **Risks & notes** — include the exact `openAppConfirm` call you used (for A3 reconciliation)
   and how you computed the dirty signature.
5. **Blocked?** — only if BLOCKED.

Set **Status:** DONE / BLOCKED, then hand back to the Manager.
