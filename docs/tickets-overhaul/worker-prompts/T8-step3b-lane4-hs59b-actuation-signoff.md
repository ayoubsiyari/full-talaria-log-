# T8 step 3b (Lane 4) — H-S59b actuation sign-off (D-014 ruling 4)

## What this is
A **bounded review + written sign-off**, NOT a hand-off or a rebuild. Lane 2 built H-S59b (independent-symbol replay-advance RED for TAL-01590) in the **host harness** (`serve.mjs` / `scenarios.mjs`, NOT `react-parity-lib.mjs` — no D-012 collision). D-014 ruling 4 requires your one written sign-off before H-S59b is trusted in the baseline. This is aligned with your honest-harness work — same I15 lens.

## The specific thing to judge (Worker 2's own flag)
Worker 2 reported: **"harness kill-switch RED is weak on tick/candle play — mirror frames still advance panel B with the switch ON."** If B advances even with `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` ON (fix OFF), then H-S59b going GREEN with the fix ON **does not isolate the fix** — it could be a false-green. Your job is to rule on whether H-S59b is an honest RED or dev-evidence only.

## Review checklist
1. **Actuation fidelity (I15):** confirm the setup truly is production-faithful — `pair=multi-independent` (A=file25/B=file27/C=file28), sync OFF, paused-enter, host `rs.play()` tick mode + passive iframe `replayPlay {mode:'tick'}`, **no** `hostReplaySeek` / no synthetic `replayFrame` inner loop; per-iframe `replaySystem.replayTimestamp` sampled on wall-clock. Is the measurement a real end-state (ts + forming-bar advancing) or a proxy?
2. **Kill-switch A/B honesty:** run H-S59b with the switch **ON** (fix off). Does panel B actually freeze, or do mirror frames keep advancing it? Determine WHY the RED is weak — is the local harness unable to force the fetch-lag/breaker timing that causes the real freeze (i.e. the freeze is network-timing-dependent and can't be reproduced deterministically locally)?
3. **Verdict:** one of —
   - **HONEST RED** — switch-ON reproduces a measurable freeze/stall; H-S59b trustworthy → promote to baseline.
   - **WEAK/DEV-ONLY** — switch-ON still advances B; H-S59b is GREEN-SYNTHETIC dev evidence, acceptance must rest on **PO staging live-confirm** (D-014/D-012 interim authority). Say so plainly and propose whether a stronger RED is feasible (e.g. inject fetch-lag/force the breaker) or not.

## Deliver
- Fill the **sign-off line** in `MANAGER-FINDINGS.md` (top action block) with your verdict + one-line rationale.
- If WEAK: note whether a fetch-lag/breaker-injection variant could make it an honest RED, and whether that's worth building vs relying on PO staging confirm.
- Do NOT edit `panel-cmd-bridge.js` or the fix. Read-only + run the scenario. You MAY note the `known-failing.json` promotion plan for H-S59–H-S78 (you own that file) but coordinate it with your rebuild.

## Guardrail
No `react-parity-lib.mjs` conflict concern here (host harness). Keep your honest-harness rebuild as the primary task; this review is a short insert.
