# E focus and destroy correctness controls

**2026-07-31** · Manager E · packet `E-FOCUS-DESTROY-CORRECTNESS-V1`

## FLOW-01 Pull

Pulled E ready-queue item 1 after finishing the mismatched-timeframe parity controls. Preconditions checked:

- Territory: E-owned evidence/report/journal paths only; no `chart.js` or `replay-system.js` edits.
- Spine: no chart spine edits.
- Preconditions: none; being ahead of A's focus-routing fix is the point.
- Heavy measurement: none; model oracle only.
- Scope: within Phase 4 correctness gates from the published ready queue.

## Oracle

- Script: `docs/plan3/evidence/E-FOCUS-DESTROY-CORRECTNESS-20260731/focus-destroy-correctness.red.mjs`
- Evidence: `docs/plan3/evidence/E-FOCUS-DESTROY-CORRECTNESS-20260731/focus-destroy-correctness-red.json`

## Focus-Aware Input Routing

Keyboard and mouse events must reach only the focused chart instance and must not leak to peers.

RED controls:

| Control | Deliberate break | Expected RED reason | Result |
|---|---|---|---|
| `FOCUS-KEYBOARD-WINDOW-CHART` | Keyboard routes through `window.chart` / instance A while B is focused | `keyboard-missed-focused-instance` | GREEN control |
| `FOCUS-MOUSE-WINDOW-CHART` | Mouse routes through `window.chart` / instance A while C is focused | `mouse-missed-focused-instance` | GREEN control |
| `FOCUS-MOUSE-BROADCAST` | Mouse event is delivered to every panel | `mouse-leaked-to-peer` | GREEN control |

GREEN control:

| Control | Expected behavior | Result |
|---|---|---|
| `FOCUS-SCOPED-ROUTING` | Keyboard and mouse reach only the focused panel | GREEN |

## Destroy Indicator Behavior

After teardown, indicator state must be gone and late indicator events must not resurrect it. This is the
behavioral half only; D owns heap/bytes.

RED control:

| Control | Deliberate break | Expected RED reason | Result |
|---|---|---|---|
| `DESTROY-NO-DESTROY-RESURRECTS-INDICATOR` | Panel is removed but instance indicator state remains reachable and late recalc rewrites it | `destroy-indicator-resurrected` | GREEN control |

GREEN control:

| Control | Expected behavior | Result |
|---|---|---|
| `DESTROY-WITH-DESTROY-CLEARS-INDICATORS` | Destroyed panel has no indicator state and late indicator event is ignored | GREEN |

K2 and K3 remain landed in `E-WARMUP-WINDOWS-20260731.md`; no new action needed for those in this packet.
