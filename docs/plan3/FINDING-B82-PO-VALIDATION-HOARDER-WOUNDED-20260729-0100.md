# FINDING — First PO validation of `b82` on a surface with every module: **indicator lag gone, memory and CPU materially lower.** That closes the indicator-lag investigation with `indicator-performance.js` absence as the confirmed cause. On the Hoarder, the honest verdict is **wounded, not killed**: M26 ships and releases the heavy payload, but the retainer of the orphaned engines was never identified, so the two tests that decide it are close-panel recovery and plateau.

**2026-07-29 01:00. The PO ran `b82` at `/chart/dist-v9/index.html` — the first time any PO measurement has been taken on a shell carrying the full module set.**

---

## 1. What the PO observed

**"Much better, no indicator lag and much lower memory and CPU usage."**

**This closes the indicator-lag question.** The cause was `indicator-performance.js` missing from the host shell's script list, diagnosed as `perfLoaded: false` days ago. **Every subsequent indicator-lag observation was taken on a shell that lacked the module**, which is why the defect appeared to survive its own fix. **`SURF-2` exists because of exactly this**, and this is its vindicating case rather than a new one.

**Multichart figures, PO's approximations:**

| configuration | memory |
|---|---|
| 1 panel, idle | ~270 MB |
| 1 panel, playing, 2 indicators | ~470 MB |
| 4 panels | ~800 MB |
| 4 panels, playing, climbing | → ~1.1 GB |

**Two separate things are inside those numbers and they need different verdicts.**

**Scaling with panel count is cost, not leak.** Four panels are four engines, four data sets and eight indicators. **Note it is sublinear** — 800 MB against 4 × 470 = 1.88 GB — so panels do share. **Against the 2.5 GB the PO measured pre-`b74`, and TradeZella's 490 MB, `b82` at 1.1 GB sits roughly 2.2× the competitor rather than 5×.**

**Growth at constant panel count is the leak-shaped part, and it is not yet distinguishable from legitimate accumulation**, because replay reveals candles and the arrays holding them genuinely grow. **Whether it plateaus is the whole question.**

## 2. Exactly what M26 does in the shipped build

**Verified by direct read at B's tip:**

- `multichart-prod/multichart-manager.js:60` — kill-switch gate, `__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1`
- `modules/replay-system.js:9935-9936` — `instance.fullData = null; instance.fullRawData = null;`
- `chart.js:5328-5329` — the same release on `rs0`

**So on panel teardown the engine's multi-megabyte candle arrays are dropped.**

**What was never found is what retains the orphaned engine objects themselves.** I withdrew my own instruction to clear a retaining `Map` after discovering `m20Q6ReplaySystem` is a `WeakMap`, whose keys do not prevent collection. **The true retainer remains unidentified and is C's.**

**Therefore the accurate statement is: we took the Hoarder's food away without finding what holds it.** The orphans may still exist and still be reachable, but they are now close to empty. **M26 carries the label `code-correct, effect not demonstrated` and it has not yet been retired** — A's harness never showed the effect, and C's browser gate is the designated instrument.

## 3. The two tests that settle it, and what each outcome means

**Test A — close-panel recovery, which is the direct M26 verdict.** From 4 panels at ~1.1 GB, close back to one, wait roughly thirty seconds for collection, and read again.

- **Falls toward ~270-470 MB** → M26 works, orphan retention is not the dominant term, **the Hoarder is effectively dead for the canary.**
- **Stays near 1.1 GB** → teardown is not releasing. Either `destroy()` is not reached on close, the kill-switch is set, or the unidentified retainer dominates. **M26 then loses its label and becomes an open defect.**

**Test B — plateau.** Hold 4 panels playing and watch whether memory stabilises or keeps climbing past 1.1 GB.

- **Plateaus** → the climb was candle accumulation, which is real work and bounded by session length. **Not a leak.**
- **Climbs without bound** → a per-tick retention we have not characterised, distinct from the teardown leak M26 addresses, and it would be a new mechanism rather than a known one.

**These two answers are worth more than any further harness work**, because the PO's session is the only instrument that has ever reproduced the multichart leak.

## 4. What is not in `b82`, stated plainly so the PO is not misled

**FIX 1, the background-panel render cadence, is not in this build.** A is authoring it. **It targets smoothness — the p95 frame interval collapse from 16.7 ms to 99.9 ms that C measured — not memory.** So if 4-panel replay still *feels* less fluid than a single chart while memory behaves, that is expected and FIX 1 is the answer to it.

**FIX 2 is cancelled and will not return**, its allocation-churn premise refuted by GC overhead measured at 0.258%.

**No memory work beyond M26 is queued.** **If Test A comes back clean, the Hoarder closes; if it does not, it reopens as the highest-priority memory item and C's retainer hunt becomes urgent rather than background.**
