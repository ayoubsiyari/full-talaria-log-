# Lane 3 — DIAGNOSTIC (READ-ONLY): multichart per-panel order parity + replay-PnL stall

## Symptom (PO live report, multichart)
Setup: 2 chart panels, **different tickers**, one order set on each.
1. **Intermittent** — sometimes both panels work perfectly, sometimes **panel B glitches and you can't add an order anymore** (entry blocked / no-op).
2. When **replay runs on both panels**, the **PnL gets stuck** (stops updating).
3. Goal: multichart orders must behave **identically to a single main-panel chart** — set / edit / drag / PnL / replay all working per panel, independently, with no cross-panel bleed.

This is READ-ONLY. Map the mechanism, produce a hypothesis-ranked root-cause + a switch-gated fix plan. **No product code changes.** Honest actuation only (I15) — reproduce in the real multichart embed with two live panels, not a synthetic stub.

## Investigate (rank by evidence)
1. **Order store ownership per panel (A6-4 gap).** Is order/position state module-level singleton shared across iframes, or per-panel-instanced? Trace where each panel's orders live (`order-manager.js`, `order-interaction-guard.mjs`, session keys). Look for a shared key (e.g. keyed by nothing / by a global) that lets panel A and panel B collide when tickers differ. Confirm whether A6-4 (host-canonical store, ratified/deferred) is the true cause.
2. **"Can't add order anymore" (panel B lockout).** Is it a **stuck interaction guard**? Check `order-interaction-guard.mjs` A6-1 apply-on-release + the `_oi*` open-SL/TP-drag provisional state (b2 v2 fix) — does a drag/guard flag get set on panel B and never cleared (e.g. release handler bound to wrong panel/iframe), swallowing subsequent entry clicks? Check pointer/marquee capture, and whether panel focus routing sends the entry command to the wrong iframe.
3. **panel-cmd-bridge routing.** How do order commands reach panel B's iframe? Any race where a command targets the wrong panel id, or drops when both panels init close together (session-order / chrome-readiness family)? Correlate with the intermittency.
4. **Replay-PnL stall on dual replay.** How is order PnL recomputed during replay — per-panel replay clock (finest-TF cadence) tick, or a shared clock? When both panels replay, does panel B's PnL subscriber stop firing (unsubscribed / overwritten by panel A / rAF coalescing collision)? Trace the mark-price → PnL update path per panel.
5. **Intermittency source.** Nail whether it's init race (panel-B ready before store wired), session-order shared state, or a genuine data race. Give the trigger.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-MULTICHART-PARITY-diagnostic-report.md`:
- Reproduction recipe (exact steps + how often it triggers).
- Ranked root cause(s) with file:line evidence for each symptom (lockout vs PnL-stall may be same or different roots — say which).
- Whether this is the A6-4 host-canonical gap or something smaller/freeze-safe.
- Proposed fix plan: switch-gated, one knob, freeze-safe if possible; if it requires host-canonical rework (A6-4, post-unfreeze / edits MultichartGrid+panel-cmd-bridge), say so explicitly and propose any freeze-safe interim mitigation.
- No code changes.
