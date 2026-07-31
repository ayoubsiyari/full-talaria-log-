# M1 — b120 Real-App Harness Fire

**Date:** 2026-07-31  
**Manager:** D  
**Harness:** `scripts/m1-b118-real-app-harness.mjs`  
**Artifact:** `docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json`

## Split Verdicts

Bounded M1 host fire completed through B's credential route. Auth is solved, and M1 is split into two verdicts because resident screenshots and the load transient are different defects.

| Field | Value |
|---|---|
| measuredAt | `2026-07-31T18:23:36.836Z` |
| build | `20260731b120` |
| expected | `b120` |
| authenticated route | solved on host; `onLogin: false`, chart loaded, `6242` bars |
| final URL | `/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677` |
| journal API | `200`, `182` trades, `395` screenshots in payload |
| resident screenshots | `PASSED` — 5.75 MB steady floor, 1 full-res, 160 thumbs |
| load transient | `NEW_DEFECT` — lower-bound 141.57 MB at app-ready |

This confirms A's journal fix on the real app for the resident case: after settle, screenshots are not staying resident as full-size data URLs. The separate load-transient defect remains: routine page load decodes a lower-bound 141.57 MB before the resident surface settles.

## Harness Peak Note

B sampled the same authenticated route from app-ready instead of after D's stability wait:

| Moment | Images | Data URLs | Full-res | Thumbs | Decoded pixel floor |
|---|---:|---:|---:|---:|---:|
| app ready | 205 | 28 | 29 | 160 | 141.57 MB |
| +1.5s | 193 | 16 | 17 | 160 | 83.48 MB |
| +6s stable | 177 | 0 | 1 | 160 | 5.75 MB |

Applying D's old single classifier to the early surface gives `RED / full-resolution-images-still-resident`; applying it to the stable surface gives `UNPROVEN / no-journal-image-surface-detected`. That was a harness design bug: it asked one classifier to answer both resident and transient questions. The split harness records resident screenshots as `PASSED` and the load transient as `NEW_DEFECT`.

The early `141.57 MB` is a lower bound, not a true peak. B sampled at app-ready after decoding had already begun. Because page load is a routine user action, this gets its own harness: `scripts/m1-b120-load-transient-harness.mjs`.

## Renderer Memory Lead

D's earlier 4.85 MB-per-screenshot figure remains a live lead for C's V8/shared-isolate attribution, but it is not confirmed as the renderer residual cause.

## Bounds

This was a single bounded run: no `--wait`, no watcher, no multi-hour loop. It avoids the earlier `4294967295` non-evidence shape and exits non-zero because the verdict is not `GREEN_CANDIDATE`.

## Verification

- `test:m1-b120-real-app` — PASS
- `preflight:m1-b120-real-app` with `M1_EXPECTED_BUILD=b120` — READY
- `test:m1-b120-load-transient` — PASS
- B host run — auth solved, resident screenshot verdict `PASSED`; load transient verdict `NEW_DEFECT`

## Ownership Update

As of B's 19:35 handoff, ownership is back with D and M1 is closed on the host artifact. No further login-path runs are warranted.
