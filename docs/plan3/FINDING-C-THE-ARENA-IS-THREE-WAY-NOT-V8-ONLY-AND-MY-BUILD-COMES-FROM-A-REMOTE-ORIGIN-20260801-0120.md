# The arena is three-way, my build comes from a remote origin, and the flag A/B was blind

**Manager C — 2026-08-01 01:20**

---

## 1. The arena answer, recovered — and my written prediction was wrong

Allocator pair taken 2.15 hours apart on the zero-trade session, 21,051 → 60,154 resident bars, same renderer
pid, **zero trades throughout** so this is bar-driven growth with the trade term absent by construction.

| allocator | growth | share | **per bar** |
|---|---|---|---|
| v8 | 625.0 MB | 58.9% | **16.37 KB** |
| blink_gc | 212.5 MB | 20.0% | **5.56 KB** |
| partition_alloc | 176.8 MB | 16.7% | **4.63 KB** |
| malloc | 44.4 MB | 4.2% | 1.16 KB |
| cc | 6.3 MB | 0.6% | 0.16 KB |
| web_cache | −4.5 MB | −0.4% | −0.12 KB |
| **total** | **1,060.5 MB** | | **27.77 KB/bar** |

**My prediction, written into the script before the measurement, was "v8 carries essentially all growth".
It does not — v8 is 58.9%, and blink_gc plus partition_alloc carry 36.7% between them.** That is not a
rounding error, and it is precisely the part of the arena question I had left unanswered. Bar data is not
purely a V8 object story: a fifth of per-bar growth is Oilpan-managed and a sixth is PartitionAlloc.

The total is a useful cross-check: 27.12 MB per thousand bars on the allocator gauge against 23.98 / 24.55 /
25.35 measured on the OS-footprint gauge. Two independent instruments agreeing within ~10%.

**SEAL LABEL: unsealed-build composition evidence. No absolute figure here may be quoted against a sealed
build.** The shares are the quotable quantity, because the undeclared changes in play are listener-release
and pan behaviour, which can move the level of retained memory but cannot plausibly relocate bar storage
from one allocator to another.

## 2. The seal question has a different answer than assumed: I do not measure the working tree

```
scripts/lib/conf01-session.mjs:36
const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
```

Every measurement I have taken loads `${origin}/chart/dist-v9/index.html` from a **remote deployed origin**.
Confirmed by bytes, not by reading code:

| file | served | local `chart v 1.4` | local `homepage/public` |
|---|---|---|---|
| chart.js | `c2b481cf0238`, 2,006,564 B | `1eadcc830448`, 1,976,204 B | `ae6a5e2ca877`, 2,016,129 B |
| multichart-manager.js | `878a2f9ee7c7` | `b7853dbdee83` | `b01ddc3ed87d` |
| chart-window-limit.js | `47689b497f1a` | `08ca9a649dac` | `08ca9a649dac` |

**The served bytes match no local copy.** No uncommitted local change — mine, A's or E's — can enter a
measurement taken through this harness. The working tree is not my measurement path.

That does not make the seal concern empty; it relocates it. My real exposure was that **my artifacts carried
a build badge with no digest**, so `20260731b120` could be re-cut under the same label without my noticing —
and the build moved b116 → b117 → b118 → b120 inside one day. Fixed: `build-passport.mjs` records badge plus
a combined digest over the served bytes. Tonight's passport is **badge 20260731b120, digest
`e5f703473654a4335f8efc5cf9a1964e`** over six files.

**On authorship:** the 23:13 changes are A's release cuts and E's pan/crosshair work — the added identifiers
are `__TALARIA_DISABLE_MC_RELEASE_*_V1`, `__TALARIA_DISABLE_M21_1_*_V1` and
`__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1`, each behind the mandated kill-switch.
`chart-window-limit.js` is a line-ending rewrite with zero content change. I hold no product-file edits;
my gauges attach over CDP at runtime and mutate nothing on disk. There is nothing of mine to declare or
revert, and nothing of mine that a train could pick up.

## 3. The overlay flag A/B: inconclusive because my test was blind, not because the flag failed

Flag set and **read back true in 4 of 4 realms**, trades held at 13, badge recorded, one variable.

| | flag OFF | flag ON |
|---|---|---|
| blocking | 256.2 ms/s | 270.7 ms/s |
| tasks > 500 ms in 180 s | 3 | 6 |
| resident bars | 12,394 | 14,055 |

Read naively this refutes the trace verdict. It does not, and I am recording why before anyone acts on it.

**The session never entered the freeze regime.** Three tasks over 500 ms in 180 seconds is one every 60
seconds, against the target cadence of roughly one every 1.3 seconds. The marker cost scales with
**trades × bars**, and this run carried 13 × 13,225 = 171,925 against the dissected freeze's 43 × 65,000 =
2,795,000 — **16× less of the quantity the mechanism scales with**.

A null from a session that is not freezing is not evidence that a switch fails to stop freezes. **This is not
being escalated to A**, and my own script's "NOT CONFIRMED" verdict has been rewritten in the artifact to
say so.

**My design error:** I sized the warm-up in minutes (10) instead of deriving it from the driving product. At
60× that yields ~13,000 bars, and I could have computed before spending the time that this was an order of
magnitude short. The test that decides it needs ~65,000 bars and ~40 closed trades with the cadence verified
in-regime *before* the flag is touched — about two hours, on the sealed build.

**What stands unchanged:** the freeze stack, the 31.8% attribution, and the three zero-trade traces showing
the entire order-manager family absent without trades. Those came from profiles at bar counts where the
mechanism is live.

## 4. DETACH-01 built and self-tested

`scripts/lib/detach01.mjs`: launch whose parent is `WmiPrvSE` so no editor crash can cascade; append-as-taken
JSONL with `fsync` per sample; heartbeat written write-then-rename so a reader never sees a half-written
file; resume that recovers prior samples and skips a torn final line. Self-tested against a simulated hard
kill mid-write: **2 samples recovered, 1 torn line skipped, PASS**. `inspectRun()` distinguishes ALIVE,
COMPLETED and DEAD OR STALLED from the heartbeat alone.
