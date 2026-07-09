# Worker B Brief — Strategy Builder Modal

**Manager:** see `../01_MANAGER_PROTOCOL.md`. Report after EVERY task via
`../templates/TASK_REPORT_TEMPLATE.md` → `../reports/B/<TASK_ID>.md`.

## 1. Ownership zone (WRITE access)

`Sources Handoff/TalariaV16.jsx` **lines ~5680–8421** only:
- Image/payload helpers (~5680–6245): `isStrategyBuilderMobileDevice`,
  `validateStrategyImageFile`, `validateCompressedStrategyDataUrl`,
  `estimateStrategyBuilderPayloadBytes`, `summarizeStrategyBuilderImages`,
  `compressCoverImage`, `STRATEGY_BUILDER_MOBILE_COVER_LIMIT`.
- `GeneralInfoStepContent` (~6246–8127): step-1 form.
- `StrategyBuilderModal` (~8128–8421): step navigation, gating, save/close buttons,
  error boundary.

Line numbers drift — re-locate symbols first; record actual ranges in reports.
Needs outside your zone (parent state ~11720–11970 → Worker D; `saveBuilder` → Worker A)
go through ICRs.

## 2. Phase 1 task (critical tier)

### B1 — Unsaved-changes confirmation on close 🟠 (phase-1 because data loss)
**Bug:** Cancel/X discards everything (name, canvas, images, tags) with no warning.
**Fix intent:** implement a dirty check inside `StrategyBuilderModal` — compare current
form/canvas state against the snapshot taken at open (you may compute a cheap dirty
signature from the props you already receive). If dirty, show a confirm
("Discard unsaved changes?") before invoking `onClose`. Keep backdrop-click ignored.
Align confirm copy/mechanism with Worker A's A3 (template confirm) via the manager so the
two dialogs feel identical.
**Acceptance:** closing a dirty builder always warns; a pristine builder closes instantly;
confirming discards; canceling returns with state intact.
**Verify:** open → type name → close → confirm dialog appears (both X and Cancel);
open → touch nothing → close → no dialog; dirty + cancel → everything still there.

## 3. Phase 2 tasks (high)

### B2 — Timeframe cap enforced end-to-end; case normalization 🟠
**Bugs:** trim effect runs only on step-1 mount; `generalInfoReady` only checks
`length > 0`; templates use `1h` while presets use `1H`, so duplicates consume slots;
save writes the array unchecked.
**Fix intent (your zone):** normalize timeframe tokens to one canonical case at every
entry point in the form (preset toggle, custom add, template-filled values as displayed);
dedupe case-insensitively; make the >6 condition part of step gating
(`generalInfoReady`) with a visible message; make the trim reactive rather than
mount-only.
**ICR-1 → Worker A:** one guard in `saveBuilder` (cap + normalized dedupe) as the final
backstop. File it with exact acceptance check.
**Verify:** try to select `1h` after `1H` (blocked/merged); load a template with lowercase
TFs then open the picker (no phantom duplicates); attempt >6 via any path (blocked with
message); legacy edit rows with 7+ TFs are trimmed/gated before save.

### B3 — Instrument grids show all selections; at-cap feedback 🟠
**Bugs:** traded/support chips grids are `height:48; overflow:hidden` (~6974, ~7103) —
10 selections render but only ~5–6 visible; at the 10-cap, clicks silently no-op.
**Fix intent:** let the chip area grow (wrap) or scroll with a visible affordance; when at
cap, show a short inline message ("Max 10 symbols") near the picker and keep rows
visibly disabled.
**Verify:** add 10 traded + 10 support symbols — all visible; 11th click produces feedback,
not silence; compact/mobile layout doesn't overflow the modal.

### B4 — Edit-mode restoration: custom timeframes & manual-market intent 🟠
**Bugs:** `sbTfCustom` and `marketsManualFilterRef` are local to `GeneralInfoStepContent`;
leaving step 1 unmounts them, so custom TFs vanish from the picker and manual market
choices get overwritten by the derive-sync on return; edit-open sets
`setStratBCustomTfs([])` regardless of saved data.
**Fix intent:** lift both into parent state via **ICR-2 → Worker D** (state + props at the
instantiation site); in your zone, consume the lifted props, derive custom TFs from saved
`timeframes` (tokens not in the preset list) when opening an edit, and stop resetting the
manual-market flag on remount.
**Verify:** save a strategy with a custom TF (e.g. 90m) and hand-picked markets → edit →
step 2 → back to step 1: custom TF still listed and deletable; markets unchanged.

## 4. Phase 3 tasks

### B5 — Feedback & small caps ⚪
- Render the missing-required-fields *names* (the computed `generalInfoMissingLabels`
  is currently unused) when Next is blocked — message, not just red borders.
- Mobile cover images: hide/disable the Add tile at the mobile limit (4) instead of
  showing it until 6 and erroring on tap.
- Add a per-tag length cap (e.g. 24–32 chars) with input truncation/feedback.
- If trivial in-zone: make `mobileSymbolPicker` width check responsive to resize.
**Verify each** with the specific repro from the audit (blocked Next shows field names;
mobile at 4 images shows no Add tile; overlong tag blocked).

## 5. Phase 4 cross-cutting verification (yours)

On the integrated build: full "Builder modal" section of the manager checklist, on
desktop AND a ≤900px compact viewport. File `../reports/B/PHASE4_VERIFY.md`.

## 6. Guardrails

- Do not touch `saveBuilder`, `openBuilder`, or parent state directly — ICR only.
- Do not change validation to be *looser* anywhere (image types/sizes, name limits).
- Keep the existing visual language (colors from `c`, font `F`, existing button styles).
