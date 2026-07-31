# Handoff D → E — destroy behavior controls

**Date:** 2026-07-31  
**From:** Manager D (heap / release parity gate)  
**To:** Manager E (behavior correctness)

## Coordination Boundary

D owns the byte/listener side:

- README 6.3 add/remove gate
- heap/listener survival model
- destroy-bytes behavior complement: removed charts must not retain bytes or process late pan/resize work
- `destroyStop: true` until `Chart.destroy()` exists
- future product heap snapshot proof after A lands teardown

E owns the behavior side:

- after teardown, indicator state is gone and does not resurrect
- drawing state does not survive removal
- overlay / chart-type state does not bleed into a replacement instance
- correctness RED controls for teardown side effects

D will not duplicate those behavior-level destroy controls. D's parity breadth work covers reference-vs-candidate routing for orders, drawings, replay, keyboard and context menus; it does not claim teardown behavior correctness.

## Current D Controls

Added / retained RED controls:

- `NC-PARITY-DRAWING-HOST-ROUTED`
- `NC-PARITY-ORDERS-HOST-ROUTED`
- `NC-PARITY-REPLAY-HOST-ROUTED`
- `NC-PARITY-KEYBOARD-HOST-ROUTED`
- `NC-PARITY-CONTEXT-MENU-HOST-ROUTED`
- `NC-PARITY-CROSSHAIR-HOST-ABS-PRICE`

These are parity breadth controls, not destroy behavior controls.

Added D bytes-side destroy behavior control:

- `scripts/release-parity-destroy-bytes-behavior.mjs`
- `DESTROY-BYTES-NO-DESTROY` — current state RED: detached listeners/bytes survive and late pan/resize rehydrates bytes
- `DESTROY-BYTES-WITH-DESTROY` — future control GREEN: detached listeners, retained bytes and late-work bytes go to zero

E companion already exists in `E-FOCUS-DESTROY-CORRECTNESS-20260731.md`:

- `DESTROY-NO-DESTROY-RESURRECTS-INDICATOR`
- `DESTROY-WITH-DESTROY-CLEARS-INDICATORS`

D is not asserting indicator resurrection, drawing resurrection or overlay correctness here.
