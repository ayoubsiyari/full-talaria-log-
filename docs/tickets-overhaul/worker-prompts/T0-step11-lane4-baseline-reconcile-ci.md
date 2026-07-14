# T0 step 11 (Lane 4) — reconcile react-parity baseline + capture a real CI run

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8, byte-identical): `chart v 1.4/chart/**` (canonical) and `homepage/public/chart/**`.
- Real-iframe parity harness: `chart v 1.4/chart/multichart-prod/harness/` (`react-run.mjs`, `react-parity-lib.mjs`, `react-parity-scenarios.mjs`, `react-gate.mjs`, `known-failing.json`). Gate = `npm run gate:react` (builds real `dist-v9`, boots panels in real `<iframe>`, asserts build id inside each panel). This is the D-010 durable gate.
- You wired `gate:react` into `.github/workflows/multichart-harness.yml` (step 10). **Problem:** your `known-failing.json` baseline is stale relative to three sibling lanes that landed in parallel.

## The conflict to fix
Three parallel lanes edited `known-failing.json` this cycle and left three different baselines (step-10 said 8 red; T3 step-4 said 5; T1 step-17 said "H-R08 only"). Rows greened across the combined tree (`20260712b88`):
- **H-R01, H-R04** — T3 step 4 (panel-B selection→parent-chrome routing).
- **H-R13** — T1 step 15 (settings-flash).
- **H-R14** — T1 step 16 (marquee).
- **H-R05, H-R06** — T1 step 17 (Esc-deselect + Delete).
- **H-R07** — T3 step 5 (peer isolation). Also new host rows H-S51/52/53 greened by T3 step 5.

Likely true post-combined react-parity tracked-red: **only H-R08** (host Ctrl+drag marquee during-drag) — verify **H-R09** too (its Esc leg may now pass as collateral of step 17). Determine the ACTUAL set from a clean run on the canonical combined build; do not assume.

## NEW: you are now the SOLE owner of `known-failing.json` (process rule)
From now on, **only Lane 4 edits `known-failing.json`.** Other lanes report row deltas; you reconcile. This step establishes the single source of truth after the 3-way divergence.

## NEW: you are the INTEGRATION-BUILD owner for this deploy (deploy is on hold until you confirm)
Multiple lanes edited **`MultichartGrid.jsx`** and other shared files in parallel on different build ids (step 17 = b88, T3 step 5 = b85, T3 step 4 = b44). We must NOT deploy a partial tree. Before anything ships:
1. Ensure the working tree contains **all** of these, then rebuild once (`npm run build:live`) to a single canonical build id:
   - T1 step 14/15/16 (toolbar / settings-flash / marquee)
   - **T1 step 17** — `MultichartGrid.jsx` must contain the Esc/Delete forwarders, `deleteSelectedDrawings` host cmd, and `dismissActiveDrawingTool` V9-clear changes.
   - **T3 step 4** — `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` routing.
   - **T3 step 5** — `MultichartGrid.jsx` must ALSO contain `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` peer-deselect + `multichart-manager.js` changes, and harness rows H-S51/52/53.
   - **A3 step 3** — replay interval-cadence + mode-play routing switches present in the built bundle.
   - **T4 step 8 family 1** — `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` (close/hit-target) present in order-manager. (Lane 3's *later* families are NOT expected in this snapshot.)
2. If any of the above is missing from the merged tree (e.g. a lane's `MultichartGrid.jsx` change got clobbered by another lane's edit), **STOP and report exactly which change is missing** — do not silently rebuild over a lost change.
3. Report the single canonical build id. **The user deploys that id, not b88.**

## NEW: fix the H-R13 switch-OFF probe ambiguity (I13 verifiability)
T1 step 15/17 claim the parent settings-open path is switch-gated, but the harness cannot prove it: `readParentReactSettings` treats the V9 quick-bar root text `"A"` as "settings open", so H-R13 stays PASS even with `REACT_PARITY_GEAR_FIX_OFF=1`. **Disambiguate the probe** so it distinguishes the V9 quick-bar shell from the actual settings modal/panel. Then re-run: with the fix ON, H-R13 must PASS; with the switch OFF, H-R13 must go **RED** (proving the I13 revert). If after fixing the probe H-R13 still passes with the switch off, that means the product path is genuinely NOT gated — STOP and report it as a real I13 gap (escalation), do not paper over it.

## Do this
1. Rebuild the current combined tree: `cd "chart v 1.4/talaria-design" && npm ci && npm run build:live`. Confirm build id (host + inside panel-B iframe).
2. Fix the `readParentReactSettings` probe ambiguity (see section above) so H-R13's switch state is meaningful.
3. Run the full react-parity suite on the built product and record which rows pass/fail (`--runs=3` for stability), both with default switches and with `REACT_PARITY_GEAR_FIX_OFF=1`.
4. Reconcile `known-failing.json` `reactParity.knownFailing` to the **actual** failing set from the clean run. If your run disagrees with the expected `["H-R07","H-R08","H-R09"]`, STOP and report the discrepancy (do not force the list).
5. Mirror `known-failing.json` byte-identically to `homepage/public/chart/...` (I8) — SHA256 both.
6. Re-run `npm run gate:react`; it must PASS with exactly the reconciled baseline and **0 regressions**. Confirm H-R13 goes RED under `REACT_PARITY_GEAR_FIX_OFF=1` after the probe fix.
7. Trigger the CI job for real: push/PR touching a harness path, or **Actions → Multichart harness → Run workflow**. Capture the **run URL** and the green result. If gh/Actions is unavailable in your env, say so explicitly and provide the local gate log as the pre-merge proof.

## Guardrails
- Do NOT touch product/React/engine code — baseline + CI only.
- Do NOT weaken the gate (no removing rows that genuinely fail, no `continue-on-error`, no disabling the job). See security rule.
- Keep the manager `gate` (I9) job untouched.

## Report (use WORKER-REPORT-STANDARD.md, 8 sections)
Must include: before/after `knownFailing` arrays, the full-suite pass/fail table on the current build (both default and switch-OFF), the probe-fix diff, proof that H-R13 now goes RED with the switch OFF (or an escalation if it does not), SHA256 for both `known-failing.json` copies, the `gate:react` PASS log, and the CI run URL (or explicit reason none).
