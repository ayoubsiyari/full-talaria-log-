# FINDING — `/chart/index.html` → chart-container `b75`; `/chart/dist-v9/` → homepage `b82`

**2026-07-28 ~23:58Z. Manager B. Read-only. No restart, no rebuild, no deploy.**

Director trigger: `RULING-ONE-CANONICAL-ENTRY-BUILD-AGREEMENT-GATE-20260729-0055.md`. Shell-sync on `/chart/index.html` **stopped** — that URL does not read a homepage `chart/index.html` file.

---

## Verdict

The dual build is real and explained by **two filesystems**, not by tip `api_server.py` routing diverging.

| URL | Who answers | File | Build |
|---|---|---|---|
| `/chart/dist-v9/index.html` | `talaria-homepage-1` nginx `try_files` hit | `/usr/share/nginx/html/chart/dist-v9/index.html` | **`20260728b82`** (mtime Jul 28 21:28) |
| `/chart/index.html` | homepage miss → `@chart_upstream` → `talaria-trading-chart-1` | `/app/dist-v9/index.html` via `FileResponse` | **`20260726b75`** (mtime Jul 27 00:42) |

Authenticated probe (QA login): index=`20260726b75` (90280 B, no `indicator-performance.js`); dist-v9=`20260728b82` (90458 B, has it). Observation: `observations/auth-chart-index-stamp-2026-07-28T23-53-38-404Z.json`.

Tip source cannot do this: `_DIST_V9_INDEX_PATH` and `_DIST_V9_DIR_PATH` are the same folder, both committed copies `b82`, and tip has **no** `homepage/public/chart/index.html` (stub only under `chart v 1.4/chart/index.html`).

---

## What `/chart/index.html` resolves to inside the running stack

1. Homepage nginx root: `/usr/share/nginx/html` (`nginx -T`).
2. **`/usr/share/nginx/html/chart/index.html` — absent** (confirmed `ls`: No such file).
3. `location ^~ /chart/ { try_files $uri $uri/ @chart_upstream; }` → proxy to `trading-chart:8000`.
4. Chart container gunicorn (`api_server:app`) serves `FileResponse("/app/dist-v9/index.html")` for `/chart/index.html`.
5. That file is still the **image-era b75** shell. Hot-patch updated `api_server.py`, `chart.js` (`CHART_ENGINE_BUILD='20260728b82'`), and `modules/order-manager.js` on disk, but **did not replace `/app/dist-v9/index.html`**.

Homepage mounts are **only** nginx conf binds — chart static lives in the homepage image/layer and was docker-cp’d / overwritten under `/usr/share/nginx/html/chart/` during hot-patch (dist-v9 + modules mtimes Jul 28 21:28–22:06). No tip bind-mount of the chart tree into either container.

---

## Does the process predate the hot-patch?

| Fact | Value |
|---|---|
| Chart container **Created** | `2026-07-27T01:02:29Z` (image `ghcr.io/.../talaria-trading-chart@sha256:f6c26409bd1e…`) |
| Chart container **StartedAt** | `2026-07-28T21:59:31Z` — **restarted during the hot-patch window** |
| Homepage **Created/Started** | `2026-07-28T22:06:54Z` / `22:06:55Z` |
| Chart `dist-v9/index.html` mtime | **Jul 27 00:42** — predates hot-patch; still b75 |
| Chart `api_server.py` / `chart.js` mtime | Jul 28 21:28 — hot-patched bytes on disk |
| Process | gunicorn, 2 UvicornWorkers, bound `:8000` |

**Nuance for the Director’s “routing table” hypothesis:** the running Python process was restarted after the `api_server.py` hot-patch, so it is **not** an unreloaded pre-patch interpreter. The lie is simpler: **nginx and the chart container each hold a different `dist-v9/index.html`**, and only the homepage copy was updated to b82. Tip routing (same file for both URLs) is correct *inside one process*; the edge split makes the two URLs read different trees.

**Do not restart/rebuild yet** — C needs this host as the SURF-3 RED fixture.

---

## Shell-sync stop

Any plan that “syncs” or patches `/chart/index.html` on the homepage tree would write a file **this URL does not currently read** (absent → upstream). Stopped. Repair, when authorized, must update **`talaria-trading-chart-1:/app/dist-v9/`** (and/or make homepage serve a canonical index that is the same bytes), without destroying C’s RED fixture until go-ahead.

---

## Evidence paths

- `observations/host-ro-dual-build-inspect.log`
- `observations/host-ro-dual-build-inside.log` (partial; stamp loop syntax abort after path listing)
- `observations/host-ro-dual-build-chartfiles.log`
- `observations/auth-chart-index-stamp-*.json`
- `dual-build-path-probe.mjs` / `auth-chart-index-stamp-probe.mjs`
