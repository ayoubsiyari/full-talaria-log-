# CORRECTION — The cap was not breached, and E has the DOM lead

**2026-07-30 21:10** · Director · corrects `FINDING-...-730MB-IS-NOT-EXCURSION-20260730-2045`

## I was wrong about the cap

In the 20:45 finding I wrote that `_m19ExcursionTailMaxV1()` returns 256 while the gate
observed 319 samples per row, and called it a breach.

D checked and it is not a breach. The 319 is the **sum across four keys per row**, against a
ceiling of 1,024, not a single array measured against 256. The hard-cap belt still runs after
every append. I read one number as four.

The claim is withdrawn. D was right to check it rather than build against it, and it should
not have cost D the cycle. `BRIEF-02` exists precisely so a Director hypothesis is not
treated as fact, and I stated this one as fact.

## The excursion figure, accepted

D's triplication finding stands and is fixed: closed and service lists are nulled, the
journal becomes sole owner.

At CONF-02 scale, measured rather than estimated:

| | bytes |
| --- | --- |
| legacy, deduped | 390,240 |
| journal-only | 195,120 |
| **delta** | **195,120 (~191 KB)** |

Evidence: `_evidence\manager-D\EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json`.

I predicted single-digit MB. It is 191 KB — smaller still. D labelled it "not the memory
win" without being asked to, which is the correct instinct. **Excursion is closed as
hygiene, not as a memory result.** It does not count against the 730 MB/h and must not be
reported as progress on it. C grades on the wire.

## E has narrowed the DOM lead, and this is the valuable result

E's overlay inventory did something better than list files: it **split the sites by whether
they can produce DOM at all.**

Ruled out as DOM producers — these are **canvas** draw paths, so they cannot create nodes
and cannot be the +1333 elements/h:

- OR / session / killzone / ICT draw paths (`chart-indicators-full.js`)
- PDR / GAP / OR / IB labels and info cells (`talaria-ratio-gap-indicator.js`)
- FVG boxes and tags (`talaria-fvg-indicator.js`)

Ruled in as the DOM churn suspects — the **separate-panel overlay rebuild paths** in
`chart-indicators-full.js`:

- legend rows
- axis tags and ticks
- drag zones
- separators
- live-axis and crosshair tooltip

E notes most of these clear before append, so the failure mode to hunt is **a removal that
misses detached overlays**, not an append without a clear. That is a much narrower search
than "find the writer."

This goes to A immediately. It is the strongest lead on the 730 MB/h that exists, and it
arrived from the lane I had not assigned to the memory hunt.

## Both D and E are now blocked on the same thing: a build

- E: `INDICATOR-EVICT` mechanism is **not on the wire yet**
- D: TAL-01896 **needs a build**
- D: Rayan #8 is **off-wire** — a money-path row, and money-path wire-clean is a freeze gate

D's corrected TEST-02 re-audit, against `<fix-commit>^` per row as amended:

| state | rows |
| --- | --- |
| on-wire | 39 |
| off-wire | 2 |
| unproven | 7 |

Rayan #2 resolved **on-wire** by behavioural probe. Rayan #8 **off-wire**.

Three lanes now converge on B's next train. That makes the train the schedule, and B is
carrying both a freeze gate (Rayan #8) and two mechanisms that cannot be graded until they
ship. B is told to cut it rather than batch further.

## Dispatch

**A** — take E's narrowed list. Hunt removals that miss detached overlays in the
separate-panel rebuild paths above. Ignore the canvas paths; they cannot produce nodes.

**D** — excursion is closed as hygiene, do not carry it as a memory win. Continue
TRADE-EVICT CONF-02 with the four opens retained. Hand Rayan #8 and TAL-01896 to B as
build-blocked, and close the 7 unproven rows.

**E** — the inventory was the right work and the split by canvas-versus-DOM is exactly what
was needed. Ship the `clearIndicators` fix into B's next train so the mechanism reaches the
wire, then hold for C's grading.

**B** — cut the train. It carries Rayan #8, TAL-01807b, TAL-01896, E's `INDICATOR-EVICT`,
and D's excursion single-owner fix. Also hand C headless-Chrome access on the test host;
that is still the highest-value unblock on the board.

## Rules

`BRIEF-02` — I stated a hypothesis as fact and D absorbed the cost. `EVID-02` honoured by
both: D's artifact is in `_evidence\manager-D\`, E's live-page probe is 3 KB and correctly
stayed in-tree. `DECL-01` — excursion is closed by D's measurement, not by my say-so.
