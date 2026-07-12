# WORKER PROMPT — T4 step 2 (Lane 3): order-entry display-threshold + parsing fixes

> Hand to the Lane 3 (order-entry) worker. Independent lane — no Director checkpoint required. Two separately-gated fixes; keep them isolated.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 2**, Lane 3. Step 1 (`computeOrderEntryAggregates` V2) is accepted and shipped in `20260712b1`. This step handles the two display/parsing sub-bugs T4 step 1 explicitly deferred.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (RC-5), `INVARIANTS.md` (binding), `TRACKS.md` (T4)
- `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md` — §9 deferred families
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — TAL-00752 rows

## SCOPE (TWO independent gated fixes — do NOT bundle)

### Fix A — SL/TP below 10 not rendered on chart
Small SL/TP values (< 10) fail to render their chart line/label. Diagnose the threshold/precision gate that drops sub-10 values; fix so any valid positive SL/TP renders.
- **Kill-switch:** `window.__TALARIA_DISABLE_SLTP_RENDER_FIX` (default unset = fix ON).

### Fix B — trailing-zero parsing zeroes the lot on SL/TP inputs
Entering trailing zeros / certain decimal strings in SL/TP inputs parses the lot to 0. Fix the input parse/format path so trailing-zero and partial-decimal input never zero the lot.
- **Kill-switch:** `window.__TALARIA_DISABLE_SLTP_PARSE_FIX` (default unset = fix ON).

## BINDING CONSTRAINTS
- **RC-5 only.** Do NOT touch `computeOrderEntryAggregates` / aggregate math (step 1, shipped) or the replay bus. If a symptom traces to aggregates or replay, STOP and report — wrong RC.
- **I8:** both `order-manager.js` trees byte-identical (canonical + `homepage/public`). SHA256 both.
- **RED-first per fix:** each fix needs a failing reproduction (Node-side unit/property test where possible; harness scenario if it needs DOM). RED before, GREEN after, RED again with that fix's kill-switch.
- **I11:** no mirror-frame guard work.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step2-display-parsing-report.md`)
1. Per fix: mechanism + file:line, diff summary, RED/GREEN/RED-again evidence, kill-switch name.
2. State matrix (I5) per fix.
3. SHA256 both `order-manager.js` trees (+ any other touched module pair).
4. Build id bump from `20260712b1` (continue the lineage) via `bump-dist-v9-cache.mjs --live --dist`; `node --check` clean.
5. TAL-00752 registry rows for these two families → dispositioned.
6. Confirm: aggregates/replay untouched; legacy trees not edited.

## STOP CONDITIONS
Premise wrong, mechanism belongs to RC-1/RC-2 (ghost/repaint) or the replay bus → report, do not improvise.
