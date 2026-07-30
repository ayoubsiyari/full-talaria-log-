# TAL-01896 — TEST-02 resolution (named)

**Date:** 2026-07-30  
**Ticket:** TAL-01896 (trade duration norm)  
**Named verdict:** **needs a build**

---

## Binary choice (Director dispatch)

| Option | Chosen? |
|---|---|
| **needs a build** | **YES** |
| needs a better marker | no |

## Why “needs a build”

Live canary census (`WIRE-RUNTIME-PROBES-20260730b113.json`):

| Probe | Result |
|---|---|
| `/chart/talaria-design/src/orderManagerTradeRows.js` | HTML trap / not a JS module |
| Other guessed chart paths | not a module |
| Homepage `/_next/static/*` chunks linked from `/` | **0** hits for `tradeDurationNormV1Enabled` |
| Inlined into served `order-manager.js` / `chart.js` | **no** |

The kill-switch already exists in tip source (and in the b103 tree). The canary does **not**
serve that module on any auditable path. That is a **delivery / next-train build** item for B
(with #8 / 01807b), not a marker-vocabulary rewrite on D’s side.

Skip register keeps TAL-01896 open on b113; `--freeze` fails while it remains skipped.
