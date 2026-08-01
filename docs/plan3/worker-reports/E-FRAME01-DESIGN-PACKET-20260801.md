# E FRAME-01 Design Packet

**Manager:** E  
**Date:** 2026-08-01  
**Row:** `FRAME-01-ORDER-02`  
**tier=TOP**  
**model=Opus 5 High**

This is a **design packet, not a patch**. No implementation bytes are prewritten here and none
are implied. What follows is the contract an implementer must satisfy, the order the units must
land in, the oracles that are allowed to grade them, and the three corrections that the first
draft of this packet got wrong.

---

## 0. Three corrections to the row's own premise

The row as claimed on the board, and the first version of this packet, both aimed at the wrong
number in the wrong condition and graded it with a model harness that cannot see the defect.
All three are corrected here before any design is stated, because each of them changes what
gets built.

### 0.1 The headline metric was measured in a different condition than it was stated in

The packet previously read: *reduce static multichart idle paints from the observed ~131
paints/s toward zero.* C measured both arms on b120 and published the result in
`docs/plan3/FINDING-C-THE-REPLACEMENT-BUDGET-ROW-ALSO-GOES-GREEN-ON-THE-BROKEN-BUILD-AND-THE-ORIGINAL-BUG-IS-ABSENT-20260731-1715.md`:

| Condition (1x) | Host-realm paints/s | Host share of all painting |
| --- | ---: | ---: |
| Static dataset, replay armed and paused | **0.0** across 4 windows / 24 s | nothing painted anywhere |
| Playing | **140.8** | **95.9%** |

The ~131 figure came from the **playing** arm. The condition the row states — static — already
scores **0.0 on the unfixed build**. An idle-paint oracle written against the static condition
therefore **goes GREEN on a build with the defect fully present**, which is the exact vacuity
that retired the paints-per-candle row from the other direction.

C's counter was validated against the failure mode that would have made the zero meaningless:
the same wrapper in the same realm reads 140.8/s the moment playback resumes, so the zero is a
measurement of the product and not of a counter attached to the wrong function.

**Consequence for FRAME-01: the defect lives in the playing path.** The static row is already
healthy and is kept only as a **regression lock at 0**, never as the win. Any report that
claims FRAME-01 took idle paints "from 131 to near zero" is claiming credit for a number the
build already had.

### 0.2 The landed governor is exempt by construction in exactly the condition that is broken

`f6ef6e5f2` landed a real cadence governor, and the cadence logic is correct on its own terms.
But read the fast-path predicate against the defect condition
(`chart v 1.4/chart/chart.js`, line numbers at this tip):

- `_frameGovPaintIntervalMs()` (3215) returns **0** when `_frameGovInputFastPathActive()` is true.
- `_frameGovInputFastPathActive()` (3206) returns true when `_isInteractionFastRender()` is true.
- `_isInteractionFastRender()` (27821) returns true on its **first line** when
  `_isReplayPlaybackRendering()` is true.
- `_isReplayPlaybackRendering()` (27815) is `replaySystem.isActive && replaySystem.isPlaying`.

So while replay is playing, the interval is 0, `_frameGovShouldPaint()` always returns true, and
**the governor caps nothing**. The measured defect is *host-realm paints/s at 1x **while
playing***. The landed unit is switched off, by its own logic, for the entire duration of the
condition it was built to bound.

This is a source read, not a runtime measurement. Per BIND-01 it is a
`RESOLVER_PRESENT_BUT_UNCALLED` hypothesis and it must be **confirmed at runtime** by oracle
`O-BIND` below before it is treated as fact. But the design must be authored on the assumption
that it is true, because if it is true, nothing shipped so far touches the defect.

### 0.3 The landed oracle is a model oracle and cannot observe the other paint authorities

`chart v 1.4/chart/modules/frame-gov-v1.test.mjs` extracts six methods out of `chart.js` by
indentation-anchored regex, pastes them into a synthetic `Chart` class inside a VM, and drives
that. It is a legitimate unit oracle for the cadence arithmetic and it is 6/6 — re-run at this
tip for this packet rather than quoted. It is **not** evidence about the product's paint rate,
for two structural reasons:

1. The synthetic class contains only `animate()` and the `_frameGov*` helpers. The five other
   rAF paint loops in `chart.js` (§2) **do not exist in the harness**, so no cell can observe
   them.
2. Its `clean panel paints nothing` cell passes identically with the governor **off**: legacy
   `animate()` also gates on `renderPending`, so a clean panel painted zero frames before
   `f6ef6e5f2` too. That cell is a valid regression lock and **zero evidence for FRAME-01**.

Classify it honestly, in the vocabulary E already used in `E-GATE-VACUITY-AUDIT-20260731.md`:
`VERIFIED_RED_ARM_MODEL`, not browser-covering. FRAME-01 does not get to call itself shipped on
a model oracle.

---

## 1. The dirty-flag protocol — first, and it is a protocol, not a flag

Everything else in this packet depends on one property: **a paint happens only because someone
declared work, and exactly one component decides when that work is paid.** Today neither half
holds.

### 1.1 Census at this tip

Method, so it is reproducible and so drift is visible: regex count of `renderPending\s*=\s*true`
and `renderPending\s*=\s*false` over `chart v 1.4/chart/**/*.js`, excluding `dist*`,
`node_modules`, and `*.test.*`.

| Measure | Count |
| --- | ---: |
| Arming writes (`renderPending = true`) | **33** across 5 files |
| — inside `scheduleRender()` | 2 |
| — inside `_requestRafPaint()` | 1 |
| — outside both sanctioned doors | **30**, of which 1 sits on the `chart-main.js` `Chart` class that **no `*.html` in the tree loads** → **29 live** |
| Clearing writes (`renderPending = false`) | **33** across 6 files (7 instances; `sync-bridge.js` exists twice) |
| Sites in `chart.js` that clear the bit and call `this.render()` on the very next line | **16** |
| Literal `this.render()` call sites in `chart.js` | **62** (mirror: 62) |
| `this.render()` calls behind `_frameGovShouldPaint()` | **1** |

The 2026-07-28 finding recorded 28 arming sites; the tree has moved since and my scope differs.
The implementer re-runs this census as the first act of the row and **publishes the delta**. A
census that is quoted rather than re-run is how the last starvation bug nearly shipped.

### 1.2 The four rules

- **D1 — one arming door.** `scheduleRender(opts)` and `_requestRafPaint(opts)` are the only
  sanctioned ways to declare work. The 29 live bypassing writers are not edited one by one:
  A's prior art is correct, convert `renderPending` into an accessor over a backing field via
  `Object.defineProperty(this, …)` in the constructor, because the constructor's own
  `this.renderPending = false` is an own data property that shadows any prototype accessor.
- **D2 — writing `false` must never arm.** This is the criterion that A's own acceptance set
  missed twice. A mutant whose setter armed on any assignment passes every positive cell and
  saves nothing. It is a required RED arm, not a nice-to-have.
- **D3 — one paying door.** Clearing the dirty bit is the **exclusive right of the paint
  authority** (§2). No site may clear-and-paint in the same breath. The 16 sites that do today
  are the migration list.
- **D4 — clear before paint, and account every paint.** `animate()` already clears before
  `render()` so that a `scheduleRender()` raised *during* render is not swallowed and a throwing
  render leaves the bit false for the next arm to re-raise. Keep that. Add: every paint, by any
  path, records through **one** accounting function. Today 16 clear-and-paint sites never call
  `_frameGovRecordPaint()`, so the governor's `_frameGovLastPaintAt` clock is stale after any of
  them and the *next* cadence decision is made against a lie.

### 1.3 Dirty is not one thing — it carries a deadline

A boolean cannot distinguish *"the playhead moved a pixel"* from *"a bar closed and the user is
owed the print"*. The design requires the armed state to carry, at minimum, a **deadline
timestamp** alongside the bit: data-commit paths (bar close, bar append, order fill, indicator
commit) arm with a deadline; smoothness paths (playhead motion, hover chrome) arm without one.
§3 explains why this, and not a higher frame rate, is what makes the bar-delivery oracle
satisfiable.

---

## 2. One layout scheduler — one paint authority per realm

### 2.1 The arithmetic that proves the problem is not cadence

A realm **cannot** exceed one rAF-coalesced paint per animation frame — 60/s on a 60 Hz display.
The host realm measured **140.8 paints/s**. Therefore, on the measured build, either several
paint authorities fired in the same animation frame, or paints happened synchronously outside
rAF, or both. **A per-panel cadence cap inside `animate()` cannot bound a number that
`animate()` did not produce.**

One alternative explanation must be closed rather than assumed away: on a 144 Hz panel, 140.8/s
is roughly one paint per frame and this argument collapses. C's framing assumed 60 Hz and did
not record the refresh rate. **Every `O-PLAY` run records display refresh rate alongside the
paint count**, and the multi-authority claim is confirmed directly by `O-AUTH` (paints per panel
per animation frame), which does not depend on the refresh rate at all.

Five independent rAF paint loops live in `chart.js`, each of which sets `renderPending = false`
and calls `this.render()` inside its own rAF callback, none of which consults the governor:

| Method | Line |
| --- | ---: |
| `_schedulePanSyncFollowRender()` | 27786 |
| `_scheduleWheelBurstRender()` | 27841 |
| `_scheduleAxisZoomRender()` | 28351 |
| `_scheduleSeparatePanelResizeRender()` | 28381 |
| `_startChartPanRenderLoop()` (self-perpetuating) | 29667 |

Plus finalize/flush paints outside any loop: `_finishAxisZoomInteraction()` (28368),
`_finishSeparatePanelResizeInteraction()` (28398), `_flushChartPanFrame()` (30054), and the
post-pan full-quality paint in `_stopChartPanRenderLoop()` (29707). And above all of them,
`animate()` (30300) re-arms its own rAF unconditionally as its first statement, once per
`Chart` instance, for the lifetime of the page.

Each of these was individually reasonable — every one of them coalesces *its own* traffic to one
paint per frame. The defect is emergent: **they coalesce against themselves and not against each
other.**

### 2.2 The contract

- **One authority per realm.** Exactly one component decides, per animation frame, which panels
  paint. `animate()` becomes the authority's tick or is replaced by it; the five auxiliary loops
  become **requests** (arm with intent + deadline) and lose the right to call `render()`.
- **At most one full paint per panel per animation frame.** This bound is behaviourally free —
  a second paint in the same frame is invisible by definition — and it is the only part of
  FRAME-01 that needs no product debate. It alone bounds the realm at the display refresh rate.
  Everything below refresh is a tier decision that has to be argued.
- **Cross-realm is coordination, not control.** Multichart panels are separate realms
  (`window.parent.__multichartGrid`). The authority in each realm owns its own paints; the host
  publishes focus and visibility. No realm may be given the power to block another realm's
  input-deadline paint, because a wedged host would then freeze every panel's crosshair.
- **Visibility, not focus, owns "do not paint a hidden tile."** That behaviour already shipped.
  FRAME-01 must not revive the superseded focus-based FIX1 row (`5f2d137a89`), which reverts the
  current predicate and coalescing.

### 2.3 The hazard that governs the sequencing

Ruling C-1 from `FINDING-IDLE-RAF-LOOP-20260728.md` stands and applies in full: **no on-demand
conversion is authored before a census of what depends on being called every frame.** Anything
using the loop as a hidden heartbeat stops silently when the loop stops — capability loss
without failure, this project's signature failure class. Enumerate every per-frame call site
reachable from `animate()` and every auxiliary loop, and for each one state **what wakes it**
under the new scheme. A site nobody can account for **blocks the change**; it is not assumed
idempotent.

---

## 3. LOD and cadence are two axes, and the product currently ties them to one boolean

`_isInteractionFastRender()` is consulted in two unrelated roles: it selects the **lite paint**
level of detail (via `_shouldUseInteractionLitePaint`, used around `render()` at 30755), and it
sets the **cadence exemption** to unlimited (§0.2). One predicate, two decisions, no way to ask
for one without the other. During replay playback the product therefore chooses *"reduced
detail, unbounded rate"* when the correct answer is *"reduced detail, bounded rate"*.

**Split them.** Every paint decision answers two independent questions:

| Axis | Question | Values |
| --- | --- | --- |
| Cadence | may this panel paint in this frame? | tier interval, or deadline override |
| Detail | how much does this paint draw? | full / lite (skip overlay indicators, volume, heavy chrome) |

### 3.1 Tier table

| Class | Interval | Rationale |
| --- | ---: | --- |
| Focused, dirty | 33.3 ms (~30 fps) | smooth enough for playhead motion and drag feedback |
| Non-focused, dirty | 66.7 ms (~15 fps) | peripheral panels are read, not watched |
| Hidden | no paint | owned by the existing visibility gate, not by FRAME-01 |
| Clean (no armed work) | no paint | the dirty-flag protocol, §1 |

The tier decides **how often** armed work may be paid. It never decides **whether** a visible
panel is allowed to paint at all.

### 3.2 The 15 fps tier and the 50 ms bar oracle contradict each other — and the fix is not a higher rate

The oracle set requires every bar at 10 bars/s to be painted within **50 ms**. A non-focused
panel on a 66.7 ms fixed-interval throttle can delay a bar by up to **66.7 ms**. The current
packet asserted both, and both cannot hold.

Note the rate is not the problem: 10 bars/s needs 10 paints/s and the tier already permits 15.
What fails is **phase** — a fixed-interval throttle can land the next permitted paint after the
deadline has passed. So the resolution is **deadline-aware scheduling**, not a faster tier:

> **Ruling:** a panel paints when `(now - lastPaint) >= tierInterval` **OR** an armed deadline
> has expired. Bar commits arm with a 50 ms deadline. Deadline paints are counted against the
> same budget and recorded through the same accounting function.

This keeps the 15 fps idle budget, satisfies the 50 ms delivery bound on focused *and*
non-focused panels, and does not hand the entire playing path a blanket exemption the way the
current fast path does.

---

## 4. Input fast path — a deadline, not an exemption

The crosshair p95 ≤ 33 ms requirement is real and it is the reason the fast path exists. But
"fast path" as currently implemented means *"remove all cadence limits for as long as this
predicate is true"*, and the predicate is true for the whole of replay playback. That is how a
protection became the hole.

- **Qualifying states:** crosshair move, pointer drag, chart pan, wheel-zoom burst, axis-zoom
  drag, panel-resize drag. These are bounded by a human gesture — they end.
- **Explicitly not qualifying: replay playback.** Playback is a continuous machine-driven state
  with no natural end, so it is a *cadence tier*, not an interaction. It gets the focused tier
  plus per-bar deadlines. This is the single highest-value change in the packet, because it is
  the change that makes the governor apply to the measured defect at all.
- **Semantics:** a qualifying input event arms with a **next-frame deadline**. It does not lift
  the cap for a period of time; it makes one paint due immediately. Back-to-back input keeps
  producing next-frame deadlines, which is the same responsiveness with a bound that survives
  the input ending.
- **Detail during input stays lite.** Unchanged, and independent of the above.

---

## 5. Switch semantics

- **One switch for the row:** `window.__TALARIA_FRAME_GOV_V1`. Default **ON**. The row does not
  ship behind an off-by-default flag; the switch exists for rollback, not to defer the decision.
- **Explicit `false` only.** Absent or non-false means ON. This is already the landed
  implementation and it is correct: it prevents a realm that never heard of the switch from
  silently disabling the governor.
- **Realm propagation is part of the contract.** `_frameGovEnabled()` (3185) checks `window`,
  `window.parent`, and `window.top`, each in its own try/catch so a cross-origin throw cannot
  read as "disabled". An iframe panel must honour a rollback set on the host. Keep this; extend
  it to the scheduler unit rather than inventing a second switch.
- **Rollback restores legacy cadence, not legacy structure.** Once the auxiliary loops are
  demoted to requests (§2), `false` must still produce the pre-FRAME-01 *observable* behaviour:
  every armed frame paints. If a unit cannot be rolled back to observable parity by the switch,
  it is not ready to land.
- **No second switch per unit.** Three units under one row must not become three flags; the
  matrix is untestable and the rollback story stops being a sentence.
- **Mirror parity is part of the switch contract.** `chart v 1.4/chart/chart.js` and
  `homepage/public/chart/chart.js` are both 62 `this.render()` sites and 49
  `requestAnimationFrame(` sites at this tip. A switch present in one tree and absent from the
  other is a rollback that works on one deployment only.

---

## 6. Required runtime oracles

Every cell below states which of the three BIND-01 states it observed. Presence is not binding,
binding is not correctness, and a broken text anchor must fail with its own distinct state
rather than collapsing into the same RED as a live product defect.

### 6.1 The grading set

| ID | Oracle | Condition | Pass | Gate states |
| --- | --- | --- | --- | --- |
| `O-PLAY` | Host-realm paints/s at 1x **while playing** | replay playing, 1 bar/s, dataset advancing | ≤ 30/s per realm and ≤ 1 paint per panel per animation frame, down from the measured 140.8/s — **this is the headline** | `RESOLVER_CALLED_BUT_WRONG` on the unfixed build |
| `O-STATIC` | Host-realm paints/s at 1x, static dataset | replay armed and **paused**, zero panels advanced | **lock at 0.0** | regression lock; already green, never reported as a win |
| `O-BAR` | Bar delivery | 10 bars/s | every bar painted within 50 ms, focused **and** non-focused | must RED when the deadline path is removed |
| `O-XHAIR` | Crosshair latency | pointer move over a focused panel | p95 ≤ 33 ms | must RED when the input deadline is removed |
| `O-BIND` | Fast-path exemption census | replay playing | the fraction of paints taken under a cadence exemption is **reported**, and is 0 for playback after the fix | distinguishes `PRESENT_BUT_UNCALLED` from `CALLED_BUT_WRONG` |
| `O-AUTH` | Paint authority census | all conditions | every paint is attributable to the single authority; count of paints not routed through the accounting function is **0** | anchor break reports `ANCHOR_BROKEN`, not RED |
| `O-AB` | Four-metric A/B record | published after ship | idle paints/s, bar paint latency, crosshair p95, dirty-skip % | — |

### 6.2 Negative controls, which are not optional

Acceptance sets must contain the case where the fix does nothing. Required RED arms:

- **Governor disabled** (`__TALARIA_FRAME_GOV_V1 = false`) must return `O-PLAY` to the unfixed
  rate. If it does not, the switch is not the rollback it claims to be.
- **`renderPending = false` armed a frame** (D2 mutant) must RED.
- **Deadline path removed** must RED `O-BAR`, and **input deadline removed** must RED `O-XHAIR`.
  A cell that stays green with its mechanism deleted is measuring something else.
- **Counter attached to the wrong function** must be excluded by the control C used: the same
  instrument, same realm, must read a large non-zero number in the playing arm. A gauge that
  reads zero because it is attached to the wrong thing is indistinguishable from a healthy
  product.
- **Static-condition control:** `O-STATIC` must be shown to be green **before** the fix. Any
  packet that reports it as an improvement is misreporting.

### 6.3 Measurement protocol for anything CPU-adjacent

Ruling C-2 as amended: two recordings of a nominally identical idle state differed by 4.5
percentage points, a 1.57× spread, against a maximum claimed effect of 1.3–3.4 points. **The
noise was larger than the effect.** So: minimum five runs per arm, **alternating** arms rather
than blocked, identical window length across all runs, and a **stated variance** with the effect
required to clear it. If it does not clear, the honest report is *"not measurable at this sample
size"* — not a point estimate. Paint counts are cheaper and quieter than CPU percentages, so
`O-PLAY`/`O-STATIC` lead the record and CPU is a secondary observation, never the verdict.

---

## 7. Risks

| # | Risk | Why it is credible here | Mitigation |
| --- | --- | --- | --- |
| R1 | **Capability loss without failure** — a per-frame call site quietly stops being called | The signature failure class of this project; C-1 exists because a `scheduleRender`-only guard would have starved most arming sites | Full per-frame census before conversion; a site nobody can account for blocks the row |
| R2 | **Starvation via the accessor** — a writer bypasses the arming door and its work is never paid | 29 live arming writes sit outside both sanctioned doors today | Accessor over a backing field, arming on `true` only, plus an armed-site counter read from a real session before anything depends on it |
| R3 | **The fast path swallows the fix** — playback stays exempt and the row ships with no effect on the defect | Already true on the landed unit (§0.2) | `O-BIND` reports exemption share; playback is a tier, not an interaction |
| R4 | **Vacuous green** — an oracle graded in a condition the unfixed build already satisfies | Already happened once to `BUDGET-01` and once to the paints-per-candle row | Two-row structure: `O-PLAY` is the verdict, `O-STATIC` is a lock |
| R5 | **Model oracle mistaken for product evidence** | The landed 6/6 is a VM harness over an extracted `animate()` | Browser-backed `O-PLAY`/`O-BAR`/`O-XHAIR` are required for ship; unit cells are labelled `_MODEL` |
| R6 | **Text-anchor fragility** — harnesses extract methods by regex, and the gate set already bounds method-body extraction at 2,200/1,200 characters (`m20-q2-countdown-region-paint-oracle.test.mjs`) | Method growth flips cells for reasons unrelated to behaviour | Anchor breaks must report `ANCHOR_BROKEN` distinctly; never let a missing anchor and a product defect share a RED |
| R7 | **Mirror drift** — canonical and `homepage/public` diverge | The switch is only a rollback if both trees have it | Parity assertions on markers **and** on the paint-site counts, both trees |
| R8 | **Visible regression in replay smoothness** at 30 fps focused | Bounding playback paints is a user-visible change, unlike the idle work | `O-PLAY` paired with a human smoothness check at 1x, 5x, 10x before the tier is lowered further |
| R9 | **Cross-realm coupling** — a wedged host stalls panel input | Focus/visibility are published across realms | Realms own their own paints; host publishes state only, never grants permission per frame |

---

## 8. Implementation sequencing

Each unit lands separately, with its own oracle, its own rollback, and a stated expected effect —
including units whose expected effect is **zero**, which must be reported as zero.

**Unit 1 — Census and instrumentation. No behaviour change.**
Re-run the arming/clearing/paint-site census and publish the delta against §1.1. Land the
per-paint accounting function and a diagnostics surface exposing: paints/s per realm, paints per
panel per frame, dirty-skip %, exemption share, and paint-authority attribution. Oracle: `O-BIND`
and `O-AUTH` report on the **unfixed** build and must show the defect. **Expected performance
gain: none. Reporting this unit as an improvement would be dishonest.** It exists so the next
three units are measurable rather than argued.

**Unit 2 — Playback is a tier, not an interaction.**
Remove replay playback from the input fast path and give it the focused/non-focused tier plus
per-bar deadlines. This is the first unit that can move `O-PLAY`. Oracle: `O-PLAY`, `O-BAR`,
plus the smoothness check in R8. Rollback: `false` restores the exemption.

**Unit 3 — Dirty-flag protocol.**
Accessor conversion, one arming door, `false` must not arm, one paying door. Migrate the 16
clear-and-paint sites in `chart.js` to arm-with-intent. Oracle: D2 mutant RED, armed-site counter
from a real session, `O-STATIC` still 0.0, `O-AUTH` unrouted-paint count trending to 0.

**Unit 4 — Single layout scheduler.**
Demote the five auxiliary rAF loops to requests; one authority arbitrates per frame; enforce at
most one full paint per panel per animation frame. Oracle: `O-AUTH` at 0 unrouted paints,
`O-PLAY` at the tier, `O-XHAIR` held. This is the unit that C-1's census gates.

**Unit 5 — The record.**
Publish `O-AB` with the four metrics under the §6.3 protocol, alongside the corrected framing:
the static row was already 0.0, the win is in the playing path, and the numbers are paint counts
with a stated variance.

---

## 9. What is already landed, stated at its true strength

- `f6ef6e5f2` — default-ON `__TALARIA_FRAME_GOV_V1` local cadence governor and
  `frame-gov-v1.test.mjs` (6/6). Correct cadence arithmetic for the non-playing dirty case;
  a `VERIFIED_RED_ARM_MODEL` unit oracle; **exempt during replay playback and therefore not yet
  shown to touch the measured defect**; governs 1 of 62 paint call sites.
- `10da0602b` — the first version of this packet, superseded by this document. It recorded
  `model=GPT-5.5` against `tier=TOP`, and it carried the static/playing condition error in §0.1.
  Both corrected here.

The board row `FRAME-01-ORDER-02` stays open. Nothing above changes the row's claim; it changes
what the row has to prove before it can be called done.
