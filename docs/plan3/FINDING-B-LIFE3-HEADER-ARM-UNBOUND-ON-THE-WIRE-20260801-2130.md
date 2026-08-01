# FINDING (B) — LIFE-3's header arm is unbound on the deployed wire; its fallback arm carries the row

**2026-08-01 21:30** · manager B · found while collecting the post-deploy numbers for b121

---

## Summary

The chart shell on the deployed origin answers with **two conflicting `Cache-Control` headers and no
`no-store`**:

```
GET http://31.97.192.82:3000/chart/dist-v9/index.html
HTTP/1.1 200 OK
Content-Type: text/html
Cache-Control: max-age=3600
Cache-Control: public, must-revalidate
```

That is the same defect the Director described as LIFE-3's before-state, still present after LIFE-3
shipped. LIFE-3 is not fully bound on the wire.

This is **BIND-01 `RESOLVER_PRESENT_BUT_UNCALLED`** for the header arm.

---

## Why the fix is correct and still does nothing

`api_server.py` implements the header arm correctly and the switch is **on** by default:

- `_LIFE3_BFCACHE_DEFEAT_ENABLED` is opt-*out* (`TALARIA_DISABLE_BFCACHE_DEFEAT_V1`), unset in the container.
- The middleware sets `Cache-Control: no-store, must-revalidate` for `text/html` under `/chart`.

It never runs for the shell. `homepage/nginx.local.conf` serves `^~ /chart/` with `try_files $uri` and the
static export **contains** the shell:

```
/usr/share/nginx/html/chart/dist-v9/index.html   93144 bytes
```

so nginx answers from disk and never proxies to the backend. The two headers are nginx's own
`expires 1h` (→ `max-age=3600`) plus `add_header Cache-Control "public, must-revalidate"`.

Asking the backend directly proves the middleware is reachable only for paths that actually reach it.

**This is the fourth instance today of one shape of mistake:** the fix, and the gate that checked it, both
sat on the tier I had edited rather than the tier that serves the request. The other three were
PASSPORT-3's — the SHA passed to the wrong Dockerfile, the artifact never copied out of the build stage,
and the routing gate reading `nginx.conf` while the image bakes `nginx.local.conf`.

---

## What is NOT broken: the fallback arm is live

LIFE-3 was specified as *no-store **or** pagehide teardown if the nonce fails*. The fallback is deployed,
loaded and enabled:

| Check | Result |
|---|---|
| `/chart/modules/chart-window-limit.js` | 200, 37,504 bytes |
| `__TALARIA_BFCACHE_DEFEAT_V1` in deployed bytes | 2 occurrences |
| `pagehide` / `pageshow` handlers | 3 / 1 |
| Loaded by the served shell | `chart-window-limit.js?v=20260802b121` |
| Switch default | `!== false` → **on** |

So bfcache defeat is being attempted in the browser by the arm designed to cover exactly the case where
the header does not arrive. The row is functionally carried; the primary arm is inert.

---

## Residual risk, stated plainly

1. **Shell cacheable for an hour.** A ten-hour soak re-reading the shell could be served from cache. C's
   own badge-flip rehearsal detected a mid-run byte change, so their served-digest check is not defeated
   by this — but the margin is smaller than the design intends.
2. **Two `Cache-Control` headers is an ambiguity, not a stricter policy.** Which one a given intermediary
   honours is not something to reason about; it is something to remove.

I do **not** consider this soak-blocking, because the arm that does the work is live and C's digest
re-verification is independently proven. I do consider it round-two work with a named owner.

---

## The fix, when it is wanted

Not attempted before the seal: it needs a build, and per C a second cut must carry a **new badge**, not
re-use b121. The shape is a `map` on `$uri` so chart **HTML documents** keep serving statically (the
static tier exists to stop multichart saturating gunicorn — four documents × 40 modules) while getting
`expires off` and a single `no-store, must-revalidate`:

```nginx
map $uri $chart_cc { default "public, must-revalidate"; ~^/chart/.*\.html$ "no-store, must-revalidate"; }
map $uri $chart_exp { default 1h; ~^/chart/.*\.html$ off; }
```

applied in the `^~ /chart/` block, with the directory-index form (`/chart/dist-v9/`) covered too — it also
returns the shell and must not be missed.

A gate for this must assert against **`homepage/nginx.local.conf`** (the file the image bakes) and must be
shown red on a tree without the map. Repo-mode green on `nginx.conf` is what let this stand.
