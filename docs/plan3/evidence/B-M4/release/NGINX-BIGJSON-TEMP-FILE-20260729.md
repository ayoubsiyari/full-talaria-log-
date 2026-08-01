# /api/file big-JSON responses: stop spooling to disk

**Owner:** Manager B (explicit director grant, 2026-07-29 18:01)
**Path touched:** `homepage/nginx.local.conf` — bind-mounted into the live canary
**Gate:** `homepage/nginx-bigjson-buffering.test.mjs` (7 cells, 6 mutants, 0 survivors)
**Kill-switch:** `/opt/talaria/canary-nginx-bigjson-switch.sh {on|off|status}`
**A/B scripts:** `observations/_nginx-buffer-ab.sh`, `observations/_nginx-buffer-ab2.sh`

## The reported symptom

`nginx [warn] an upstream response is buffered to a temporary file` for
`GET /api/file/25/smart?timeframe=1m&limit=100000&anchor=end`, escalated as
"spools to a temp file before the client sees a byte".

## The premise was wrong, and the measurement says so

Round 1 of the A/B ran the real config against a trickling upstream (8MB over
~6s) with a fast client, buffering on versus off:

| arm | ttfb | total | temp-file warns |
|---|---|---|---|
| buffering on (control) | 0.0021s | 6.396s | 0 |
| buffering off | 0.0017s | 6.395s | 0 |

**`proxy_buffering on` does not delay the first byte.** nginx forwards the
response as it arrives; it does not wait for completion. So there was no
first-byte cost to recover, and no warn at all under that stimulus.

Buffering spools only when nginx can read from the upstream **faster than the
client consumes**. Round 2 changed the stimulus to match reality — upstream as
fast as the socket allows, client rate-limited to 1MB/s — and the warn appeared
immediately.

## What the cost actually is

One multi-MB **disk write per request**, on the same 81%-full disk that holds the
pinned canary images. Not latency. `$is_tile` is 1 for every path except
`/tile/`, so these routes are never cached either — the buffering bought nothing
here at all.

Disabling buffering would have removed the write, but it also hands slow-client
backpressure directly to the uvicorn workers, which is a worse failure mode than
a disk write. So: keep buffering, size the memory buffers so a normal candle
response fits, and forbid temp files.

```nginx
location ~ ^/api/file/[0-9]+/(smart|candles|bars|candles\.msgpack)$ {
    proxy_pass http://trading-chart:8000;
    proxy_buffer_size        32k;
    proxy_buffers            64 16k;   # 1MB in memory
    proxy_busy_buffers_size  64k;
    proxy_max_temp_file_size 0;        # never to disk
    proxy_cache              off;
}
```

## Round 3 — the result, isolated per route

Real config file, b99 image, throwaway network, client rate-limited:

| | control (pre-change) | fixed |
|---|---|---|
| warns after boot | 0 | 0 |
| after 3× `/smart` | **3** | **0** |
| after 1× `/meta` | 4 | 1 |
| tile cache | MISS then HIT | MISS then HIT |
| bytes / status | 4194304 / 200 | 4194304 / 200 |
| total (mean of 3) | 3.23s | 3.34s |

`/meta` still spooling in the fixed arm is the point, not a leak: it is a route
the block deliberately does not match, which proves the scoping is exact rather
than a blanket change to `/api/file/`. (The stub upstream returns 4MB for every
path, which is why a normally-small route spools at all here.)

**Cost:** ~3% on total transfer time for an artificially throttled client, because
nginx now paces the upstream instead of buffering ahead onto disk. First byte
unchanged. That is the trade, stated plainly: slightly slower worst-case transfer
for a slow client, no disk write, no cache regression.

## Deployment — reload only, the wire never moved

Applied by overwriting the mounted config and `nginx -s reload`. Verified:
`RECREATED=no`, `STAMP_BEFORE=STAMP_AFTER=20260729b99`, block present in
`nginx -T`, tile location intact, shell 200, `/api/file/...` 401 (auth-enforced,
not 502). Four reloads across deploy plus the switch test left
`.State.StartedAt` at `17:06:11Z`.

## Live before/after — real traffic, not the harness

Reload landed 18:18:18Z. Live error log, same container generation:

```
17:56:16 [warn] ... temporary file ... "GET /api/file/25/smart?timeframe=1m&limit=100000  client 160.90.31.98
18:05:45 [warn] ... temporary file ... "GET /api/file/25/smart?timeframe=1m&limit=100000  client 196.69.45.59
18:14:37 [warn] ... temporary file ... "GET /api/file/25/smart?timeframe=1m&limit=100000  client 196.69.45.59
--- reload 18:18:18Z ---
(none)
```

Three multi-MB disk writes in the 22 minutes before the change, all on the exact
reported URL, all from real client IPs; **zero in the 10 minutes and 2125 requests
after.** The symptom was real and recurring under the PO's own traffic, even though
the first version of my A/B could not reproduce it.

## Kill-switch, proven both ways

nginx has no runtime flag for this, so the switch is the config block itself.
`off` strips it and reloads, `on` restores it and reloads; both validate with
`nginx -t` inside the running container first and put the previous file back if
validation fails. Flipped live in both directions:

```
off  -> block_in_file=no  block_in_nginx=no
on   -> block_in_file=yes block_in_nginx=yes
```

Log: `/root/talaria-restore/NGINX-BIGJSON.log`. No container recreate either way.

## Why this survived to canary

`scripts/territory-preflight.mjs` reports `homepage/nginx.local.conf` as
**unowned — no manager owns this path**. It is exactly the between-territories
gap the director named. The grant is verbal so far; the manifest entry has to come
from the director, because the preflight (correctly) refuses a manager editing its
own territory.

Preflight state of the shipping commit, with trailers satisfied:

```
RED unowned: homepage/nginx.local.conf
RED unowned: homepage/nginx-bigjson-buffering.test.mjs
```

Both clear the moment the grant is recorded. Proposed entry, for the director to
paste under `managers: - id: B` / `owned_paths` in `docs/plan3/TERRITORY.yml`:

```yaml
      - pattern: homepage/nginx.local.conf
        provenance: ruling
        authority: director 20260729 18:01 - explicit grant of the /api/file proxy
          buffering finding. The preflight reported this path unowned, which is why
          a user-visible load cost survived to canary: it fell between territories.
          Scope is the proxy behaviour of the chart data routes; the auth,
          rate-limit and security-header directives in this file stay off limits.
      - pattern: homepage/nginx-bigjson-buffering.test.mjs
        provenance: ruling
        authority: same grant - the gate that holds the above
```

## Not fixed here

The response is still a single 100k-candle JSON. Streaming it as NDJSON, or
paging it, would cut both peak memory and time-to-first-candle far more than any
proxy setting — but that is an API-shape change in `api_server.py`, which is not
mine.
