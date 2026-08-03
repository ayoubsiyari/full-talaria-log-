# A-lane seal evidence audit — SEAL-EVIDENCE-01

> **Update 11:38+01:00 — the eleven static-only gates below now declare themselves** (`0888d6757`). Each
> prints `STATIC_ONLY_SOURCE_GATE <row> — reads source; served behaviour unobserved` at load, so the
> token travels into a sweep log rather than living only in this document, and the seven that had no
> refusal state now throw `SUBJECT_ABSENT: <path>`. The classification below is unchanged.


**Standing rule.** Source evidence cannot bless served bytes. A seal row is `PASSED` only when the
sealed build itself produced runtime evidence. A check that can only be performed statically must
say so in its own verdict line rather than presenting as a pass.

Produced by `scripts/seal-evidence-classify.mjs` (lane A), which classifies each gate by what the
file reaches for rather than by what it claims. Re-runnable: `node scripts/seal-evidence-classify.mjs`.

---

## 1. The count

| Evidence class | Rows |
|---|---|
| `SERVED_RUNTIME` — drives a browser against a served build | **2** |
| `SERVED_BYTES_STATIC` — reads the compiled bundle without running it | **0** |
| `STATIC_ONLY_SOURCE_GATE` — reads source only | **11** |

And two hazards cutting across all three:

- **4 rows assert configured intent** — they read a `__TALARIA_*` switch name out of source and
  assert on it, which describes what the code is configured to do, not what it does.
- **7 rows have no named refusal state** — a failure to execute is indistinguishable from a defect
  in the subject. This is BIND-01 applied to the gate file itself.

Both `SERVED_RUNTIME` rows are **unrun against a sealed build**. `order01b-readback-canary` last
produced an artifact against b124, which is retired as an identity; the deployed host still serves
**b122** (B, 08:52+01:00, `rebuild-constraint` 5/5 NOT CARRIED). So lane A currently has **zero runtime
evidence from the build being sealed**.

---

## 2. Row by row

| Row | Evidence today | Seal verdict it may claim | What would make it a served PASS | Refusal states |
|---|---|---|---|---|
| ORDER-01B step ladder / steps per wall-second | source gate, asserts switch default | `STATIC_ONLY_SOURCE_GATE` | sealed smoke: set a step, observe bars advance at that rate | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN`; `CONFIGURED_INTENT_UNOBSERVED` |
| ORDER-01B forming renderer on the step clock | source gate, **no refusal state** | `STATIC_ONLY_SOURCE_GATE` | sealed smoke observing forming-bar repaint cadence | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN`; `GATE_DID_NOT_EXECUTE` |
| ORDER-01B tick-path deletion | source gate, asserts switch default | `STATIC_ONLY_SOURCE_GATE` | absence must be shown in **served bytes**, not source | `STATIC_ONLY_SOURCE_GATE`; `SERVED_BYTES_NOT_READ`; `CONFIGURED_INTENT_UNOBSERVED` |
| ORDER-01B 1d tick-speed routing | source gate, asserts switch default | `STATIC_ONLY_SOURCE_GATE` | sealed smoke at 1d | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN`; `CONFIGURED_INTENT_UNOBSERVED` |
| ORDER-01B timeframe downshift anchor | source gate, asserts switch default | `STATIC_ONLY_SOURCE_GATE` | sealed smoke across a downshift | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN` |
| A2 resolveBar transcript | source gate | `STATIC_ONLY_SOURCE_GATE` | sealed transcript capture | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN` |
| A3 speed/fill journal parity | source gate | `STATIC_ONLY_SOURCE_GATE` | sealed fill journal comparison | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN` |
| A3 daily bucketing on session day (17:00 NY) | source gate, **no refusal state** | `STATIC_ONLY_SOURCE_GATE` | sealed smoke: a daily bar boundary observed at 17:00 NY with the dropdown moved | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN`; `GATE_DID_NOT_EXECUTE` |
| TZ-01 tool labels follow the selected timezone | source gate | `STATIC_ONLY_SOURCE_GATE` | **PO's symptom was visual**; needs a sealed screenshot of crosshair and tool label agreeing | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN`; `LABEL_BASIS_UNOBSERVED` |
| TZ-01 candles honour the zone | source gate, **no refusal state** | `STATIC_ONLY_SOURCE_GATE` | sealed smoke reading bar boundaries under two zones | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN` |
| SHELL-PLAY override receiver (handed to B) | source gate | `STATIC_ONLY_SOURCE_GATE` | B's row; the defect is observable only at runtime | `STATIC_ONLY_SOURCE_GATE`; `SERVED_SMOKE_NOT_RUN` |
| `__talariaEffectiveRate` read-back | `SERVED_RUNTIME`, provenance-stamped | **`SERVED_SMOKE_NOT_RUN`** | run against deployed b125 | `SERVED_SMOKE_NOT_RUN`; `PROVENANCE_MISMATCH`; `READBACK_ABSENT`; `MIXED_SURFACE` |
| ORDER-01B play at the loaded edge | `SERVED_RUNTIME`, provenance-stamped | **`SERVED_SMOKE_NOT_RUN`** | run against deployed b125 | `SERVED_SMOKE_NOT_RUN`; `PROVENANCE_MISMATCH` |

---

## 3. The sharpest instance in this lane, named rather than buried

`BOARD-A` already records, in my own words, that the animation contract is *"implemented,
oracle-covered, and OFF by default"* and that *"the animation contract is not in force"* — the
shipped default still computes the legacy `tf / N` divisor, four times slower than the contract at
every rung. The oracle covering it is green.

That is FRAME-01's shape exactly: a green gate over a path the product does not take. It is
disclosed on the board, but a seal row reading "animation contract: oracle-covered" would be true
and misleading in the same breath. **The verdict line for that row must carry
`CONFIGURED_INTENT_UNOBSERVED`**, and turning the switch on is not mine alone — it red-lights 7 of
19 cells in three suites owned by others, which encode the legacy divisor as an invariant.

---

## 4. A structural nuance that sharpens the rule rather than excusing anything

The v9 shell does **not** compile the chart engine into its bundle. `dist-v9/index.html` loads
`/chart/modules/replay-system.js?v=20260803b125` — the engine ships as the **source file itself**.

So for engine rows, the bytes my source gates read *are* the bytes that will be served, and the gap
is narrower than for a compiled subject. It is not closed:

1. The **host may serve an older tree** — it serves b122 today, so "the source is right" says
   nothing about what a user is running.
2. A source gate reads the code **with the switch as written**, not as shipped.
3. The engine runs **under the shell**, and the shell overrides `play()`. SHELL-PLAY-01 is precisely
   a defect invisible in engine source and visible only in composition.

The **UI** rows are different: the two-control step menu *is* compiled into
`dist-v9/assets/talaria-v9-live.js`, so those rows need bundle or runtime evidence, never source.

---

## 5. A methodological warning I nearly published as a finding

Checking whether the sealed bundle carried the ORDER-01B UI, my first pass searched it for
`replayStepMenu`, `replaySpeedSteps` and `setStepSeconds` and found **zero of each**. Read at face
value that says the two-control UI never reached the seal — a five-alarm pre-seal finding.

It is wrong. The bundle is minified: `const`/`useState` locals are renamed by the build, so their
absence is evidence of nothing. Re-checked with markers that survive minification — property and
method names on objects the bundle does not own, plus string literals — the UI is present:
`isStepBelowDataFloor` 2/2, `stepTimeframeOverride` 2/2, `timeframeToMs` 2/2, `REALISTIC` 5→4,
matching source. `setStepSeconds` is genuinely 0 in both source and bundle, and correctly so: the
UI writes `stepTimeframeOverride`, because INTERVAL *is* the step knob.

**For anyone else doing served-bytes checks before the seal: a grep of a minified bundle for a local
identifier is a broken test, and it fails toward alarm.** Admissible markers are foreign property
names, method names, and string literals. Add `MINIFIED_MARKER_INADMISSIBLE` to the refusal
vocabulary.

---

## 6. What I am asking for

1. **Ruling on presentation.** Lane A has no runtime evidence from the build being sealed and cannot
   get any until b125 is deployed and I reach the front of C's queue. Every A row above should be
   presented with its `STATIC_ONLY_SOURCE_GATE` or `SERVED_SMOKE_NOT_RUN` token, not as a pass.
2. **Queue position.** The two `SERVED_RUNTIME` instruments are ready and provenance-stamped. One
   slot converts the two most-doubted rows — `__talariaEffectiveRate`, which has been claimed landed
   twice and was absent both times, is the one that most needs a live reading.
3. **The animation-contract row needs an owner** for the re-blessing across three suites, as flagged
   previously. It is not a row I can close alone.
