# PROMPT — Worker C — Phase 1 (Canvas Flow Editor & Templates)

You are **Worker C** on the Strategy ship-ready effort. You fix bugs; you do not redesign.
Work only inside your ownership zone. Report after the task. Read this whole prompt first.

## 0. Working rules (read first)

- **Isolation:** work in your own git worktree/branch (`ship/worker-c`). Do NOT commit to
  `main`. Do NOT merge. The Manager integrates later. You integrate FIRST in the merge order
  (C → B → D → A), so keep your diff clean and self-contained.
- **File under work:** `Sources Handoff/TalariaV16.jsx`. **Line numbers drift — re-locate
  every symbol by name before editing** and record actual current line ranges in your report.
- **Do not edit outside your zone.** The `TemplatePickerModal` *instantiation* (~46801) is
  Worker D's; `fillStrategyBuilderFromTemplate` is Worker A's. Not needed for C1 — if you
  think you need them, mark BLOCKED.
- **Security guardrails non-negotiable;** no new dependencies. No console errors introduced.

## 1. Your ownership zone (WRITE access only here)

`Sources Handoff/TalariaV16.jsx` **~lines 1524–5679 only**:
- Group node component (~1524–2460), condition node component (~2461–3012).
- Label helpers (~3013–3077), `clampStrategyFlowViewport`, `MIN_STRATEGY_FLOW_GROUPS`,
  `buildSingleStrategyGroup`, `countStrategyFlowGroups`.
- `STRATEGY_TEMPLATES` data + `TemplatePickerModal` (~3135–4049).
- `StrategyCanvasWorkspaceInner` (~4050–5679): board, outline/document view, PDF export,
  toolbar, footer, `_cvCb` callback bridge, history/undo.

## 2. Task (Phase 1 — critical 🔴)

### C1 — Undo must never restore an empty canvas
- **Bug:** history is initialized `[{ nodes:[], edges:[] }]` (~4054) instead of the mounted
  canvas; `pushHistory` fires only on edge-connect and keyboard-delete. One action + Ctrl+Z
  wipes all groups/conditions.
- **Fix intent:**
  - Seed history with the actual initial `canvasNodes`/`canvasEdges` on mount, and re-seed if
    the canvas is externally replaced (e.g., template application).
  - Extend `pushHistory` to cover: add/delete group, add/delete/move condition, rename commit,
    status change, and template load — so undo/redo is coherent.
  - Cap history length (e.g., 50) to bound memory.
- **Acceptance:** Ctrl+Z after the first user action returns to the pre-action state, never
  empty; redo round-trips; undo across a template application restores the prior build.
- **Verify:** mount with a template → connect/delete/rename/add → undo step-by-step back to
  the exact mounted state → redo forward; repeat in outline view; no console errors.

## 3. Do NOT do in Phase 1
- Do not start C2/C3/C4 (later phases). No template-overwrite guard, no UX batch, no PDF
  polish yet. In particular DO NOT act on Director decision D-2 (edge-connect) this phase.
  Reading to prepare is fine.
- Keep `MIN_STRATEGY_FLOW_GROUPS` enforcement intact. Keep `escPrint` on every print
  interpolation. If you must touch the `_cvCb` module-singleton bridge, keep its
  reassign-on-render semantics and flag the risk in your report.

## 4. Reporting (required)

Produce a task report for C1. Save to `docs/strategy-ship-plan/reports/C/C1.md` AND paste the
full report text into your final message to the Manager.

Report must contain:
1. **What changed** — table File | Symbol(s) | current line range | nature; + 2–5 sentence
   summary.
2. **Zone compliance** — all hunks in zone; `MIN_STRATEGY_FLOW_GROUPS` intact; no new deps;
   ICRs (none).
3. **Verification evidence** — reproducible steps table (step | expected | observed | pass),
   including an undo/redo sequence in BOTH board and outline views; lint result; "console
   errors introduced: none/<list>".
4. **Risks & notes** — history memory cap chosen; any `_cvCb` risk touched.
5. **Blocked?** — only if BLOCKED.

Set **Status:** DONE / BLOCKED, then hand back to the Manager.
