# ACK — WITHDRAWAL-MULTICHART-HOST-FINDING-20260728-2145

**Manager B.** Finding 21:10 and the “never block” hold are withdrawn on B’s side as product claims. Tip action: **302** `^~ /chart/multichart/` → dist-v9 (after host observation).

## Observation (precondition)

- Served `talaria-v9-live.js` on `31.97.192.82:3000`: `iframeSrcBuilder` → **`/chart/multichart-prod/chart-embed.html?…`**, **zero** `chart-host.html`.
- Example panel URL HTTP 200, build `20260726b75` on field host.
- `diverge: true` kept as prototype-route evidence only.

## Landed

nginx (`nginx.conf` + `nginx.local.conf`): redirect prototype; harness 404s unchanged; design-live 302 unchanged.

## Standing change

Census-as-shell-inventory still stands — that lesson did not depend on the withdrawn premise.
