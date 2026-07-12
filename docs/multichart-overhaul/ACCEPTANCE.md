# Multichart Overhaul — Acceptance List (D-048 closure protocol)

**Status: PO-CONFIRMED PASS end-to-end on build `20260707b105` — overhaul DECLARED CLOSED and released (D-048 clause 3, 2026-07-12).**
This list is the RELEASE FINISH LINE. The single structured acceptance session was run against the current build.
On-list failures are fixed under standing discipline (RED-first, gated, gate-ratcheted); off-list observations go to
backlog, NOT fixed pre-release. **List passed end-to-end ⇒ overhaul DECLARED CLOSED and released.** See D-048 CLOSURE
in `DIRECTOR-DECISIONS.md` and §6cu in `MANAGER-FINDINGS.md`.

Build under test: **`20260707b105`** (PO-confirmed). Confirm on every frame: console `__TALARIA_CHART_BUILD_ID`.

**Acceptance verdict (PO-confirmed on b105): A1–A13 all PASS.**

| Item | Verdict (b105) | Item | Verdict (b105) |
| --- | --- | --- | --- |
| A1 | PASS | A8 | PASS |
| A2 | PASS | A9 | PASS |
| A3 | PASS | A10 | PASS |
| A4 | PASS | A11 | PASS |
| A5 | PASS | A12 | PASS |
| A6 | PASS | A13 | PASS |
| A7 | PASS | | |

Preconditions for the session:
- Clean load: unregister SWs → clear site data → close all tabs → reopen → confirm build id.
- Unless a step says otherwise: 4 panels, all **same pair**, **sync OFF**.

Mark each: **PASS / FAIL** (+ screenshot on fail).

---

## A1 — Cold boot / initial load
Open the multichart. All 4 panels paint promptly with correct, aligned data.
- **PASS:** all panels show candles quickly, no perpetual spinner, no obviously-wrong/blank panel.

## A2 — Host timeframe switch (same pair, sync off)
Switch the **host (A)** TF (e.g. 1m → 4h → 1m).
- **PASS:** host reframes cleanly; **other panels do not flash, reload, reframe, or rescale.**

## A3 — Peer refetch on host fan-out during replay (BL-18)
Replay running. Switch host **coarse → finer** (1h → 1m).
- **PASS:** B/C/D adopt the new TF **instantly by mirroring** — no reload spinner, and **zero new candle requests** on peers (Network tab idle on B/C/D).

## A4 — Panel own switch to a coarse TF during replay (BL-17)
Replay running a while. Switch **one panel** to **1D**.
- **PASS:** loads **fast and full** — candles fill the whole visible range (no empty older months), playhead at the right edge (no empty future gap). No ~50-request crawl.

## A5 — Panel own switch to a finer TF during replay (BL-15)
Replay entered on a coarse host (1h/4h). Switch **one panel** to **1m**.
- **PASS:** correct 1m time axis (evenly spaced), real 1m candles — no squished/compressed axis, no "new label but old candles."

## A6 — Replay play across mixed timeframes (BL-10)
Panels on different TFs (e.g. A=1m, B=5m, C=1h, D=1D). Press **play**.
- **PASS:** **all** panels advance together (not just the host); coarser panels' forming candle updates.

## A7 — Viewport follows playhead during play (BL-11)
During play, watch panels B/C/D.
- **PASS:** each panel's viewport auto-scrolls to keep the playhead in view (like the host), without manual dragging.

## A8 — Panel playback smoothness (BL-12/13)
During play, observe B/C/D scrolling.
- **PASS:** playback scrolls **as smoothly as the host** — no chunky "group-by-group" stutter, no stall-then-jump.

## A9 — Drag during play (BL-16/12)
While replay is **playing**, drag/pan a panel.
- **PASS:** dragging feels smooth (comparable to dragging while paused); no lag, no snap-back to the playhead while you hold the drag.

## A10 — Drag-to-load history (BL-9)
Paused (or stopped). Drag a panel back to load older data.
- **PASS:** older data loads **without getting stuck** — no need to click to "unstick" it.

## A11 — Cross-panel price-scale independence (BL-2b/8, sync off)
With **all sync off**, switch one panel's TF repeatedly (1m ↔ 4h).
- **PASS:** other panels' **price scales do not change** — host actions have zero effect on peers.

## A12 — Sync ON behaviors
Turn interval sync and/or visible-range sync **ON**. Switch host TF and pan the host.
- **PASS:** peers follow as intended (shared TF / shared visible range), still without runaway refetch storms.

## A13 — Stale-tab reload prompt (b96 hygiene) — optional/opportunistic
If a newer build deploys while the app is open, a dismissible **"new version — reload"** toast appears.
- **PASS:** toast appears on a real deploy boundary (or: verified previously in the b96 sign-off).

---

### PO notes / edits
_(PO: add, remove, or reword workflows here. Target 8–12 that reflect how you actually use it.
Anything not on this list is out of scope for the release acceptance session.)_
