# D Late Money-Path Picks

**Manager:** D  
**Date:** 2026-08-01  
**Packet:** `D-LATE-MONEY-PICKS-V1`  
**Reviewer:** B  

## Scope

PO ruling `RULING-PO-ORDERS-ALL-18-LAND-BEFORE-THE-SEAL-CHERRY-PICKS-PARALLELISED-20260801-1455.md`
assigns D the money-path late picks:

| Row | Source | Landing status | Predicted contribution before soak |
| --- | --- | --- | --- |
| `COVER-LOOP-SAFETY` | `1c7fe2d912` | Landed as `206571f26`, then integrated with inflight wedge | Lag/network safety. Prevents unbounded `ensureReplayDataCoversTimestamp` re-dispatch when the host playhead advances during an inflight cover. Expected steady memory contribution near zero unless the soak hits this stalled-cover path; primary value is avoiding replay fetch storms and main-thread/network churn. |
| `COVER-INFLIGHT-WEDGE` | `fc7a80b958` | Landed as `b5a85d4ac`, then integrated with cover-loop safety | Replay correctness/availability. Prevents a settled promise from wedging the cover slot forever after pre-await exits. Expected memory contribution near zero; lag contribution only if the soak previously wedged cover acquisition and retried/short-circuited. |
| `M17-DI2 / TAL-01918` | `db3546e8ef` | Landed as `54d2a3138` | Trade/replay correctness. Guards completed bars from close/high/low mutation across four sites. Expected memory and lag contribution approximately zero; this is correctness risk removal. |
| `M23 rollback trade-state` | `4327f8f5f2` | Already present on D tip; cherry-pick resolved empty and was skipped | Trade lifecycle correctness. Permanent-cancel path is already on D with the stronger GATE-01 kill-preload control. Expected memory and lag contribution approximately zero; this prevents rollback resurrection/double-count trade state. |
| `ORDER-GLOW-GC-V1` | `6afb8006a3` | Landed as `774c799b4`, with test harness updated for D-tip M24 helper deps | Memory retention. In the gate's real Blink DOM scenario, fixed path returns to baseline after 120 order cycles while kill/legacy retains 480 filters after cycles and 530 filters after strip. Expected trade-arm contribution is proportional to order-marker churn; zero-trade contribution is approximately zero. Paint contribution is predicted near zero because KILL-02 showed unreferenced filters have no raster dose response. |

## Integration Notes

- E's published claim `E-LOADER-CACHE-LATE-PICKS-V1` covers only `LEAK-G`, `LEAK-F`, `LEAK-I`, and `LEAK-A`;
  no overlap with this D packet.
- `COVER-LOOP-SAFETY` and `COVER-INFLIGHT-WEDGE` both edit `ensureReplayDataCoversTimestamp`; conflict resolution
  keeps both invariants:
  - publish only genuinely inflight cover promises;
  - re-arm self-dispatch only when `_coverRedispatchShouldRearm(...)` allows it;
  - preserve resume-guard catch/return-false behavior while the resume kill-switch restores rejection.
- `M23` was skipped as a duplicate because D already carried the product content and stronger test additions.

## Verification

Green on D branch after integration:

- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/cover-loop-safety.test.mjs" "chart v 1.4/chart/modules/cover-inflight-wedge.test.mjs" "chart v 1.4/chart/modules/order-glow-filter-gc.test.mjs"`
  - `85` tests passing.
- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/m17-di2-completed-bar-guard.test.mjs" "chart v 1.4/chart/modules/m23-rollback-trade-state.red.test.mjs"`
  - `28` tests passing.
- Mirror parity checked with `git diff --no-index` for:
  - `chart.js`
  - `modules/order-manager.js`
  - `modules/replay-system.js`
- IDE diagnostics: no linter errors on touched product/test files.

## Review Ask

B should review the three new D commits plus the integration follow-up:

- `206571f26` `COVER-LOOP-SAFETY`
- `b5a85d4ac` `COVER-INFLIGHT-WEDGE`
- `54d2a3138` `M17-DI2 / TAL-01918`
- `774c799b4` `ORDER-GLOW-GC-V1`
- integration commit following this handoff

M23 remains a D-tip carry-forward, not a new pick in this packet.
