# Gate triage — the 23 red module gates

**B, 2026-08-02. Tip at time of sweep: `0241272ed`.**

Every red lands as **product defect**, **harness artifact**, or **deferred-with-reason**. The
ruling is that harness artifacts get the stub, not a product change, and nothing below
changed a product line — `chart.js` was mutated only to prove a widened anchor still
discriminates, then restored byte-identical and confirmed clean by git.

## Why this was urgent

`raf-paint-coalesce` died on `this._frameGovShouldPaint is not a function`. The method exists
at `chart.js:3233` and is called at `:30342`. That is a **green product reading as a red
gate**, and there were 23 of these going into a seal. At 3am nobody can tell that apart from
a real defect.

## Result

| Class | Count |
| --- | --- |
| Harness artifact — **fixed, now green** | 4 |
| Harness artifact — diagnosed, fix identified, not mine to land | 13 |
| Deferred-with-reason | 5 |
| **Product defect candidate** | 1 |

**Zero of the 23 is a confirmed product defect.** One is a candidate and is mine.

---

## 1. Harness artifact — fixed tonight (4)

One row broke three harnesses. E's FRAME-01 governor (`f6ef6e5f2`) added two collaborator
calls inside the `animate` loop that these gates lift into a `vm` sandbox. Bisected rather
than assumed: all three were **GREEN at `cf4b40c42`** and **RED from `f6ef6e5f2`**.

| Gate | Was | Now | Root cause |
| --- | --- | --- | --- |
| `raf-paint-coalesce` | RED | **15/0** | Missing `_frameGovShouldPaint`/`_frameGovRecordPaint` stubs; stale static anchor; stale mutant needle |
| `fix1-mc-background-render-cadence` | RED | **26/0** | Same two stubs |
| `flag03-kill-switch-product-on` | RED | **green** | Meta-gate that spawns `fix1`; recovered transitively |
| `leak-d-rawdata-copy` | RED | **8/0** | Six unlisted lift methods; two stale mutant anchors |

Stubs are permissive on purpose: these gates measure coalescing and cadence, and admitting a
wall-clock governor would make paint counts timing-dependent. The governor's own behaviour is
covered by `frame-gov-v1.test.mjs`, which is green, so no coverage was lost.

**The dangerous part was not the stubs.** Three anchors were stale, and two would have failed
quietly. `CLEAR_BEFORE_BLOCK`, the needle four mutants share, no longer matched the product at
all — a mutant that does not apply is not a mutant that survived, so the cell would have read
as coverage while testing nothing. Same in `leak-d`: two anchors pointed at a signature that
had gained a `slotKey` argument. All re-anchored; `leak-d` now reports all six mutants
**killed rather than skipped**, and the widened `raf` anchor was re-proved to go RED when the
product is mutated to clear pending after `render()`.

## 2. Harness artifact — diagnosed, not landed (13)

These are other managers' gates. Each has a named cause and a one-line fix; I have not landed
them because re-anchoring someone's mutation suite without them reading it is how a gate goes
quietly vacuous.

### 2a. Stale content pins (5) — will re-red on every legitimate product change

`m19i-b62-exact-tail-red`, `m20-a-timezone-listener-api.red`,
`m20-q6-replay-float-listeners`, `m20-q6-replay-lifecycle-binding`,
`m20-q6-replay-lifecycle-strong`.

All pin a SHA-256 of product bytes and compare it to what is on disk, e.g. expected
`12eb6525…` against live `7456ca22…`. Eighteen rows landed tonight, so the pins are stale by
construction. **This class cannot survive a night of landings and should not be in the seal's
red count** — either the pins get refreshed at the final tip, or they must be re-expressed as
behavioural assertions. Owners: whoever owns M19/M20.

### 2b. Stale mutation anchors (1)

`p3-bar-store-realm` — 15/1, `prototype-walking clone mutant anchor count`. Identical class
to the `leak-d` anchors above and the same fix.

### 2c. Missing fixtures and modules (3)

| Gate | Missing |
| --- | --- |
| `m20-q4-trail-sl-path-cap.red` | `m20-q4-trail-sl-path-cap-contract.mjs` |
| `m21-2-candle-offscreen-scaffold` (22/1) | `visible-window-mirror.mjs` (w6 fixture) |
| `orphan-l2-l3-iframe-listeners` (4/6) | Fixture returns null; dies on `listenerCount` of null |

### 2d. Gates reading generated or deleted artifacts (4)

This is the one with a hygiene consequence beyond the gates.

`chart v 1.4/chart/dist-v9/index.html` is a **generated** file that is nonetheless committed,
and the committed copy carries build stamp **`20260727b80`** — five days and many builds
stale. The image build regenerates it via `npm run build:live:chart`, so the *shipped* bytes
are correct; the source-tree copy is a lie, and gates that read it produce reds that look
exactly like product defects.

- `screenshot-brand-preload-cut` — expects `width="880"` in the stale `dist-v9` shell.
- `server-write-failure-ledger` — "the ledger is loaded by the served shells before
  preferences-sync". The ledger **is** correctly wired in the source shell
  `chart v 1.4/talaria-design/live/index.html`; the gate reads a shell that predates it.
- `m22-session-calendar-bucketing.red` — reads `homepage/public/chart/legacy-index.html`,
  absent. Also carries genuine value assertions (`daily-bucket-count actual=24 expected=20`)
  that need its owner.
- `p6-live-shell-presence` — 0/5, asserts
  `homepage/public/chart/talaria-design/live/index.html` is present. That file was
  **deliberately removed** by `d071c858f` *"chore(chart): remove stale public live shell"*.
  The gate encodes a superseded expectation and should be retired, not satisfied.

## 3. Deferred-with-reason (5)

| Gate | Reason |
| --- | --- |
| `excursion-single-owner-v1.red` | Not a failure. Exits 2 with *"Set `TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1` to run RED cell"* — a deliberately env-guarded RED cell that the sweep counts as red because it only reads the exit code. **The sweep is wrong here, not the gate.** |
| `m20-a1-screenshot-idb.green` | Seven failing cells across durable-tier IDB behaviour. Too large a behavioural surface to classify from the outside; needs its owner. |
| `m24-order-id-restore-stability.red` | `actual=942 expected=5`. Reads as a count pin against changed data rather than an order-id defect, but not mine to assert. |
| `trade-evict-v1.red` | *"kill-switch ON must fail the eviction-released product claim"* — a RED cell that no longer reproduces. Either the product moved under it or the cell is stale; both need the owner. |
| `prefs-cloud-failure-cap` | Mine, and **pre-existing**: `actual: [Timeout], expected: null`. Verified RED at `cf4b40c42`, before my DEF-05(b) commits (`6959c2ce9`, `a42cbb02e`), which are not ancestors of that tree — so the bootstrap timer did not cause it. Deferred only because it is not on the seal path. |

## 4. Product defect candidate (1)

`r1-render-killswitches` — `m23-kill-no-pagehide-handler — pagehide=1`, expected 0, plus
`m20q9-kill-no-fast-wrapper`. With the M23 kill-switch on, one `pagehide` handler remains
installed. **LIFE-3 (mine) installs a `pagehide` teardown of its own**, so the likely reading
is that R1's M23 oracle counts handlers globally and now sees a second, legitimate installer
that is not M23's. If so it is a gate-scoping fix; if not, the M23 kill-switch does not fully
restore prior behaviour, which is a real defect in a kill-switch — the one thing that must
work when something goes wrong at 3am. **This is the only one of the 23 I would not let into
a seal unclassified, and it is mine to close.**

## What this changes for the seal

- 23 unclassified reds are now 19, none confirmed as a product defect.
- Five of the remaining are stale content pins that will re-red on any landing; counting them
  as defects at the final tip will mislead whoever reads the board at 3am.
- The committed `dist-v9` shell is stale and gates read it. Worth a decision independent of
  these gates: regenerate it in the source tree, or stop committing a generated file.
