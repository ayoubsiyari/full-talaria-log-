# PHASE 4 — Persistence & Lifecycle — STATIC verification (reassigned from offline Worker A)

Recorded by Manager from the fresh verification worker's read-only trace (worker kept read-only and
did not self-write this file). Browser/runtime click-crawl DEFERRED to the final Docker pass.

Checks: homepage `tsc --noEmit` exit 0; ReadLints clean on checked v16 TS files.

| Item | Expected | Trace result | Verdict |
|---|---|---|---|
| A1 | `mergeV16StrategyBankRows` preserves local rows only when stale/preserve; boot sync/refresh keep current bank on failure | Confirmed | PASS |
| A6 | `fetchJournalApiData` records `strategyBankError` (no whole-payload throw); `fetchJournalPayload` propagates; `buildBootFromPayloads` marks only bank stale, retains journal/entries | Confirmed | PASS |
| A2 | Live delete awaits API, keeps row on failure, in-app confirm (no window.alert), `strategyDeleteInFlightRef` double-fire guard | Confirmed | PASS |
| A4 | Image-size + payload-byte guards run before `persist()` | Confirmed | PASS |
| A5 | `saveBuilder` writes canvas-derived root conditions (legacy fallback); `openBuilder` restores tree | Confirmed | PASS |
| ICR-1 | Timeframes normalized/deduped, capped/enforced at 6 | Confirmed | PASS |
| A7 | Duplicate-name check normalizes both input and row names | Confirmed | PASS |

Result: all 7 items PASS static. No defects. Runtime → final Docker pass.
