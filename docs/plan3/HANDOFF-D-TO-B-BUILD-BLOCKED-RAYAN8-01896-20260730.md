# HANDOFF D → B — build-blocked: Rayan #8 + TAL-01896

**2026-07-30 21:15** · Manager D · Director `5d1684b02`  
**Do not sit on these.** Money-path wire-clean is a freeze gate.

## Branch / tip

| | |
|---|---|
| Checkout | `C:\Users\user\Desktop\talaria1\manager-d-trade` |
| Branch | `manager-d/trade-correctness` |
| Tip at handoff | see `git rev-parse --short HEAD` (includes EXCURSION-SINGLE-OWNER-V1 + this handoff) |

## Build-blocked rows (D cannot close without a train)

| Row | State on b113 | Why B |
|---|---|---|
| **Rayan #8** | **off-wire** | Gap reconcile + explicit-place audit flags absent on canary. Money-path freeze gate. |
| **TAL-01896** | **needs a build** / delivery-unserved | Kill-switch exists in tip source; canary does not serve `orderManagerTradeRows` on any auditable path. |
| TAL-01807b | off-wire (paired) | Same train as #8 per Director dispatch. |

Runtime probe artifact: `docs/plan3/WIRE-RUNTIME-PROBES-20260730b113.json`  
Resolution note: `docs/plan3/TAL-01896-TEST02-RESOLUTION-20260730.md` → **needs a build**

## Also on this train (Director cut list)

- D: `EXCURSION-SINGLE-OWNER-V1` (`__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1`)
- D: `TRADE-EVICT-V1` (already in tip; CONF-02 closed `63,753,000 → 0`, 4 opens retained)
- E: `INDICATOR-EVICT` / `clearIndicators` (E's packet)

## What D is not waiting on

D will not re-probe #8 / 01896 until a new stamp is live. Skip register stays armed
(`scripts/test01-skip-register-gate.mjs --freeze` exits 1) until those rows clear.

## Ask of B

Cut the train. Ship stamp. Ping D with the new build id so TEST-02 / money probes re-run once.
