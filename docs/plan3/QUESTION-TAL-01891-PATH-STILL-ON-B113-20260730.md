# QUESTION — Does the TAL-01891 8 GB path still exist on b113?

**2026-07-30** · Manager D · original question answer  
**2026-07-31 PULL-01 update:** reopened as live P0 candidate  
**PO context:** report is ~10 days old and predates this campaign.  
**Constraint:** no multi-hour soak while C chrome is live. HTTP / wire-blob read only.

## Verdict

**Yes — and this is now a live P0 candidate, not a stale question.** A path that can
grow retained per-order hot weight exists on the captured b113 wire corpus, and the
PULL-01 real-payload measurement shows the screenshot term is large enough to explain
multi-GB memory on a heavy account.

Evidence: `PULL01-ORDER-MEMORY-TERMS-20260731.md`.

## What b113 wire has / lacks

| Mechanism | On captured `artifacts/wire-b113` OM |
|---|---|
| `entryScreenshot` / `railScreenshots` fields | present (capture path still in product) |
| M20-A1 retained sweep (`_m20A1ScheduleRetainedSweep`) | **present** — partial externalisation |
| TRADE-EVICT-V1 (`_tradeEvictV1Enabled`) | **ABSENT** |
| EXCURSION-SINGLE-OWNER-V1 | **ABSENT** |

So on **b113 corpus**: screenshots can still attach to orders; closed-trade hot eviction and
single-owner journal handoff are **not** in that blob. That is enough for a 10-day-old
"normal session + trades → multi-GB" report to remain **plausible on that stamp**, even
with M20-A1 present.

## Live canary note (2026-07-30 evening)

A light HTTP census of the **live** `/chart/modules/order-manager.js` now shows
`_tradeEvictV1Enabled` and `_excursionSingleOwnerV1Enabled` **present** (B train mid/post
ship). That **cuts** the hot closed-trade retention path on the live surface relative to the
b113 corpus. Stamp id not readable from OM text; MEAS-01 still required before claiming a
named build.

## PULL-01 update (2026-07-31)

The real Talaria-Chart screenshot fixture is `3331×1556`. One decoded RGBA bitmap is
**20,732,144 bytes**. At the current 95,652 excursion-sample scale, the implied closed-trade
count is **301** (`95,652 / 318`). One decoded bitmap per closed trade is therefore
**6,240,375,344 bytes** before counting entry+exit duplication or other retained terms.

This explains the historical failure to reproduce on fresh harness accounts: fresh accounts
do not carry the heavy closed-trade screenshot population. TAL-01891 should stay open as a
live P0 candidate until C/A prove the screenshot bitmap term is not retained on the running
page, or TRADE-EVICT is wire-graded on a named build with heavy-account coverage.

## What this is not

- Not a soak. Not a 730 MB/h grade.
- Not a claim that 01891 is fixed until C grades TRADE-EVICT on the wire under CONF-01/02.
- No longer routed as stale. It is reopened as a live P0 candidate under the heavy-account
  screenshot hypothesis.

Evidence: `_evidence\manager-D\LIVE-OM-FLAG-CENSUS-20260730.json` · wire-dir checks in
`PREBUILD-B-TRAIN-CLOSE-GATES-20260730b113.json` (related hygiene absences on corpus).
