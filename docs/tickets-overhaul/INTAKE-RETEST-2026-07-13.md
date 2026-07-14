# Intake Retest — 2026-07-13 batch (instability-window tickets)

**Why:** ~1/3 of the 2026-07-13 intake was filed during the T1 multichart instability window (b6–b8 regressions). Per the Director's priority note, these get a **first-pass retest on the current stable build BEFORE any new work is dispatched** — several may already be gone after fallback-B + steps 9–12.

**Build discipline (L1):** confirm the build id on the host **and every panel frame** before recording any result. Test build: **`20260713b6`** (or `b7` once T1 step 12 lands — note which build each result is on). Full SW unregister + Clear site data + hard reload so no panel iframe is stale.

Mark each: **GONE** (retest-close), **PERSISTS** (routes to owning lane), or **CHANGED** (describe).

| Ticket | Symptom to reproduce | Owner if it persists | Result | Build |
|---|---|---|---|---|
| TAL-01569 | Ctrl-select: chart stuck during drag; selection only lands on Ctrl **release** (try on single chart AND a panel) | Lane 1, T1 step 8 (if persists single-chart = step-8 RED) | ☐ | ____ |
| TAL-01584 | Crosshair snaps to a tool's **previous** position when holding Ctrl | Lane 1, T1 family (= TAL-00157#11 resurfacing) | ☐ | ____ |
| TAL-01570 | Crosshair appears at **chart center** when clicking a tool | Lane 1, T1 lifecycle chrome | ☐ | ____ |
| TAL-01568 | Brush tool doesn't move until you click it first (first-click) | Lane 1, T1 first-click (H-S32 family) | ☐ | ____ |
| TAL-01578 | Drag freeze — chart can't be moved | T8-evidence; **if it reproduces OUTSIDE replay → re-triage to T3** | ☐ | ____ |
| TAL-01579 | Chart snaps back to the grab point on release | T8 (plan-1 boot-shake/index-pin family) | ☐ | ____ |
| TAL-01587 | Drag past the layout boundary loses control (**host tile only**); mouse leaves layout bounds → drag dies | **T3 Row 11 (reopened)** — needs a live drag-trace | ☐ | ____ |

## How to run
1. Rebuild/deploy the test build on the server; confirm build id on all frames.
2. For each row, reproduce the exact symptom (single chart first, then a 2-panel layout where relevant).
3. Record GONE / PERSISTS / CHANGED + the build id.
4. Hand results back to the Manager. Only **PERSISTS** rows become tasks; GONE rows close by tester confirmation (P5) and are cited in the owning track.
