# M1 — b120 Real-App Harness Fire

**Date:** 2026-07-31  
**Manager:** D  
**Harness:** `scripts/m1-b118-real-app-harness.mjs`  
**Artifact:** `docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json`

## Verdict

Bounded M1 host fire completed through B's credential route. It is **not GREEN**, and M1 is closed as an auth-solved harness measurement-window defect, not as a product pass.

| Field | Value |
|---|---|
| measuredAt | `2026-07-31T18:23:36.836Z` |
| build | `20260731b120` |
| expected | `b120` |
| authenticated route | solved on host; `onLogin: false`, chart loaded, `6242` bars |
| final URL | `/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677` |
| journal API | `200`, `182` trades, `395` screenshots in payload |
| settled harness verdict | `UNPROVEN` |
| settled reason | `no-journal-image-surface-detected` |

This confirms the real app served b120, reached a journal-bearing product page, and removed the `UNPROVEN_LOGIN_PATH` blocker. The remaining issue is D's harness sampling window: the stable surface misses the transient full-size image peak.

## Harness Peak Note

B sampled the same authenticated route from app-ready instead of after D's stability wait:

| Moment | Images | Data URLs | Full-res | Thumbs | Decoded pixel floor |
|---|---:|---:|---:|---:|---:|
| app ready | 205 | 28 | 29 | 160 | 141.57 MB |
| +1.5s | 193 | 16 | 17 | 160 | 83.48 MB |
| +6s stable | 177 | 0 | 1 | 160 | 5.75 MB |

Applying D's classifier to the early surface gives `RED / full-resolution-images-still-resident`; applying it to the stable surface gives `UNPROVEN / no-journal-image-surface-detected`. Because `collectStableImageSurface` requires three identical one-second samples, it selects the quiet state after the peak has decayed. `journalLikeImages` stayed `0` at every sample, so D's current entry condition and stability condition are mutually exclusive on this route.

M1 is therefore closed as: auth solved, b120 product route proven, current D harness not valid for the peak-footprint claim. The early `141.57 MB` is a lower bound, not a true peak.

## Bounds

This was a single bounded run: no `--wait`, no watcher, no multi-hour loop. It avoids the earlier `4294967295` non-evidence shape and exits non-zero because the verdict is not `GREEN_CANDIDATE`.

## Verification

- `test:m1-b120-real-app` — PASS
- `preflight:m1-b120-real-app` with `M1_EXPECTED_BUILD=b120` — READY
- B host run — auth solved, settled artifact `UNPROVEN`, harness peak miss documented

## Ownership Update

As of B's 19:35 handoff, ownership is back with D and M1 is closed on the host artifact. No further login-path runs are warranted.
