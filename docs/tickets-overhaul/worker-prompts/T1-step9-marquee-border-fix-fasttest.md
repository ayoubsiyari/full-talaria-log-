# WORKER PROMPT — T1 step 9 (Lane 1): Ctrl+drag marquee border — re-fix with the fast local test loop

> Hand to the Lane 1 worker. This is the dedicated fix for the pre-existing marquee-border bug (`PLAN2-FOUND#1`). Step 8 attempted it but it never verified live. **You now have a fast local test loop (T0 step 5) — use it: verify the border actually draws in the running chart before claiming a fix.**

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 9**, Lane 1. RC-1. Registry: `PLAN2-FOUND#1` (and `PLAN2-FOUND#2` if related).

## SYMPTOM (PO-confirmed, main chart AND panels, build `20260713b3`)
Ctrl+drag over empty chart space **selects** but draws **no blue marquee preview border** during the drag. Pre-existing (not a T1 regression — isolated via D-007 three-switch matrix, all-off, border never returns). Step 8's `__TALARIA_DISABLE_CTRL_MARQUEE_FIX` (document-level tracking + SVG viewBox sizing) did NOT make the border visible live.

## USE THE FAST TEST LOOP (mandatory — no more blind rebuilds)
Per `worker-reports/T0-step5-vite-devproxy-fast-test-report.md`:
```
cd "chart v 1.4/talaria-design"
$env:USE_LOCAL_CHART='1'; npm run dev:live
# open the Vite URL, Ctrl+drag on empty chart space, watch for the blue border
```
Local `chart.js`/modules edits are served directly (USE_LOCAL_CHART=1), so you can iterate in seconds. **Do not claim the fix until you have visually confirmed the blue marquee border draws during Ctrl+drag in this running chart.**

## PART 1 — DIAGNOSE why step 8 didn't make the border visible
Step 8 added document-level tracking + SVG sizing but the border still doesn't paint. Find the actual reason the rectangle is invisible/zero-size/not painted: is `drawCtrlMarqueeSelect` called with a valid rect? is the overlay element attached/visible/z-ordered? is `endX/endY` ever updated? is it painted to a layer that's cleared each frame? Name file:line with evidence from the running chart (not just code reading).

## PART 2 — FIX
- One coherent gated fix. Reuse/extend `__TALARIA_DISABLE_CTRL_MARQUEE_FIX` (default ON) — keep it revertible.
- The blue border must draw during Ctrl+drag and multi-select the enclosed tools on release, on **main chart AND panels**.
- Do NOT change plain-drag (move), single-click select, or Ctrl-click toggle (H-S43 stays green).

## BINDING CONSTRAINTS
- RC-1 only. I11: no mirror-frame work. L2: production trees only. I13 (switch covers every touched file).
- Both engine trees byte-identical; SHA256 both sides.
- Do NOT bump build id — Manager coordinates the deploy.
- Keep the gate green (H-S32/33/36/37/38/39/43; tracked reds unchanged).

## DELIVER (report `.md`: `worker-reports/T1-step9-marquee-border-fix-report.md`)
1. Part 1 diagnostic: real reason the border didn't paint (file:line + running-chart evidence).
2. Fix diff + kill-switch + RED/GREEN/RED.
3. **Local dev:live verification:** explicit confirmation (screenshot or precise observation) that the blue border draws during Ctrl+drag on main chart AND a panel.
4. I5 state matrix; gate result; SHA256 both trees; `node --check` clean; build-id diff for Manager.
