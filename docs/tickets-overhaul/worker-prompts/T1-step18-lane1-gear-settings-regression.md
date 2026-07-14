# T1 step 18 (Lane 1) — P0: gear/settings button broken on BOTH panels A and B

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8, byte-identical): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`. React: `chart v 1.4/talaria-design/src/` (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`). Engine: `chart v 1.4/chart/modules/drawing-tools-manager.js`, `drawing-tools-ui.js`, `keyboard-shortcuts.js`, `chart.js`.
- **Acceptance surface = the real built product (D-010):** multichart 2-panel on built `dist-v9` in real iframes. dev:live is NOT acceptable proof.
- **I14:** parent↔iframe only via postMessage bridges.

## The regression (P0) — and why the harness missed it
PO reports: **the gear/settings button no longer opens the settings menu on Panel A OR Panel B.** Panel A's gear previously worked — so a recent change broke it for both surfaces.

**CRITICAL — the harness was lying.** Lane 4 (T0 step 11) fixed the `readParentReactSettings` probe, which previously counted the V9 quick-bar shell as "settings open" (false green). With the **honest probe** on the combined build `20260712b88`, these rows are actually **RED**: **H-R04, H-R05 (Esc), H-R06 (Delete), H-R12 (gear→settings), H-R13 (dbl-click→settings), H-R14 (marquee)**. The step 15/16/17 "10/10 GREEN" were false greens. So this is NOT just the gear — the whole panel interaction family is broken on the real product. **Pull Lane 4's updated `react-parity-lib.mjs` (honest probe) before you start** and treat its results as truth.

**Prime suspects (verify, don't assume):** T1 step 15 (settings-flash) and step 17 (I13 tighten) gated the settings-open route behind `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` and touched `postMultichartOpenDrawingSettings()` / `openDrawingSettingsForPanel()` / the parent open handler. Both **gear (H-R12) and dbl-click (H-R13)** now fail to open the real settings modal from a panel → likely a **single settings-open-transport root** (fix once, not per-row).

## Scope (per ESC-011 Manager recommendation — pending Director ratification, start diagnostic now)
1. **Settings-open transport (root):** make BOTH gear (H-R12) and double-click (H-R13) open the real settings modal on Panel A AND Panel B, over the postMessage bridge (I14), WITHOUT reintroducing the flash or the double-toolbar. H-R04 (settings chain) should follow.
2. **Re-verify H-R05 (Esc), H-R06 (Delete), H-R14 (marquee)** on the honest harness + real product — these were false-green too; fix whatever is genuinely broken.
3. Keep H-R01 (select→chrome) and H-R07 (peer isolation) green — they are genuinely passing; do not regress them.

## Step 0 — reproduce + isolate on the built product (REQUIRED before any edit)
1. Build + open the 2-panel layout; confirm build id inside each panel iframe.
2. Reproduce: click the gear on Panel A → does settings open? On Panel B → ? Record exactly.
3. **Isolate gear-route vs settings-open-entirely:** does **double-click** on a drawing still open settings? If double-click works but gear doesn't → it's the gear button's handler/route. If neither works → the settings-open path itself is broken.
4. **Switch bisect:** set `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true` before load and re-test the gear. Note whether the gear works with the fix OFF vs ON. This tells us if the fix gating is the cause.
5. Report the isolation result in one line before proceeding (or in the report if you proceed straight to fix).

## Fix
Restore the gear → settings-open route on BOTH panels, over the postMessage bridge for iframe panels (I14), while KEEPING the step-15 flash fix (settings must open AND stay open) and step-17 Esc/Delete. Do not reintroduce the flash or the double-toolbar.

## Kill-switch (I3 + I13)
- Keep behavior under `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`. Switch OFF must revert cleanly. Cover every file touched (React included).

## Proof (mandatory, built product)
- Gear opens settings on **Panel A** AND **Panel B**: RED (repro) → GREEN 10/10 on built dist-v9, build id inside panel B.
- Double-click still opens + stays open (H-R13 not regressed); Esc/Delete (H-R05/06) not regressed.
- `npm run gate:react` PASS + `npm run gate` (host) PASS.
- SHA256 for every changed file in BOTH trees.

## Coordinate with Lane 4 (harness fidelity)
The current H-R13 probe cannot tell the V9 quick-bar apart from the real settings modal — which is why the harness did not catch this. **Add/adjust a harness assertion that specifically checks the settings modal opened from the GEAR button** (distinct from double-click), so this regression is caught in CI going forward. Report the row delta to Lane 4 (who owns `known-failing.json`); do not edit the baseline yourself.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Include the step-0 isolation result, RED→GREEN on built product for BOTH panels' gear, switch-OFF revert, both gate logs, SHA256 both trees, and the new gear-specific harness assertion.
