# P6 remedy — redirect, prepared before A's restore

**Director 20:40 item 2.** Requirement: the route stops serving stale code.  
**Choice:** 302 to canonical V9 is cheaper than keeping the homepage twin current.

## What lands

| File | Change |
|---|---|
| `homepage/nginx.local.conf` | `location ^~ /chart/talaria-design/live` → `302 /chart/dist-v9/index.html` **before** the `/chart/` try_files block |
| `homepage/nginx.conf` | Same prefix location **before** the regex proxy to trading-chart |

Also closes related census holes (same class — unstamped / ancient HTML under `/chart/`):

- `/chart/modules/m20-a-favorites-harness/` → 404
- `/chart/modules/m21-2-browser-harness/` → 404
- `/chart/multichart/` → 404 (chart-host a10, unstamped shell)

## Interaction with A's restore

A still restores `homepage/public/chart/talaria-design/live/index.html` so the deletion is not in the tip. The redirect means even a restored or COPY'd twin **cannot** be loaded as a chart shell — bookmarks and old links land on dist-v9. Restore + redirect land together; neither alone is enough under D-5 (restore without redirect can drift again; redirect without restore leaves a confusing deleted twin in git).

## Verify after deploy

```
# must be 302 (or 301), Location: …/chart/dist-v9/index.html
curl -sI http://<host>/chart/talaria-design/live/index.html
node docs/plan3/evidence/B-M4/live-surface-probe/stamp-census.mjs \
  --base-url=http://<host> --current=20260728b81
# design-live rows must be REDIRECT, not STAMPED_200
```
