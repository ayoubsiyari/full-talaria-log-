# Worker C Brief — Canvas Flow Editor & Templates

**Manager:** see `../01_MANAGER_PROTOCOL.md`. Report after EVERY task via
`../templates/TASK_REPORT_TEMPLATE.md` → `../reports/C/<TASK_ID>.md`.

## 1. Ownership zone (WRITE access)

`Sources Handoff/TalariaV16.jsx` **lines ~1524–5679** only:
- Group node component (~1524–2460), condition node component (~2461–3012).
- Label helpers (~3013–3077), `clampStrategyFlowViewport`, `MIN_STRATEGY_FLOW_GROUPS`,
  `buildSingleStrategyGroup`, `countStrategyFlowGroups`.
- `STRATEGY_TEMPLATES` data + `TemplatePickerModal` (~3135–4049).
- `StrategyCanvasWorkspaceInner` (~4050–5679): board, outline/document view, PDF export,
  toolbar, footer, `_cvCb` callback bridge, history/undo.

Line numbers drift — re-locate symbols first; record actual ranges in reports.
The `TemplatePickerModal` *instantiation* (~46801) belongs to Worker D; `fillStrategyBuilderFromTemplate` belongs to Worker A — coordinate via ICR/manager.

## 2. Phase 1 task (critical)

### C1 — Undo must never restore an empty canvas 🔴
**Bug:** history is initialized `[{ nodes:[], edges:[] }]` (~4054) instead of the mounted
canvas; `pushHistory` fires only on edge-connect and keyboard-delete. One action + Ctrl+Z
wipes all groups/conditions.
**Fix intent:** seed history with the actual initial `canvasNodes`/`canvasEdges` on mount
(and re-seed if the canvas is externally replaced, e.g. template application); extend
`pushHistory` to cover add/delete group, add/delete/move condition, rename commit, status
change, and template load, so undo/redo is coherent. Cap history length (e.g. 50) to
bound memory.
**Acceptance:** Ctrl+Z after the first user action returns to the pre-action state, never
empty; redo round-trips; undo across a template application restores the prior build.
**Verify:** mount with template → connect/delete/rename/add → undo step-by-step back to
the exact mounted state; redo forward; repeat in outline view; no console errors.

## 3. Phase 2 task (high)

### C2 — Template overwrite protection actually works 🟠
**Bugs:** (a) `hasExistingGroups` inside the workspace checks `type === 'condition'` (~4103)
— a canvas with groups but no conditions gets no warning; (b) the "Create Your Own" footer
calls `onPick(null)` directly, bypassing the `confirmReplace` two-step (~3977); (c) the
live picker instantiation passes `hasExistingGroups={false}` hardcoded (D's zone); (d) the
in-canvas picker instance is dead code (`templatePickerOpen` never set true).
**Fix intent (your zone):** make the modal's replace-confirmation robust — route ALL
destructive picks (template AND "Create Your Own") through the same confirm path; fix the
existing-content predicate to consider meaningful user content (any section beyond the
default scaffold OR any condition OR any edited label/description). Decide with the
manager whether the dead in-canvas picker instance is removed (recommended) — removal is
in your zone.
**ICR-3 → Worker D:** the instantiation must pass a real `hasExistingGroups` computed from
current canvas state (you define the exact predicate/prop contract in the ICR).
**Verify:** with a non-trivial build, picking a template or "Create Your Own" from the
in-builder Templates button requires an explicit Replace confirmation; a pristine/new
builder does not nag; combined behavior with A3 (edit-session warning) is coherent —
one confirmation, not two stacked (align copy via manager).

## 4. Phase 3 tasks

### C3 — Canvas UX & consistency batch 🟡
- **Delete-group notice styling:** `showFlowNotice` aliases the red image-error toast;
  give the "At least one group is required." notice neutral/info styling.
- **Outline status menu:** add outside-click dismiss (board cards already have it).
- **Board image validation parity:** board nodes use `validateScreenshotUploadFile`
  (any `image/*`); switch to `validateStrategyImageFile` for parity with outline.
- **Outline empty labels:** blur-normalize empty group labels back to the default label
  (board `commitEdit` already does).
- **Edge-connect (Director decision D-2, default (a)):** remove unreachable
  `onConnect`/edge-drag plumbing from user reach (keep edge *rendering* for
  template/saved data); confirm connectors (AND/OR/OFF) fully cover the UX. Do NOT
  implement `<Handle>`s unless the Director picks (b).
- Trim dead code in-zone flagged by audit: unused `statsOf`/`blankTpl`, unbound `doFit`
  (either bind to a toolbar Fit control or remove), unused `selectedNode`, and the
  never-rendered MiniMap/palette/inspector props (removal of the *props* touches other
  zones — ICR if you go that far; dropping only your unused internals is fine).

### C4 — PDF export polish 🟡
**Bug:** print with a missing/invalid name opens a popup, then save fails → flash window.
**Fix intent:** validate the preconditions (name present, savable) BEFORE `window.open`;
keep the existing popup-blocked message and escaping (verified safe — `escPrint`).
**Verify:** print with no name → clear message, no popup flash; happy path prints with
logo (asset `/LOGO-07.png` confirmed present in `homepage/public`); popup-blocker path
still shows its message.

## 5. Phase 4 cross-cutting verification (yours)

On the integrated build: full "Canvas" section of the manager checklist, in both board
and outline views, desktop + compact. Include an undo/redo stress pass (20+ mixed
operations). File `../reports/C/PHASE4_VERIFY.md`.

## 6. Guardrails

- `MIN_STRATEGY_FLOW_GROUPS` enforcement must remain (board bin, `doDeleteSection`,
  `_cvCb.canDeleteSection`, wizard gating).
- Keep `escPrint` on every interpolation into the print document — no exceptions.
- The `_cvCb` module-singleton bridge is fragile; if a fix requires touching it, keep
  reassign-on-render semantics and note the risk in your report.
