# PROMPT — Worker A — A6 REWORK — isolate strategies-fetch failure

Your A6 change is REJECTED as-is. It correctly stops the false-empty strategy bank, but it
over-reaches: throwing the whole `fetchJournalApiData` on a `/strategies` non-OK collapses the
ENTIRE journal boot (entries, broker connections, active profile, live accounts, session KPI
enrichment) to empty, because `fetchJournalPayload` catches the throw and returns
`EMPTY_JOURNAL_PAYLOAD`, and `buildBootFromPayloads` builds `journal` + `strategies` from that
empty payload. Only `strategyBank` survives (via fallback), and on a COLD first boot not even
that. A `/strategies`-only hiccup must NOT wipe the user's trades/journal.

## Working rules (unchanged)
- Exclusive edit; TS files only for this rework (`v16JournalMappers.ts`, `useV16LiveBootstrap.ts`,
  `v16LiveGlobals.d.ts` if a type changes). DO NOT switch branches / stash. Preserve A1's contract.
- No new deps. Do not weaken any other endpoint's tolerant behavior.

## Required behavior
On `/strategies` non-OK or network failure during boot:
- **Preserve** entries, connections, active profile, live accounts, sessions — everything that
  fetched successfully must still render.
- **Only** the strategy bank goes stale: surface via the existing A1 `strategyBankError` /
  `strategyBankStale` flags, and use the last-known bank fallback when present.
On a true empty (`200` with `strategies: []`): show an authoritative empty bank (unchanged).

## Recommended approach (isolate, don't throw the payload)
1. In `fetchJournalApiData`, do NOT `throw` for the strategies branch. Instead keep returning the
   full `JournalApiData`, and add a field to carry the strategy-bank failure, e.g.:
   `strategyBankError?: string | null` on `JournalApiData`. On non-OK/null strategies:
   `strategies = []` (as before) **and** `strategyBankError = await responseErrorMessage(...)`.
   All other sections process and return normally.
2. In `fetchJournalPayload`, propagate that per-section error:
   `errorMessage = payload.strategyBankError ?? null` (keep the try/catch for genuine
   network/all-fail cases, but a strategies-only failure now comes back on the payload, not as a
   thrown EMPTY payload).
3. `buildBootFromPayloads` already prefers `strategyBankFallback` when `strategyBankError` is set —
   leave that. Now `journal`/entries come from the REAL payload, so they survive.
4. Keep the refresh path (`__TALARIA_V16_REFRESH_STRATEGY_BANK__`) as-is (it already isolates).

## Verify
- Simulate `/strategies` 500 while `/journal/list` succeeds → entries/journal still render;
  strategyBankStale=true, strategyBankError set, bank = last-known (or empty w/ retry UI on cold).
- Simulate `/strategies` 200 `{strategies:[]}` → authoritative empty bank, no stale flag.
- `tsc --noEmit` exits 0; `ReadLints` clean; `git diff` shows the isolation (no whole-payload throw).

## Report
Rewrite `reports/A/A6.md`; show the removed throw, the new per-section error field, and the two
simulation outcomes. Status DONE only when a strategies-only failure preserves the journal.
