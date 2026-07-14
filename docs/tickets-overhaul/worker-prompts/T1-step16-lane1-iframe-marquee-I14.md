# T1 step 16 (Lane 1) — Ctrl+drag marquee multi-select on real iframe panel (I14 re-fix)

**Cold-start:** read `INVARIANTS.md` (esp. **I14**), `WORKER-REPORT-STANDARD.md`, and the step-14 report (`__talariaV9PanelEmbed` in-iframe flag pattern). Engine mirrored across both trees (SHA256 both).

## SYMPTOM (caught by the real-iframe parity harness, T0 step 8b)
- **H-R14 RED on real built dist-v9 iframe:** Ctrl+drag on panel B → marquee `active:false, w:0, h:0`; single-select only, no multi-select box. Step 9 "fixed" the marquee but only on dev:live (same-context); it doesn't work across the real iframe boundary — same class as the gear (I14).

## FIX (reuse step-14 pattern)
- Drive marquee start/commit off the authoritative **in-iframe** signal / bridge messages, NOT parent globals. The `ctrlMarqueeSelect` start predicate + live-drag update + multi-select commit must all run inside the panel iframe on the real product.
- Same switch `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (or a clearly-named sibling if the mechanism is disjoint — one mechanism/one switch per I3; state which and why). I13 all touched files, both trees. Single chart + host tile unchanged (I5).

## ACCEPTANCE (real product only — D-010)
- **H-R14 must flip RED→GREEN on the T0-step8b real-iframe harness** (built dist-v9, real iframes, build id inside panel B): Ctrl+drag draws the blue marquee and multi-selects enclosed drawings. 10× deterministic, settle-signal gated (no fixed sleep).
- Switch OFF → RED again. Full `npm run gate` green (I9). SHA256 both trees.

## DELIVER
`worker-reports/T1-step16-iframe-marquee-report.md` per WORKER-REPORT-STANDARD — mechanism (why step 9 failed across the iframe), diff + switch, H-R14 RED→GREEN on the 8b harness, gate result, SHA256. Part of the **single combined deploy** with steps 14 + 15.
