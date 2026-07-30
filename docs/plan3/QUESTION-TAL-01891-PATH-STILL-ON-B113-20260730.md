# QUESTION — Does the TAL-01891 8 GB path still exist on b113?

**2026-07-30** · Manager D · takes the alarm off A's plate  
**PO context:** report is ~10 days old and predates this campaign.  
**Constraint:** no multi-hour soak while C chrome is live. HTTP / wire-blob read only.

## Verdict

**Yes — a path that can still grow retained per-order hot weight exists on the
captured b113 wire corpus.** It is not proof the 8 GB event would recur in 10 days of
runtime; it is proof the **retention path was not yet cut on that stamp**.

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

## What this is not

- Not a soak. Not a 730 MB/h grade.
- Not a claim that 01891 is fixed until C grades TRADE-EVICT on the wire under CONF-01/02.
- A routes 01891 as **question / historical report**, not as a fresh P0 alarm, unless a
  **new** PO reproduction appears on a stamped build that still lacks eviction.

Evidence: `_evidence\manager-D\LIVE-OM-FLAG-CENSUS-20260730.json` · wire-dir checks in
`PREBUILD-B-TRAIN-CLOSE-GATES-20260730b113.json` (related hygiene absences on corpus).
