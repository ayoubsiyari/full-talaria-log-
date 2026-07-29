# Standing order — canary auto-ship (Manager B)

**When:** 2026-07-29  
**Authority:** Director standing order after b83 green.

## Do without asking

Whenever `manager-a/critical-path` advances with product merges:

1. Cherry-pick / assemble onto B tip  
2. Stamp next `20260729bNN` (monotonic)  
3. Ship to **`31.97.192.82` only** via `canary-checkpoint-one-action.sh`  
4. Full verify: SURF-3 live GREEN + fixture RED; stamp-census holes=0; deploy-gate markers PRESENT; new flags reachable at runtime  
5. **FLAG-01 + FLAG-02 on every new switch** per `FLAG-BISECT-VERIFY-PROTOCOL-20260729.md` — fail = **blocking defect**, not a footnote (bisect depends on independent runtime toggle without reload)  
6. Journal and continue — **do not wait / ask between deploys**

## Exceptions (still need Director)

- Anything touching **`talaria-log.com`** / production origin (closed)  
- Any deploy that **removes a route** or **changes a public URL**  

## Gap work when A is quiet

- C calibration handoff (`HANDOFF-C-HEAP-CENSUS-LIVE-CANARY-20260729.md`, cookie jar `c-canary-login-cookie.mjs`)  
- Canary disclosure draft polish  
- Poll A tip for the leak-suspect burst  

## Current floor

**`20260729b85` live** — PURGE-1/2 + A's canonical `chart.js` (P3) + LEAK-C (`MC_CLEARFILE_ON_REMOVE_V1`).  
B does **not** write `chart.js`; escalate leak shots that need it.

