# RULING — The lag defect is confirmed with the PO: a concurrent-load defect in 4-panel multichart replay, roughly 50% worse than single chart, with no residual effect afterwards, conditioned on drawings, orders or indicators being present. One property remains unresolved — whether it is lost throughput or lost smoothness — and it will be settled by C's benchmark rather than by another question to the PO.

**2026-07-28 23:00. PO confirmed the statement of the defect verbatim.**

---

## 1. The defect, as now jointly agreed

**Held true:**

- **While** four-panel multichart is open and replaying, it feels **about 50% worse** than replay on a single chart.
- **After** closing multichart, single-chart replay feels **exactly as it did before**. **No residue.** `FINDING-LAG-IS-RESIDUE-20260728.md` stays retired.
- The defect is **conditioned on content** — drawings, orders or indicators present during replay. Replay on a bare chart is not the complaint.

**Therefore: this is a defect of concurrent load, and the abandoned-engine work does not touch it.** That separation holds and A is correctly instructed not to claim otherwise.

## 2. The property still unresolved, and why it matters

**"50% worse" admits two mechanisms that need opposite fixes:**

- **Lost throughput.** Configured 10x delivers roughly 5x. The engine cannot complete a tick's work within the tick interval, so the timeline genuinely advances at half rate. **Cause lives in per-tick work: allocation, resample, indicator recompute.**
- **Lost smoothness.** The timeline advances correctly at 10x, but frames are dropped, input feels sticky and drawings trail the cursor. **Cause lives in paint and main-thread contention.**

**A's two fixes divide along exactly this line** — FIX 2 (per-tick allocation reuse) attacks throughput, FIX 1 (background-panel render cadence) attacks contention.

## 3. Ruling — instrument it, do not ask again

**I asked the PO to distinguish these and the PO declined to guess, which is the right answer, because the distinction is not reliably available to a human eye at 10x on four panels.** A person can tell you it feels wrong. **A person cannot reliably tell you whether 40 bars arrived in four seconds or eight, and asking them to try produces confident noise that I would then build on.**

**So: C's four-panel replay benchmark acquires two mandatory outputs.**

1. **Achieved tick rate against configured tick rate**, per panel — the throughput answer. Bars actually committed per wall-clock second, divided by the rate the replay was set to.
2. **Frame timing and long-task count** during the same run — the smoothness answer.

**Run in both configurations: single chart with content, and four panels with content.** The ratio between them is the "50%" the PO is describing, and **whichever of the two numbers degrades is the mechanism.**

**This converts an unanswerable question into a reading, and it costs nothing extra** — C is already building this harness and it must emit numbers regardless.

## 4. This does not delay A

**A builds both FIX 1 and FIX 2 anyway, each behind its own kill-switch, per the standing shoot-first directive.** The ambiguity would only have blocked us if we were choosing *one* fix to build. **We are building both, so the benchmark's role is to grade them, not to authorise them.**

**Consequence for honesty in M7: we do not describe the lag as improved until the benchmark shows the ratio moving with a switch flipped, and we name which of the two mechanisms moved.** A fix that improves frame timing while throughput stays halved has not fixed what the PO reported, and vice versa.
