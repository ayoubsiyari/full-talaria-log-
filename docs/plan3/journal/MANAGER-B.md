# Manager B journal — Product Fix Families

**Append-only.** Corrections are new entries that supersede earlier ones by id; earlier entries are never edited or deleted.
Territory (exclusive write): `chart v 1.4/chart/modules/order-manager.js`, `order-service.js`, `order-event-bus.js`, `preferences-init.js`, `preferences-sync.js`, `indicator-persist-rehydrate.js`.
Deploy target: **TEST-2 only**. Worktree: `C:/Users/user/Desktop/talaria1/manager-b-plan3` · branch `manager-b/plan3-20260727`.

---

## B-0001 — SESSION OPEN · 2026-07-27 23:47 (UTC+1)

Manager B session opened. Standing policy read in full before any other action: `DIRECTOR-RULINGS-20260727.md`, then `README.md`, `PLAN3-BOARD.md` (structure + my rows: M6, M15, M25, M26, M10/TAL-01896), `TICKETS-INTAKE-20260727.md`, `INTAKE-MERGE-20260727.md`.

Queue as received from the Director, in order:
1. Precondition audit on own territory — V6 call-site ownership (cheap tier, §A11.3).
2. Five V6 order-drag defects (M6).
3. V8 preference contract (M15) — timeframe pins, tool pins, pin-bar state.
4. M25 four REDs; M26 two REDs.
5. Trade-duration clock defect (TAL-01896); teardown residual.

Merge gate: authoring open from minute one; **no merge into integration until Manager C lands `TERRITORY.yml` + CI ownership preflight** (§A11.1). Verified at session open: no `TERRITORY.yml` exists anywhere in the repo, and `docs/plan3/journal/` did not exist (this file creates it). Gate is therefore **closed**; I author and do not merge, and I do not idle waiting.

Own worktree created off `main` @ `51b6e0da1740db9b384e61eef3fefbb771b0fc29` rather than working on the integration branch (§A11.1). The repository's default checkout is on `backlog/lane4-q4-path-cap` with a large uncommitted working set that is not mine; I touch none of it.

Outstanding `PO-REQ` count: **0**.

---

## B-0002 — PROVENANCE NOTE · standing policy changed during my read

`DIRECTOR-RULINGS-20260727.md` was **273 lines when I began reading it and 328 lines minutes later**. The added region is **§A13 "Managers dispatch, they do not implement" (PO directive, 2026-07-27 23:52)**, including §A13.1–§A13.4 (adversarial review at top tier, the model-routing table, parallel-subagent collision rules, mandatory brief contents).

Consequence, recorded because it changed my own conduct mid-session: my first pass missed §A13 through no fault of the Director. I re-read the file raw end-to-end and am operating under §A13 from this entry onward — I dispatch subagents and do not author product code myself; my own code reading is confined to the §A13 carve-out (reading in order to write a competent brief).

Standing request implied for the Director: when policy is amended mid-session, a one-line amendment marker would let managers detect it without re-reading 328 lines. Not an escalation, an observation.

---

## B-0003 — ASSUMPTION · model-routing reference resolves to §A13.2

The dispatch instruction cites "§Part 4 model routing"; §A13.1 likewise cites "§Part 4". **There is no §Part 4 in `DIRECTOR-RULINGS-20260727.md`** — the document is structured as Part A (§A1–§A13, §A5) and Part B (§B1–§B6). The only model-routing table in the corpus is **§A13.2**, and its content matches the Director's inline restatement exactly (cheap for audits/inventories, mid for implementing specced fixes, top for money-path/data-durability and root-cause triage, reviewer never downgraded).

**Assumption:** "§Part 4" is a stale cross-reference to **§A13.2**, which I treat as the operative routing policy. Routing recorded per dispatch. If the Director intends a different document, correct me and I will re-route in flight.

Corollary held as fact from §A13.2, not assumed: default tier is cheap (`composer-2.5-fast`, `cursor-grok-4.5-medium-fast`); escalation trigger is **verifiability, not apparent difficulty**; `opus 4.7` does not exist and is never substituted silently.

---

## B-0004 — ESCALATION (policy gap) · "§Part 6 standard" for the agent smoke sweep does not exist

§A12.3 makes this binding: *"No `PO-REQ` may be emitted until the packet's automated gates and the agent smoke sweep are green (§Part 6 standard)."* **There is no §Part 6 in the rulings corpus**, and a repository-wide search finds "Part 6" only in an unrelated analytics handoff document.

This is a real gate I cannot satisfy or self-define, and it sits directly in front of every `PO-REQ` I will need for V6 and V8 reporter re-verification. Per my operating rules I escalate rather than locally interpret.

**Ask:** either name the document that defines the agent smoke sweep standard, or state the standard in one paragraph. **Not blocking now** (I have no gate-green packet yet, so no `PO-REQ` is due); it becomes blocking at my first V6 packet. I continue working.

---

## B-0005 — VERDICT · V6 territory precondition (§A11.3): order-line paint, hit-testing and drag preview

surface=`source (repository working tree, branch backlog/lane4-q4-path-cap @ 634448817)` · coverage=`static call-site enumeration of chart.js + chart/modules/*.js; NOT verified on a served build, NOT verified on panel/iframe surface, no runtime binding check`

**Verdict: the V6 implementation is owned by `order-manager.js` (mine). Its invalidation/scheduling and its z-order referee are not. V6 is grantable to Manager B with three named seams that need a Director ruling.**

### Owned by me — implementation (`chart v 1.4/chart/modules/order-manager.js`, 49,672 lines)

| V6 concern | Site | Note |
|---|---|---|
| Order-line paint | `drawOrderLine()` @ 36214 | per-order line render |
| Order-line paint | `updateOrderLines()` @ 44563 | bulk reposition/purge/rebuild; the entry point everything else calls |
| Preview-line paint | `drawPreviewLine()` @ 22706 | creates visible `line` + invisible `hitLine` + `labelGroup` |
| Hit-target geometry | `drawPreviewLine()` @ 22729, 22747–22758 | `hitStrokeWidth = 20`, `pointer-events: stroke` when draggable |
| Hit-order priority | `_raiseEntryAnchoredPreviewBadgesToFront()` @ 22673 | lifts entry/avg-entry/SL/TP/multi-TP badge groups to top of SVG stack |
| Coincident-level stacking | `_multiEntryStackYOffsetPx()` @ 25360, `_computeMultiEntryStackIndices`, `ENTRY_STACK_OFFSET_PX` | **multi-entry legs only** |
| Multi-TP badge fan | `_drawMultiTPPreviewBadges()` @ 23897 | fans by index (`5px` X, `3px` Y) for *unset* targets at entry price |
| Drag + drag preview | all **7** `d3.drag()` registrations @ 22940, 23945, 24024, 26251, 35619, 37850, 38801 | zero order drag handlers exist outside this file |
| Drag-time recompute | `calculateAdvancedRiskReward()` @ 23013/23262/23457/23525; `updatePlaceButtonText()` @ 23409, 23739–23746 | see the deferral finding below |
| Drag freeze flag | `isDraggingPreviewLine` — 25 sites, notably @ 1368, 1383, 25352, 25983, 28446 | suppresses `updatePreviewLines()` during drag |

`chart.js` contains **no** order-line paint, hit-test or drag implementation: a search for order/SL/TP-named functions returns exactly one unrelated match (`isMacChartPlatform`), and it registers exactly one `d3.drag()` (@ 40966, not an order path).

### Seam 1 — invalidation and scheduling live in `chart.js` (Manager A)

`chart.js` decides *when* my paint runs, and owns the kill-switches for it:
- `_syncOrderOverlaysDuringPan(panActive)` @ 28594 — the pan-lite path. Chooses between `om.updateOrderLines(this, { panLite: true, skipTradeMarkers: true })` @ 28647 and a full `om.updateOrderLines(this)` @ 28671, then calls `om.updatePreviewLinePositions()`, `om._updateEntryMarkersForChart()`, `om._updateExitAndPartialMarkersOnMain()`, `om.updateMfeMaeMarkers()`, `om._scheduleDraftPreviewRedrawIfNeeded()`.
- Kill-switches declared and read in `chart.js`, not mine: `__TALARIA_DISABLE_ORDER_OVERLAY_PAN_LITE_V1`, `__TALARIA_DISABLE_TRADE_MARKER_LIVE_PAN_GLUE_V1`, `__TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1`.
- `render()` tail @ 29500–29514 — the post-scale repaint call, gated on `chartViewPanning`.

**Why this matters for defect 1 (lines disappearing while moving/after placement):** if the mechanism is *when* repaint is invoked or which lite path is selected mid-gesture, the cure is in `chart.js` and is **A's**, not mine. If it is what `updateOrderLines()` does when invoked (purge-then-rebuild ordering, registry vs DOM divergence), it is mine. The two are distinguishable by diagnostic and I have routed that triage to top tier rather than guessing — the in-file comments at 28600–28614 record that this exact path already produced two prior "froze until mouse-up" defects, so the prior is genuinely split.

### Seam 2 — the z-order contest is refereed by two files I do not own

Hit-order priority when lines overlap is decided by three parties:
- mine: `_raiseEntryAnchoredPreviewBadgesToFront()` (order-manager @ 22673),
- **`modules/drawing-tools-manager.js`**: `raiseDrawingLayersAboveOrderPreviews()` @ 8280, called @ 8262, 12850, 12921 — deliberately lifts drawing layers *above* order previews, which my function then re-raises against. My own source comment @ 22688–22692 documents that losing this contest swallows the multi-entry ✓/✕ clicks outright.
- **`chart.js`**: `updateSVGPointerEvents()` @ 37678 — I call it from 8 sites in order-manager; it decides whether the root SVG captures at all.

`drawing-tools-manager.js` is **assigned to no manager** in my brief or in the `INTAKE-MERGE-20260727.md` §3 matrix. It also **writes order state directly**: `orderManager.orderLines = orderManager.orderLines.filter(...)` at 12088, 12097 and 12133 — a foreign module mutating my registry.

### Seam 3 — `order-manager.js` is co-claimed by M23/M24 (Lane 5)

`INTAKE-MERGE-20260727.md` §3 grants Lane 5 exclusive write on `order-manager.js` for M23/M24, and the recorded V6 blocker is verbatim *"Lane5 order-manager.js exclusive ownership"* (see B-0006). The Director has now granted the same file to me, and separately told me M24's ledger migration is live and that I am the only manager permitted to author migrations, strictly serialised. I read those together as: **the Lane-5 grant is superseded and M24's `order-manager.js` work now flows through me and is serialised by me.** That reading is load-bearing and it is an inference, so it is filed as an assumption in B-0007, not acted on as fact.

### What I am NOT doing

Not editing `chart.js`, `drawing-tools-manager.js`, or any shell to make a V6 fix possible. Where the cure lands outside my territory I will report it and stop, per instruction.

---

## B-0006 — EVIDENCE FOUND · V6 already has PO evidence; V8 already has a RED

Neither artefact is on `main`; both were located on sibling worktree commits and are not in the docs tree. Recording them so no one re-runs them.

**V6 — `docs/plan3/PO-V6-PARTIAL-20260727.evidence.json`** on `24ea0eabb` (2026-07-27 12:08, build **B75**, lineage `ACCEPTED_PO_SWEEP`, result **PARTIAL**, `productEditsAuthorized: false`, blocker "Lane5 order-manager.js exclusive ownership", `overClosureProhibited: true`, `screenshotSha256: REQUIRED_PENDING`). Matrix maps cleanly onto the Director's five defects:

| Cell | Result | Observation | Maps to |
|---|---|---|---|
| A, F | RED | joint current-build line visibility (TAL-01696, TAL-01698) | lines disappearing; SL/TP not fully visible |
| B | RED | entry-dependent SL/TP recompute (TAL-01697 scenario PASS) | SL/TP not updating until release |
| C | RED | label overlap + cross-order disambiguation — **`poQuestion: PENDING`** | overlapping TP boxes |
| D, E | PASS | order drag scenario; TAL-01699 blocker | — |
| G | RED | release-gated preview, **broader than TAL-01617** | preview calc not updating until release |

Dispositions to honour: TAL-01697 `SCENARIO_PASS_NO_OVER_CLOSE`, TAL-01699 `BLOCKER_PASS_NO_OVER_CLOSE`, TAL-01897/TAL-01750 `CLOSE_PENDING_REPORTER_CONFIRMATION`, **TAL-01885 `STALE_SURFACE_TRIAGE_SURVIVED_REENTER_ENGINEERING`** (stale-surface triage already run and survived — this is real engineering, not a retest), TAL-01617 `OPEN_BROADER_RELEASE_GATED_RED`. Cell C carries an unanswered PO question; I will not invent its answer.

**V8 — `tests/evidence/b70-stage5/b75-po-v8-owner-pins-red.mjs`** + `.test.mjs` on `b925f7d2d` (2026-07-27 12:12, "diagnose owner pin persistence red"). It already establishes the mechanism, and it establishes that **V8 is not inside my territory**:
- Pin state is `useState` with hardcoded defaults in **`chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`** — `toolPinned` (`Trend Line, Horizontal Line, Fib Retracement, Rectangle, Text`), `tfPinned` (`1m, 5m, 15m, 1H, 4H, 1D`), `pinnedBarOpen: false`, `pinnedBarPos: {x:50,y:80}`. `runLifecycleMatrix()` records the sharpest line in the harness: apparent account isolation is **"remount-to-default, not owner-scoped persistence."**
- Owner identity bootstraps in **`chart v 1.4/talaria-design/live/index.html`** — a servable shell — with `window.userStorage` shim created *synchronously* while `/api/auth/me` resolves *asynchronously*, plus a cached `localStorage['_uid']` and a late `window.__talariaUserId` fallback. That is precisely the §A4 "empty or failed read is never authoritative" hazard, in the shell.
- Backend members probed in `journal-backend/routes/chart_routes.py` + `models.py`: `timeframe_favorites` exists; `tool_pins` and `pin_bar` are probed as possibly absent.

---

## B-0007 — ASSUMPTIONS · unverified premises I am proceeding on

Each is unverified, each would change my plan if false, none is treated as fact.

- **B-0007a** Lane 5's exclusive-write grant on `order-manager.js` (`INTAKE-MERGE-20260727.md` §3) is superseded by my grant, and M24 ledger-migration work on that file is now mine to author and serialise. *If false, V6 is blocked exactly as it was at 12:08 today and the Director should say so.*
- **B-0007b** "M25's four REDs" and "M26's two" mean authoring failing tests that encode those rows' member scenarios, not editing `replay-system.js` or `chart.js`. Board: M25 = `replay-system.js` tick/step + replay clock (Lane 2, 4 members after the PO scratched TAL-01854); M26 = `chart.js` viewport/interaction (Lane 1, **5** members, "SERIALIZED BEHIND B74", "MUST NOT open before the B74 integration branch lands"). Both product surfaces are explicitly outside my territory, and test harnesses belong to Manager C. See the escalation in B-0008.
- **B-0007c** The V6 evidence at `24ea0eabb` is still current for build B75 and no later V6 run supersedes it. Its `screenshotSha256` is `REQUIRED_PENDING`, so the visual record is incomplete.
- **B-0007d** `drawing-tools-manager.js` has no current writer, so its 3 direct writes to `orderManager.orderLines` are not being changed underneath me.
- **B-0007e** TEST-2 exists and satisfies the §B5 database-isolation condition. An `infra/test2-profile` worktree exists, which suggests it was stood up; I have not verified DB isolation and will not deploy until I have.

---

## B-0008 — ESCALATION (territory) · four rows in my queue are not in my territory

Reported, not decided. I am not touching any of these files, and I am not idling — I am working V6 and the V8 persistence half meanwhile.

1. **M25 (four REDs)** — product surface is `replay-system.js` (replay tick/step generator + replay clock). My brief forbids `replay-system.js` and the data pipeline. Board assigns it to Lane 2. **Ask:** does my M25 scope mean RED authoring only, and if so, why is it not Manager C's (harnesses/oracles/CI are C's)?
2. **M26 (two REDs)** — product surface is `chart.js` viewport/interaction, Manager A's exclusive territory, and the board marks the row SERIALIZED BEHIND B74 with an explicit must-not-open. The board lists **5** members, not two. **Ask:** which two, and same RED-ownership question as M25.
3. **Teardown residual (~230 MB)** — §A1 item 4 defines it as *"Workstream-A retained-set hygiene (view/listener/cache release on panel destroy)"* in a parallel lane. Panel destroy is A's surface. I can own the order-side retained set (order-manager listeners, marker registries, series caches) and nothing else. **Ask:** confirm my slice is order-side only.
4. **V8 preference contract** — splits across three owners and I hold only one part. Mine: the persistence engine in `preferences-init.js` / `preferences-sync.js`. Not mine: the React pin state in `talaria-design/src/TalariaV8bLive.jsx`, and the owner-identity bootstrap in `talaria-design/live/index.html`, which is a **servable shell** and therefore explicitly A's. Also unassigned: the `journal-backend` preference members. **Ask:** either move the pin-state call sites to me, or assign A the React/shell half against a contract I author. I will author the owner-scoped contract and its RED regardless, since that half is unambiguously mine and is the part the PO's spec actually rests on.

Plus, from B-0005: **`drawing-tools-manager.js` is unassigned** yet it both contests order-preview z-order (`raiseDrawingLayersAboveOrderPreviews`) and writes `orderManager.orderLines` directly at three sites. V6's overlapping-TP/hit-priority defect cannot be closed with coverage while a file nobody owns can re-order my layers and mutate my registry. **Ask:** assign it, or rule that the seam is mine to define and A's to honour.

---

## B-0009 — RESERVATIONS · claimed before any dispatch (§A13.3)

Reserved now so parallel briefs cannot collide. Unused reservations will be released in a later entry rather than silently reused.

**Kill-switch globals** (default-ON cures, switch-OFF must be a demonstrated cell per §B3, not merely declared):
- `__TALARIA_DISABLE_ORDER_SLTP_ENTRY_DRAG_FOLLOW_V2` — SL/TP follow the entry live during entry drag (V6 defect 2 / cell B / TAL-01653).
- `__TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1` — preview/RR/qty recompute every drag frame instead of on release (V6 defect 5 / cell G / TAL-01617, TAL-01697).
- `__TALARIA_DISABLE_ORDER_TP_COINCIDENT_STACK_V1` — coincident-TP stacking + hit disambiguation (V6 defect 3 / cell C / TAL-01699).
- `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1` — full-visibility clamp for SL/TP lines and labels at plot edges (V6 defect 4 / TAL-01885).
- `__TALARIA_DISABLE_ORDER_LINE_DRAG_PERSIST_V1` — order lines survive move/placement (V6 defect 1 / cells A, F / TAL-01696, TAL-01698, TAL-01789).
- `__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1` — owner-scoped pin persistence (V8 / M15 / TAL-01792, TAL-01895).
- `__TALARIA_DISABLE_TRADE_DURATION_CLOCK_V1` — trade-duration clock (TAL-01896).
- `__TALARIA_DISABLE_ORDER_TEARDOWN_RELEASE_V1` — order-side retained-set release on teardown.

**Global symbols:** `window.TalariaPreferences` (facade published by `preferences-init.js`), `window.__TALARIA_PREF_SCHEMA_VERSION`, `window.__TALARIA_LOADED_MODULES` entry name `TalariaPreferences` (the §A4c-3 presence channel; the array itself is C's/A's contract, I reserve only my member name).

**Storage keys** — per-key writes only, never a blob (§A4 guardrail 1), tier encoded in the key so a layout can never rewrite a user preference (§A4 tier 2), schema version in the prefix (§A4 guardrail 3):
- `tal.pref.v1.u.<accountId>.pins.timeframes`
- `tal.pref.v1.u.<accountId>.pins.tools`
- `tal.pref.v1.u.<accountId>.pinbar.open`
- `tal.pref.v1.u.<accountId>.pinbar.pos`
- `tal.pref.v1.meta.schemaVersion`
- Legacy keys to be read-migrated and retained one full release cycle per §A4 (lazy migration on read): `v9_tool_pinned`, `v9_tf_pinned`, `v9_pinned_bar`, `toolPinned`, `tfPinned`, `pinnedBarOpen`, `pinnedBarPos`. **Not reserved — pre-existing**, listed so no one treats them as free.
- Reset-to-defaults entry point reachable without loading the chart (§A4 guardrail 6): URL param `?talPrefReset=1`.

**Message names** (panels are iframes, so these cross frames): `talaria:pref:set`, `talaria:pref:changed`, `talaria:pref:request-snapshot`.

Note on `<accountId>`: preferences are keyed to account id and must remain excludable from customer data per I16 (§A4 first line). No account id is embedded in any evidence artefact; QA account ids only.

---

## B-0010 — DISPATCH · read-only audits, cheap tier, parallel (§A13.2, §A13.3)

Read-only subagents cannot collide, so parallelism is unlimited. Neither may write any file.

- **B-A1** — V6 call-site ownership audit, independent of B-0005. Tier **cheap** (`composer-2.5-fast`) per §A13.2 row 1 (audits, file:line inventories); the verifier is my own independent enumeration in B-0005, so an undetected error is caught, which is the §A13.2 escalation test. Writable file set: **none**.
- **B-A2** — V8 preference-state and storage-key inventory across React source, servable shells, chart modules and `journal-backend`. Tier **cheap** (`composer-2.5-fast`), same row. Verifier: the existing V8 RED at `b925f7d2d`. Writable file set: **none**.

Per §A13.2, cheap-tier output is evidence only — no classification or verdict from these subagents enters the record. Every verdict in this journal is mine, with `surface=` and `coverage=`.

Write packets in flight: **0 of 3** (§A13.3 cap). Outstanding `PO-REQ` count: **0**.

---

## B-0011 — ESCALATION (provenance) · the standing policy documents are not version-controlled

Found while committing this journal. `.gitignore:24` ignores `docs/`. Of everything under `docs/plan3/`, exactly **45 paths are tracked** (force-added historically) and the only tracked markdown at the top level is `PLAN3-BOARD.md`. The following are **untracked and ignored**, i.e. they have no git history, no diff, no blame, and no provenance:

- `docs/plan3/DIRECTOR-RULINGS-20260727.md` — the standing policy that binds all three managers
- `docs/plan3/README.md`
- `docs/plan3/INTAKE-MERGE-20260727.md`
- `docs/plan3/TICKETS-INTAKE-20260727.md`
- `docs/plan3/STICKY-REGISTRY.md`
- `docs/plan3/PO-SWEEP-RESULTS-20260727.md`

This is the mechanical explanation of B-0002. §A13 was added to the rulings while I was reading them and there was **no way to detect it except noticing that the file's line count had changed from 273 to 328**, because there is no commit to diff. A manager cannot verify which version of policy it is bound by, cannot cite a policy revision in a packet, and cannot detect an amendment mid-flight.

It also undercuts D-034 in its own terms: this programme requires a provenance chain for every byte it ships, while the document defining that requirement is the one artefact with no provenance chain at all.

**Ask (cheap, and I am not the right owner):** force-add the plan-3 governance markdown to git, or add a `!docs/plan3/**/*.md` negation to `.gitignore`. Either makes policy amendments diffable and citable. This is tooling and repository hygiene, which is Manager C's charter, so I am not doing it inside my territory — I am reporting it. My own journal is force-added to git in the same commit as this entry, following the existing convention for tracked files under `docs/`.

**Not blocking.** Recorded because a governance system whose governance is untracked will produce a disputed instruction eventually, and it is far cheaper to fix now than to adjudicate later.

---

## B-0012 — DISPATCH · B-A3, trade-duration clock and order-side retained set (read-only, cheap)

Dispatched to keep working while B-A1 and B-A2 are in flight (§A11.1: never idle). Read-only, so it cannot collide with them.

**B-A3** — locate the trade-duration computation for TAL-01896 ("wrong duration in all-trades", an M10 member the Director queued to me, and the §B3 calibration example for Tier 1), and separately inventory the order-side retained set: order-manager timers, listeners, marker registries and series caches that are not released on teardown. Tier **cheap** (`composer-2.5-fast`) per §A13.2 rows 1–2 (inventories, timer/listener census). Writable file set: **none**.

The teardown half is deliberately scoped to the order side only, because §A1 item 4 defines the ~230 MB teardown residual as Workstream-A panel-destroy hygiene, which is not my territory (see B-0008 item 3). I am inventorying my own contribution to it and nothing else.

Write packets in flight: **0 of 3**. Outstanding `PO-REQ` count: **0**.

---

## B-0013 — SELF-CORRECTION · two defects in my own §A13 compliance

§A13 re-issued to all managers 2026-07-28 00:08. Re-read in full against source. No change to my operating posture — B-0002/B-0003 already recorded it and I have authored nothing — but re-reading it against my own three dispatches surfaced two defects in my compliance, both mine, both recorded here rather than quietly fixed.

**Defect 1 — brief form.** §A13.4 requires every brief to state *"task, tier and model with the reason for that tier, the exact file set the subagent may write, names already reserved for it, the acceptance criterion, and what it must report back."* B-A1/B-A2/B-A3 each stated the task, the writable file set (`NONE`, in the first two lines), the acceptance criterion as a mandated output format, and the report-back. **None of them stated the tier, the model, or the reason for the tier inside the brief itself** — I recorded that in B-0010/B-0012 instead. The brief is the artefact that gets checked, so putting the routing rationale only in my journal is not compliance.

Not invalid under the §A13.4 invalidity test, which turns specifically on the writable file set, and all three declared `NONE`. Not re-dispatched: they are read-only, so no naming collision and no territory risk is possible, and re-running them would burn tokens to fix a form defect with zero substantive effect. **Every brief from B-0017 onward carries the routing block.** Template of record appended below.

**Defect 2 — reservations incomplete.** §A13.3 requires reserving *"kill-switch names, global symbols, storage keys, message names, oracle and fixture names"* before dispatch. B-0009 reserved the first four and **omitted oracle and fixture names entirely**. That gap has teeth: the §B3 provenance floor makes a regression test part of every packet, so every write packet I dispatch will create oracle and fixture names, and two parallel briefs could have collided on them. Closed in B-0014 before any write packet is dispatched.

### Brief template of record (Manager B)

Every write and read brief I issue from now states, in this order: **task** · **tier + model + the §A13.2 row and escalation-trigger reason** · **exact writable file set, enumerated, or `NONE`** · **names reserved for this brief** (from B-0009/B-0014, quoted, with "invent no new names; if you need one, stop and report") · **acceptance criterion** · **what to report back** · **explicit prohibitions** (files it may not touch, and "do not weaken or remove a gate, guard or kill-switch to make a test pass").

---

## B-0014 — RESERVATIONS supplement · oracle and fixture names (closes B-0013 defect 2)

Reserved before any write dispatch. Naming grammar: `b-<row>-<concern>-<kind>`.

**Oracles / REDs:**
- `b-m6-sltp-entry-drag-follow.red.mjs` — SL/TP track the entry live during entry drag (V6 defect 2).
- `b-m6-preview-live-recalc.red.mjs` — RR / position size / PnL / place-button recompute per drag frame, not on release (V6 defect 5).
- `b-m6-tp-coincident-stack.red.mjs` — two TPs at one price remain individually addressable (V6 defect 3).
- `b-m6-line-edge-visibility.red.mjs` — SL/TP line and label fully within the plot at both edges (V6 defect 4).
- `b-m6-line-drag-persist.red.mjs` — order lines survive move and placement (V6 defect 1).
- `b-m15-owner-scoped-pins.red.mjs` — pins survive refresh, exit/re-entry and new session, per owner (V8).
- `b-m10-trade-duration-clock.red.mjs` — trade duration (TAL-01896).
- `b-order-teardown-release.red.mjs` — order-side retained-set release.

**Negative-control cells** (§A5-1, paired kill-switch-OFF cells asserting RED): same basename with `.negctl.mjs`.

**Fixtures:** `b-fixtures/m6-two-tp-coincident.json`, `b-fixtures/m6-entry-drag-sltp.json`, `b-fixtures/m6-edge-price-extremes.json`, `b-fixtures/m15-pin-lifecycle-matrix.json`, `b-fixtures/m10-duration-replay-vs-wallclock.json`.

Fixtures carry **no** wall-clock timestamps, UUIDs, rAF ordering or float equality inside assertion payloads (§A5-6), and **no** real account ids (I16); QA account ids only.

Naming caveat, flagged not decided: test-harness and CI *placement* is Manager C's charter. I reserve these names and will have my packets' REDs authored, but where the files physically land and how they enter CI is C's call. If C wants a different path or grammar, the names move and I re-record them here.

---

## B-0015 — VERDICT · my whole V6 queue is one file, so §A13.3 serialises it; write partition and packet plan

surface=`source (branch manager-b/plan3-20260727 @ e096b1ff2, base main 51b6e0da1)` · coverage=`static; derived from the B-0005 call-site inventory and the B-0006 V6 evidence matrix. Not verified on a served build. Mechanism attribution for defect 1 is explicitly NOT covered and is out for triage.`

**The structural fact:** all five V6 defects, and M24's ledger migration, live in `order-manager.js`. §A13.3 states *"two subagents may never hold the same file"* and *"same-file work is serialised, never merged optimistically."* Therefore **the three-packet cap never binds me on V6 — the file binds first, at one packet at a time.** Five defects plus a live ledger migration through a single 49,672-line file is a one-lane road, and that is a throughput fact the Director should price rather than discover at a train boundary. Escalated in B-0016.

**Write partition inside my territory** (I am accountable for it per §A13.3). Three disjoint lanes, so my genuine parallelism ceiling is 3, and it is reached only when work exists in all three:

| Lane | Files | Status |
|---|---|---|
| α | `order-manager.js` | **serialised, one packet at a time** — V6 ×5 and M24's migration all queue here |
| β | `preferences-init.js`, `preferences-sync.js` | free — V8 engine half lands here, parallel to α |
| γ | `order-service.js`, `order-event-bus.js`, `indicator-persist-rehydrate.js` | free |

**V6 decomposition — grouped by mechanism, not by ticket,** because grouping is the only lever that shortens a serial queue without breaking the one-writer rule. Five defects become three packets and one blocked item:

- **V6-P1 — deferred-until-release recompute** (defects 2 and 5; evidence cells B and G; TAL-01653, TAL-01697, TAL-01617). One mechanism: work is skipped during drag and run at `'end'`. The `isDraggingPreviewLine` freeze flag (25 sites) and the guarded block at `order-manager.js:23528–23604` are the same shape, and `updatePlaceButtonText()` is called per-frame at only one site (23409) against three at drag-end (23739–23746). **Tier 3 / top tier (`claude-opus-5-thinking-high`).** Reason, as a stated trigger and not a difficulty judgement: these two defects decide *the numbers a trade is placed on* — SL/TP prices and risk-derived position size — which is money-path under §B3 and D-030 per the board's own M6 note; and **no existing oracle asserts painted preview values**, so an undetected error is expensive and unverified, which is exactly §A13.2's escalation trigger. Lane α, first.
- **V6-P2 — plot-edge visibility** (defect 4; TAL-01885, disposition `STALE_SURFACE_TRIAGE_SURVIVED_REENTER_ENGINEERING`, so this is engineering and not a retest). Clamp geometry is `Math.max(0, Math.min(chartHeight, event.y))` at 23025 and repeated at 23073/23088/23106, with label translate at 23188. **Tier 2 / mid tier (`gpt-5.5-medium-fast`).** Reason: fully speccable leaf-file change, and its RED is a deterministic geometry assertion, so the gate does the quality work — §A13.2 says stay cheap when that is true. Lane α, second.
- **V6-P3 — coincident-TP addressability** (defect 3; TAL-01699; evidence cell C). **BLOCKED on a spec answer, see B-0016.** Mechanism is already located: a stacking mechanism exists but only for multi-*entry* legs sharing a price (`_multiEntryStackYOffsetPx` @ 25360, `ENTRY_STACK_OFFSET_PX`), while multi-TP badges fan only by index for *unset* targets at the entry price (`_drawMultiTPPreviewBadges` @ 23897). There is no coincident-*TP* equivalent. What the fix should *do* when two TPs occupy one price — offset, cycle on repeat click, or something else — is a product decision I may not make.
- **V6-P4 — lines disappearing** (defect 1; cells A and F; TAL-01696, TAL-01698, TAL-01789). **Cannot be packeted until attribution is settled**, because the cure may sit in `chart.js`'s invalidation path (Manager A) rather than in mine — B-0005 seam 1. Root-cause triage dispatched as B-0017. Deliberately read-only, so it takes no lane and blocks nothing.

Every packet gets a separate top-tier adversarial review subagent (`claude-opus-5-thinking-high`) that did not author it, reconciled by me (§A13.1). Reviewers are never downgraded regardless of the authoring tier.

---

## B-0016 — ESCALATION · one throughput ruling and one spec question

**(a) `order-manager.js` is a single-lane road for V6 and M24 simultaneously.** Per B-0015 the file serialises five V6 defects and a live ledger migration. I have already compressed five defects into three packets by grouping on mechanism; beyond that I cannot parallelise without violating §A13.3, and I will not. Three options exist and all three are the Director's to pick, not mine: accept serial throughput on lane α; give M24's migration an explicit slot in my serial order so it is scheduled rather than colliding; or authorise a structural split of a 49,672-line file, which is architecture, top tier, and a large blast radius I would not recommend mid-flight while a ledger migration is live. **My default absent a ruling:** V6-P1 → V6-P2 → M24 migration slot → V6-P3/P4 as they unblock, with the V8 engine running in lane β in parallel throughout. I proceed on that default and will re-order on one line from you.

**(b) V6 evidence cell C carries `poQuestion: PENDING` and I cannot invent the answer.** The question is what should happen when two take-profits occupy the same price: separate them visually by an offset, keep them coincident but cycle selection on repeated clicks, or refuse the duplicate at entry. This is a product decision.

Filed as **`NEEDS-PO-CLARIFY`**, not as a `PO-REQ`, and the distinction is deliberate: §A12.2's `PO-REQ` template is verification-shaped — surface, URL, build ID, numbered steps, a stated prediction the PO confirms — and a spec question has no build to confirm and no prediction to test. `README.md` §Intake protocol item 3 already defines `NEEDS-PO-CLARIFY` as the channel for exactly this, and it explicitly *"never blocks other rows in the same lane"*, which is why V6-P1 and V6-P2 proceed ahead of it. If the Director wants spec questions carried as `PO-REQ` anyway, say so and I will re-file. **This is the reason my outstanding `PO-REQ` count is 0 and not 1.**

---

## B-0017 — DISPATCH · B-T1, root-cause triage of "order lines disappear while moving" (read-only, TOP tier)

**Task:** attribute V6 defect 1 to a mechanism and name the owning file, distinguishing "what `updateOrderLines()` produces when invoked" (mine) from "when and how `chart.js` invokes it mid-gesture" (Manager A's, per B-0005 seam 1).

**Tier / model:** **top** — `claude-opus-5-thinking-high`. §A13.2 row *"root-cause triage of any surprise or new regression"*. The escalation trigger is met on its own terms: a wrong attribution here sends the packet to the wrong manager's territory, and **no automatic verifier catches a mis-attribution** — it surfaces as a rejected packet or, worse, as an edit in someone else's territory. Cheap tier is correct where a gate converts a mistake into a rejection; there is no such gate for ownership attribution.

**Writable file set: NONE.** Read-only. Takes no lane, so it blocks nothing and can run beside the three cheap audits.

**Names reserved for it:** none — it writes nothing. It must invent no kill-switch, oracle or fixture names; if it believes one is needed it reports the need and I reserve it.

**Acceptance criterion:** a mechanism stated as a causal chain with file:line at every step, an explicit verdict of `order-manager.js` / `chart.js` / `both`, and — required — the discriminating observation that would distinguish the two attributions on a live build, so the attribution is falsifiable rather than argued.

Write packets in flight: **0 of 3**. Read-only subagents in flight: **4** (B-A1, B-A2, B-A3, B-T1). Outstanding `PO-REQ` count: **0**. Outstanding `NEEDS-PO-CLARIFY`: **1** (V6 cell C).

---

## B-0018 — RECONCILIATION of B-A1 · four corrections to B-0005, which is superseded in part

B-A1 returned. Its output is **evidence, not verdict** (§A13.2: no cheap-tier judgement enters the record); the four findings below are my own, reconciled against my independent B-0005 enumeration. It confirmed my core attribution — paint, hit-testing and drag all implement in `order-manager.js`, and `chart.js` registers exactly one `d3.drag()` which is a legacy drawing handle at 40966, not an order path. It corrected me on four things that matter, and **B-0005 is superseded on each**.

**(1) My "all seven `d3.drag()`" statement was incomplete, and the gap is exactly where two defects live.** Beyond the seven `d3.drag()` registrations there are **three native `document`-level mousemove/mouseup drag systems** in the same file: `makeLineDraggable` @ 34389 (open entry / SL / TP / BE), `_setupPendingEntryDragToCreateTPSL` @ 35160, `_setupEntryDragToCreateTPSL` @ 35374. **Open, executed orders drag through the native path, not through d3.** V6-P1's scope must therefore cover both, and the store-write behaviour differs between them: the native path commits via `_oiCommitOpenSltpToStore` @ 34791 at mouseup while writing a provisional price during drag @ 34561–34578, gated on `_orderSltpApplyOnReleaseFixEnabled()`. Same defect shape, two implementations. A packet scoped only to the d3 path would have half-fixed it and looked green.

**(2) `chart.js` deletes my DOM by class allow-list — a mechanism candidate I did not have.** `chart.js:37783` defines `_preserveOrderOverlay` and `chart.js:37811` runs `svg.selectAll('*:not(...)').remove()` during the legacy `redrawDrawings` purge, preserving order overlays **by class name**. Any order-line class absent from that allow-list is destroyed by A's redraw. That is a first-class candidate for "lines disappearing" and it is structurally fragile: every new class I create in `order-manager.js` must be registered in a list living in A's file, with no gate asserting the two agree. Forwarded to the defect-1 triage.

**(3) Three unassigned files touch order paint, not one.** Beyond `drawing-tools-manager.js` (which I already reported): `drawing-tools-advanced.js` calls `updatePreviewLines()` @ 1964, 1978, 2014; `multichart-prod/panel-cmd-bridge.js` calls `drawOrderLine`, `drawSLTPLines`, `updateOrderLines`, `updateSLTPLines`, `updateBELines` and `removePreviewLines` across ~13 sites (261–317, 4590–4655, 4781). Also **`order-interaction-guard.mjs`**, which *declares* the kill-switches `order-manager.js` reads — a file gating my own behaviour that is in nobody's territory. And `replay-system.js` (A's) calls `orderManager.updatePositions` @ 4074, 5813. My territory's public paint surface is consumed by at least five files outside it.

**(4) Nineteen kill-switches already gate these three concerns, and two of them own behaviour I had minted new names for.** Most consequential: `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` (declared `order-interaction-guard.mjs:45`, read `order-manager.js:250–252`, branches at 22977+, 23127, 23204, 23237, 34561, 34791) and `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` (read `order-manager.js:274–275`, 970). **An apply-on-release switch and an exec-drag-follow switch already exist for precisely the mechanism V6-P1 addresses.** Minting a second switch over the same behaviour would produce two switches for one mechanism and a negative-control cell that proves nothing — the `852420adc` "a declared switch is not a switch" failure in a new costume. Reservations corrected in B-0019. Also newly recorded: `__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1` (`chart.js:29418/29422`), a second A-owned invalidation switch I had not listed.

**Consequence for V6-P2, recorded as a change of direction.** I assumed defect 4 was a *missing* clamp. There is instead substantial deliberate visibility machinery in my file: `_isOrderYInMainPlot` @ 44465 (margin top/bottom versus the indicator stack), `_applyOrderRowMainPlotVisibility` @ 44473 which **hides rows outside the plot**, and `_applyPlotClipToOrderOverlays` @ 44507 applying a `clip-path` to order selectors. So "SL and TP lines not fully visible" is most likely this machinery computing plot bounds wrongly when an indicator stack is present — a bug *in* an intentional feature, not an absence. It stays mid tier because the RED is still a deterministic geometry assertion, but the brief must establish whether hiding outside-plot rows is intended before changing it, and report back rather than decide if it is ambiguous.

**Confirmed clean:** no order-line paint, hit-test or `orderLines` read/write exists in `order-service.js`, `order-event-bus.js`, `preferences-init.js`, `preferences-sync.js` or `indicator-persist-rehydrate.js`. Lane γ is genuinely disjoint from lane α, so my write partition in B-0015 holds.

---

## B-0019 — RESERVATIONS CORRECTED · supersedes B-0009 on three points

**Withdrawn, because an existing switch already owns the mechanism** (§B3: a second switch over one mechanism makes both untrustworthy):
- ~~`__TALARIA_DISABLE_ORDER_SLTP_ENTRY_DRAG_FOLLOW_V2`~~ → V6-P1 extends the existing `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` and `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX`.
- ~~`__TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1`~~ → same two switches.

If V6-P1's implementer finds the existing switches cannot express the new behaviour cleanly, it must **stop and report** rather than mint a name; I will then reserve one deliberately, with the reason recorded here.

**Retained unchanged:** `__TALARIA_DISABLE_ORDER_TP_COINCIDENT_STACK_V1`, `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1`, `__TALARIA_DISABLE_ORDER_LINE_DRAG_PERSIST_V1`, `__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1`, `__TALARIA_DISABLE_TRADE_DURATION_CLOCK_V1`, `__TALARIA_DISABLE_ORDER_TEARDOWN_RELEASE_V1`. No existing switch collides with any of these.

**Storage-key grammar corrected.** B-0009 reserved `tal.pref.v1.u.<accountId>.pins.*`, embedding the account id myself. That was wrong: the shells already apply owner scoping automatically — `window.userKey(key)` returns `'u' + id + '_' + key` and `window.userStorage` wraps `localStorage` through it (`live/index.html:1487–1509`, mirrored in `chart-embed.html:276–296` and `legacy-index.html:91–98`). Embedding a second owner prefix would create two competing scoping schemes over one store. **Corrected reservation — plain keys passed through `userStorage`, owner scoping delegated to the shell:**
- `pref.v1.pins.timeframes` · `pref.v1.pins.tools` · `pref.v1.pinbar.open` · `pref.v1.pinbar.pos` · `pref.v1.meta.schemaVersion`

With one hard condition, which is the subject of B-0020: `userKey()` returns an **unscoped** key when the owner id is unresolved, so delegating scoping is only safe if my facade refuses to write until the owner is known. That is a fail-safe-on-write requirement, not an optimisation.

---

## B-0020 — VERDICT · V8 is not "build persistence", it is "wire persistence that already exists", plus three defects nobody has a row for

surface=`source (working tree; React sources, chart modules, journal-backend, all servable shells)` · coverage=`static inventory cross-checked against the b925f7d2d V8 RED. NOT verified on a served build; no runtime confirmation that the unwired path is unreachable in production; backend behaviour not exercised.`

B-A2 returned; findings below are my verdict on its evidence.

**The core correction to my own framing, and to the premise I was given.** The brief described pins as "React-only state with no owner-scoped persistence". The first half is exact — `TalariaV8bLive.jsx:12420` (`tfPinned`), `:12028` (`toolPinned`), `:14200`/`:14201` (`pinnedBarOpen`, `pinnedBarPos`), all `useState` with hardcoded defaults, no read or write of any storage key. The second half is not: **a complete owner-scoped, per-field, local-plus-cloud preference path already exists in my own territory and is simply never called by the pin UI.** `preferences-sync.js` implements per-field writes (`updatePreference` @ 295–308, `saveToLocalStorage` @ 313–374), local-first with cloud fallback (`loadPreferences` @ 22–68, `syncToAPI` posting only `pendingUpdates` @ 379–436); `preferences-init.js` exposes `saveTimeframeFavorites`/`loadTimeframeFavorites` @ 39–44; and `timeframe_favorites` is a **real DB column** (`journal-backend/models.py:786`, migration `add_user_preferences_table.py:30`) served by `GET`/`POST /api/chart/preferences` (`chart_routes.py:487–490`, `551–594`).

So the timeframe-pin half of V8 is a **wiring** job, and the wiring point is one React file in Manager A's territory. That materially reduces the engineering and sharpens B-0008 item 4: the useful thing I can do in my own files is make the contract safe and callable, and the thing that actually closes the row is a call site I may not write.

**Three defects that need rows and have no owner.**

1. **A new §A4c "capability loss without failure" instance.** `timeframe-favorites.js` — which reads and writes `chart_timeframe_favorites` through `userStorage` @ 34/54 and delegates to the cloud helpers @ 27–28/56–57 — is **not loaded by the canonical V9 shell at all**. Its only script tag is `legacy-index.html:44052`. `chart.js:42139–42140` constructs `TimeframeFavorites` when the global exists, so on `dist-v9` the global never exists and the feature silently does not run. A backend column, a sync path and a module, all present, all unreachable on the served surface, nothing erroring. This is the exact class §A4c was opened for and §A10 extends; it is a **second confirmed instance after the `IndicatorPerf` loader finding**, which strengthens the case that the build-time presence preflight is the right gate. Reported to Manager C's queue item 2 by way of the Director; not mine to fix, since script tags live in servable shells.
2. **`_uid` is never cleared on logout — I16-relevant.** Logout removes `token` and `refresh_token` (`homepage/src/app/dashboard/DashboardShell.tsx:662–663`) and leaves `_uid` in place; no `removeItem('_uid')` exists anywhere in `homepage/src` or the chart React source. On a shared device the next user's chart surface therefore runs under the **previous account's key prefix** until `/api/auth/me` resolves, reading and potentially writing the prior owner's preferences. §A4's first line keys preferences to account id and requires them excludable per I16; this breaks that in the logout path. Not my territory (homepage app shell), and I judge it more serious than the pin row it was found under.
3. **An unscoped-key write window at every boot.** The `userStorage` shim is created **synchronously** from a cached `_uid`, while `/api/auth/me` resolves **asynchronously** (`live/index.html:1469–1477` versus `1487–1494`). When the cache is empty, `userKey()` returns the **bare key**, so anything written before identity resolves lands in a global, unowned slot, and the later owner-scoped read misses it. This is a mechanism by which preferences legitimately appear to "reset to defaults" even once wiring exists, and it is why B-0019 requires my facade to refuse writes until the owner is known.

**One defect in my own file, which is mine and which I am fixing:** `preferences-sync.js` has **no schema version anywhere**, violating §A4 guardrail 3 ("schema version from day one; preserve unknown keys on write"). Its `saveToLocalStorage` switch @ 313–374 also enumerates known fields, so an older client can drop keys it does not recognise — the second half of the same guardrail. This is the load-bearing part of V8 that is unambiguously in my territory, and it protects every existing preference field, not just pins.

**Backend gap:** `tool_pins` and `pin_bar` have no column, no API field and no migration. Only `timeframe_favorites` exists. `journal-backend/` is in no manager's territory.

---

## B-0021 — ESCALATION · V8 contains a migration, so it collides with the migration monopoly

I hold the only migration-authoring permission while M24's ledger migration is live, and migrations are strictly serialised. **§A4 requires "lazy migration on read, old key retained one full release cycle" — so V8's absorption of the legacy keys (`chart_timeframe_favorites`, `chart_favorite_tools`, `chart_favorites_position`, `chart_favorites_visible`, `talaria_v9_ind_pinned`, `v9TlBarPosition`) is a migration** and falls under that serialisation, against a ledger migration in a different file for a different row.

Rather than let a preference row queue behind a ledger migration, I have split V8 so the serialised part is small and isolated:

- **V8-P1 — owner-scoped pin persistence contract, no migration.** Schema version, per-key writes, owner-gated writes, fail-open read / fail-safe write, unknown-key preservation, reset path. Contains **no** legacy-key reads, so it is not a migration and is not serialised. Dispatched now (B-0022).
- **V8-P2 — legacy-key lazy migration.** Strictly serialised under the migration rule, sequenced by the Director against M24's ledger migration. Not dispatched.

**Ask:** confirm this split satisfies the serialisation rule, and place V8-P2 in the migration order relative to M24. If you consider a schema-version field to be itself a migration, say so and I will move V8-P1 into the serialised slot instead — I would rather over-serialise than discover mid-flight that I ran two migrations concurrently.

**Also newly unassigned, all found today, all touching my territory's surface:** `order-interaction-guard.mjs` (declares kill-switches `order-manager.js` obeys), `drawing-tools-advanced.js`, `multichart-prod/panel-cmd-bridge.js`, `journal-backend/` (preference columns), and the homepage logout path holding the `_uid` defect. With `drawing-tools-manager.js` from B-0005 that is **six** unowned files bearing on rows assigned to me.

---

## B-0022 — DISPATCH · V8-P1, two write subagents on disjoint file sets

First write packets of the session. Partition, for which I am accountable (§A13.3): the two subagents share **no** file, and neither touches lane α (`order-manager.js`), so nothing serialises against V6 or M24.

- **B-W1 — persistence contract implementation.** Writable set: exactly `chart v 1.4/chart/modules/preferences-sync.js` and `chart v 1.4/chart/modules/preferences-init.js`. **Top tier, `claude-opus-5-thinking-high`.** Reason on the §A13.2 trigger, not on difficulty: `preferences-sync.js` is loaded by nine shells and mediates every preference in the product, so a schema or write-path error silently corrupts settings for all users — which is the precise incident §A4's guardrails were written to prevent — and **no preference oracle exists**, so nothing automatic would catch it. Expensive plus unverified equals top tier. Tier 3 ceremony (data durability).
- **B-W2 — RED and fixture.** Writable set: exactly the two new files `b-m15-owner-scoped-pins.red.mjs` and `b-fixtures/m15-pin-lifecycle-matrix.json`. **Mid tier, `gpt-5.5-medium-fast`**, §A13.2 row "test, oracle and harness authoring against stated criteria". Must fail against the current tree, and must fail for the stated reason rather than incidentally.

Both briefs carry the same explicitly stated contract, so parallel authoring cannot diverge; the contract is mine, which is the decomposition §A13 assigns me. Both are forbidden from touching React sources, any servable shell HTML, `journal-backend/`, `order-manager.js`, and from performing any legacy-key migration.

Each will receive a separate top-tier adversarial review that did not author it, reconciled by me (§A13.1). Reviews are not dispatched until the packets return.

Write packets in flight: **2 of 3**. Read-only in flight: **2** (B-A3, B-T1). Outstanding `PO-REQ`: **0**. Outstanding `NEEDS-PO-CLARIFY`: **1**.

---

## B-0023 — VERDICT · trade duration is computed twice, by different rules, and one of them uses the wrong clock

surface=`source (working tree)` · coverage=`static; two independent compute paths traced end to end. NOT reproduced on a served build; the specific TAL-01896 report has no attached scenario, so which of the two paths the reporter saw is unconfirmed.`

B-A3's evidence, my verdict. Two findings, and the second is the defect.

**(1) The product stores one duration and displays a different one.** `order-manager.js` computes and persists `holdingTimeMs` / `holdingTimeHours` / `holdingTimeDays` at close (`7836`, `12411–12510`, `30920`, `33680`), and `_enrichJournalEntryForPersistence` @ `7863–7868` only fills them when absent, so they are stable once written. The legacy All Trades view renders the stored `holdingTimeHours` (`9998`, `10897`, `10927`, `11103`). But the **React trades table does not read the stored value at all** — `orderManagerTradeRows.js` recomputes a `dur` string on every row build (`1369`, `1505`, `1549`) and `TalariaV8bLive.jsx` renders that (`38149`, `38272`, `41940`, `42029`). Two answers to one question, in a journaling product, with no gate asserting they agree. Even after the clock bug below is fixed, they can still disagree.

**(2) The clock defect: a wall-clock `now` is subtracted from a historical bar timestamp.** `v9TradeDuration(openMs, closeMs, nowMs = Date.now())` @ `orderManagerTradeRows.js:106–112` computes `end - openMs` where `end = closeMs` if finite, **else `nowMs`**. Three ways that goes wrong:
- `orderManagerTradeRows.js:1549`, the closed-position path, calls `v9TradeDuration(tOpen, tClose)` **with no third argument**, so `nowMs` silently defaults to `Date.now()`. Any closed trade whose `tClose` is not finite therefore reports *"wall-clock now minus a historical bar timestamp"* — for a backtest on 2024 data that is months, not minutes. This is the cleanest available explanation of "wrong duration in all-trades".
- `resolveTradeRowNowMs` @ `61–84` prefers replay/session time but falls back to `Date.now()` when no replay timestamp is finite, so open rows in a replay session can tick against wall time.
- `order-manager.js:33329–33330` seeds `closeTime` as `bgCloseTime || evalCandle.t || Date.now()` and that value is subtracted from a bar-based `position.openTime` @ `33680` — a mixed-clock subtraction inside **my own** file.
- `order-service.js:626` writes `openTime: request.timestamp || Date.now()`, a wall-clock fallback for an open time that closes against bar time. Also mine.

**The spec, which I am stating as engineering and not sending to the PO:** trade duration is always measured in session/bar time, never wall-clock time. A trade opened at the 09:00 bar and closed at the 11:00 bar lasted two hours regardless of when the user clicked, and in replay at 60× the wall-clock elapsed time is meaningless. I am confident enough in that to spec it; there is no business judgement in it. What I am *not* doing is deciding whether the stored field or the recomputed string becomes canonical, because that determines what historical journal rows display, and that has product consequences.

**Territory split, which is the problem.** The mis-rendered value is produced in `chart v 1.4/talaria-design/src/orderManagerTradeRows.js` — a React source file **not in my six-file territory** and not obviously in anyone's. Mine are the two seed sites (`order-manager.js:33329`, `order-service.js:626`) and the stored fields. So §B3's "Tier 1, same-day routine" calibration example is, as it actually sits in the tree, a cross-territory fix. Escalated in B-0025.

---

## B-0024 — VERDICT · the order side holds a retained set that plausibly contributes to the REOPENED memory row

surface=`source (the six territory files only; panel/chart teardown deliberately out of scope)` · coverage=`static census. No heap measurement, no runtime retention proof. Contribution to the ~230 MB residual is inferred from structure, NOT measured — this is the premise most in need of a measurement before anyone acts on it.`

Scoped strictly to my own files per B-0008 item 3. The numbers are lopsided:

- **`this.chart` is assigned once @ `order-manager.js:451` and never nulled — zero nulling sites in the file.** An OrderManager therefore retains its chart, and transitively the chart's SVG, scales and data, for the lifetime of the manager.
- **107 timer allocations** in `order-manager.js` against **one** `setInterval` with a matching `clearInterval`. Named timers with **no clear found**: `__m20A1KillTransitionTimer` @ `5119`, `_rrPanelSyncTimer` @ `26692`, `_closedJournalRedrawTimer` @ `40193`, and the animation frames `_pendingMirrorSyncRaf` @ `1454` and `_pendingPositionsPanelRaf` @ `29895`.
- **91 `addEventListener` against 22 `removeEventListener`**, and many of the survivors are **inline closures**, which cannot be removed even in principle — that is a structural leak, not a missing call. Permanent `window`/`document` listeners include `keydown` @ `770`, `multichartFocusChanged` @ `775`, `blur` @ `779`, `message` @ `5321`, a `BroadcastChannel.onmessage` @ `5328`, `chartDataLoaded` @ `8187`, and a `pagehide`/`beforeunload` `flush` pair @ `8529–8530`.
- **`_miSeriesByFileId`** @ `624–625` is a per-file **bar-series cache with no prune path found**. This is the one that concerns me: it holds market data keyed by file id, and nothing observed releases it.
- **`order-service.js` holds `orders`, `openPositions`, `closedPositions`, `pendingOrders`, `tradeJournal`, `mfeMaeTrackingPositions` and `listeners` and has no teardown, dispose or clear method at all.**
- The only real lifecycle teardown in the whole set is `_m20A1Teardown` @ `4410–4437`, which releases six things and closes an IndexedDB handle.

**Why this is worth the Director's attention beyond my own row.** §A9 reopened the memory closure on Rayan reaching **3.5 GB on a single layout** with **indicators and live trades present**, and required every future memory cell to include open trades. The retained set above is order-side, grows with trades, holds a never-pruned market-data cache, and never releases its chart. That does not make it the cause — §A9 rule 3 says measure before building, and I am not going to violate that from the opposite direction by asserting a cause from a static census. It does mean **the order side is a candidate contributor to a row currently framed as a rendering-and-dataset problem**, and that a memory cell run "with trades present" may be measuring my territory as much as anyone's. Cheap way to settle it: include an order-side retained-set probe in the §A2 re-baseline that C is configuring. That is a measurement request, not a fix, and it is the honest next step.

---

## B-0025 — ESCALATION · a seventh unassigned file, and the duration fix straddles it

`chart v 1.4/talaria-design/src/orderManagerTradeRows.js` produces the wrong duration and is in no manager's territory. It is not `chart.js`, not the data pipeline, not `replay-system.js`, not an indicator module, and not servable shell HTML — so it is not excluded from me by name — but it is a React source under `talaria-design/`, which is where V8's pin state also lives and which I have already been told is not mine. It is now the **seventh** unowned file bearing on rows assigned to me, after `drawing-tools-manager.js`, `drawing-tools-advanced.js`, `panel-cmd-bridge.js`, `order-interaction-guard.mjs`, `journal-backend/`, and the homepage logout path.

**Ask, and I think this is now the highest-value ruling available:** rather than adjudicating these one at a time as I trip over them, the territory manifest that Manager C is building should enumerate **every** file that reads or writes order state, preference state or trade records, and assign each one. I have now found seven by accident, in one session, purely as a by-product of two audits. A manifest built only from the six files named in my brief will pass its own preflight while leaving every real seam unowned.

Specific asks meanwhile: (a) assign `orderManagerTradeRows.js` — if it comes to me, TAL-01896 is a single coherent packet; if it goes to A, I fix only the two seed sites and A fixes the renderer, which needs a shared RED; (b) rule whether the stored `holdingTime*` fields or the recomputed `dur` string is canonical for historical journal rows, since that one is genuinely product-shaped.

---

## B-0026 — DISPATCH · B-W3, the V6-P1 RED. Write cap now reached.

RED-first is mandatory before the V6-P1 fix (README: "one gated fix per mechanism, RED-first"; §B3 floor requires RED→GREEN artefacts and a regression test in the packet), so the RED is dispatched ahead of the implementation rather than beside it.

**B-W3** — RED for the deferred-until-release recompute mechanism. Writable set: exactly the two new files `b-m6-sltp-entry-drag-follow.red.mjs` and `b-fixtures/m6-entry-drag-sltp.json`. **Mid tier, `gpt-5.5-medium-fast`**, §A13.2 row "test, oracle and harness authoring against stated criteria" — the criteria are stated, and running the test verifies the test, which is the stated reason to stay off top tier. Disjoint from every other in-flight file set; touches no product file, so it does not take lane α.

Scope corrected per B-0018: it must cover **both** drag implementations — the `d3.drag()` preview path at `22940` and the native `document` mousemove/mouseup path at `34389` that executed orders actually use — and must exercise the two **existing** kill-switches rather than any new name.

**Write packets in flight: 3 of 3 — cap reached (§A13.3).** No further write dispatch until one returns. This is the throttle behaving as designed rather than an obstruction: the cap exists because top-tier review is the binding constraint, and I have three packets that will each need an adversarial reviewer. Consequently **V6-P1's implementation, the V6-P2 visibility fix, the duration-clock RED and the order-side teardown work are all queued, not forgotten**, in that order. Read-only work remains uncapped, so triage and audit continue regardless.

Read-only in flight: **1** (B-T1). Outstanding `PO-REQ`: **0**. Outstanding `NEEDS-PO-CLARIFY`: **1**.

---

## B-0027 — SELF-CORRECTION · my write partition was disjoint for writes and coupled at read time

B-W2 returned and reported 1 pass / 11 fail with every failing cell citing `window.TalariaPreferences is absent`, and three identical runs. I re-ran it myself as provenance rather than accepting the report. **The output differed from the report:** cell 1 now fails with `window.TalariaPreferences.getItem must exist` instead of `... is absent`. Cause established immediately — `git status` shows B-W1 has already written **524 lines** into `preferences-sync.js` and `preferences-init.js` and is still in flight, so a partial facade now exists.

**The defect is mine, in the dispatch, not in either subagent's work.** §A13.3 requires write subagents to hold disjoint file sets, and B-W1 and B-W2 do — B-W1 writes the two preference modules, B-W2 writes two new test files, no overlap. But **B-W2's test imports B-W1's files at runtime.** Disjoint write sets are necessary and not sufficient; I partitioned for write collision and missed a read-time coupling, so the RED's output is non-deterministic for as long as its subject is being edited. B-W2's "three identical runs" was true when it ran; the tree moved underneath it.

Consequences I am acting on:
1. **No RED output taken while B-W1 is in flight has any provenance value.** The three-run evidence must be re-established on a quiescent tree after B-W1 lands. Recorded as an outstanding evidence obligation, not as a completed four-state proof.
2. **Standing rule for my own future dispatches:** a brief's partition must state both the writable set *and* the runtime read set, and a RED whose subject is concurrently being authored is serialised behind it, not run beside it. Cheap to state now, expensive to discover during consolidation.
3. Ratified retroactively: the honest way to run these two in parallel was to dispatch the RED against a **stated contract only** — which I did — and simply not to execute it until the implementation settled. The authoring was parallel-safe; the *execution* was not, and I did not distinguish those.

**One positive finding falls out of the same evidence.** The changed message proves B-W2's test loads the **real** product modules rather than a transcription of them, which was the single largest risk in that brief and the thing I told it to be blunt about. That is confirmed by observation, not by its self-report.

---

## B-0028 — REVIEW · B-W2 held, not accepted. Two substantive concerns and one name ratified.

Not accepted, and no adversarial reviewer dispatched yet (reasons in B-0029). My own review findings, to be handed to that reviewer rather than resolved by me alone:

1. **The RED is currently red for a trivial reason.** Eleven of twelve cells fail on facade absence, which is one cause reported twelve times. That proves the contract is unimplemented; it does **not** yet prove each contract property is independently violated. Once B-W1 publishes a facade the cells will begin exercising real logic, and the hazard is that they then fail on **API shape** rather than on contract violation — at which point the tempting move is to edit the test to match the implementation, which would convert the gate into a mirror of whatever was built. The four-state proof was performed against a stub the subagent wrote inside its own test and then removed, so "passes on fixed state" is currently evidence about that stub, not about B-W1's code. **Obligation:** re-prove all four states against the real implementation before this packet may claim RED→GREEN.
2. **Cell 11, the kill-switch OFF cell, is `UNPROVEN` in §A5-5 terms and I am labelling it so.** It passes today with "contract satisfied", and it passes for the same reason the feature is absent: today's behaviour *is* the OFF behaviour. A cell that cannot distinguish "the switch correctly reverts a working implementation" from "there is nothing to revert" is not yet a negative control — §A5-1 is explicit that a gate whose negative control is green for the wrong reason is a lying gate. It must be re-proven against a landed, working implementation with the switch flipped, and until then it is not GREEN.
3. **Name ratified retroactively.** B-W2 needed a test-only key for the unknown-key-preservation cell and used `pref.v1.pins.__qa_unknown__`. My brief said stop and report rather than mint; it minted *and* reported, which is the lesser failure and it disclosed clearly. The name sits under my reserved `pref.v1.` prefix, is test-only, and collides with nothing, so I am **reserving it now** rather than leaving an unreserved name in the tree: `pref.v1.pins.__qa_unknown__`, reserved, test-only, never written by product code.

Confirmed good: exactly the two reserved paths were created and nothing else; the fixture holds the matrix data and the test holds the logic, as specified; no real account ids; exit code 1 on failure, so it is CI-usable as a gate.

---

## B-0029 — DECISIONS · one review over both halves, and I am deliberately leaving a write slot empty

**(a) B-W1 and B-W2 are one packet and get one adversarial review.** They are two halves of a single mechanism — the V8-P1 contract and its RED — and §B3 requires a packet to ship RED→GREEN together. Reviewing the RED before its implementation exists would ask a reviewer to judge whether cells fail for the right reason without the code that determines the answer. So the top-tier adversarial review (`claude-opus-5-thinking-high`, an agent that authored neither half, per §A13.1) is dispatched when B-W1 returns, over both halves plus my B-0028 findings. This also spends one top-tier review instead of two, which matters because review is the binding constraint the write cap exists to protect.

**(b) B-W2 finishing frees a write slot and I am not filling it.** In flight: B-W1 and B-W3, so 2 of 3, and policy would permit a third. I am declining, and the reason is the constraint behind the cap rather than the cap itself: **three packets now exist and none has been reviewed**, one of them is blocked on an evidence obligation I created, and every one needs a top-tier adversarial pass. Adding a fourth would grow review debt against precisely the bottleneck §A13.3 names — and it would put me at four awaiting consolidation, which is the pre-registered §A11.4 throttle threshold, before a single train boundary. Filling the slot would satisfy the letter of the cap and defeat its purpose.

Queued in order, unchanged, and each blocked on a stated thing rather than on my attention: V6-P1 implementation (blocked on B-W3's RED landing, RED-first); V6-P2 visibility fix (blocked on the mechanism question in B-0030); duration-clock RED (ready, awaiting a slot, and see the assignment ask in B-0025); order-side teardown release (ready, awaiting a slot; its fix needs lane α, which V6-P1 holds first).

---

## B-0030 — DISPATCH · B-A4, plot-clip and outside-plot visibility investigation (read-only, cheap)

Read-only, so uncapped and free of review debt — which is how I keep the queue moving while declining to fill the write slot.

**B-A4** — settle the V6-P2 mechanism question raised in B-0018 before its RED is authored. I changed direction once already on this defect, from "missing clamp" to "bug inside deliberate machinery", and authoring a RED against a mechanism I have already misjudged once would encode the wrong assertion into a permanent gate. **Tier cheap, `composer-2.5-fast`**, §A13.2 row "audits, file:line inventories". Escalation trigger not met: the output is an inventory whose correctness I can check against the code myself, and no product change follows directly from it. Writable file set: **NONE**. Reads only `order-manager.js`, which no subagent is currently writing, so no repeat of the B-0027 coupling.

It must determine whether hiding order rows outside the main plot is intentional, how the plot bounds are computed when an indicator stack is present, and whether the clip region and the visibility predicate can disagree — and it must report, not decide.

Write packets in flight: **2 of 3, one slot deliberately empty**. Read-only in flight: **2** (B-T1, B-A4). Packets awaiting review: **1** (B-W1+B-W2 as one). Outstanding `PO-REQ`: **0**. Outstanding `NEEDS-PO-CLARIFY`: **1**.

---

## B-0031 — SELF-CORRECTION · B-A4 audited a different tree. Mechanism survives, every line number does not.

B-A4 returned and disclosed unprompted that it had searched `full-talaria-log--main` rather than the `manager-b-plan3` worktree I named, and that its line numbers were therefore assumed. I verified rather than accepting either the citations or the disclaimer:

- `order-manager.js` **differs** between the two trees (SHA-256 `EB70D1A5…` in mine vs `8C7E4080…` in main). `chart-indicators-full.js` also differs (`7716CDC8…` vs `7169223A…`).
- The Chart-side helpers it cited at 14201 / 14213 / 14242 are at **12072 / 12084 / 12113** in my tree — roughly 2,100 lines off.
- The four order-side helpers are **present** in my tree (`_isOrderYInMainPlot`, `_applyOrderRowMainPlotVisibility`, `_applyPlotClipToOrderOverlays`, `_syncMainPlotSvgClip`, 6–7 references each), so the machinery it described is real here.

**Verdict: mechanism findings usable, every file:line citation unusable.** Any RED authored from this must re-locate its sites in my own tree, and I will say so in the brief.

Two corrections against myself, one of which is the same mistake as B-0027 wearing different clothes:

1. **I named the repo path and assumed that bound the search.** It did not. Briefs must state the tree *and* require the agent to confirm which tree it actually read before reporting — a disclosure after the fact only helped because this agent was honest about it.
2. **Citing across trees is structurally unsafe here, not merely untidy.** The main tree is a live workspace that Managers A and C are editing right now, so its line numbers drift under anyone reading it. B-0027 was a race in *execution*; this is a race in *citation*. The common root is that I have twice failed to pin **what state the work is measured against**, so I am fixing the general form rather than the two instances: every brief I issue from now states the tree, the commit or "uncommitted worktree", and whether the agent may read anything outside it.

My own bad search deserves a note too: I first concluded these helpers were absent from my tree because I searched for `name = ` prototype-assignment syntax when they are class methods. I re-ran before recording anything, which is the only reason a wrong finding did not enter this journal.

---

## B-0032 — VERDICT (V6-P2 mechanism) · surface=order-row visibility and clipping, coverage=mechanism established, sites not re-located

Ratifies the direction change in B-0018 — **the hiding is deliberate, and now confirmed by code comments rather than inference.** Order rows whose Y maps into the separate-indicator stack are hidden on purpose, paired with an SVG clip on the main price pane: *"Hide order row when its Y maps into the indicator stack; clip when inside main plot."* So V6-P2 is a bug inside intended machinery, and any fix that simply stops hiding rows would be a regression, not a fix.

**The escalation, and it is the sharpest one yet.** The deciding predicate and the clip definition — `_getMainPricePlotLayout`, `_isYInMainPricePlot`, `_ensureMainPlotSvgClipDef`, and the `separateIndicatorPanelHeight` value all three depend on — live in **`chart-indicators-full.js`**. Not in `chart.js` as I assumed in B-0018, and not in my territory. That file is an **indicator module**, which my brief forbids me from touching by name. So:

> **The root mechanism of a P0 defect assigned to me sits in code I am explicitly forbidden to modify.** `order-manager.js` only consumes the predicate, with a local fallback that recomputes the same formula. I can fix which *DOM nodes* obey the rule; I cannot fix the rule. This is the **eighth** unowned-or-cross-territory file bearing on my rows, and unlike the previous seven it blocks a P0 rather than merely muddying ownership.

Concrete partial-visibility candidates inside my own territory, which is the part I *can* act on and which explains "not fully visible" better than the predicate does:
1. **Entry-row `slBadge` / `tpBadge` / `tpBadgesContainer` are gated by neither rule** — not in the per-row visibility parts map, and not in the bulk clip selector list. They can stay on screen while the row they annotate is hidden. Best single candidate.
2. **Preview SL/TP lines get clip only, never `display:none`**, so an off-pane preview is truncated rather than hidden.
3. **Duplicate SL at the same price hides labels but keeps the line**, a deliberately partial row that looks identical to the reported symptom.
4. **Interactive buttons are deliberately left unclipped when in-plot**, per comment — so "controls visible outside the clip" is intended and must not be asserted against.

**No kill-switch exists for this behaviour** — searched and not found; the three related globals gate pan-lite and trade markers, not row hiding. V6-P2 therefore needs a new name, reserved here: **`window.__TALARIA_DISABLE_ORDER_ROW_PLOT_VISIBILITY_V1`** (kill-switch, default off, reverts to pre-fix node gating).

**Gap that must close before any RED is authored, and it is load-bearing:** whether `yScale`'s pixel range always aligns with `[margin.t, plotBottom]`. B-A4 flagged this as unverified and it is exactly where predicate and clip would disagree *numerically* rather than by node coverage — the difference between a two-line fix and a wrong test. Next read-only dispatch closes it; I am not authoring the V6-P2 RED until it is closed.

Write packets in flight: **2 of 3, one slot deliberately empty**. Read-only in flight: **1** (B-T1). Packets awaiting review: **1** (B-W1+B-W2 as one). Outstanding `PO-REQ`: **0**. Outstanding `NEEDS-PO-CLARIFY`: **1**. Unowned/cross-territory files blocking or affecting my rows: **8**.
