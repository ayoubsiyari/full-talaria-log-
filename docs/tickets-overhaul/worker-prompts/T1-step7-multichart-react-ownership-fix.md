# WORKER PROMPT — T1 step 7 (Lane 1): gating audit → A/B revert → gated re-land (multichart selection recovery)

> Hand to the Lane 1 worker. **Director ruling D-006 governs this task.** Do NOT start with an ownership redesign. Start with the gating audit and the A/B-revert experiment below — that is the cheapest decisive test and it is mandatory ordering.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 7**, Lane 1. RC-1.

## WHY (read before anything)
On build `20260712b8`, multichart panels show three live regressions (single chart is fine):
- **R1** — Ctrl-select broken. **R2** — no blue selection/preview border. **R3** — settings menu flashes open then closes.

The step-6 diagnostic (`worker-reports/T1-step6-multichart-selection-regression-report.md`) mapped these to `MultichartGrid.jsx`. **But the Director found the isolation test inconclusive:** T1 steps 4/5 edited `MultichartGrid.jsx` (`:4756` skipV9Dismiss cleanup, `:5822-5837` close-settings handler) **outside** `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`. So "switch off, nothing changes" is equally consistent with **our own un-gated React edits** being the cause. That is also an **I3/I13 breach** (a fix not fully revertible by its switch). You must resolve which theory is true before proposing any fix.

## READ FIRST (binding)
- `worker-reports/T1-step6-multichart-selection-regression-report.md` (mechanism map + file:lines)
- `worker-reports/T1-step4-lifecycle-migration-report.md`, `T1-step5-multichart-select-settings-fix-report.md` (your own edits)
- `worker-reports/T3-step3-row2-ctrlselect-fix-report.md` (Lane 2 — do not clobber `_suppressNextIframeCtrlSelectToggle`)
- `docs/tickets-overhaul/INVARIANTS.md` — binding; note **I13 (new)**, I3, I5, I9.

## PART 1 — GATING AUDIT (mandatory first deliverable)
Produce a table of **every edit T1 steps 4/5 made to production React (`MultichartGrid.jsx`) and any other file** with:
| file:line | what the edit does | which kill-switch (if any) gates it | revertible by that switch? (Y/N) |

List every step-4/5 change that is **outside** `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` reach. This is the I13 compliance ledger.

## PART 2 — A/B REVERT EXPERIMENT (do this BEFORE any ownership theory)
In the **real React product** (live Vite `MultichartGrid`, not the harness):
1. **Neutralize all step-4/5 React edits** (revert `MultichartGrid.jsx:4756` and `:5822-5837` and any other un-gated step-4/5 React change to pre-step-4 behavior). Keep single-chart untouched.
2. Re-test R1, R2, R3 in panels.
3. Record the result per regression:
   - **If R1/R2/R3 disappear** when our edits are neutralized → **our un-gated edits are the cause.** Proceed to Part 3A (re-land properly gated).
   - **If any regression survives** with all our edits neutralized → that one is a genuine pre-existing React ownership defect. Proceed to Part 3B for that regression only.

Report the A/B result as the decisive evidence. (Director expectation: the audit will show our edits are the cause — but prove it, don't assume it.)

## PART 3A — RE-LAND PROPERLY GATED (if Part 2 shows our edits caused it)
- Re-implement the needed step-4/5 React behavior **entirely behind a React-scoped kill-switch** (`window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`, default ON), covering **every** `MultichartGrid.jsx` line the fix touches (satisfy **I13**).
- Fix the specific races the diagnostic named: `openDrawingSettingsForPanel()` must not be undone by `clearDrawingUiOnOtherPanels()` → `closeDrawingSettingsOnAllPanels()` in the same interaction (R3); source panel keeps its selected chrome + recomputed focus frame (R2); parent cleanup must not fight Row-2 suppression (R1).
- RED (switch OFF or pre-fix) / GREEN (switch ON) / RED-again proof, **in the real product**.

## PART 3B — OWNERSHIP FIX (only for regressions that survive Part 2)
Implement the diagnostic's recommended split of `clearDrawingUiOnOtherPanels(sourceId, opts)` (peer-deselect / peer-settings-close / parent V9 dismiss / source-close-only-on-explicit-deselect-Esc-delete), gated by the same React switch. Same real-product RED/GREEN/RED proof.

## FALLBACK (b) — PRE-AUTHORIZED by D-006, no re-escalation
If Part 2/3 shows the step-4/5 model is fundamentally wrong for panels and cannot be re-landed cleanly: **revert the multichart migration and default it OFF for panels** (single-chart migration stays ON — it is live-confirmed), so the PO gets a stable build immediately. Report this path clearly; the Manager will bump and ship. Re-migration happens later, once, under the parity gate.

## MANDATORY ACCEPTANCE — real-product parity checklist
Run `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md` against the **live React multichart** and paste results. Harness (H-S43/H-S44) alone is NOT acceptance (D-006 ruling 1). Keep the harness gate green too (I9).

## BINDING CONSTRAINTS
- RC-1 only. I11: no mirror-frame work. L2: production trees only.
- **I13:** every touched file behind the switch; ungatable edits explicitly called out + real-product verified.
- Both engine trees byte-identical; SHA256 both sides. Do NOT clobber Lane 2's suppression.
- **Do NOT bump build id** — report the diff; Manager coordinates the bump.

## DELIVER (report `.md`: `worker-reports/T1-step7-multichart-react-ownership-fix-report.md`)
1. **Part 1 gating audit table** (I13 ledger).
2. **Part 2 A/B-revert result** per R1/R2/R3 — the decisive evidence.
3. Chosen path (3A re-land / 3B ownership / fallback-b) + diff + kill-switch name + real-product RED/GREEN/RED proof.
4. Completed parity checklist results.
5. State matrix (single chart unchanged; panels R1/R2/R3 fixed) + harness gate intact + SHA256 both trees + `node --check` clean + build-id diff for Manager.
