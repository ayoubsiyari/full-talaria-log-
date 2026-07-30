# ESCALATION (C → A, cc Director) — two bar-driven cuts, with predicted effects and flag status

**2026-07-31 00:25** · Manager C · `KILL-03` shot declarations · build read off the running page: **20260730b115**
Evidence: `FINDING-C-MONSTER-2-IS-BAR-DRIVEN-AND-TWO-FUNCTIONS-ARE-NAMED-20260731-0010.md` (21de5e4e6)

Monster 2 is bar-driven: renderer CPU-ms per bar climbs **+3.46 per 1,000 bars played**
(CI [2.76, 4.16]) while CPU supply stays pinned at 99.4%, in the PO's exact configuration
with **zero trades**. Two functions grow their self-time share between a first-two-minutes
and a last-two-minutes profile. Both are below, each with the predicted effect `KILL-03`
requires before a shot is fired.

**b115 note:** `chart-indicators-full.js` and `replay-system.js` are served **byte-identical**
to b114 (994,217 and 453,663 bytes), so the version bump did not touch either mechanism.

---

## SHOT 1 — bound the freshness fingerprint's window

**Where:** `chart-indicators-full.js`
- `Chart.prototype._m19iExactTailPaintFp` → `_m19iB62WindowFp(data, 0, totalLen)`
- `_indicatorAsyncDataToken` → `windowFp: b62On ? _m19iB62WindowFp(data, 0, len) : null`

**Mechanism:** `_m19iB62WindowFp` FNV-hashes every bar in the range it is given, building a
`t|o|h|l|c|v;` string per bar and hashing each character. Given `[0, totalLen)` it hashes the
**entire replayed history**. Reached every paint via
`drawIndicatorsOptimized() → _m19iExactTailPaint() → _m19iExactTailPaintFp()`, per panel.
The fingerprint is computed **before** the memo comparison, so the memo saves the work but
never the cost of deciding — the cache key costs more than a miss.

**Measured cost per call**, product function, detached receiver, five reps per rung:

| bars hashed | median ms per call |
| --- | --- |
| 250 | 0.2 |
| 500 | 0.2 |
| 1,000 | 0.6 |
| 2,000 | 1.0 |

Slope **0.487 ms per 1,000 bars hashed**, CI [0.219, 0.755], CLIMBS, and **replicated in a
second independent session at 0.494**, CI [0.249, 0.739]. A fixed-size control at 250 bars
read −0.05 and −0.03, not climbing, in the two sessions (GATE-01 PASS both times).

**Call rate during live replay**, from wrapping the method in all four realms for one minute:
**5,985 calls over 837 bars advanced = 7.15 calls per bar**, **9.73 ms per bar spent in this
one function**, 13.2% of wall clock, at roughly 2,500 resident bars per panel. The first
session read 5,338 calls and 11.7% independently.

### The kill-switch A/B — measured, not predicted

Flipping the existing flag in all four realms mid-session, same session, same panels:

| arm | throughput |
| --- | --- |
| path live | 13.56 bars/s |
| `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 = true` | **18.05 bars/s** |

**+33.1%**, and it is a **lower bound**: the disabled arm ran later in the session, so it
carried *more* resident bars, a bias against the flag. n=1 window per arm.

**Extrapolation, stated as such:** at 20,000 bars a call costs ~10 ms; four panels paying it
per paint is ~40 ms of pure decide-nothing-changed per frame, which is a missed frame budget
on its own.

**Existing kill-switch:** `window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1` (via
`_m19iExactTailPaintEnabled()`) gates the whole path. It satisfies FLAG-01/02/03 but it also
disables a freshness guard, so it is the **A/B probe, not the fix**.

**The fix:** pass a bounded `tailStart` at those two call sites, the way the invalidation
check already does (`_m19iB62IsTailTokenStale` passes `token.tailStart`). The function's own
comment already promises a bounded pass; these two sites are where that intent was lost.

**Predicted effect on the curve:** removes the history-length term from per-paint cost, so
the CPU-ms-per-bar slope should collapse toward zero and 60x should stop sagging as bars
accumulate. It is 29.26% of JS self time by minute 20 and still climbing. The A/B above
already shows **+33% throughput at ~2,500 bars**, and because the removed term is
proportional to bar count, the benefit grows as a session runs longer — which is exactly
where the PO's complaint lives.

---

## SHOT 2 — the scheduler ledger grows forever and is scanned linearly

**Where:** `replay-system.js`, `m20Q6TrackScheduler` (push) and `m20Q6CapturedClear` (scan).

**Mechanism:** every `setTimeout` / `setInterval` / `requestAnimationFrame` /
`queueMicrotask` inside a capture session pushes an entry into `state.schedulers`. Entries are
**never removed** — completion only sets `entry.pending = false`. Every `clearTimeout`,
`clearInterval` and `cancelAnimationFrame` then walks the whole list to find its handle. N
registrations each cleared with an O(N) scan is O(N²) in elapsed frames, and at 60x across
four panels the rAF traffic alone pushes thousands of entries per minute.

**Measured:** self-time share **0.82% → 10.40%** between the first two minutes and the last
two minutes of the same run. That is the fastest-growing share in the profile, 12.7x, and it
is what turns a slow chart into an unresponsive one at the twenty-minute mark the PO reported.

**Confirmed before naming it**, because a growing wrapper looks exactly like an instrument
artefact:
- product code, not a harness: `M20Q6ReplaySystem` is the shipped class and its effect
  methods are wrapped unconditionally at module load (`m20Q6CapturedReplayEffect`);
- present in the deployed `replay-system.js` (push, scan, wrapper all found over HTTP);
- **zero** truncation sites for `state.schedulers` in the deployed file; `m20Q6DrainState`
  walks it once, at destroy.

**Kill-switch: none exists.** Zero `__TALARIA_*M20Q6*` identifiers in the deployed file, so
per `KILL-03` this shot must land with a new flag rather than behind an existing one.

**The fix:** key the ledger by handle (a `Map` per kind), or drop entries when they settle.
Either removes the scan entirely.

**Predicted effect on the curve:** removes a quadratic term, so the *acceleration* of the
decay should go away even if the slope does not — distinguishable from Shot 1 by shape, which
is why both should be flagged separately (`TEST-02`).

---

## What I am not claiming

I measured a 1.5x decay, not the PO's 30x: my headless four-panel session was CPU-saturated
at 99.4% from the first sample, where the PO's run started acceptable, and starting inside
saturation compresses the visible decay. The direction, the slopes, the pinned-supply
arithmetic and the two named functions all hold. The magnitude of the user-visible collapse
does not transfer from my run and I am not quoting one.

`tickMs` never read: I wrapped `stepForward` in all four realms and it was never called during
playback, so per-bar cost is derived from renderer CPU ÷ bars advanced rather than measured
inside the advance path. Naming the real advance function is an open item on me.

n=1 run for the decay series; the dose-response is five reps per rung within one session.
