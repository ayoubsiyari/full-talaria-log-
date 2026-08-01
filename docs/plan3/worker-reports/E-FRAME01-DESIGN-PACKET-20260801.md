# E FRAME-01 Design Packet

**Manager:** E  
**Date:** 2026-08-01  
**Row:** `FRAME-01-ORDER-02`  
**tier=TOP**  
**model=GPT-5.5**

## Goal

Reduce static multichart idle paints from the observed ~131 paints/s toward zero
without starving visible replay progress or input feedback.

`__TALARIA_FRAME_GOV_V1` is ON by default. Explicit `false` is the rollback path.
The switch is for safety rollback, not for debating whether the row ships.

## Design Order

1. **Dirty-flag gate first.** A clean panel must not paint. `renderPending` remains
   the dirty bit: no pending dirty state means `animate()` performs book-keeping
   only, not a full canvas render. This is the largest expected win because it
   attacks idle repaint directly.
2. **Cadence tiers second.** Dirty focused panels paint at most every 33.3 ms
   (~30 fps). Dirty non-focused panels paint at most every 66.7 ms (~15 fps).
   The tier decides how often dirty work can paint, not whether visible panels
   are allowed to paint at all.
3. **Input fast path third.** Crosshair, drag, pan, wheel burst, and interaction
   fast-render states bypass the cadence cap so user input can paint on the next
   frame. This is the protection for crosshair p95 <= 33 ms.
4. **Single layout scheduler last.** Today every chart realm owns its own
   forever-rAF `animate()` loop. The final shape must route layout/frame
   permission through one multichart scheduler so panels do not independently
   decide to paint in the same layout. The already-landed unit is a local
   cadence governor; the scheduler unification remains the next product unit.

## Product Invariants

- A clean panel paints zero full frames while `renderPending === false`.
- A dirty focused panel paints no faster than 30 fps unless input-fast.
- A dirty non-focused panel paints no faster than 15 fps unless input-fast.
- Input-fast states bypass the cadence cap and paint the next dirty frame.
- Visibility, not focus, still owns “do not paint hidden tile” behavior. FRAME-01
  must not revive the superseded focus-based FIX1 row.
- Rollback is explicit: `window.__TALARIA_FRAME_GOV_V1 = false` in any reachable
  realm restores legacy cadence.

## Oracles

Required final oracles:

| Oracle | Pass condition |
| --- | --- |
| Idle paint | Clean static panels paint <= 1 full frame/s, down from ~131/s. |
| Bar delivery | Every bar at 10 bars/s is painted within 50 ms. |
| Crosshair | Crosshair p95 latency <= 33 ms. |
| A/B record | Four-metric A/B published after ship: idle paints/s, bar paint latency, crosshair p95, and dirty-skip %. |

Current landed unit:

- `f6ef6e5f2` adds the default-ON local governor and `frame-gov-v1.test.mjs`.
- That oracle covers clean-panel no-paint, 30 fps focused tier, 15 fps
  non-focused tier, input-fast bypass, explicit false rollback, and mirror
  markers.

## Remaining Work

- Add the shared multichart layout scheduler so there is one frame authority for
  the layout rather than one independent scheduler per panel realm.
- Extend diagnostics with dirty-skip %, per-panel pending frame slot, and the A/B
  metrics required for the record.
- Add browser-backed oracles for the three runtime thresholds: idle paint <= 1/s,
  10 bars/s paint latency <= 50 ms, and crosshair p95 <= 33 ms.
