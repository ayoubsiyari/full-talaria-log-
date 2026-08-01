# Handoff C — consume census shell inventory

**From:** Manager B  
**Re:** Director finding 21:10 §6–7  

`scripts/servable-shells-from-census.json` is now the SoT list of shells the server actually served (HTTP 200). Schema `TALARIA_SERVABLE_SHELLS_FROM_CENSUS_V1`.

**Required:**

1. `CACHE_STAMP_SHELLS` (and peer gate lists) must load from that file — or fail closed if missing/stale relative to the last census.
2. Include `/chart/multichart/chart-host.html` and `multichart-shell.html` (`neverBlock: true`, roles `multichart-panel-host` / `multichart-shell`).
3. Module-presence must go **RED** on today's `chart-host.html` (missing `indicator-performance.js` and `module-presence-runtime.js`) before that gate is trusted again.
4. Do **not** treat inventory status `denied-route-pending` on these paths as authority to de-route — live consumer evidence + Director: this **is** the multichart feature.

See `CENSUS-AS-SHELL-INVENTORY.md`.
