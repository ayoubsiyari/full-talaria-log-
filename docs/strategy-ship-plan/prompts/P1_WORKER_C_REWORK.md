# PROMPT — Worker C — C1 REWORK (Phase 1)

Your C1 work was correct but was **overwritten by another worker's concurrent full-file save**
of `Sources Handoff/TalariaV16.jsx`. Your changes are NOT in the current tree. Re-apply them.

## 0. CRITICAL — exclusive file lock this time
- You have **exclusive** write access to `Sources Handoff/TalariaV16.jsx` right now. No other
  worker is editing it. Do NOT run anything that rewrites the whole file from a stale buffer.
- Before you start: open the CURRENT file fresh and re-locate symbols (line numbers below are
  current). After you finish: save and hand the file straight back to the Manager. Do not let
  any build/codegen step overwrite the file.
- If you run `build:handoff-v16` or `npm ci`, verify afterward (git diff) that your edits to
  `TalariaV16.jsx` are still present before reporting DONE.

## 1. Zone (unchanged): `TalariaV16.jsx` ~lines 1524–5679 only.

## 2. Current landmarks (re-verified by Manager against the live tree)
- `StrategyCanvasWorkspaceInner` starts at **4052**.
- History state: **4056** — `const [history, setHistory] = useState([{ nodes:[], edges:[] }]);` ← the empty seed to fix.
- `histIdx` state: **4057**.
- `loadTemplate`: **4107–4132** (currently pushes NO history snapshot).
- `pushHistory`: **4175–4178** (currently no cap; only called by onConnect @4197 and keyboard-delete).
- `hasExistingGroups` @4105 is a C2 concern — LEAVE it for Phase 2.

## 3. Task — C1 (re-apply exactly your reported design)
- Seed history from the ACTUAL mounted `canvasNodes`/`canvasEdges` (not `[]`). A lazy `useState`
  initializer or a layout-effect reseed is fine — but guarantee the first history entry equals
  the mounted canvas BEFORE any user action can push.
- Extend history coverage via a central `commitCanvasMutation` (or equivalent): add/delete group,
  add/delete/move condition, rename commit, status change, template load. Template load must push
  the PRE-load state so undo returns to the prior build and redo restores the template.
- Cap history at 50 entries.
- Keep `MIN_STRATEGY_FLOW_GROUPS` enforcement intact. Keep `_cvCb` reassign-on-render semantics.

## 4. Acceptance / verify (same as original C1)
Mount with a template → connect/delete/rename/add → Ctrl+Z step-by-step back to the EXACT mounted
state (never empty) → redo forward; repeat in outline view; no console errors.

## 5. Report
Save to `docs/strategy-ship-plan/reports/C/C1.md` (overwrite the REWORK note) AND paste the full
report into your final message. **Include a "clobber re-check" line:** paste the current line of
the history `useState` proving it is no longer `[{ nodes:[], edges:[] }]`, and confirm a fresh
`git diff` shows your `TalariaV16.jsx` hunks present. Status: DONE / BLOCKED.
