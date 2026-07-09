# Worker D Brief — Strategy Bank Page & UI Surface

**Manager:** see `../01_MANAGER_PROTOCOL.md`. Report after EVERY task via
`../templates/TASK_REPORT_TEMPLATE.md` → `../reports/D/<TASK_ID>.md`.

## 1. Ownership zone (WRITE access)

`Sources Handoff/TalariaV16.jsx`, strategy-related blocks only:
- Strategy state declarations (**~11720–11970**): `myStrategies`, `savedCommunityIds`,
  `savedCommunityStrats`, `stratTab`, `stratStyleFilter`, `hiddenTemplateIds`, `stratB*`
  state, community refresh effects.
- Left-nav stratbank wiring (**~15179–15260**) — read mostly; edit only if a task says so.
- Bank page block (**~45400–46015**): sources (`stratBankRows`, `mineSource`), filters,
  sorts, skeletons (`StratRowsHeader`, `Strat*Skeleton`), card/row renderers,
  `StrategyRowAction`.
- Tab bar, list render, action menus, share modal, and the `TemplatePickerModal` +
  `StrategyBuilderModal` **instantiations** (**~46393–46930**).

Line numbers drift — re-locate symbols first; record actual ranges in reports.
`runDelete`/`saveBuilder`/`openBuilder`/`fillStrategyBuilderFromTemplate` are Worker A's —
ICR only.

## 2. Phase 1 task (critical tier)

### D1 — Execute Director decision D-1 on the community/share surface 🟠
**Default decision (a): strip/feature-flag for this release.** Confirm with the manager
that D-1 is resolved before starting. Scope under (a):
- Remove or gate behind a single `COMMUNITY_ENABLED = false` flag (your zone, one
  constant): the unreachable Share-to-Community modal (`stratShareStrat` UI), the
  decorative "Include in post" checkboxes, the `display:"none"` card action bar with
  onClick-less "Use Strategy" buttons, the dead `StrategyRowAction` component, the
  session-only `saveCommunity` bookmark toggle, and the Saved-tab empty-state CTA that
  targets the hidden community tab.
- Keep intact (dormant, not deleted): community fetch plumbing, backend routes, the
  hidden-tab comment structure — so option (b) remains cheap later. Anything ambiguous:
  ask the manager.
- The visible result: a user on the Strategies page can never reach a dead end related
  to community/share.
**Verify:** click-crawl the entire page (cards, rows, ⋮ menus, empty states, both layout
modes, demo + live): no control references community/share; no console errors; My
Strategies flows unaffected.

## 3. Phase 2 tasks (high)

### D2 — Edit restores saved markets (verification owner) 🟠
The code change lives in `openBuilder` (Worker A, via **ICR-4** — file it): prefer saved
`editStrat.markets` over instrument-derived markets when both exist. Your part: define
the acceptance check in the ICR, and after A lands it, verify from the UI: save a
strategy with manual market scope narrower/different than its instruments imply → edit →
markets shown are the saved ones.

### ICRs you will receive
- **ICR-2 (from B):** add lifted parent state for custom timeframes + manual-market flag
  (~11720–11970) and pass as props at the `StrategyBuilderModal` instantiation.
- **ICR-3 (from C):** compute and pass a real `hasExistingGroups` at the
  `TemplatePickerModal` instantiation (predicate contract comes from C).

## 4. Phase 3 tasks

### D3 — Sort/filter honesty 🟡
- My Strategies sort menu: remove or disable-with-tooltip the options that sort on fields
  own strategies don't have ("Win Rate", "Avg R:R", "Most Saved") — or wire them to the
  real backtest-linked metrics already computed for cards if trivially available. Choose
  with the manager; default: remove.
- Apply the active sort to the Saved list path if it survives D-1 (skip if stripped).
- Give the Strategy Bank sort dropdown its own open-state instead of sharing
  `sessSortOpen` with the Sessions page.
- Demo mode: don't count built-in template previews in the "My Strategies" tab badge
  (show them, but badge = real rows), or label them visibly as examples — pick one with
  the manager; default: badge counts real rows only.

### D4 — Dead-code sweep in zone ⚪
Remove what D1 didn't already cover and the audit flagged as dead in your zone:
unused `stratStyleFilter` + `STYLES` filter state (unless a filter UI is being added —
it is not, this release), unused `normalizeStrategyBankName` alias, template-preview
delete path lacking confirm (`hiddenTemplateIds`) — add the same `openAppConfirm` used
for real deletes or relabel the action "Hide".
**Verify:** lints clean; page behavior identical except the intended changes.

## 5. Phase 4 cross-cutting verification (yours)

On the integrated build: full "Bank page" section of the manager checklist in live AND
demo mode, cards AND rows layouts, desktop AND phone widths. Also re-run the click-crawl
from D1. File `../reports/D/PHASE4_VERIFY.md`.

## 6. Guardrails

- Do not delete backend community routes or community fetch plumbing — dormant, not dead.
- Do not change `mergeV16StrategyBankRows` usage semantics (Worker A owns that contract).
- Keep the existing visual language; no layout redesigns.
