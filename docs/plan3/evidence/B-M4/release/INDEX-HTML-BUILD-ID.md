# `/chart/index.html` build-id stamp · 2026-07-28

## What was wrong

The source stub `chart v 1.4/chart/index.html` carried **no** `__TALARIA_CHART_BUILD_ID`.
It was not in `bump-dist-v9-cache.mjs` and not checked by `checkpoint-provenance`
`verifyTreeLayout`. A PO session that landed on the fallback path (dist-v9 absent)
could not be named.

## What ships now

1. Stub declares `window.__TALARIA_CHART_BUILD_ID` + `<meta name="talaria-chart-build-id">`.
2. `bump-dist-v9-cache.mjs` rewrites those on every `--dist` / checkpoint build.
3. `verifyTreeLayout` fails the build if the stub is present and its id ≠ expected.

Floor id in tree: `20260728b81` (matches the train's `CHART_BUILD_ID` floor).

## Authenticated delivery (do not misread)

On the running stack, nginx `try_files` misses `public/chart/index.html` and proxies
to trading-chart. Auth middleware redirects unauthenticated clients to `/login/`.
**Authenticated** `/chart/index.html` is `FileResponse(dist-v9/index.html)`, which
was already stamped. Stamping the stub closes the **fallback** and **source** gap;
it does not replace reading `window.__TALARIA_CHART_BUILD_ID` from the live V9
shell (or running the probe with `--cookie`).

Do **not** copy a full chart into `homepage/public/chart/index.html` to make
`try_files` hit — that would bypass the auth middleware on the static path.
