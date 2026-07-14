# T1 step 17 (Lane 1) — panel-B Esc-deselect + Delete over the bridge (I14), + tighten step-15 switch

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8, byte-identical): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`. Engine files: `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/drawing-tools-manager.js`.
- **Multichart panels are separate windows** (`chart-embed.html` in real `<iframe>`). Per **I14**, parent↔iframe coordination goes through **postMessage bridges only** — no parent globals, no shared closures, no same-context assumptions in panel-facing paths.
- **Acceptance surface is the built product only (D-010):** the real-iframe parity harness at `chart v 1.4/chart/multichart-prod/harness/` (`npm run gate:react`, boots real `dist-v9` panels in real iframes, asserts build id inside each panel). dev:live is NOT acceptable proof for iframe fixes — it has repeatedly shown green while the real product was broken.
- T3 step 4 (Lane 2) just confirmed the panel-B interaction root (selection→parent-chrome routing) is fixed. It proved **H-R05 (Esc), H-R06 (Delete) are INDEPENDENT defects**, not the routing root — they are yours.

## Scope (two related fixes + one cleanup)
1. **H-R05 — Esc does not clear selection chrome in panel B.** Pressing Esc after selecting a drawing in an iframe panel must deselect and clear the parent V9 quick-bar/settings chrome. Route the Esc/deselect over the postMessage bridge (I14), not a parent global.
2. **H-R06 — Delete key does not remove the selected drawing in panel B.** Delete/Backspace on a selected drawing in an iframe panel must remove it and clear chrome, over the bridge.
3. **Tighten step-15 switch (I13 gap):** the step-15 settings-flash fix used `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`, but switch-OFF does NOT fully revert the postMessage settings-open path (H-R13 still passes with switch off). Make switch-OFF cleanly revert **every** path the fix touches so H-R13 goes RED when disabled (I13).

## Kill-switch (I3 + I13)
- Gate H-R05/H-R06 behavior behind a switch (reuse `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` if these share the routing family, or a new `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` — your call, state it). Switch must cover EVERY file touched, React included (I13).
- Prove switch-OFF → the target rows go RED (real revert).

## Proof (mandatory)
- Add/enable real-iframe harness rows for Esc (H-R05) and Delete (H-R06); RED-first on the pre-fix build, then GREEN 10/10 on the built product with build id asserted **inside panel B**.
- `npm run gate:react` PASS (no new regressions) + `npm run gate` PASS.
- Switch-OFF restores RED for H-R05, H-R06, and H-R13.
- SHA256 for every changed file in BOTH trees (I8).

## Guardrails
- I14 (bridge only), I5 (host tile A behavior unchanged), I8 (mirror both trees), I13 (full switch coverage).
- Do NOT edit parity harness ownership files that other lanes are actively changing without mirroring; if you touch shared harness files, mirror + SHA both.
- Do not weaken any gate to make rows pass.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Include the RED→GREEN logs on built dist-v9 (build id inside panel B), switch-OFF RED for H-R05/06/13, gate logs, SHA256 both trees.
