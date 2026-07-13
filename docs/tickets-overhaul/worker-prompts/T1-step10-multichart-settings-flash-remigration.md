# WORKER PROMPT — T1 step 10 (Lane 1): re-apply the multichart settings-flash fix (R3), verified via fast loop

> Hand to the Lane 1 worker. This is the first slice of the D-006 "re-migrate under the parity gate" now that the fast local test loop (T0 step 5) exists. Scope is narrow: **stop the multichart settings menu from flashing open→closed.** Verify in the running chart before claiming done.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 10**, Lane 1. RC-1.

## SYMPTOM (PO live, multichart panels; single chart is fine)
Opening a drawing's settings in a multichart panel makes the menu **flash open then close within ~1s**. Single-chart settings work perfectly.

## ROOT CAUSE (already diagnosed — do not re-derive from scratch)
This is **R3** from `worker-reports/T1-step6-multichart-selection-regression-report.md`: `openDrawingSettingsForPanel()` opens V9 settings, then `clearDrawingUiOnOtherPanels()` → `closeDrawingSettingsOnAllPanels()` closes the **source** panel's settings in the same interaction (`MultichartGrid.jsx` ~:4754–4768, :4860–4867, :5822–5838). **Step 7 fixed this** behind `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`, but **fallback (b) (D-006) defaulted ownership-V2 OFF in panels**, reintroducing the flash.

## TASK — re-apply ONLY the settings-flash (R3) portion of step 7
- Make the source panel's settings **not** be closed by the peer-cleanup/broad-close during the same open interaction (source settings close only on explicit Esc/deselect/delete). This is the step-7 R3 fix; re-enable that specific behavior in panels.
- Keep the rest of the fallback-(b) posture intact **unless** re-enabling R3 cleanly requires the surrounding step-7 ownership split — if so, re-enable the minimal coherent set and say so in the report.
- Preserve the PO spec (D-007): single-click = select + quick menu; **double-click = open settings** (which must now stay open); Esc = deselect + close.

## VERIFY IN THE RUNNING CHART (mandatory — fast loop, T0 step 5)
```
cd "chart v 1.4/talaria-design"
$env:USE_LOCAL_CHART='1'; npm run dev:live
```
Open a multichart panel, double-click a drawing → **settings menu opens and STAYS open** (no flash), and closes on Esc. Confirm single-chart settings unchanged. Provide the observed evidence (screenshot or precise before/after).

## PARITY CHECKLIST
Run `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md` rows 4, 5, 9 on **main chart AND a panel**. Harness alone is not acceptance (D-006/I13).

## BINDING CONSTRAINTS
- RC-1 only. I11: no mirror-frame work. L2: production trees only. **I13:** the switch covers every touched file (React included).
- Both engine trees byte-identical + `MultichartGrid.jsx` consistent; SHA256 all touched files.
- Do NOT re-break: single-chart, marquee (step 9), Ctrl-select (H-S43), cross-panel clear (H-S34/35 stay tracked-red for now — note if your change would flip them).
- Do NOT bump build id — Manager coordinates.

## DELIVER (report `.md`: `worker-reports/T1-step10-multichart-settings-flash-remigration-report.md`)
1. Exact change (file:line) re-applying the R3 fix; which flag/default governs it.
2. Running-chart verification: settings stays open in a panel (evidence) + single-chart unchanged.
3. Parity rows 4/5/9 results (main chart + panel).
4. Gate result (note any known-failing changes); SHA256 all trees; `node --check` clean; build-id diff for Manager.
