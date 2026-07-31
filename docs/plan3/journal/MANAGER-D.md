# Manager D — journal

**Lane:** trade correctness / money-path  
**Checkout:** `manager-d-trade` · branch `manager-d/trade-correctness`  
**JOUR-01:** this file is the declared journal. Older notes also live in `docs/plan3/journal-D.md`.

---

## Backfill (Director JOUR-01 — two decisions only)

### Vacuity criteria and reversal levers (fixed-column audit)

A gate was judged vacuous when any of: (1) kill-switch OFF still GREEN, (2) asserted only
a helper/no-op path, (3) single-chart coverage for a multichart-reported defect. Reversal
levers that proved non-vacuity: restore-id kill → `942 !== 5` (TAL-01908); PnL kill →
`12000 !== 10075` (TAL-01903); TRADE-EVICT / duration / pending-protection RED cells under
their `TALARIA_TEST_DISABLE_*` env flags. Class-3 (single-chart vs multichart) remains a
standing reject reason.

### Cold-read proof design (TRADE-EVICT-V1 step 1)

EVICT-01 requires bytes-down **and** cold-read-works. The cold-read cell seeds a journal
row with MAE/MFE/path/screenshots while `closedPositions` is empty, then asserts analytics
consumers still resolve from the journal. That is the measurement that the cold room already
exists — eviction deletes the redundant hot copy, it does not invent a new store.

---

## 2026-07-30 — TRADE-EVICT-V1

- CKPT-01 tag `ckpt/pre-d-trade-evict-v1-6ba61eeeb` exercised rollback while green.
- Product: `__TALARIA_DISABLE_TRADE_EVICT_V1`; release hot screenshot/excursion on closed at
  post-exit playhead T; restore on rewind (EVICT-02).
- CONF-02 byte cell (screenshots + excursion): closed `63,753,000 → 0` with 30 closed + 4 open
  retained; harness GREEN only — C grades on the wire.
- Tip before this packet: `f4e006b06`.

## 2026-07-30 — EXCURSION-SINGLE-OWNER-V1 (Director e8ba8bdbc)

- **Authoritative:** `tradeJournal`.
- `managerClosed` ≡ `serviceClosed` (same array via `bindServiceProp`) — alias, not a third
  heap owner. Real duplicate was journal `.slice()` copies.
- Flag: `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` (default ON). Share array identity into
  journal; TRADE-EVICT nulls closed/service keys; journal keeps sole ref.
- Cap: 319/row was C summing four keys (ceiling 1,024), not a 256 breach. Hard-cap belt
  shipped anyway.
- CONF-02 excursion-only bytes (measured): legacy deduped **390,240** → journal-only
  **195,120** (delta **195,120** ≈ 191 KB). **Not the memory win.** Evidence:
  `_evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json`.
- Gates: `excursion-single-owner-v1.test.mjs` GREEN; `.red.test.mjs` under
  `TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1` exits ≠ 0.

## 2026-07-30 — TEST-02 / Rayan probes (queue continue)

- TAL-01896 named: **needs a build** (kill-switch in tip source; not served on canary).
- Runtime probes re-run on b113: Rayan #2 on-wire; Rayan #8 off-wire; 01896 delivery-unserved.
- #8 / 01807b / 01896 remain B next-train; skip register stays armed.

## 2026-07-30 — Director correction 5d1684b02 (cap / excursion hygiene)

- Cap-breach claim withdrawn by Director (`BRIEF-02`). Excursion closed as hygiene; 191 KB
  figure accepted; **not** progress against 730 MB/h.
- TRADE-EVICT CONF-02 reconfirmed: 30 closed `63,753,000 → 0`, **4 opens retained** (`6,371,552`).
- Closed the 7 TEST-02 unproven rows → **wire_unproven: 0**, on-wire **46**. Cause: missing
  `PATH_HINTS` + wrong M23 seed SHAs + thin wire corpus. Docs:
  `TEST02-SEVEN-UNPROVEN-CLOSED-20260730.md`.
- **Handed to B as build-blocked** (not waiting): Rayan #8 off-wire (money freeze gate),
  TAL-01896 needs a build. Handoff:
  `HANDOFF-D-TO-B-BUILD-BLOCKED-RAYAN8-01896-20260730.md`.

## 2026-07-30 — Director e982c3ce5 (57% ledger / 26 po-eyes)

- **FLAG-01 confirmed:** `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` **ABSENT ⇒ feature ON**
  (`!== true`). GREEN cell deletes the key; does not require explicit `false`.
- Built **one** consolidated PO visual pack for all 26 `po-eyes`, setup-ordered, observables +
  pass/fail boxes, TEST-01 wire preflight on b113 (0 rows removed for missing wire):
  `PO-VISUAL-PACK-26-PO-EYES-20260730.md`.
- Applied `PO-DECISIONS-23-ROWS` docx → `needs-info` **0**. Owner-blocked rebalanced A/E/C
  (`OWNER-BLOCKED-ROUTING-20260730-2135.md`).

## 2026-07-30 — Resume: PO waits on C chrome; owner lists confirmed

- **Do not call PO** for the 26-row pack until C’s CONF-01 / attribution clears and Director
  says go. No second browser from D on this machine.
- TRADE-EVICT / EXCURSION-SINGLE-OWNER stay harness GREEN only — C grades on the wire.
- Owner-blocked handoffs with **named row lists** (not counts): A=13, E=5, C=3.
  Verified 13+5+3=21 against ledger. Files: `HANDOFF-OWNER-BLOCKED-TO-{A,E,C}-20260730.md`,
  `OWNER-BLOCKED-ROW-LISTS-20260730.json`.
- Scorecard flip armed idle: `scripts/po-scorecard-flip.mjs` +
  `PO-SCORECARD-FLIP-PROCEDURE-20260730.md` — PASS→fixed, FAIL→broken on b113 when scorecard
  returns. Heavy evidence → `_evidence\manager-D\`.

## 2026-07-30 — Prebuild B-train close gates + 01891 question

- Built `scripts/prebuild-b-train-close-gates.mjs` for Rayan #8 / TAL-01807b / TAL-01896.
  Against **b113 wire corpus**: all three **RED exit 1** (discriminator). Evidence:
  `_evidence\manager-D\PREBUILD-B-TRAIN-CLOSE-GATES-20260730b113.json`.
- Live OM (unlabelled stamp): #8 + 01807b flags **present**; tip unit gates GREEN; 01896
  still delivery-unserved. No ledger flip until B names the stamp + `--expect-green`.
- TAL-01891: **question not alarm** — path still on b113 corpus (no TRADE-EVICT there);
  live now has eviction bytes. Doc `QUESTION-TAL-01891-PATH-STILL-ON-B113-20260730.md`.
  No soak. Did not call PO.

## 2026-07-30 — B stamp + PO deploy-freeze request

- Live OM has #8 / 01807b bytes, but stamp is unlabelled. D will not flip without B naming
  the stamp; unlabelled deploy is a **MEAS-01 defect**.
- Requested explicit B freeze for the PO 26-row pack: no deploy between Director "PO start"
  and scorecard return. If B ships first, D re-preflights the pack against the new named stamp.
- Scratch artifacts moved out of worktree to `_evidence\manager-D\scratch-clean-*`; pending
  protection clear tests committed in both trees with GREEN + RED clear-kill coverage.

## 2026-07-30 — Zero-trade replay guard added to PO pack

- Director rule accepted: any pack claiming smooth replay needs a **zero-trade 60x ≥15 min**
  cell. Added `ZERO-TRADE-60X` mandatory Section Z to the 26-row PO pack before any order is
  placed.
- `po-scorecard-flip.mjs` now forces replay-smoothness rows to FAIL if `ZERO-TRADE-60X` fails:
  TAL-01898 / 01925 / 01917 / 01909 / 01929 / 01923 / 01700 / 01934 / 01717.

## 2026-07-31 00:13 — Overnight queue reconciliation

- Re-ran B-train prebuild probes on stamped `artifacts/wire-b113`: Rayan #8 RED, TAL-01807b RED,
  TAL-01896 RED, exit 1 as expected. Evidence refreshed at
  `_evidence\manager-D\PREBUILD-B-TRAIN-CLOSE-GATES-20260730b113.json`; this is TEST-02
  discrimination, not a product regression.
- TAL-01891 remains answered as a question: the retained hot screenshot / closed-trade path still
  exists on b113 corpus; no soak run; live has eviction bytes but needs named-stamp MEAS-01 before
  a fix claim.
- PO pack now has CONF-04 mode axis M0-M6 and `po-scorecard-flip.mjs` refuses ledger mutation if
  any mode read is missing or `UNREADABLE`.
- B freeze request refreshed with explicit ACK text. Current state: freeze **requested / not yet
  agreed** until B names the stamp and writes the ACK.
- Cleaned remaining scratch files out of the worktree:
  `_evidence\manager-D\scratch-po-decisions-23-20260730.txt` and
  `_evidence\manager-D\scratch-merge-acceptance-20260730.log`.

## 2026-07-31 09:26 — PULL-01 memory queue

- Re-measured the screenshot memory candidate with the real
  `talaria-chart-median-live-census.dataurl.txt` payload. JPEG dimensions are `3331×1556`;
  decoded RGBA is **20,732,144 bytes per bitmap**. At the 95,652-sample / ~301-closed-trade
  scale, one decoded bitmap per closed trade is **6,240,375,344 bytes**; entry+exit decoded
  would be **12,480,750,688 bytes**. This restores screenshots as the leading TAL-01891 term.
- Re-measured `excursionSamples` at **95,652**: packed Float64 lower bound **765,216 bytes**;
  product JSON UTF-16 approximation **1,604,120 bytes**. The +23,300/h slope is real but
  remains sub-MB/hour in byte terms; keep as RED retention/correctness term, not 8 GB driver.
- Reopened TAL-01891 as **live P0 candidate** in ledger (`broken=1`) and A handoff. Heavy
  accounts explain why fresh harness accounts did not reproduce the 8 GB report.
- PO 26-row visual pack remains built/held for PO pass; no scorecard flip yet.
- Filed D→B passport handoff: `HANDOFF-D-TO-B-PASSPORT-FIELDS-PULL01-20260731.md`.

## 2026-07-31 09:49 — Screenshot retention shape

- Answered Director's shape question in `PULL01-SCREENSHOT-RETENTION-SHAPE-20260731.md`.
  Ordinary closed trades retain **entry + exit** screenshots, so the 301-trade real-payload model
  is **11.62 GiB**, not the entry-only 5.81 GiB lower bound.
- Aggregate scaled/split rows are list-shaped: `entryScreenshots[N]` plus primary
  `entryScreenshot` plus `exitScreenshot`; rail attachments add another per-trade list path.
  No global session-level "every screenshot loaded" list found; `__talariaV9RailScreenshots` is
  consumed once and cleared.
- Journal startup calls `updateJournalTab()`, renders the full `tradeJournal`, and emits thumbnail
  `<img>` tags for embedded entry/exit data URLs. TAL-01891 is therefore a **baseline** candidate
  on heavy-account load as well as a growth term.
- Consumer check before A edits: JSON export and preview/detail need full screenshot bytes
  fetchable, not resident at startup. CSV does not need screenshots; no D-owned PDF/print/share-card
  journal screenshot consumer found. Explicit multi-entry caps at `MAX_ENTRY_LEVELS = 4`, but
  manual `scaleNextOrder` scaling pushes into `group.entries` without a screenshot-list cap found.

## 2026-07-31 12:00 — Ruling pull: D-1, D-2, server cap

- Read Director ruling `RULING-A-LANDS-THREE-AND-I-PARKED-D-AND-E-ON-A-STALE-INSTRUCTION-20260731-1200.md`.
- D-1 landed in `D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.md` with JSON mirrored to
  `_evidence/manager-D/D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.json`. Real Chromium, real
  `3331×1556` fixture, 60 rows × 2 screenshots, unique payloads. Legacy DOM decoded-pixel floor:
  **2,487,857,280 bytes**. J1 settled thumbnail DOM floor: **12,902,400 bytes**. Delta:
  **2,474,954,880 bytes**. Renderer private did not show a multi-GB settled bitmap cache in this
  headless run; J1 still has a non-zero raster/allocator cost (~93 MB renderer private in the
  synthetic 120-image path).
- D-2 landed in `D2-ATTRIBUTE-497MB-RENDERER-RESIDUAL-20260731.md`. Attribution: the 497.23 MB is
  native browser cost of replicated chart realms — 7 documents/frames, 61,272 nodes, 14,796
  listeners, 251 script requests / 44.26 MB decoded scripts, two worker targets, style/layout/layer
  state and allocator arenas — not the 4.16 MB chart canvas backing stores.
- Server cap check landed in `SERVER-CAP-CHECK-JOURNAL-STATE-20260731.md`. `/api/journal-trades`
  is paginated, but chart startup uses `/api/sessions/{id}/state` → `resolve_session_journal()` →
  `load_journal_trades_from_sql().all()` and hydrates the full session journal. Writes have a
  5000-trade admission cap; reads have no page/offset cap and 301-trade heavy accounts remain fully
  exposed. A fix needs partial-hydrate provenance, not just `limit(3000)`.
- D-2 attribution refined after the parallel code/evidence sweep: host `dist-v9` plus three
  `chart-embed` iframe realms; rough residual buckets recorded for V8 code/cache, Blink
  DOM/style/listener structures, worker heaps, paint/font/layer state and allocator arenas. The
  recommendation stays: reduce full iframe engines / share code; R-1 bar cuts target the JS-heap side.

## 2026-07-31 12:24 — J1 repeated-render settle check

- Answered Director's only remaining question against A's journal screenshot fix in
  `D1-J1-SETTLE-BROWSER-20260731.md`; JSON mirrored to
  `_evidence/manager-D/D1-J1-SETTLE-BROWSER-20260731.json`.
- Real Chromium, same real `3331×1556` fixture, 60 rows × 2 screenshots, 12 repeated journal-list
  rebuilds. J1 cache misses by cycle: `120,0,0,0,0,0,0,0,0,0,0,0`; the full raster path runs on
  warmup only.
- Stable tail cycles 4-12: renderer private spread **1,957,888 bytes**; GPU private spread
  **253,952 bytes**. Classification: settled warmup/cache cost, **not** a +23 MB per-render leak.

## 2026-07-31 13:20 — Release parity oracle Cycle 2

- Read Director ruling `RELEASE-01` and mixed-symbol amendment from `talaria-director`. D now holds
  explicit stop authority: if the parity suite is insufficient to hold a final release, release waits.
- Added `RELEASE-PARITY-NON-CONTAMINATION-V1` at
  `docs/plan3/oracles/release-parity-non-contamination-v1.mjs` plus
  `scripts/tests/release-parity-non-contamination.test.mjs` and package scripts.
- Cycle 2 scaffold is RED-first under CONF-01: four panels, four different symbols and timeframes
  (`XAUUSD/1m`, `HOG/5m`, `ETHBTC/15m`, `BTCEUR/1h`). The suite mutates one panel at a time across
  symbol, timeframe, data load, drawing, order and seek/playhead operations and requires peers'
  data, indicators, drawings, orders and viewport/replay state to remain bit-identical.
- RED controls proven:
  `NC-UNSCOPED-H1-CACHE` goes RED with `indicator-cross-contamination`;
  `NC-GLOBAL-CHARTDATALOADED` goes RED with `peer-mutated`.
- Evidence landed in `RELEASE-PARITY-NON-CONTAMINATION-CYCLE2-20260731.md`; compact JSON mirrored to
  `_evidence/manager-D/RELEASE-PARITY-NON-CONTAMINATION-CYCLE2-20260731.json`.
- D release posture: this is necessary Cycle 2 scaffold credit, but **not sufficient final release
  credit** until wired to the real single-realm app build. If it remains model-only at release time,
  D holds the release.

## 2026-07-31 14:00 — Breadth + M1 fire + first-paint

- Status note accepted: M6 dead; territory carve-out for `release-parity-*` confirmed; no move needed.
- Breadth expanded in the same oracle: eight CONF-01 surfaces
  (drawing-tools, indicators, orders, replay, crosshair-sync, range-sync, keyboard, context-menus).
  Multi-realm reference vs single-realm candidate; local surfaces must not mutate peers.
- Breadth RED controls proven: host-routed keyboard, host-routed context menu, host-absolute
  crosshair price — all trip `single-realm-reference-mismatch`. Tests 8/8.
- Still model-only: **no final-release credit** until wired to real single-realm app.
- M1 harness retargeted to canary. b118 already live (`20260731b118`). Authenticated fire:
  product URL reached, build matches, journal/image surface empty → **`UNPROVEN` /
  `no-product-images`**. Not claimed GREEN. Needs a journal-bearing session on b118.
- First-paint product-path probe (no login, harness `mcLayout=2v`): median FCP **152 ms**,
  DCL **230 ms**, wall **644 ms**. C's 17.1/19.1/19.1 s **not reproduced** on product path;
  login overhead remains the likely contaminant. Do not spend CONF-01 on it yet.
  Write-up: `FIRST-PAINT-PRODUCT-PATH-PROBE-20260731.md`.

## 2026-07-31 14:25 — Archaeology ruling: port guards, not reinvent

- Ruling: iframes were a correctness choice; Phase 4 already rejected once; tautological
  breadth must become reference-vs-candidate. Artifact already exists —
  `homepage/public/chart/multichart/engine-api-guards.js`. **Ported, not rewritten.**
- Suite source of truth = decisions.md **ten** forbidden fields (earlier two-hazard list was
  short by ~5×). Port loads product IIFE via `vm`; wraps filter with `scaleMode` union;
  implements real per-instance `installForbiddenSetterTraps` (product stub still returns false).
- **Stop-authority first test:** ported traps **do** fire per-instance in one realm
  (`FORBIDDEN_SETTER_TRAP` on peer `priceScale.min`; internal write still ok).
  `trapStop: false`. **Release still waits** because product `installForbiddenSetterTraps`
  remains a stub (`productStubBlocksRelease: true`). Preflights exit ≠ 0 while that holds.
- E coordination: indicators / drawings / overlay RED controls referenced only
  (`RP-INDICATOR-GLOBAL-SLOT`, `RP-DRAWING-GLOBAL-LAYER`, `RP-OVERLAY-GLOBAL-LAYER`).
  Handoff: `HANDOFF-D-TO-E-FORBIDDEN-FIELDS-COORD-20260731.md`.
- README lifted as written: 6.3 add/remove + no surviving listeners; 6.5 four charts /
  30s / 4× throttle / fail=0. Hermetic GREEN + RED controls; product heap/CDP drives remain
  CONF-01 follow-ups.
- Evidence: `RELEASE-PARITY-ENGINE-API-GUARDS-PORT-20260731.md` (+ JSON under
  `_evidence/manager-D/`).

## 2026-07-31 15:20 — Spike GO ruling: 6.3 becomes load-bearing RED

- Read Director ruling `RULING-THE-SPIKE-IS-GO-AND-PHASE-4-WOULD-CREATE-ITS-OWN-MONSTER-WITHOUT-DESTROY-20260731-1520.md`.
- Correction accepted: README step 6.3 is not a formality. A confirmed `Chart` has no
  `destroy()`, `dispose()` or `teardown()`, and chart.js alone installs **51** global listeners
  per instance. D gate now models current add/remove as **RED** (`destroyStop: true`) until A
  lands `Chart.destroy()`. The future-destroy control is GREEN so the gate can turn green only
  after teardown exists.
- E roadmap corrections applied: every contamination fixture is mismatched-timeframe only; matched
  timeframe fixtures are non-evidence. The old `_h1Cache` RED no longer creates a same-timeframe
  collision; the broken key leaks across already-mismatched CONF-01 panels.
- Added resize alongside pan as a candle-compression route. README 6.5 now requires pan **and**
  resize across four mismatched-timeframe charts for 30s under 4× CPU throttle with `fail=0`.
- Verification: `test:release-parity-readme-gates` 5/5 GREEN; `test:release-parity-non-contamination`
  8/8 GREEN. Preflights remain intentionally non-zero while 6.3 is RED / product traps are stubbed.

## 2026-07-31 15:35 — FLOW-01 pull: M1 b120 + parity breadth

- FLOW-01 pull item 1: **M1 confirmation on real app at b120**. Pullable because b120 was confirmed
  live in the running container; checked conditions: territory preflight attempted and failed closed
  because `docs/plan3/TERRITORY.yml` does not declare Manager D, `chart.js` untouched, no heavy
  measurement lock conflict (single bounded browser run only), no new scope. Artifact:
  `M1-B120-REAL-APP-HARNESS-20260731.json`.
- M1 b120 result: build stamp **`20260731b120`** confirmed, auth cookie supplied, final URL redirected
  to login, verdict **`UNPROVEN_LOGIN_PATH`**. This is not GREEN and not a rerun of the seven
  `4294967295` non-evidence runs; it wrote an artifact and exited non-zero as designed.
- FLOW-01 pull item 2: **parity breadth — orders, drawings, replay, keyboard, context menus**.
  Pullable because precondition is none and it is light oracle/test work. Added RED controls
  `NC-PARITY-DRAWING-HOST-ROUTED`, `NC-PARITY-ORDERS-HOST-ROUTED`,
  `NC-PARITY-REPLAY-HOST-ROUTED`, keeping keyboard/context-menu controls and the existing
  crosshair price control.
- Destroy behavior coordination: D owns heap/listener 6.3; E owns correctness/behavior destroy
  controls. Handoff: `HANDOFF-D-TO-E-DESTROY-BEHAVIOR-CONTROLS-20260731.md`.
- Verification: `test:m1-b120-real-app` PASS; `preflight:m1-b120-real-app` READY when
  `M1_EXPECTED_BUILD=b120`; `test:release-parity-non-contamination` 8/8 PASS; lints clean.

## 2026-07-31 15:55 — A teardown probe numbers wired into 6.3

- Read Director ruling `RULING-THE-SPIKE-PRICES-PHASE-4-AT-665-HOURS-AND-I-GOT-FOUR-THINGS-WRONG-20260731-1555.md`.
- M1 b120 pulled again with the bounded wrapper. Artifact updated at `2026-07-31T16:08:50.703Z`:
  build **`20260731b120`**, auth cookie supplied, final URL login, verdict **`UNPROVEN_LOGIN_PATH`**.
  This confirms b120 but still does not confirm M1.
- 6.3 gate updated from the superseded 51-listener source-site claim to A's runtime teardown probe:
  **147 live listeners per instance**, **357** page-wide registrations, **0** removals,
  **1 rAF loop per instance**, **2 setTimeout handles at rest**.
- Gate now distinguishes precondition from outcome: current product has **147/147 anonymous closures**
  with **0 retained references**, so listeners are **not removable at all**; `withDestroy` control first
  makes them removable and then removes 147.
- Verification: `test:release-parity-readme-gates` 5/5 PASS,
  `test:release-parity-non-contamination` 8/8 PASS, `test:m1-b120-real-app` PASS; lints clean.

## 2026-07-31 17:46 — M1 waits on B auth route; legacy-index non-auth control

- Read urgent ruling `URGENT-THE-SESSION-CAP-MAY-VOID-THE-SOAK-THAT-LAUNCHED-THREE-MINUTES-AGO-20260731-1746.md`.
- M1 remains pull item 1, but D is not grinding the login path. Last bounded b120 artifact confirms
  `20260731b120` and redirects to login (`UNPROVEN_LOGIN_PATH`). Waiting for B's documented authenticated
  route; retry immediately when it lands.
- Added non-auth static control for the disclosed `legacy-index.html` `isPanel` path:
  `LEGACY-INDEX-ISPANEL-PATH-GATE-20260731.md`. It checks `chart/index.html` links to
  `/chart/legacy-index.html`, the legacy shell has the expected auth redirect marker, the shell constructs
  panel charts with `new Chart(panel.canvas, panel.svg, { panelIndex })`, and `chart.js` sets `isPanel`
  on the canvas constructor path.
- RED controls proven: removing the index link goes RED; removing the legacy panel constructor call goes RED;
  changing the constructor so it does not set `isPanel` goes RED.
- Caveat preserved: this is static shell wiring only and does not prove browser resize behavior; 6.3 heap
  snapshot and 6.5 throttle drive also remain hermetic CONF-01 follow-ups.
- Verification: `test:legacy-index-panel-path` PASS, `preflight:legacy-index-panel-path` GREEN,
  `test:m1-b120-real-app` PASS; lints clean.

## 2026-07-31 18:15 — PLACE-01 and A legacy-shell handoff

- Read Director ruling `RULING-GATE-SCRIPTS-MAY-NOT-LIVE-IN-IGNORED-PATHS-AND-D-ANSWERED-A-QUESTION-A-IS-ABOUT-TO-ASK-20260731-1815.md`.
- Sent A direct handoff `HANDOFF-D-TO-A-LEGACY-INDEX-LIVE-CHECK-20260731.md`: D's control answers the cheap
  liveness question (`chart/index.html` links to `/chart/legacy-index.html`; legacy shell has unauth redirect
  marker). Caveat remains: static non-auth shell wiring, not browser resize behavior.
- PLACE-01 sweep note: `PLACE01-EVIDENCE-GATE-SWEEP-20260731.md`. Clear evidence-tree gates named:
  E legacy-panel shell correctness, E focus/destroy correctness, E release-parity correctness,
  E pre-session warmup buckets; plus B-M4 historical test/mutant scripts if still cited as active gates.
- M1 remains queued behind B's authenticated route. No login retry.

## 2026-07-31 18:28 — B auth route pulled for M1

- Read B handoff `manager-b-plan3/docs/plan3/HANDOFF-B-TO-D-AUTHENTICATED-ROUTE-IS-PROVEN-20260731-1830.md`.
- Wired M1 harness to import B's route module and poll the image surface until stable.
- Bounded live run against B's journal-bearing route (`sessionId=936`, `fileId=677`) confirmed build
  **`20260731b120`**, but local login through the imported route returned **HTTP 401**. Artifact updated:
  `docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json`; verdict remains **`UNPROVEN_LOGIN_PATH`**.
- Legacy-shell reconciliation line added for A: D proved source wiring plus redirect code only; D did not prove
  the shell is served live or renders instead of redirecting.

## 2026-07-31 19:14 — Whole queue pass

- Parity breadth checked in the aggregate oracle: orders, drawings, replay, keyboard and context menus all have
  reference-vs-candidate cells plus host-routed RED controls; still model credit only until driven against the
  real single-realm app.
- Added D-owned destroy bytes behavior complement:
  `scripts/release-parity-destroy-bytes-behavior.mjs`. Current `noDestroy` state is RED because detached
  listeners/bytes survive and late pan/resize work can rehydrate bytes; `withDestroy` future control is GREEN.
- Coordination boundary with E updated in `HANDOFF-D-TO-E-DESTROY-BEHAVIOR-CONTROLS-20260731.md`. E owns
  `DESTROY-NO-DESTROY-RESURRECTS-INDICATOR` and correctness after teardown; D owns retained bytes / late work.
- M1 artifact not yet returned from B. Only B's host runner script is present under
  `_evidence/manager-B/m20-j1/run-d-m1-harness-on-host.sh`; D will not spend another login-path run. M1 stays
  D-owned and closes when B hands back the host artifact.
