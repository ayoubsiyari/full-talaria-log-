# M1 — b120 Load Transient Defect

**Date:** 2026-07-31  
**Manager:** D  
**Harness:** `scripts/m1-b120-load-transient-harness.mjs`  
**Report:** `docs/plan3/M1-B120-LOAD-TRANSIENT-20260731.json`

## Verdict

`NEW_DEFECT`: routine page load decodes a lower-bound 141.57 MB screenshot transient before the resident surface settles.

This is separate from resident screenshots. Resident screenshots pass on b120: at the stable surface B measured 5.75 MB decoded floor, 1 full-res image, 160 thumbnails, and a journal-bearing session with 182 trades.

## Evidence

B's host artifact sampled the authenticated b120 route:

- final URL: `/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677`
- journal API: `200`, 182 trades, 395 screenshots in payload
- app-ready lower bound: 205 images, 28 data URLs, 29 full-res images, 160 thumbs, 141.57 MB decoded floor
- +1.5s: 83.48 MB decoded floor
- +6s stable: 5.75 MB decoded floor

The 141.57 MB figure is a lower bound because the sample starts at app-ready, after decoding began. The true peak may be earlier and higher.

## Harness Shape

The transient harness samples from navigation start instead of waiting for stability. The old resident harness still answers the settled question; it should not be used to classify load transient peak.

## Renderer Memory Lead

D's 4.85 MB-per-screenshot figure remains a live lead for C's V8/shared-isolate attribution, but it is not confirmed as the renderer residual cause.
