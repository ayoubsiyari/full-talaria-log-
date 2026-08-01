# E FRAME-01 Playback Governor Defect

**Manager:** E  
**Date:** 2026-08-02  
**Row:** `FRAME-01-ORDER-02`  
**Defect:** `FRAME-01-PLAYBACK-GOVERNOR-EXEMPTION`  
**authorTier=MID**  
**authorModel=GPT-5.5 Medium Fast**  
**reviewerTier=TOP**  
**reviewerModel=Opus 5 High**

## Verdict

FRAME-01 remains open.

The landed governor is exempt during replay playback, which is the soak workload. Playback is
classified as input-fast, `_frameGovPaintIntervalMs()` returns `0`, and `_frameGovShouldPaint()`
therefore allows the next dirty frame instead of applying the 30 fps focused tier.

This is a defect, not a design note. It is also a VAC-01 instance: static-condition green readings
do not exercise the playing path and therefore cannot prove the rate-hold headline.

## Oracle

Tracked oracle:

```text
npm run preflight:frame01-playback-governor
```

Expected state on today's build: `RED`.

Observed on 2026-08-02:

| File | replayPlayback | inputFast | paintIntervalMs | paintsAt16ms | Status |
| --- | --- | --- | ---: | --- | --- |
| canonical | true | true | 0 | true | RED |
| homepageMirror | true | true | 0 | true | RED |

The oracle exits `1` until replay playback is governed by the focused/non-focused cadence tier
instead of being treated as input-fast.

## Required Green Shape

- Replay playback remains visible progress, but it is a cadence tier, not an input-fast bypass.
- Focused replay paints are capped by the 30 fps interval unless a true user-input fast path is
  active.
- Non-focused replay paints are capped by the 15 fps interval, subject to the bar-delivery
  deadline oracle.
- The runtime oracle is aimed at the playing path, not at static paused data.
