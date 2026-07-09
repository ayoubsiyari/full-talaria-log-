# PROMPT — Worker C — Phase 2 (Canvas & Templates)

You are **Worker C**. Phase 1 (C1) is done and verified. This is Phase 2, task **C2**.
You are FIRST in the serialized editing order — you have exclusive access to
`Sources Handoff/TalariaV16.jsx` right now.

## 0. CRITICAL working rules (a prior clobber wiped C1 once)
- **Exclusive file lock:** only you may edit/save `TalariaV16.jsx` during your turn. Do NOT let
  any build/codegen step overwrite the file. After editing, `git diff` to confirm your hunks
  are present before reporting DONE.
- Re-locate symbols by name (line numbers drift). Zone = `TalariaV16.jsx` **~1524–5679 only**.
- No new deps. No security/limit weakening. Keep `MIN_STRATEGY_FLOW_GROUPS`, `escPrint`, and
  `_cvCb` reassign-on-render semantics intact.

## 1. Task — C2: Template overwrite protection actually works 🟠
Bugs:
- (a) `hasExistingGroups` inside the workspace checks `type === 'condition'` (~4131) — a canvas
  with groups but no conditions gets NO warning.
- (b) the "Create Your Own" footer calls `onPick(null)` directly, bypassing the `confirmReplace`
  two-step (~3977 region in `TemplatePickerModal`).
- (c) the live picker instantiation passes `hasExistingGroups={false}` hardcoded — **D's zone**
  (you fix via ICR-3, below).
- (d) the in-canvas picker instance is dead code (`templatePickerOpen` never set true).

Fix intent (YOUR zone only):
- Make the modal's replace-confirmation robust: route ALL destructive picks (template AND
  "Create Your Own") through the same `confirmReplace` path.
- Fix the existing-content predicate to consider meaningful user content: any section beyond the
  default scaffold **OR** any condition **OR** any edited label/description — not just conditions.
- Decide with the Manager whether to remove the dead in-canvas picker instance (recommended —
  removal is in your zone). Default: remove it.

## 2. ICR-3 → Worker D (file it; do NOT edit D's zone)
The live `TemplatePickerModal` instantiation (D's zone, ~46801) must pass a REAL
`hasExistingGroups` computed from current canvas state. **You define the exact predicate/prop
contract** in the ICR. File it at `docs/strategy-ship-plan/reports/C/ICR-3.md` using the ICR
template. The Manager routes it to D; you verify the combined behavior AFTER D implements
(a later turn). For now, make your modal side correct assuming the prop will arrive.

## 3. Coherence with A3 (already shipped)
A3 added an edit-session confirm in `fillStrategyBuilderFromTemplate` (A's zone). Your replace
confirm must not stack a SECOND dialog on top of A3's for the same action — one confirmation.
If you see a risk of double-confirm, note it in your report; align copy via the Manager
(reuse the "Keep editing" cancel wording).

## 4. Verify (your part now)
- With a non-trivial build (groups present, no conditions), picking a template OR "Create Your
  Own" from the in-builder Templates button requires an explicit Replace confirmation.
- A pristine/new builder does NOT nag.
- (Combined ICR-3 behavior verified in a later turn once D lands the prop.)

## 5. Report
Save to `docs/strategy-ship-plan/reports/C/C2.md` AND paste full text back. Include: symbols +
current line ranges, the `hasExistingGroups` predicate you now use (modal side), whether you
removed the dead in-canvas picker, the ICR-3 contract summary, verification steps table, lint
result, and a `git diff` presence confirmation. Status: DONE / BLOCKED.
