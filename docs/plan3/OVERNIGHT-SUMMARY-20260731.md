# OVERNIGHT SUMMARY — 2026-07-31 (Manager C, NIGHT-01 battery)

**Was the night good? 0 of 1 scenarios produced a usable artifact, none died.**
**Headline:** see the table

| # | status | verdict | min |
| --- | --- | --- | --- |
| **B1** | RUNNING | in progress · latest: no fit produced (two indicators); build ? | — |

## What each scenario was

**B1 — Mode truth + indicator A/B, SAME BUILD (two indicators arm).** B1 was answered at 01:00-02:30, after the 00:05 ruling was written; its one weakness was cross-build arms (b115 vs b116). This re-runs both arms back to back on one build so the A/B is same-build.

## Reading this honestly

- Every scenario ran serially under an explicit `--max-old-space-size` with a hard timeout, per `NIGHT-01`. A scenario that died is `VOID` with its reason and the queue continued; nothing was relaunched.
- `B1` and `B2` were specified before my 01:00-02:30 results landed, so they were run in the form that adds information rather than re-learning a banked number: `B1` as a **same-build** A/B (the earlier arms were b115 vs b116), `B2` in **tick mode**, which had never been measured.
- `B3` sees JS-visible arrays reachable from `window` within a node budget in each realm. It is blind to closure-held, `WeakMap`-held and worker-held bars, so its copies-per-bar ratio is a **lower bound**.
- `B4` reads array lengths. A fall in resident count proves **dereferencing**, not collection; proving collection needs a heap snapshot.
- Free-RAM context reads `null` in tonight's manifest: `wmic` is absent on this Windows build. Fixed in the driver for future runs, but tonight there is no free-memory series.

_Manifest: `c:\Users\user\Desktop\talaria1\_evidence\manager-C\OVERNIGHT-MANIFEST-20260731.json`. Driver started 2026-07-31T01:39:33.101Z. Summary regenerated 2026-07-31T01:42:02.246Z._
