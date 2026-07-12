# WORKER PROMPT — T4 step 3 (Lane 3): order-entry replay-interaction rows

> Hand to the Lane 3 (order-entry) worker. **RED-first + diagnostic before fix.** These rows touch the replay bus — full state-matrix discipline applies, and if the mechanism is mirror-frame policy it defers to T8 (do not fix here).

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 3**, Lane 3. Steps 1–2 (aggregate model + display/parse) are shipped. This step handles the two replay-interaction sub-bugs T4 step 1 deferred.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (RC-5), `INVARIANTS.md` (**binding — I5 state matrix, I11, L1/L2**), `TRACKS.md` (T4)
- `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md` — §9 deferred rows
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` — TAL-00752 replay-interaction rows

## SCOPE — two rows, RED-first harness scenarios
1. **Entry fills on the wrong candle** during replay.
2. **TP line flicker per candle** during replay advance.

## APPROACH (mandatory order)
1. **RED-first repro** in the multichart-prod harness (replay topology). Prove each row deterministically RED on the current canonical build (confirm build id).
2. **Diagnostic first, then fix.** Identify the exact mechanism (which replay-frame value / timing drives the wrong-candle fill or the per-candle flicker). Name file:line.
3. **Gated fix** only once the mechanism is confirmed order-entry-owned:
   - Entry-fill row: `window.__TALARIA_DISABLE_REPLAY_FILL_CANDLE_FIX`
   - TP-flicker row: `window.__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`

## BINDING CONSTRAINTS
- **I11 / Lane-2 standing rule:** if a row traces to **mirror-frame application policy** (which data/X/Y a panel adopts from the replay broadcast), **STOP** — it is **DEFER-T8**, not a T4 fix. Report and hand back; do not add a replay-frame guard.
- **State matrix (I5) required** per row: single chart × replay playing/paused/off, multichart host + panel, with the replay-mirror-frame cell explicitly marked.
- **RC-5 only.** Do not touch `computeOrderEntryAggregates` (step 1) or the SL/TP display/parse helpers (step 2) except to read.
- **Build id:** do NOT run `bump-dist-v9-cache.mjs` yourself — report your diff and the Manager coordinates the bump (build-id lineage routes through the Manager per D-003).
- Both `order-manager.js` trees byte-identical (I8). L2: production only.
- Existing gate (31 + any newly tracked) stays green (I9).

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step3-replay-interaction-report.md`)
1. Per row: RED repro spec + evidence, mechanism + file:line, whether it is RC-5-owned (fix here) or mirror-frame policy (DEFER-T8).
2. For fixed rows: diff, GREEN + kill-switch RED evidence, kill-switch name, state matrix.
3. SHA256 both trees; `node --check` clean; build-id diff left for Manager to bump.
4. TAL-00752 replay-interaction rows dispositioned (fixed / deferred-T8).

## STOP CONDITIONS
Mechanism is mirror-frame policy → DEFER-T8, report, do not fix. Row can't be reproduced deterministically → report dead end + manual repro needed.
