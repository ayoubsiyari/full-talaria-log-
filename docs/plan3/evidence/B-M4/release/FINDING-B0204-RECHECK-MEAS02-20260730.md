# B-0204 re-check under MEAS-02

**2026-07-30** · Manager B · authority `RULING-THREE-CONFIDENT-WRONG-NUMBERS-AND-MEAS-02-20260730-2125.md`

## Question

Did Trap 2 (`page.on('request')` on the top page missing iframe traffic) manufacture the
B-0204 "zero fetches during play" result?

## Method

CONF-01 layout (four panels, four symbols, four timeframes). Four instruments attached
**before** navigation:

1. top-page `page.on('request')`
2. CDP `Network.requestWillBeSent` on the page target
3. per-realm `fetch` wrap via `evaluateOnNewDocument`
4. harness API log (server ground truth)

MEAS-02: boot must show a known non-zero on live instruments before play zeros count.
Accessor for replay entry: `getActiveChart()` (Trap 1).

Raw JSON: `FINDING-B0204-RECHECK-MEAS02-20260730.json`.

## Result

| Phase | top-page | CDP | per-realm wrap | harness |
|---|---|---|---|---|
| Boot | 8 | 8 (4 frames) | 8 | 8 |
| Play-in | 0 | 0 | 0 | 0 |
| Play-cross | 0 | 0 | 0 | 0 |

**B-0204 play-zero stands.** All four instruments agree. The different-symbol cost remains a
boot-latency result, not a play-fetch result.

## Correction to my Trap 2 claim

On this harness, with listeners attached before navigation and a filter that matches the real
URL shape (`/api/file/N/bars`), the top-page listener sees iframe traffic (8 = 8).

The earlier host probe that reported "top page saw 0 while harness saw 8" used the filter
`/\/api\/(bars|smart|candles)/`, which does not match `/api/file/25/bars`. That was a MEAS-02
failure — a confidently wrong zero from a bad filter — not proof that `page.on('request')` is
blind to iframes.

Trap 2 as "top-page listeners never see iframe fetches" is **withdrawn for this stack**. The
standing obligation that survives is MEAS-02 itself: prove liveness on a known non-zero before
a zero counts, and name the filter.
