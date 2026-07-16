# Lane 1 — RECONCILE: panel-B dbl-click → parent settings fails after D-024 dom-ready (Worker 1 9-10/10 vs Lane 4 0-4/10)

## The contradiction to resolve
Same build id `20260716b10`, opposite results:
- **Worker 1** (`T3-panelB-chrome-dom-ready-FIX-report.md`): H-R04 **10/10**, H-R05 **9/10** ON — WITHOUT any harness dom-ready wait.
- **Lane 4** (`T0-lane4-chrome-dom-ready-wait-plus-bless-report.md`): H-R04 **4/10**, H-R05 **0/10** ON — WITH the dom-ready wait wired, measuring the REAL parent modal (`hasStyleSection`). dom-ready signal PASSES every run; host leg PASSES; panel-B settings modal is `open:false`.

A legitimate wait cannot make a real product worse. Either the two are running **different bytes** (stale/incomplete served `dist-v9`) or they are **measuring different things** (Worker 1 asserted a weaker end-state = false-green). Your job: determine which, with evidence. **Read-only except a local dist rebuild** (build artifact regen, no source edits).

## Constraints
- Deploy stays frozen. No product source edits in this task — this is diagnosis + (if needed) a dist artifact rebuild only.
- Do NOT edit the harness lib (Lane 4 owns it). Do NOT add sleeps.
- Honest measurement (I15): assert the REAL parent settings modal opened (`hasStyleSection` / visible Style panel), not click-dispatched or quick-bar shell presence.

## Tasks
1. **Bundle audit (hypothesis A — stale/incomplete dist):**
   - Inspect the served `dist-v9` bundle(s) for both trees (`chart v 1.4/.../dist-v9`, `homepage/public/chart/dist-v9`). Confirm whether the built bundle actually contains the D-024 fix: the ready-signal emit, `data-v9-chrome-dom-ready`, and the `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` switch.
   - Report the source→dist build provenance: was `dist-v9` rebuilt from `2537d3d0b`, or is it a pre-fix bundle? Give hashes/timestamps.
   - If stale/incomplete: rebuild `dist-v9` from HEAD (includes `2537d3d0b` + `6fe92e25`), verify the markers are present, and re-run the honest panel-B probe against the freshly served build.
2. **Measurement reconcile (hypothesis B — false-green):**
   - Read exactly what Worker 1's H-R04/H-R05 asserted as "settings open." Did it check the real parent modal (`hasStyleSection`) or a proxy (click dispatched / quick-bar shell / `editDrawing` fallback)?
   - Re-run Worker 1's own probe AND Lane 4's honest probe against the SAME freshly-built served dist. Report both numbers side by side.
3. **Verdict:** classify as one of:
   - **(A) BUILD** — served dist was stale/incomplete; rebuilt dist makes the honest probe pass 10/10 → no product bug, bless can proceed on the rebuilt dist.
   - **(B) TRANSPORT** — even on a verified-fresh dist with the real-modal assertion, panel-B dbl-click → parent settings genuinely fails. D-024 fixed the readiness *ordering* but there is a separate *transport* gap (panel-B iframe → parent settings modal). This is beyond D-024's authorized scope → needs a fresh escalation for a transport fix.
   - **(C) HARNESS** — Lane 4's probe races something Worker 1's didn't (identify it) → Lane 4 harness adjustment, not a product bug.

## Deliverable report
`docs/tickets-overhaul/worker-reports/T3-panelB-settings-transport-reconcile-report.md`:
- Bundle audit result (markers present/absent, provenance, hashes).
- Side-by-side probe numbers on the verified-fresh dist (Worker 1 assertion vs honest `hasStyleSection`).
- The A/B/C verdict with evidence.
- If (A): the rebuilt dist commit (file-scoped, dist artifacts only) + honest 10/10 proof → hand back to Lane 4 for the 3-clean bless.
- If (B): the exact transport call path that fails (panel-B dbl-click event → where it should reach the parent settings open, and where it dies), a proposed gated fix + switch name, and STOP for Director escalation.
- If (C): the harness race identified, handed to Lane 4.

Do the cheap check first (bundle audit) — it's the most likely explanation for "an honest wait made it worse."
