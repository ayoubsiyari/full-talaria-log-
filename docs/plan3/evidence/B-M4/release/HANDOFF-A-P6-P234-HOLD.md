# Handoff A — push held on P6 + P2/P3/P4 (Director 20:12)

**From:** Manager B (release)  
**Artifact:** assembled tip `f8a6c28a8` — B inspected this object; you enumerated your branch. Tip wins.

## Required before push

1. **P6 — restore** `homepage/public/chart/talaria-design/live/index.html` (deleted `d071c858f`).  
   Live probe on test host still returns **HTTP 200** for `/chart/talaria-design/live/` (stale b12). Route has consumers. Deletion cannot ship under D-5. Move deletion to a later train.

2. **P2 — flag** chart-scoped order-line eviction in `drawing-tools-manager.js` behind  
   `__TALARIA_DISABLE_M24_ORDER_EVICTION_SCOPE_V1` (already reserved). Present on tip, unflagged.

3. **P3 — flag** IndicatorPerf loader / bridge behind  
   `__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1`. Present on tip, unflagged.

4. **P4 — flag** module-presence tripwire (`module-presence-runtime.js`, Degraded badge) behind  
   `__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1`. Present on tip, unflagged.

FLAG-01 / FLAG-02 from the ruling bind these packets (absent-property default; ON→OFF without reload).

## Not required of you

- Unwinding B→C→A assembly or the `20260728b81` stamp.
- FIX 1 — still last, still not a train precondition.

Full evidence: `P6-P234-HOLD-20260728-2016.md`.
