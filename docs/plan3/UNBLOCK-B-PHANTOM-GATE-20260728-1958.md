# UNBLOCK B — B has been holding the train since 17:59 for a kill-switch belonging to a fix that has not been written and is not in the train. The train is not blocked. Both A and B were behaving correctly; the phantom is mine.

**2026-07-28 19:58. Branch and journal evidence, not manager report.**

---

## 1. What B is waiting for

**B's journal, three consecutive entries:**

> B-0133 — *"A's render kill-switch still not on tips checked 17:59 — train still waits on A."*
> B-0134 — *"Polled A tips 18:06 — `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` still absent from product trees. Train remains correctly blocked."*
> B-0135 — *"A tip advanced (hidden-pause) — still **no** `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` in product trees. Train correctly blocked."*

**B has identified the blocking flag as the multichart background-render-cadence switch — that is FIX 1, which I placed FIFTH and LAST in A's order at 17:42.**

## 2. Why this is a phantom

**FIX 1 has not been built.** Searched A's `critical-path` tip for `backgroundRender`, `renderCadence` and `BACKGROUND_RENDER`: **no matches.** The nearest existing flags are `__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1` and `__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1`, which govern finest-timeframe candle stepping, not background panels.

**So the change B wants a switch for is not in the train. A fix that does not exist cannot ship unflagged, and its absent flag cannot be a release precondition.**

**Stated with the caution I have earned today: I searched three name patterns on one branch tip. It is possible the change exists under a name I did not try. B has the `--deploy-gate` tooling to settle this precisely, so B should confirm rather than take my word.** But on the evidence available, **the train is not blocked.**

## 3. Where the phantom came from — mine

**My 16:52 ruling said "A's render fix MUST have a runtime kill-switch (blocks train)" without naming an artifact.** B read the dispatches, saw that FIX 1 was a render-behaviour change, and reasonably inferred both the referent and the flag name it would carry. **B then held the train, correctly, against its own inference of my instruction.**

**A, given the same vague ruling, asked me which fix I meant. B, given the same ruling, inferred and waited. Both were reasonable responses to an unusable brief.** The cost fell on B: **roughly two hours of a manager polling A's tips for something that was never coming.**

**And my 18:39 answer by elimination did not catch it,** because I reasoned over the three options A offered and never asked the obvious question — *what is actually in the train right now?* **The branch log answers that in seconds and I did not look.**

## 4. What saved it

**The generalisation did.** I ruled that A must *enumerate every item in the train altering render or invalidation behaviour and confirm each has a runtime kill-switch*, rather than fix one named thing. **A executed exactly that**: `19:23 Add R1 render runtime kill-switches`, then `19:55 Merge R1: runtime kill-switches for M23 host-commit teardown and M20-Q9 counters`, touching `chart.js` in both trees with a 614-line test file.

**So the requirement behind the ruling is now satisfied even though my named referent was probably wrong.** Worth keeping as a lesson: **when uncertain of an identity, ruling the property rather than the instance survives being wrong about the instance.**

## 5. Actions

**B — the train is not blocked. Verify A's `critical-path` tip at `19:55` against your own enumeration rather than against the cadence flag, and if the render-behaviour items in the train each carry a runtime switch, ship.** Do not wait for FIX 1's flag.

**A — FIX 1 is still yours and still last, and it is genuinely not built yet, which is correct sequencing rather than a miss. When you do build it, name its switch `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1`, because B has already written that name into its gate expectations and a second name would desynchronise them.**

## 6. Credit where the branch log shows it

**A shipped FIX 3 within an hour of the dispatch that created it** — `18:37 Merge M28: pause replay playback while the page is hidden` — against a 17:35 finding. **A also refuted the strong-Map claim independently**, per its own `18:38` note, which means my 18:21 correction confirmed A's finding rather than informing it. **And A enforced the M25 cut without argument.**

**B delivered build attribution in 25 minutes** — `18:02 B-0133: PO-readable build id on every servable shell`, covering dist-v9, live, legacy, embed and stub, with a bottom-left badge and a one-paste console value. **B also completed the standing charter task I set as an anti-idle backstop, producing `FIX-ABSENT-FROM-PO-PATHS.md` with fourteen enumerated ways a fix can be correct in the repository and absent from what the PO opens, and closed two of them.**

**Neither manager was idle. Both were blocked or waiting on me, and in B's case on something imaginary.**
