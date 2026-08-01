# P6 + prototype de-route — redirect (post-WITHDRAWAL 21:45)

**Directors:** 20:40 item 2; `WITHDRAWAL-MULTICHART-HOST-FINDING-20260728-2145.md`.  
**Rule:** redirect by default; 404 only where proven unused (harness prefixes).

## What lands

| Prefix | Action |
|---|---|
| `^~ /chart/talaria-design/live` | `302 /chart/dist-v9/index.html` |
| `= /chart/multichart` and `^~ /chart/multichart/` | `302 /chart/dist-v9/index.html` |
| `^~ /chart/modules/m20-a-favorites-harness/` | `404` |
| `^~ /chart/modules/m21-2-browser-harness/` | `404` |

**Critical:** the multichart location uses a **trailing slash** (`/chart/multichart/`) so **`/chart/multichart-prod/` is not matched**.

## Precondition (observed before landing)

Tool: `prod-panel-iframe-observe.mjs`  
Evidence: `observations/prod-panel-iframe-observe-2026-07-28T20-52-15-297Z.json`

| Check | Result |
|---|---|
| Served V9 asset `iframeSrcBuilder` | present |
| `chart-host.html` refs in V9 asset | **0** |
| Production builder return | **`/chart/multichart-prod/chart-embed.html?...`** |
| That URL on host | HTTP 200, build id present |
| Prototype `/chart/multichart/*` | still 200 pre-redirect (expected) |

**Nuance for Director:** withdrawal text said “dist-v9 iframes”; the **running** V9 asset on this host builds **`chart-embed.html`** (stamped panel shell under `multichart-prod`). That is production. It is **not** `/chart/multichart/chart-host.html`. Redirect of the prototype prefix does not touch it.

## History

- B-0140 held a **404** on `/chart/multichart/` under the (withdrawn) live-loader reading.
- WITHDRAWAL 21:45: route is dead prototype → **302**, same class as design-live.
- `diverge: true` (defect-one probe) remains sound for the **prototype** only; not production panels.

## Verify after deploy

```
curl -sI http://<host>/chart/multichart/chart-host.html
# → 302 Location: …/chart/dist-v9/index.html

curl -sI http://<host>/chart/multichart-prod/chart-embed.html
# → 200 (must NOT redirect)

curl -sI http://<host>/chart/talaria-design/live/index.html
# → 302 → dist-v9
```
