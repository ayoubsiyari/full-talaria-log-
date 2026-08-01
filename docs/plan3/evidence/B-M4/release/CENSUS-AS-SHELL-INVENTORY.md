# Standing change — census is the shell inventory for every gate

**Director:** `FINDING-MULTICHART-HOST-SHELL-STALE-20260728-2110.md` §7  
**Owner:** Manager B (inventory derivation) → Manager C (gate consumption)  
**Effective:** 2026-07-28 21:10

---

## Why

Module-presence, reachability, and cache-stamp coherence all ran today and **all missed** `/chart/multichart/chart-host.html`, because each enumerated from its own list. That file was even marked `denied-route-pending` in `chart-shell-inventory.json` while the live host served it as the multichart panel loader.

**Every audit inherits its blind spots from its own inventory.** The census derives candidates from what the server actually serves (plus pinned expansions). That list is the only inventory that would have forced the panel shell into every gate.

## Rule

1. **`stamp-census.mjs` is the source of the servable shell list.**
2. Emit with `--emit-shell-inventory=scripts/servable-shells-from-census.json` (schema `TALARIA_SERVABLE_SHELLS_FROM_CENSUS_V1`).
3. **CACHE-STAMP-COHERENCE-V1**, module-presence, and reachability **must consume that file** (or re-run census and consume the fresh emit) instead of maintaining a parallel `CACHE_STAMP_SHELLS` / allowlist that can drift.
4. Rows with `neverBlock: true` (`/chart/multichart/*`) are **load-bearing** — gates may RED on content, never recommend 404/de-route.

## B delivers

| Artifact | Purpose |
|---|---|
| `stamp-census.mjs` `--emit-shell-inventory` | Machine list of HTTP 200 shells/engine/SW |
| `scripts/servable-shells-from-census.json` | Checked-in emit from the last sealed census run (refresh on each census) |
| This doc | Standing rule for A/B/C |

## C owns

Replace hardcoded `CACHE_STAMP_SHELLS` (and peer gate lists) with the census emit. Show module-presence **RED** against today's `chart-host.html` before trusting that gate (GATE-01 / Director §6).

## A owns

Shell repair on `chart-host.html` / `multichart-shell.html` — stamp engine, restore module list, move a10 pins. Not a de-route.
