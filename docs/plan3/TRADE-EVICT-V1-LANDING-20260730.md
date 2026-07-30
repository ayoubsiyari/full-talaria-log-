# TRADE-EVICT-V1 landing

**Tip at landing:** see `git log -1` on `manager-d/trade-correctness`  
**CKPT-01:** `ckpt/pre-d-trade-evict-v1-6ba61eeeb` (`CKPT01-D-TRADE-EVICT-V1-20260730.md`)  
**Flag:** `__TALARIA_DISABLE_TRADE_EVICT_V1` (default ON; truthy disables)

---

## Steps completed

| Step | Status |
|---|---|
| 1 Cold-read proof | Accepted earlier — journal-only trade serves MAE/MFE/path/screenshots |
| 2 Playhead bound (EVICT-02) | Post-exit completion playhead **T**; rewind `t < T` restores |
| 3 Evict on bound | Release screenshot + excursion hot fields; drop from `mfeMaeTrackingPositions`; keep id + entry/exit for arrows |
| 4 Kill-switch FLAG-01/02/03 | GREEN + RED gates |
| 5 EVICT-01 both numbers | Bytes-down **and** cold retrieval (step 1) |

## EVICT-01 measurement (fixture)

| | Bytes (approx UTF-16 hot fields) |
|---|---:|
| Before eviction | **98 306** |
| After eviction | **0** |
| Journal cold copy | intact (screenshots + path series) |

Method: `_tradeEvictV1ApproxHotBytes` over
`entryScreenshot` / `exitScreenshot` / `screenshotBase64` / `chartImage` / `thumbnail` /
`railScreenshots` + in-trade/post-exit excursion arrays.

## EVICT-02

- Bound keyed to **playhead** (`currentCandle.t` at post-exit completion), never wall clock.
- `_tradeEvictV1SyncPlayhead` on every `updatePositions` tick and at `updateMfeMaeTracking` entry.
- Rewind behind T: rehydrate from journal; re-queue sampling while still inside the post-exit window.

## Gates

```bash
node "chart v 1.4/chart/modules/trade-evict-v1.test.mjs"          # GREEN → 0
node "chart v 1.4/chart/modules/trade-evict-v1.red.test.mjs"      # RED → ≠0
node --test "chart v 1.4/talaria-design/src/trade-evict-v1-cold-read.test.mjs"
```

Homepage mirrors under `homepage/public/chart/modules/`.

## What this kills

1. **Memory** — per-order base64 screenshot fields left in `closedPositions` after M19-C strip-from-persist.  
2. **CPU** — post-exit sampling membership ends at bound; rewind can re-queue only while `close < t < T`.
