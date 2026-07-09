# Interface Change Request — ICR-3

- **From (requesting worker):** Worker C
- **To (owning worker):** Worker D
- **Related task:** C2 — Template overwrite protection actually works
- **Status:** OPEN
- **Date:** 2026-07-09

## 1. What I need changed (exact)

- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call site: live `TemplatePickerModal` instantiation in Worker D zone, currently near the strategy builder template picker render.
- Requested change (precise — code-level description or snippet):

Replace the hardcoded prop:

```jsx
hasExistingGroups={false}
```

with a real current-canvas predicate:

```jsx
hasExistingGroups={strategyFlowHasMeaningfulTemplateContent(canvasNodes)}
```

Use the current strategy builder canvas node state that is passed into the builder modal/live picker path. Do not duplicate the predicate inline; Worker C added `strategyFlowHasMeaningfulTemplateContent(nds)` in the shared canvas/template zone.

## 2. Why (which task/bug this unblocks, user impact)

C2 fixes the modal-side confirmation path so destructive template choices, including "Create Your Own", require a replace confirmation when meaningful strategy flow content already exists. The live picker currently passes `false`, so the modal cannot warn users and a template/blank reset can overwrite their canvas without a modal-side confirmation.

## 3. Contract

- New/changed props, state, flags, or return values and their exact semantics:
  - `TemplatePickerModal.hasExistingGroups` must mean: the current canvas has meaningful template-replaceable content.
  - Use `strategyFlowHasMeaningfulTemplateContent(canvasNodes)` for the value.
  - Predicate semantics: `true` when there is any condition, any section beyond the default scaffold, or any edited section label/description; `false` for a pristine default scaffold.
- Who consumes it and where:
  - `TemplatePickerModal` consumes `hasExistingGroups` in Worker C zone to route template and blank picks through its `confirmReplace` path.
  - Worker D owns the live picker call site that must provide the real value.

## 4. Acceptance check (how the requester will verify the combined behavior)

| # | Step | Expected |
|---|---|---|
| 1 | Open the strategy builder with a pristine/default flow and open Templates. | Selecting a template or "Create Your Own" applies without an extra modal-side replace confirmation. |
| 2 | Create meaningful flow content with groups present but no conditions, such as adding a group or editing a group label/description. Open Templates and pick a template. | The picker shows the replace confirmation before applying. |
| 3 | With the same meaningful flow content, click "Create Your Own". | The picker shows the same replace confirmation path before clearing/resetting. |
| 4 | Confirm the replacement. | The selected template or blank flow applies after one explicit replace confirmation; no silent overwrite. |

## 5. Owning worker implementation notes (filled on IMPLEMENTED)

- Status: IMPLEMENTED by Worker D.
- What was done: replaced the live `TemplatePickerModal` hardcoded `hasExistingGroups={false}` with `hasExistingGroups={strategyFlowHasMeaningfulTemplateContent(canvasNodes)}` in `Sources Handoff/TalariaV16.jsx`.
- Current line range: `TemplatePickerModal` instantiation line 46984.
- onPick follow-up site for Manager/A skip-confirm wiring: `onPick={(tpl)=>{...}}` starts at line 46985 and calls `fillStrategyBuilderFromTemplate(tpl)` at line 46987.
- Deviations from request: none. Per prompt, Worker D did not solve the possible double-confirm path here; A needs to add/pass the future `skipConfirm` parameter.

## 6. Requester verification (filled on VERIFIED)

- Steps re-run, results:
