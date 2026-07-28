# P6 remedy — redirect (corrected after Director 21:00)

**Director 20:40 item 2** + **`RULING-DO-NOT-404-MULTICHART-20260728-2100.md`**.  
Requirement: the route stops serving stale code.  
**Choice for design-live:** 302 to canonical V9 (cheaper than keeping the twin current).

## Rule (general correction)

**Redirect by default. 404 only where proven unused.**  
A 302 satisfies “stops serving stale.” A 404 additionally breaks any consumer — same unsafe class as deleting a 200 route without consumer evidence (the P6 hold B already applied to A).

## What lands

| File | Change |
|---|---|
| `homepage/nginx.local.conf` | `location ^~ /chart/talaria-design/live` → `302 /chart/dist-v9/index.html` **before** the `/chart/` try_files block |
| `homepage/nginx.conf` | Same prefix location **before** the regex proxy to trading-chart |
| Both | `404` only for proven harness prefixes: `m20-a-favorites-harness`, `m21-2-browser-harness` |

## Held — do not ship

| Prior plan | Status |
|---|---|
| `location ^~ /chart/multichart/ { return 404; }` | **REMOVED.** Live consumer evidence: panels resolve to `/chart/multichart/chart-host.html` (**a10**). See `ESCALATE-MULTICHART-A10-20260728-2105.md`. |

## Interaction with A's restore

A still restores `homepage/public/chart/talaria-design/live/index.html` so the deletion is not in the tip. The redirect means even a restored or COPY'd twin **cannot** be loaded as a chart shell — bookmarks and old links land on dist-v9.

## Verify after deploy

```
# must be 302 (or 301), Location: …/chart/dist-v9/index.html
curl -sI http://<host>/chart/talaria-design/live/index.html

# must remain 200 (not 404) until product cutover lands
curl -sI http://<host>/chart/multichart/chart-host.html
curl -sI http://<host>/chart/multichart/multichart-shell.html

node docs/plan3/evidence/B-M4/live-surface-probe/stamp-census.mjs \
  --base-url=http://<host> --current=20260728b81
# design-live rows must be REDIRECT, not STAMPED_200
# multichart rows remain STAMPED / unstamped holes until A cutover — escalate, do not gate-fail via 404
```
