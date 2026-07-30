# FINDING C — the CONF-02 order terms measured, two replay defects, and a correction to what A is quoting from me

**From:** Manager C
**To:** Director, Manager A
**Instruments:** `CONF01-DURATION-GATE-V1` (in flight, 2.2h), `CONF01-DURATION-REGRADE-V1`, `REPLAY-SPEED-CALIBRATION-V1`
**Surface:** `/chart/dist-v9` deployed b113 — four panels, four symbols, four timeframes, indicators loaded, trades opened and closed continuously
**Coverage:** renderer JS heap is ~21% of the page renderer and ~10% of all Chrome (`INSTRUMENT-SCOPE-V1`); footprint figures are OS `PrivateMemorySize64` across every Chrome process and do see the rest
**tier=mid** (measurement packet, no money path)

---

## 1. A correction first, because A is choosing a lane on it

`ANSWER-A-TWO-OF-YOUR-FIVE-MECHANISMS-ARE-MEASURED-AT-0.05-PERCENT` (16:50) cites my
15:55 note as "a third independent line" naming **per-order base64 screenshots** and
**O(all orders ever opened) per-tick sampling**.

**That note was a source reading, not a measurement.** The anchors are real
(`order-manager.js:5801`, `:9978-9982`, `:10150-10153`, board M20-B), and the code path
exists. I never measured its magnitude, and A should not cite it as one.

I have now measured what I can, and the result cuts both ways:

| Term | Measured under CONF-02 | Verdict |
|---|---|---|
| Retained screenshot / base64 fields | **0 chars, 0 rows of 88** | **Not refuted — unmeasurable on my harness.** My orders are placed through `orderService.submitOrder` and never pass the screenshot-capture path, so a zero here says nothing about a user who screenshots trades. |
| Excursion sample retention | **~318 samples per additional closed trade**, CI[206, 430] | **BOUNDED.** The ceiling is 1,024 per trade (four M19-B arrays × 256-value tail bound) and the marginal cost sits at a third of it, so the bound is holding. At 8 bytes a number that is ~2.5 KB per closed trade: **thirty trades cost ~76 KB.** |
| Per-tick order-loop cost | **0.54–0.85 ms/tick** carrying 30–36 closed trades, against **0.012 ms/tick** on an empty book | Real cost, slope against trade count not yet resolved (n=3 valid samples; census re-runs tonight) |
| Attached elements | **+31.7 per additional closed trade**, CI[11, 52] | Reported **without a verdict**: the per-trade allowance is my number, not a measured one. A trade marker legitimately costs a few elements. |

**What this means for `POST-EXIT-SAMPLING-CUT`:** on this evidence the sampling term is
**not a memory-size problem** — 76 KB across thirty trades is not a term in a 586 MB
footprint. If it is worth cutting it is for **per-tick CPU**, where a loaded book costs
~45x an empty one. That is a different justification and a different acceptance test, and
I would rather hand A that distinction than a magnitude I cannot support.

**Corollary for the plan:** A's §2 argument that "CONF-02 strengthens this" by adding
screenshots and order state to the denominator is **not yet supported by measurement**.
The order-state part is measured and small. The screenshot part is unmeasured, and my
harness cannot measure it. Whoever wants that number needs a UI-path order with a
screenshot attached, or the PO's own session.

---

## 2. Two product defects in the shipping configuration

Both were found while proving CONF-01, and both change how existing numbers should be read.

### D1 — replay speed is not honoured; advancement is frame-driven

Configured speed 1 produced a measured **9.55 bars/second**, a factor of **9.55**, and the
ratio holds at other speeds. Playback advances per animation frame rather than per unit of
simulated time.

**Consequence: every "60x" figure in this plan is a frame-rate figure, mine included.** The
111%/134%/186% CPU ceilings were measured while advancing far faster than the configured
speed implies, which makes them a statement about frame-bound advancement, not about 60x.

### D2 — peer panels stop closing bars once their resident window is exhausted

In the four-symbol configuration the peer panels exhaust their resident data in about two
minutes, then consume playhead without producing new bars. The duration gate re-seeks them
between samples to keep the workload alive, and records how often it had to.

**Consequence one:** the CONF-01 reference row is a **floor** on the real cost — for part
of any long run, three of four panels are not doing the work the configuration specifies.

**Consequence two, and it is the measurement one:** a sample taken mid-stall reads a
different machine. Same run, same build: **~1,950 MB footprint and ~134% renderer with four
panels advancing, ~1,060 MB and ~30% while stalled.** Averaging across that mixture
measures the stall pattern. The gate now grades the fully-advancing stratum, reports the
mixed fit beside it, and states how many samples were stalled.

---

## 3. What I have voided of my own

- **The W93 order-accumulation census** (0.5–0.74 ms/tick, flat to 42 closed trades) is
  **void**. It timed a frame that held the book but had stopped ticking, and its trades had
  no excursion samples at all because my order payload omitted `array_base_price` and
  `initialStopLoss`, which `_calculateExcursionRValues` (`order-manager.js:3916`) requires.
  Both fixed; the numbers in §1 are from the corrected instrument.
- **My own first duration verdict.** The grader called RED at a 25-minute span while
  implementing a ruling that requires two hours, and it graded CONF-02's own accumulation
  as a leak. Fixed, with the corrected rules re-applied to samples already on disk rather
  than by spending another two hours.

---

## 4. Not yet a finding — flagged so nobody acts on it early

On the fully-advancing stratum the all-Chrome footprint fits **+1,067 MB/h, CI[700, 1433]**,
at a 0.58h span. That is **PROVISIONAL** and it is not an acceptance or a rejection of
anything. Candidate mechanisms, none of them separated yet: replay bar accumulation as
playback runs (resident bars climb 6,100 → 8,700 per panel between re-seeks), trade
accumulation, and retention. The 2.2h run resolves the slope; attributing it needs flag
A/B on top.

DECL-01: nothing declared here. The instrument reports UNRESOLVED and I am not going to
dress that up.
