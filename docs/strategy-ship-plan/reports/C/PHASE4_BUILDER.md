# Phase 4 Static Verification — Builder Modal
Status: DONE (static) with no builder findings

Source traced: `Sources Handoff/TalariaV16.jsx`

## Trace Table
| Item | Symbol / current lines | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| B1 | `StrategyBuilderModal` `builderDirtySignature` / `requestBuilderClose` @ 8423-8475; close button @ 8641-8652; step-1 Cancel @ 8701-8713 | Dirty X and step-1 Cancel route through `openAppConfirm`; pristine close immediate. | Initial signature is captured on first modal render, dirty state compares current signature to it, and both X plus step-1 Cancel call `requestBuilderClose`. Pristine state calls `onClose` directly; dirty state opens `openAppConfirm`. | PASS |
| B2 | `canonicalTf` / `dedupeTfs` / `toggleTf` / trim effect @ 6779-6824; step gating @ 8484-8516 | Timeframes canonicalize `m/H/D/W/M`, dedupe, trim to 6, show cap feedback; gating uses normalized count. | Canonicalization preserves lowercase minutes and uppercase larger units, dedupes before display, trims over-limit selections reactively to `MAX_STRATEGY_TIMEFRAMES`, and general-info gating uses normalized unique timeframes. | PASS |
| B3 | `toggleInst` / `toggleSupportInst` @ 6695-6716; trading grid @ 7213-7256; support grid @ 7351-7395 | Trading/support grids wrap and scroll; 11th selection shows "Max 10". | Both symbol pickers block additions at 10 and render cap feedback. Selected trading/support grids use `repeat(auto-fit,minmax(106px,1fr))`, `maxHeight:116`, and `overflowY:'auto'`. | PASS |
| B4 | `GeneralInfoStepContent` props @ 6416-6437; custom TF usage @ 6824-6876; market manual ref @ 6658-6694; edit restore @ 46403-46444 and modal props @ 47187-47221 | Custom TF state is lifted; no `sbTfCustom` local; manual markets are not clobbered; step-1 fields restore on edit. | `stratBTfCustom`/`setStratBTfCustom` are passed in and are the only custom timeframe persistence path for this step. `sbTfCustom` has 0 refs. `stratBMarketsManualRef` is set for manual/edit markets and prevents auto-derive overwrite. `openBuilder(editStrat)` restores step-1 fields. | PASS |
| B5 | Missing labels @ 8500-8516 and 8688; render @ 6985-6988; image add gate @ 6909-6910 and 7616-7626; tag cap @ 6438-6491 | Blocked Next renders missing labels; mobile Add image tile gated at 4; per-tag length cap with feedback. | `requireGeneralInfo` exposes missing labels to `GeneralInfoStepContent`; alert renders when Next is blocked. `canAddStrategyImage` uses mobile limit 4 or desktop 6. `MAX_TAG_LENGTH = 28` caps input/add and displays feedback. | PASS |
| Double-confirm | `fillStrategyBuilderFromTemplate` @ 46342-46401; picker call @ 47177-47184 | `skipConfirm=true` bypasses A3 confirm; picker passes true and `hasExistingGroups` includes `stratEditId`. | Confirm only opens when `!skipConfirm && strategyBuilderHasUnsavedChanges()`. Template picker calls `fillStrategyBuilderFromTemplate(tpl, undefined, true)` and passes `hasExistingGroups={strategyFlowHasMeaningfulTemplateContent(canvasNodes) || stratEditId != null}`. | PASS |

## Browser-Only Checks
Runtime click-crawl, mobile picker behavior, and popup/modal interaction checks are DEFERRED -> final Docker pass.

## ReadLints
`ReadLints` on `Sources Handoff/TalariaV16.jsx`: no linter errors found.

## Defects
None for the Builder modal static bundle.
