# Suspect Ledger — seal publication draft

**Owner: Manager B (integration). Updated: 2026-08-04 00:52+01:00 / 2026-08-03T23:52Z.**

> The stamp above read `00:2x+01:00 / 2026-08-03T23:2xZ` until 00:52+01:00 — a placeholder I never
> resolved, in the header of the document the PO's verification pass reads first. `FUTURE_STAMP` cannot
> see it, because it only inspects a board's CURRENT STATE block. That gap is seated at `PSL-32` and this
> is its second confirmed instance in one night, the first being a handoff future-dated by 1h47m.

**THE LAW, ruled by the PO at 2026-08-03 23:33+01:00.** Every named thing this campaign has
raised appears in **exactly one** of three states, and **absence is the only forbidden state**.

| state | what it requires — all of it, not most of it |
| --- | --- |
| **KILLED** | a fix, a kill-switch, a green gate, and a commit |
| **CLEARED** | cited evidence |
| **DEFERRED** | a named row **and** a `POST-SOAK-LEDGER.md` seat number. The PO signs these at packet review, so **signature cells are deliberately left empty** rather than pre-filled |

> **`OPEN` is abolished.** It was a legal state in every earlier revision of this file and it is
> no longer one. Five rows carried it and have been restated. `OPEN` is what a ledger says when it
> has not decided; the three states above force the decision, and a deferral with a seat number is
> how you say "we know, and we are shipping anyway on purpose" without lying about it.

> `DEFERRED` was added at 23:40+01:00 on 08-02 on the PO's instruction to publish a deferral here.
> It is recorded rather than assumed because the older three-word vocabulary had no way to express a
> deliberate ship-anyway: such a row could only be filed as CLEARED, which is a lie, or OPEN, which
> reads as unfinished work. Both bury it. **Deferral is never a synonym for CLEARED.**

---

## 0 · Census — how much of the population this ledger actually states

Section 2 of the seal packet is the claim that nothing is absent. That claim is only worth the
instrument behind it, so it is measured rather than asserted:

```
node scripts/suspect-ledger-census.mjs        # committed at 702060cb4
npm run test:suspect-ledger-census            # 10/10, with anti-vacuity arms
```

Artifact: `docs/plan3/evidence/suspect-ledger-census-20260804.json`.

**What it found on the pre-assembly ledger, and why this section exists:**

| | before assembly | after assembly |
| --- | --- | --- |
| population (149 ticket-ledger rows + 16 curated campaign controls) | 165 | 165 |
| STATED under exactly one legal state | **2** | **165** |
| `ILLEGAL_OPEN` | **5** | **0** |
| `AMBIGUOUS_MULTI_STATE` | 0 | **0** |
| `ABSENT`, the forbidden state | **158** | **0** of the enumerated population |
| dangling post-soak seats | **3** | **0** |

Instrument exit code **0** (`CENSUS_CLEAN`). Selftest **12/12**.

**Read the "after" column exactly as written.** `0 ABSENT` means *zero absent of the 165 enumerated*,
and the enumeration is a floor. It does not mean nothing is missing, and this ledger does not claim it.

**Three defects were found in the instrument by running it against the assembled file.** Each would
have produced a false accusation rather than a missed row, and all three are the same family as the
defects this campaign has spent ten days finding in product code:

1. A restated row records its former verdict as `` `OPEN` `` in a `was` column. The detector read that
   quotation as a live assertion and graded a lawful audit trail an illegal state. Fixed by stripping
   inline-code spans — **assertions are bold, quotations are backticked.**
2. A `DEFERRED` row explaining *"a fix with no mechanism is not a fix, so this cannot be KILLED"* was
   graded `KILLED` off its own prose, colliding with its bold status. Fixed by giving the **bold**
   status precedence over any state word in prose.
3. Nine rows stated a few lines away were reported `ABSENT`, because ids like `SEL-01`, `Rayan #6b` and
   `PO value-box shaky` match no id shape, and curated handles like `SECOND-GPU-BOX` are my shorthand
   appearing nowhere in the prose. Fixed with literal matching plus an explicit **anchor** per curated
   control, so a reworded row breaks the anchor and reports absence **loudly** rather than passing on a
   handle nobody uses. That is BIND-01 applied to the census itself.

**The finding, stated plainly: this ledger has never been a census.** It was a highlights list.
Section 4 carried **7** ticket rows against the ticket ledger's **149**; the other 142 appeared
nowhere in it. Nothing was hidden — it was simply never claimed to be complete, and §2 of the seal
packet now requires that it be.

### The instrument reported a green zero on its first run, having done nothing

Recorded here rather than quietly fixed, because it is the same defect class the instrument exists
to detect. The `invokedDirectly` guard compared `import.meta.url` against a hand-built
`` `file://${argv[1]}` ``, which never matches on Windows — `import.meta.url` carries three slashes
and a drive letter. `main()` never ran; the process printed nothing and exited **0**. A green from
an instrument that scanned nothing is exactly what caught `copy-absence-census` manufacturing a
zero, and it happened again while building the tool to check for it. Fixed with `pathToFileURL`.

### `fixed` is a status word, not four axes

**KILLED requires four axes and the ticket ledger records three.** Measured, not assumed:

| axis | evidenced |
| --- | --- |
| fix + commit | **49 of 49** `fixed` rows carry a commit |
| green gate | **49 of 49** carry a gate asserting GREEN/PASS |
| **kill-switch** | **1 of 149 rows records a switch anywhere.** The ticket ledger has no switch column |

So for **48 of the 49** rows below marked KILLED, the switch axis is **UNRECORDED**. That is a gap
in the evidence, not a pass, and each such row says `switch UNRECORDED` in its basis cell rather
than letting the word "fixed" launder into a four-axis guarantee. The 18 kill-roster rows in §1 and
the 6 in §2 are different: those carry PROC-3 GREEN, which tests Present/Bound/Mirrored/
Discriminating directly, and several name their switch explicitly.

### This census is a FLOOR, not a ceiling

Extraction is id-shaped over the ticket ledger plus a curated control list. It **cannot see** a
suspect named only in prose with no id, one living only in an untracked file, one referred to by two
different names (which counts as two), or one that exists only in a commit message. **This
instrument can prove an absence. It cannot prove completeness.** Read the population as a lower
bound, and read "0 ABSENT" below as "0 absent *of the 165 enumerated*" — never as "nothing is
missing".

### Curated, because no regex can infer it

16 campaign controls are in the population by hand, since no pattern can know that `DRAW-SMOKE-01`'s
gap is a suspect while `BIND-01` is the rule it was judged by. The first version of this instrument
counted policies as suspects and reported 231 absences, which is a category error rather than a
finding. The curated list is in `scripts/suspect-ledger-census.mjs` as `CURATED`, so it can be
argued with.

Source of truth for kill-roster axes: `node docs/plan3/oracles/proc3-unwired-fix-sweep-v1.mjs` on tip.
This tip's PROC-3 run: **18 roster rows GREEN**; overall status RED only because four deliberate `KNOWN-*` canaries stay RED (that is the gate working, not a product defect).

---

### 0g · The census produced a false absence, inside the corpus it claimed to search

Two of the PO's ten items were published as `REFERENT_NOT_LOCATED`. **Both were wrong, in different
ways, and the difference matters more than the count.**

| item | published | actual | why the instrument missed it |
| --- | --- | --- | --- |
| the second GPU box | `REFERENT_NOT_LOCATED` | **in the corpus**, `RECIPE-SEALED-SOAK-FROZEN-20260803.md:240` and `BOARD-C.md:1263` | **search failure.** The text was in the frozen soak recipe, one of the most-read documents in the project, and I said no request existed |
| the unlit dark rooms | `REFERENT_NOT_LOCATED` | **outside the corpus**, `scripts/n1-heavy-vs-fresh.mjs:5` | **scope failure.** The census reads `docs/plan3` prose only, so a suspect named in a script header is invisible to it by construction. Seated `PSL-37` |

The second is a stated limit I should have declared up front. **The first is the one error a census is not
permitted to make** — it is a manufactured absence, in an instrument whose entire claim is that absence is
the forbidden state. It also propagated: the same false sentence reached `POST-SOAK-LEDGER.md` and the
§2 handoff to A before anyone read it, so one unchecked search became three documents.

**Read every `REFERENT_NOT_LOCATED` in this file as "B's search did not find it", never as "it is not
there."** The two remaining unlocated items in row 8's cohort carry that caveat now.

**A "correction" that made the record worse.** The R7 row was recorded at 00:28+01:00 as ambiguous, with
two candidate referents named. At 00:3x+01:00 I replaced that with `REFERENT_LOCATED — and it is mine`,
a single confident answer that **discarded the ambiguity I had correctly captured an hour before**. A
third candidate has since surfaced — checklist #7, COV-01 coverage calibration, RED at 59.8% — which fits
"machine-coverage backfill" at least as well as either. Restored to `REFERENT_CONTESTED` with all three.
Confidence rose while accuracy fell, no gate could see it, and only a re-read caught it.

**Why this section exists at all.** The PO's finding this morning is that our measuring apparatus is less
trustworthy than the thing it measures — 0.08 against 8.0 from a harness, against 600 bars per minute
measured by hand. This file is part of that apparatus, so its own false readings belong in it, at the
top, where a reader meets them before they meet a number.

---

### 0f · PO signature lines — 62 rows had nowhere to sign

The law requires a DEFERRED row to carry a PO signature line left **empty**, because the PO signs at
packet review rather than us assuming it. Audited mechanically at 00:53+01:00: **99 DEFERRED rows, and
66 of them had no signature column at all.** Not an empty cell — no cell. A reader could not have signed
them without editing the table first.

| table | DEFERRED rows | before | after |
| --- | --- | --- | --- |
| §4g ticket census | 49 | no column | column added, 49 empty, 94 settled rows marked `—` |
| §4i PO's named items | 9 | no column | column added, 9 empty, 2 settled rows marked `—` |
| §4i B-lane controls | 4 | no column | column added, 4 empty, 2 settled rows marked `—` |
| the other six tables | 33 | column present | 31 empty, 2 already PO-signed, unchanged |
| §4k A-lane | 1 | added with the section | 1 empty |
| **total** | **96** | 33 signable | **96 signable, 94 awaiting a signature** |

**Empty and `—` are deliberately different.** Empty means *the PO must sign this*. An em dash means *no
signature is required*, on a KILLED or CLEARED row. Without that distinction an empty cell on a settled
row is indistinguishable from an unsigned deferral, which would have made the column decorative — the
same failure as a gate that checks an offset is present without checking the time is possible.

Four DEFERRED-matching rows were deliberately **not** given a signature cell, and they are the law table
in the preamble and the three-row `STATUS_MAP` legend in §4g. Both describe rules rather than suspects.
Stated because "62 of 66" invites the question, and the answer is not "I missed four".

**What this section does not claim.** Opening a signature line is not obtaining a signature. All 94
unsigned deferrals are still unsigned, exactly as instructed, and two rows in §4 and §4b carry real PO
signatures from 2026-08-02. The count to quote at packet review is **94 rows awaiting a PO signature**
out of 96 deferrals, not 94 rows the PO has seen.

> **This paragraph first said 96 awaiting, twice.** I subtracted the four law-and-legend rows and then
> failed to subtract the two rows already signed, and the filter I wrote to check it matched nothing while
> appearing to work — it excluded on header text that never appears in a row. Recounted structurally by
> table shape: **96 suspect deferrals, 2 signed, 94 awaiting.** Second arithmetic slip of the night, after
> a §4j count line that said 28 over a breakdown summing to 36, and both were caught by re-deriving the
> number rather than by re-reading the sentence. Recorded because a ledger whose own totals need checking
> is the apparatus problem the PO just named, in the file that is supposed to be the check.

**One more stamp finding, stated rather than papered over.** Sweeping this file and `POST-SOAK-LEDGER.md`
for placeholder minutes found **18** stamps in the `00:2x+01:00` form — mine and C's, describing past
events. They are **imprecise rather than false**, which is the opposite failure from the `00:45` I wrote
against a `00:44:03` commit an hour ago, and it is the better failure of the two. I have not back-filled
them, because I do not have the minutes and inventing them would convert honest imprecision into false
precision in the document the PO reads first. They cannot be checked against a commit time by any
instrument we have. `PSL-32`.

---

## 1 · Kill roster (round one) — performance / life / hygiene

| Row | Owner | Status | Evidence |
| --- | --- | --- | --- |
| LAG-1a | D | **KILLED** | PROC-3 GREEN; mutant proof `lag1a-marker-index-cache-gate` |
| LAG-1b | A | **KILLED** | PROC-3 GREEN; C13 neutering cells |
| LAG-2 | A | **KILLED** | PROC-3 GREEN |
| LAG-3 | E | **KILLED** | PROC-3 GREEN; regime OFF/ON arms |
| LAG-4 | A | **KILLED** | PROC-3 GREEN |
| MEM-1a | A | **KILLED** | PROC-3 GREEN |
| MEM-1b | A | **KILLED** | PROC-3 GREEN |
| MEM-1c | A | **KILLED** | PROC-3 GREEN |
| MEM-1d | A | **KILLED** | PROC-3 GREEN; consumer audit left 6 pinned sites |
| LIFE-1 | A | **KILLED** | PROC-3 GREEN |
| LIFE-2 | E | **KILLED** | PROC-3 GREEN |
| LIFE-3 | B | **KILLED** | PROC-3 GREEN; canary serves `Cache-Control: no-store` on passport |
| LIFE-4 / M8 | D build, B review | **KILLED** | PROC-3 GREEN; B review 20260801-1030 |
| HYG-1 | B | **KILLED** | PROC-3 GREEN |
| HYG-2 | A | **KILLED** | PROC-3 GREEN |
| PROC-2 | E | **KILLED** | PROC-3 GREEN |
| PROC-3 | E | **KILLED** | PROC-3 GREEN (self) |
| ATTRIB-A-live | A | **KILLED** | PROC-3 GREEN |

### Withdrawn / not guilty

| Suspect | Status | Why |
| --- | --- | --- |
| ~16.6 MB/closed-trade resident (decoded-image family) | **CLEARED** | Director 09:15+01:00 §0.1 — coefficient fails matched-bars test; bar-driven growth wearing a trade label |
| Residency-window-inline `9e0a8ad591` | **CLEARED** | A: `CANNOT-APPLY` — pre-image absent; EVICT-03 does not absorb it |

---

## 2 · Bootstrap / passport / deploy (B lane, post-roster)

| Row | Status | Evidence |
| --- | --- | --- |
| DEF-05(a) canvas context recovery | **KILLED** | `27eaebdc4`; oracle 27/0; kill `__TALARIA_DISABLE_CANVAS_CONTEXT_RECOVERY_V1` |
| DEF-05(b)/DEF-07 prefs bootstrap defaults | **KILLED** | `6959c2ce9` / `a42cbb02e`; deterministic oracle 23/0; browser 20× cold-load still owed on final tip |
| PASSPORT-3 (badge + digest + SHA) | **KILLED** on canary | Live `VERIFIED` on `http://31.97.192.82:3000`; door triage distinguishes production `WRONG_DOOR_AUTH` (exit 3) from build defect |
| Emitter `package.json` side effect | **KILLED** | Removed; version pinned 1.4.31; discriminating mutant |
| Pre-cut integrity gate root inference | **KILLED** | `1c69bebb4`; container-layout proof in `_evidence/manager-B/precut-gate-layout` |
| r1-render-killswitches | **KILLED** | `a83d75c09`; 11/0; switches proven by direct probe |

---

## 3 · PROC-3 deliberate canaries (must stay RED)

These are **not product OPEN rows**. They prove the sweep discriminates. Leaving them GREEN would be the defect.

| Canary | Status | Meaning |
| --- | --- | --- |
| KNOWN-A-resolver | RED (intentional) | Present but unbound — BIND-01 training case |
| KNOWN-MEM-1a-mutant-artifact | RED (intentional) | Mutation artifact in product mirror |
| KNOWN-overlay-kill-switch-four-call-sites | RED (intentional) | Incomplete discriminating cover |
| KNOWN-E-first-attribution-oracle | RED (intentional) | First oracle superseded |

---

## 4 · Ticket / canary order rows needing PO signature or closeout before seal

Pulled from `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` and `docs/plan3/CANARY-LEDGER-20260730.md`. Anything still `po-eyes` / `open` / `owner-blocked` / `blocked-on-build` is **OPEN** here until closed or PO-signed into the soak.

**All five `OPEN` rows in this section have been restated under the new law.** The former status is
kept in the row so the change is auditable rather than silent.

> **Four of these five were restated a second time, on D's evidence rather than on a status word.**
> The ticket ledger still calls TAL-01696 and TAL-01698 `po-eyes` and TAL-01865 `owner-blocked`, so the
> mechanical mapping in §4g deferred all three. **D has landed fixes for all three with gates and
> served mutant kills against b126.** The ticket ledger's status column is simply stale relative to
> D's lane, which is exactly the failure a status-word mapping cannot see and a lane submission can.
> The lane evidence wins; the stale status is recorded beside it so the disagreement stays visible.

| ID | was | Status | PO signature | Post-soak seat | Note |
| --- | --- | --- | --- | --- | --- |
| TAL-01696 | `OPEN` | **KILLED** | — | — | Order-line visual cluster. **D's evidence, overriding a stale `po-eyes`:** fixes `a1a270692` + `c0a0d7620`; gates `order-stable-label-hover-dom`, `preview-label-drag-freeze`, `order-type-live-label-refresh`, `order-line-drag-scale-and-multitp-live`. Nine served mutants killed on b126 — `fixed-box-size`, `value-box-moves`, `hover-blinks`, `drag-scale-mismatch`, `missing-size-unit`, `market-size-drift`, `control-button-moves`, `font-baseline-drift`, `duplicate-activation-box` — in `docs/plan3/evidence/tal-po-ui-smoke-mutants-b126-live-summary.json`. **This is the strongest kill shape in the file: mutants killed on the served build, not a static gate.** |
| TAL-01698 | `OPEN` | **KILLED** | — | — | Multi-TP average live update. D: fix `231df7bb5`; gates `order-line-drag-scale-and-multitp-live`, `multi-tp-preview-drag-sync`; served mutant `release-only-average` killed on b126, same artifact. Stale `po-eyes` overridden on the same basis. |
| TAL-01617 | — | **CLEARED** | `PO-SIGNED: PO 2026-08-03` | — | PO stated resolved at 12:57+01:00, confirmed closed 15:44+01:00. Basis is the PO's own verification, not a gate: the row sat `NEEDS-INFO` because no reproduction steps ever existed, so the PO is the only party who could retire it. No runtime evidence is claimed and none is owed. |
| TAL-01865 | `OPEN` | **KILLED** | — | — | Visual / restore seal rows. **D's evidence, overriding a stale `owner-blocked on A (symbol persist)`:** served mutant suite `710313adc` killed `tool-label-timezone-drift`, `candle-timezone-static`, `refresh-symbol-resets`, `refresh-replay-starts-over`, `drawings-index-persist` on b126; PO checklist rows in `434ce9266`, addenda `e56b8b284`, `41d40f68f`. The killed `refresh-symbol-resets` mutant is the symbol-persist ask the `owner-blocked` note was waiting on. **Two things share this id** and the census flagged the double state: `TAL-01865-VIEWPORT-CONSUMER` is separately **KILLED** in §4c at `823e32cec`. Both now kill, so the id no longer carries two verdicts. |
| M17-DI2 / TAL-01918 | `OPEN` | **DEFERRED** |  | `PSL-20` | `blocked-on-build`. Product guard restored on the train tip; needs stamp confirmation against the sealed build, which is verification debt rather than an unfixed defect. **The only one of the five that stays deferred.** |
| Rayan #8 | `OPEN` | **KILLED** | — | — | Analysis-only / supporting-symbol order path. **Restated twice.** The census first caught the contradiction — this row said `OPEN` while the ticket ledger says `fixed` — and D then supplied the kill shape: fix `f2e9d4fdb`; gate `analysis-only-symbol-order-gate`; served mutants `analysis-only-allows-order`, `session-overlap-allowed`, `supporting-gold-missing`, `supporting-compare-missing` killed on b126; visual checklist rows 13–17 in `434ce9266`. |
| TAL-01941 | — | **CLEARED** | `PO-SIGNED: PO 2026-08-03` | — | Same basis as TAL-01617: instrumentation/repro-only row with no reproduction steps, retired by the PO directly. No runtime evidence is claimed and none is owed. |

> Deployed-build Script rows that are "open until Script N on stamp" are **not** listed as product defects once the fix is KILLED above; they are **verification debt** against the final tip. They still need a green Script run or an explicit PO waiver before soak fire.

---

## 4b · Deferred by ruling — known, understood, deliberately not fixed before this seal

These are **not** CLEARED and **not** unfinished work. Each is a defect or hazard we can describe precisely and have chosen, on the record, not to touch before the seal. Every row carries a signature and a revisit condition, so it cannot decay into folklore.

| ID | Owner | Status | PO signature | Revisit condition | Evidence it is latent, not live |
| --- | --- | --- | --- | --- | --- |
| `SHELLPLAY-SIBLINGS-BIND-SHAPE` | B | **DEFERRED** | `PO-SIGNED: PO 2026-08-02T22:34Z` — *"leave the nine wrappers … that is the right risk call"* | The day anything replaces the host `ReplaySystem` **in place**, or a twelfth wrapper is added to `MultichartGrid.jsx`. Then it becomes live and wants one mechanical pass with a gate. | Eleven wrappers capture their original as `patchedRs.<m>.bind(patchedRs)`, freezing the receiver at patch time. Can only bite if the instance is replaced while they stay installed; A's b124 artifact records `patchState.sameReplaySystem: true`. Receiver divergence was separately disproved as the `SHELL-PLAY-01` mechanism. |

> **`TAL-01865-VIEWPORT-CONSUMER` was withdrawn from this section on 2026-08-03 and is now KILLED.** It was deferred at 23:27Z on the reasoning that the seal was imminent and the fix touched the engine on seal night. `b125` turned out not to be the seal build, so the premise expired; the PO reopened it in daylight and it landed at `823e32cec`. Kept visible here rather than deleted, because a deferral that vanishes without trace teaches the next reader that 4b is where things go to be forgotten. The kill is recorded below.

> Count note: the ruling says "nine wrappers", the row says eleven. Eleven is correct — `enterReplayMode`, `exitReplayMode`, `pause`, `setSpeed`, `setPlaybackMode`, `setStepTimeframe`, `goToReplayTimestamp`, `requestStepForward`, `requestStepBackward`, `stepForward`, `stepBackward`. Nine was my miscount, carried into the ruling before I corrected it at 23:11+01:00. The decision is unaffected — it argues *more* strongly for deferring, not less.

---

## 4c · Withdrawn from deferral and closed

| ID | Owner | Status | Landed | Evidence |
| --- | --- | --- | --- | --- |
| `TAL-01865-VIEWPORT-CONSUMER` | B | **KILLED** | `823e32cec` | The chain was capture → persist → manager writes `restoreStart`/`restoreEnd` onto the panel URL → **nobody reads it**. Every link present, mirrored and green, and zoom never restored. The consumer went into `multichart-prod/sync-bridge.js`, not the engine: `setVisibleTimeRange(chart, startSec, endSec)` already takes seconds, already handles the no-overlap case, and is already exercised on every panel add by the initial-sync snap — a proven path, where a new `chart.js` viewport writer would have been a fresh one running on every boot. Restore-only by construction: boot URL only, applies at most once, abandons on first user input, bounded 25-attempt retry. Kill switch `__TALARIA_DISABLE_VIEWPORT_RESTORE_V1`. Gate `viewport-restore-consumer` **11/11** with two mutants (cut the apply; cut the kill-switch check), four anti-vacuity arms, a bars-arrive-late cell and a mirror-identity cell. **All six fields of the PO's per-panel list now restore end to end.** |

---

## 4d · E-lane memory suspect rows sent to B at freeze

Sent by E at **23:34+01:00** after the product freeze. One row per named E-lane suspect; no product edits are implied. Empty PO signature cells are intentional for post-soak packet review.

> **Seat numbers corrected 00:2x+01:00.** The census found that all three seats these rows cited —
> `POST-SOAK-LEDGER-E-01`, `-E-02`, `-E-03` — **did not exist** in `POST-SOAK-LEDGER.md`. Three
> deferrals were citing a seat number that was not a seat, which is the citation-lands-in-git-and-its-
> evidence-doesn't split one level up: the deferral was real, the seat was a label. E's numbering was
> reasonable and simply predated the file, which B opened at 23:4x+01:00 under a `PSL-nn` scheme. The
> rows below now cite real seats and keep E's original label as an alias, so E's own notes still
> resolve. `E-SUS-04` maps to the seat that already existed for it.

| Seat | Suspect | Status | Post-soak seat | PO signature | Evidence / revisit condition |
| --- | --- | --- | --- | --- | --- |
| `E-SUS-01` | Canvas arenas / indicator-layer canvases | **KILLED** | — | — | Fix landed in `8d0ed5579` with release path `_releaseIndicatorLayerCanvas`; capability proof re-detected the known change under forced GC + settle. `_evidence/manager-E/combined-canvas-fix-settle-20260802.json` reports total private **500.36 → 449.58 MB**, reclaim **50.78 MB**, `verdict=MEASURED`. |
| `E-SUS-02` | Linked panes | **KILLED** | — | — | Fix landed in `934132a1e` and `fcd338a4a` with linked-pane overlay removal release paths. Pair-switch evidence stopped carrying this as a standing leak row; no post-freeze product cut required. |
| `E-SUS-03` | Marker defs / SVG defs | **DEFERRED** | `PSL-24` (alias `POST-SOAK-LEDGER-E-01`) |  | Named suspect without a current E-owned KILLED/CLEARED proof shape in this ledger. Revisit after soak with MB-priced forced-GC/settle evidence or explicit owner handoff. |
| `E-SUS-04` | `_smartPrefetchCache` | **DEFERRED** | `PSL-02` (alias `POST-SOAK-LEDGER-E-02`) |  | Real asymptotic hoard, not the monotone **36 MB/hour** V8 slope answer. Fix landed in `64b0a7a01` + `afcb87e5f`; gate `smart-prefetch-cache-discipline` is green for the static discipline row, but product freeze says it rides the post-soak build. Revisit after soak with the committed perturbation arm if needed. |
| `E-SUS-05` | V8 monotone slope | **DEFERRED** | `PSL-25` (alias `POST-SOAK-LEDGER-E-03`) |  | Still the unresolved JS-side slope finding. Diagnostic run was contaminated/non-authoritative; perturbation rerun stays post-soak/behind C. Revisit condition: run the committed smart-cache perturbation and/or authoritative read when the box is released. |
| `E-SUS-06` | Dominator-subtree attribution work | **KILLED** | — | — | Instrument undercount fixed in `47c873ac4` after fallback build `6bd2fd6fd`; gate `v8-dominator-subtree` PASS **3/3**. Diagnostic A/B/C application reclassified `_smartPrefetchCache` as an asymptotic hoard, preventing it being mis-filed as the slope answer. |
| `E-SUS-07` | `m20Q6CapturedClear` lead | **CLEARED** | — | — | Complete diagnostic C retainer hunt found **13 instances / 416 bytes**. The earlier A-B **+7.270 MB** constructor salvage remains two-point salvage only, not a standing retainer owner. Reopen only if the post-soak authoritative V8 read names it again. |

---

## 4e · C-lane suspect rows sent to B at freeze

Sent by C at **00:2x+01:00** on the Director's 00:00+01:00 instruction. One row per named C-lane
suspect; no product edits are implied and none were made. Empty PO signature cells are intentional for
post-soak packet review.

**Two conventions, so B does not have to guess.** (1) Where a suspect C named was killed by another
lane's fix, the row says so and cites their seat — **do not count it twice in §2**. (2) Every DEFERRED
seat below resolves to a real numbered row in `POST-SOAK-LEDGER.md`; a seat number that points at
nothing is absence wearing a better word, which is the failure this ledger exists to prevent.

| Seat | Suspect | Status | Post-soak seat | PO signature | Evidence / revisit condition |
| --- | --- | --- | --- | --- | --- |
| `C-SUS-01` | COV-01 coverage basis — 59.84%, 271.05 MB unattributed | **KILLED** | — | — | The defect was mine: one renderer's allocator roots divided by **all-process** private. Fixed to all-process `effective_size` in `coverageAcrossProcesses`, `scripts/lib/detailed-dump-capture.mjs`, commit `2f548462d`. Gate `BASIS-GUARD-01` **BOUND** in HEAD guards the ratio; `npm run test:cov01-capture` green. The single-pid figure is retained in every artifact as `singlePidCoverage` for comparison, explicitly not for quoting. |
| `C-SUS-02` | "Settled" was a word, not a criterion | **KILLED** | — | — | A forced collection plus a **3-second sleep** was taken for settled and produced a 135 MB spread across five reps of one configuration. `SETTLE-CRITERION-V2` in `scripts/lib/settle-criterion.mjs`, commit `f01507ea0`, four conditions (Quiescent, Collection effective, Flat, Not rising). Gate **BOUND**. Discrimination proven on a known-unsettled mutant: the b120 3-second reps are fed to it and graded not-settled. |
| `C-SUS-03` | Forced GC on live, allocating pages — 26 instruments | **KILLED** | — | — | Twenty-six instruments inherited the omission from one module, so it was fixed in the module rather than the callers: `quiesce()` is now the **default** in `readUnderSettleProtocol`, `scripts/lib/settle-protocol.mjs`, commit `2f548462d`. Gate `QUIESCE-01` **BOUND** with 8 non-test callers. Opting out requires a recorded reason, so an instrument that genuinely measures a live session no longer looks identical to one that forgot. Roster: `npm run gate:settle-roster`. |
| `C-SUS-04` | JS heap read **higher** after collection in 4 of 5 reps | **KILLED** | — | — | Not noise around a bad settle window. The mechanism is sampling during **post-collection re-allocation** on an unpaused page: the read post-dates the collection without reflecting it. Written up in `docs/plan3/C-FORCED-GC-RESAMPLE-ANOMALY-20260803.md`. Now detected rather than reasoned about — condition C of `SETTLE-CRITERION-V2` takes the heap on **both sides** of every collection and grades `COLLECTION_INEFFECTIVE_OR_RESAMPLED`. |
| `C-SUS-05` | The five historical memory readings | **KILLED** | — | — | Retired by Director ruling and not restated here beyond the fact of retirement. The generalisation is the deliverable: `PHASE-SURVIVAL-01`, `scripts/lib/phase-survival.mjs`, commit `3f966bb76`, gate **BOUND**, gives a **stated criterion** for which phase-corrupt readings survive — absolute single-phase readings die, differences within one curve may live — so the published set was swept rather than judged case by case. |
| `C-SUS-06` | Canonical floor **674.9 MB** — blocked, not published | **DEFERRED** | `PSL-11` |  | `FLOOR_FOUND` but `NOT_QUOTABLE_COVERAGE` at 59.84%, and on the corrected criterion its curve would not have graded settled either — the instrument's default ladder had a **300 s last gap** (see `C-SUS-17`). Re-measured at the soak's hour-0 endpoint under `BOOT-ENDPOINT-READING-01`. **Revisit condition:** if the hour-0 reading fails `READING-VALIDITY-01`, the packet carries the failure sidecar and the floor is re-taken post-soak on a clean box. |
| `C-SUS-07` | `DRIFT-ABBA` | **DEFERRED** | `PSL-12` |  | `SELF_TEST_ONLY`, and I had reported it completed when it had never run — `abbaSequence` is called by exactly one file, its own self-test. Withdrawn from the completed list at 22:0x. **Not** bound somewhere convenient to make the audit green: binding it needs a genuine paired ABBA arm, which needs the host. **Revisit condition:** first real paired run after the soak releases the box. |
| `C-SUS-08` | Combined canvas reclaim — C's **19.6 MB** | **KILLED** | — | — | **Killed under `E-SUS-01`, not by me — do not count twice.** C's 19.6 MB (`_evidence/manager-C/combined-canvas-fix-run2.json`) was measured against a dirty tree and is **withdrawn as a number**; the mechanism finding stands and is superseded by E's clean measurement of **50.78 MB** at `8d0ed5579`. C's no-release control at `_evidence/manager-C/combined-canvas-fix-control-no-release-20260802.json` remains valid as the control for E's arm. |
| `C-SUS-09` | `blink_gc` **+212 MB** growth | **CLEARED** | — | — | Withdrawn by me and reconciled against E's measured `blink_gc` **level of 13.00 MB** — a 212 MB growth in an arena that holds 13 MB total was an instrument artefact, not a leak. C's own later census puts `blink_gc` at **+6.75 MB** with `partition_alloc` **+3.2 MB**, together ~10 MB against a **+110 MB** OS floor, which is the same conclusion from the other direction. |
| `C-SUS-10` | **12.7 MB** per pair switch | **CLEARED** | — | — | Disproved by D's accumulation run, and it was **my** hypothesis that had reordered the night's priorities. Renderer-private from baseline across ten switches: `14.44, 9.24, 8.15, 6.88, 7.48, 7.43, 7.92, 8.76, 9.41, 10.57`. Verdict `RETURNS_TOWARD_BASELINE_OR_NO_MONOTONIC_SLOPE`. A **one-time first-switch cost that falls away**, not a per-switch accumulation: ten switches cost 10.57 MB total, not 127. |
| `C-SUS-11` | The 2026-08-02 arena series | **DEFERRED** | `PSL-13` |  | Every figure keyed to `totalPrivateMB` from that series is unusable — host contention covered the **whole run, not a tail**, so there is no clean window to salvage from inside it. **Revisit condition:** re-run under host scope with the exclusivity witness recording `scopesHeld`, on box time only. C's arena re-run is deliberately last in the queue and waits on E's retainer verdict. |
| `C-SUS-12` | Three of four panels delivered **zero bars** in every CONF-01 measurement ever taken | **KILLED** | — | — | The larger half of a hypothesis that split, and worse than the version I proposed: `distinct-four-files` parked 3 of 4 panels at `masterLen-1`, so most published per-panel work described panels that never advanced. Fixed by `HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL` plus `CONF01-COMMON-WINDOW-V1` in `scripts/sealed-two-arm-soak.mjs`, commit `2f548462d`, with `requireDeliveringPanels: 4` refusing the arm at boot and runway declared rather than assumed. Artifact `_evidence/manager-C/exhaustion-probe-run2.json`, grader 12/12. |
| `C-SUS-13` | The 1,024 MB bar had no stated basis | **KILLED** | — | — | The bar was being compared against whatever the reader had to hand. Defined on a **total all-Chrome private** basis binding at **settled post-GC**, split three ways — authored / caused / fixed — in `scripts/lib/bar-basis.mjs`, commit `6e1aa9c0c`, paper `docs/plan3/C-BASIS-OF-THE-1024-BAR-20260803.md`. `assessAgainstBar` **refuses** to compare an unsettled reading rather than returning a pass or a fail. The fixed row holds to 8.8 MB across three readings, two builds and two configurations while the caused row swings 59.9 MB. |
| `C-SUS-14` | Cross-basis borrowing | **KILLED** | — | — | A figure measured on one quantity, scope or method used against another — arithmetic valid, meaning not. It produced `C-SUS-01` and nearly killed three canvas reclaims. `BASIS-GUARD-01`, `scripts/lib/basis-guard.mjs`, commit `2f9e2da02`, gate **BOUND**, deliberately bound at the exact site where the original error happened rather than somewhere convenient. |
| `C-SUS-15` | Measurement runs firing unclaimed on a shared box | **KILLED** | — | — | `UNCLAIMED_RUN_DETECTED` was real: my own soak ran unclaimed. `RUN-LOCK-01` now held by the **child** rather than the launcher in `scripts/sealed-two-arm-soak.mjs`, the fire script claims the queue with the child's pid, and `ADOPT-01` in `scripts/measurement-queue.mjs` (commit `0051c3893`) lets an already-live run be recorded retroactively while **refusing dead pids** — which is the distinction that makes adoption safe. |
| `C-SUS-16` | The gate audit could not tell an unbound gate from an uncommitted binding | **KILLED** | — | — | The audit greps HEAD; it reported `SELF_TEST_ONLY` on a gate that was genuinely bound in my working tree. The audit was right and I was reading the wrong tree — but those are different facts, so `BOUND_BUT_UNCOMMITTED` is now its own state in `scripts/gate-binding-audit.mjs`, commit `2f548462d`, via `git grep --untracked` against the worktree. Written up as the law of three costumes: presence, binding and commitment are three things. |
| `C-SUS-17` | The floor instrument could never have graded `SETTLED` | **KILLED** | — | — | Default ladder was `0,20,150,300,600` — cumulative, so its **last gap was 300 s** against the criterion's 600 s minimum. **No run of that instrument could ever have graded settled, including the pass-3 curve that reported `FLOOR_FOUND`.** Ladder is now `0,600,1200` in `scripts/canonical-floor-retake.mjs`, commit `99198d15d`; the old ladder stays reachable via `--rungs` and grades `RUNG_TOO_SHORT`, which is the honest answer for it. |
| `C-SUS-18` | The soak's hour-0 endpoint was not a settled reading | **KILLED** | — | — | With W2 cancelled, the temptation was to relabel the existing `<arm>:start` dump canonical. It is **one read on a playing page** — two failures, Q and F. `BOOT-ENDPOINT-READING-01`, `scripts/lib/boot-endpoint-reading.mjs`, commit `2f548462d`, gate **BOUND**: quiesce, three reads at 600 s rungs with forced collection, dump while paused, resume. First segment only. 15 cells. |
| `C-SUS-19` | A memory number could be published without its validity checklist | **KILLED** | — | — | `READING-VALIDITY-01`, `scripts/lib/reading-validity.mjs`, commit `2f548462d`, gate **BOUND**. Five rows inline with the reading — identity lock, phases, sidecars, coverage, capability proof — and **UNPROVEN is not a pass**. On failure it writes a sidecar file and returns `floorMB: null`; the number is not emitted with a caveat, it is not emitted. 14 cells. |
| `C-SUS-20` | An instrument certifying itself with another instrument's capability artifact | **KILLED** | — | — | I nearly used E's `combined-canvas-fix-settle-20260802.json` as this reading's capability proof. It proves **E's harness** can see a change and says nothing about the soak's footprint path — `C-SUS-14` in a different costume, eight hours after I built the guard for it. `CAPABILITY-PROBE-01` in `scripts/lib/boot-endpoint-reading.mjs`, commit `2f548462d`: commit a known 64 MB, read, release, collect, read again — run **after** the quoted floor so it cannot move the number it certifies. |
| `C-SUS-21` | First-paint allowance — ratified method, no measurement | **DEFERRED** | `PSL-10` |  | R2 ratified the number in advance conditional on two falsifiers, so only the three boots are outstanding and **nothing waits on them**. Allowance is `settled bar + Σ(attributed, structurally unavoidable construction transients)`; unattributed transients are excluded by construction. `scripts/lib/first-paint-allowance.mjs`. **Revisit condition:** three boots on a clean box producing `SETTLE-CRITERION-V2`-compliant curves; if a falsifier trips, the allowance is the settled bar plus attributed transients and the gap is reported. |
| `C-SUS-22` | Hoard floor curve | **DEFERRED** | `PSL-14` |  | Ruled post-soak by the Director, so the end-of-arm paused curve was **removed** from both arms and `RECIPE-SEALED-SOAK-FROZEN-20260803.md` Amendment 2 records the removal (commit `f0531a352`). The hour-0 curve remains and covers the boot end. **Revisit condition:** post-soak paused curve at the drained end, same ladder, on box time. |
| `C-SUS-23` | `chart.js:4916` and `:4919` — silent catches under RATE-HOLD's own quantity | **DEFERRED** | `PSL-15` |  | `try { replay.syncCurrentIndexFromReplayTimestamp(...) } catch (_si) { }` and `try { replay.updateChartData(false) } catch (_uc) { }`. `replayTimestamp` is exactly what RATE-HOLD reads as delivered bars/s: if either throws during a ten-hour arm the playhead stops, delivery reads zero, and **nothing reports an error** — the artifact records a number instead of a fault. **Product file, frozen. No edit made or proposed tonight.** Revisit on the post-soak build. |
| `C-SUS-24` | N6 swallowed-catch census — 2,049 silent catches, 189 CRITICAL | **DEFERRED** | `PSL-16` |  | 192 files, ranked by blast radius, brace-matched to each catch's own `try` block. Commit `4ec7aeb99`. **Triage, not a defect list** — some silent catches are correct and nothing here should be changed without reading the site. Recorded against myself: the first pass reported **531** CRITICAL by classifying on a 700-character window that matches almost anything in dense code; re-classified on the matching `try` block only, 531 → 189. **Product files, frozen.** |
| `C-SUS-25` | Account history as a component of the 1,122 MB first paint | **CLEARED** | — | — | Proven innocent, and this finding is a **null** so it carries its own control. Two accounts, same host, sequential, b121: first paint **1,395.9** heavy vs **1,387.4** fresh — 8.5 MB, 0.6% — and the post-drain floor is **1,032.0 vs 1,041.4**, fresh marginally *higher*. `n1-account-identity-check` asks the **server** who is logged in on each arm: two distinct identities, neither seeing the other, **CONFIRMED**. There is no account-history component to remove; the PO is ruling on the right number. Commits `974bfd160`, `742a45c9f`. |
| `C-SUS-26` | The **108.2 MB** method gap (1 s read vs settled) | **CLEARED** | — | — | Survives the phase-corruption sweep, and for a stated reason rather than a judgement call: it is a **difference between two rungs of one curve**, not an absolute single-phase reading, so both terms carry the same phase and the difference is well-defined. `PHASE-SURVIVAL-01` grades it explicitly. Coverage does not gate it either, because it is not an attribution. |
| `C-SUS-27` | The two soak arms differed in duration as well as in the trade knob | **KILLED** | — | — | `ARM-EQUALITY-01` correctly refused the fire: with within-arm separability predicted to fail, a second difference between the arms leaves attribution with nothing to stand on. PO ruled option (b) and it is encoded, commit `991607f77`, gate **BOUND**, 18 cells: the window must **equal** the shorter arm from `origin=boot`, and the verdict records attribution over the matched window and full-duration certification of the trade arm as **separate claims**, explicitly not differenceable. |
| `C-SUS-28` | `__talariaEffectiveRate` absent from the tree, the branches and the sealed bytes | **CLEARED** | — | — | Verified with a control symbol first, so the absence is not the empty-list defect. Resolved by design rather than by waiting: RATE-HOLD ships **two independent routes** and records which answered — C's measured delivered-bars/wall-time as the judge, A's read-back as a witness. Standing design warning attached and unchanged: a controller reporting its own setpoint reads ≈held **by construction** while delivery collapses, so it may never be the judge. |
| `C-SUS-29` | The switch roster names 14 switches; the served build carries 3 | **DEFERRED** | `PSL-17` |  | Present: `BFCACHE_DEFEAT_V1`, `CHART_DESTROY_V1`, `OVERLAY_RESYNC_DIRTY_V1`. Absent: the other eleven, including `EVICT_BEHIND_PLAYHEAD_V1`, `SERIES_LRU_V1`, `MARKER_INDEX_CACHE_V1`, `INDICATOR_FP_MEMO_V1`. A switch-off A/B today would flip three, **silently no-op eleven**, and report the difference as the roster's contribution. **Revisit condition:** run the A/B only against a build that actually carries the switches. |
| `C-SUS-30` | A defect class `node --check` cannot see | **KILLED** | — | — | My wired soak passed syntax checking while referencing an **undefined `BASE_TF_SEC`** — a ReferenceError that would have fired at sample two of a ten-hour run and killed the night silently. `scripts/rate-hold-wiring-check.mjs`, commit `b1bcbf562`, strips comments and strings and scans for unbound identifiers, with a control that must catch an injected one. Reusable by any lane shipping code that only executes deep inside a long loop. |
| `C-SUS-31` | A caveat written into an artifact could be ignored at quote time | **KILLED** | — | — | `KNOWN-WEAKNESS-01`, `scripts/lib/known-weakness.mjs`, commit `b987a4c72`, 10 cells: every `knownWeakness` entry must carry a formal disposition, and the floor instrument's **headline is refused** while any weakness is undisposed. This is the enforceable half of my characteristic failure; the other half is the absence rule at `.cursor/rules/evidence-before-absence.mdc`, which requires a report of absence to say **where it looked**. |

**Count: 31 rows — 18 KILLED, 5 CLEARED, 8 DEFERRED, 0 absent.** One KILLED row (`C-SUS-08`) is killed
under E's seat and must not be counted twice in §2. The eight DEFERRED seats are `PSL-10` through
`PSL-17`, all of which exist as numbered rows in `POST-SOAK-LEDGER.md`.

---

## 4f · D-lane suspect rows sent to B at freeze

Sent by D at **23:28+01:00** in `docs/plan3/D-SUSPECT-LEDGER-ROWS-20260803.md` and integrated here at
00:4x+01:00, because a row that stays in a lane's own file is not in the ledger.

**Four of D's rows are stated in §4 rather than repeated here** — TAL-01696, TAL-01698, TAL-01865 and
Rayan #8. They were the `OPEN` rows, D's evidence is what killed them, and restating them twice would
give one id two rows. **D's lane submission beat the ticket ledger's status column on three of the
four**, which is the single most useful thing that came out of assembling this section.

**D's kill shape is the strongest in this file and deserves naming: served mutants killed against
b126**, not static gates on a source tree. Artifact
`docs/plan3/evidence/tal-po-ui-smoke-mutants-b126-live-summary.json`.

| Row | State | Evidence |
| --- | --- | --- |
| M24 quota retry dropping `order_counters` | **KILLED** | Fix `47b1c5f05`; gate `m24-order-id-restore-stability.test.mjs` exercises the `QuotaExceededError` retry and preserves `order_counters`. **Switch axis present and named:** `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` remains the restore-stability RED discriminator. One of very few rows in this file evidencing all four axes. |
| M19 hot/durable tier merge dropping durable summaries | **KILLED** | Fix `bebedd412`; gate `m19-persist-trim-contract.test.mjs` proves `journal_by_ticker` and `per_instrument_stats` survive a newer slim hot payload by merging from the durable tier. |
| Money-path refresh survival | **KILLED** | Fix `f2e9d4fdb`; gate `order-refresh-money-path-survival.test.mjs` covers open positions, pending orders, journal, balance and order counters across refresh. |
| Drawing market-time persistence | **KILLED** | Fix `f2e9d4fdb`; gate `drawing-market-time-persist.test.mjs`; served mutant `drawings-index-persist` killed on b126. **This is the runtime half of the drawings question** — see §4h, where the PO's drawings item is stated, because D's mutant kill and B's never-executed grader are two different claims about the same feature. |
| Pause drain as a memory release point | **KILLED** | Fix `f2e9d4fdb`; gate `replay-pause-drain.test.mjs`; PO visual addendum row 31 names expected state `PAUSE_DRAIN_RELEASES_MEMORY` with a 60-second Browser Task Manager observation window. |
| QW-3 Stack 2/3 ≥80% allocation-reduction target | **CLEARED** | PO ruling **withdrew the ≥80% acceptance bar** after memory measurement showed JS heap was a minor contributor. Stacks closed as implemented and kill-switched, with the measured improvement recorded in `docs/plan3/QW3-RESAMPLE-HOLD-20260802.md`. Cleared because the bar was retired, not because the target was met — those are different and the distinction is D's own. |
| `m20Q6CapturedClear` as V8 retainer owner | **CLEARED** | E's real-playback heap verdict measured **416 bytes** retained; D demoted it in `docs/plan3/V8-RETAINER-DIFF-LOOKUP-20260803.md` and `BOARD-D.md`, below the **2 MB** single-path threshold. Agrees with `E-SUS-07`'s independent finding of 13 instances / 416 bytes. **Two lanes, one number** — see §4h for what this does and does not clear. |
| Pair-switch arena accumulation alarm | **CLEARED** | `scripts/pair-switch-arena-accumulation.mjs`: ten switches cost **10.57 MB**, not the feared **127 MB**. First-switch cost decays; only shallow later creep remains. Independently the same conclusion as `C-SUS-10`, which was C's own hypothesis being disproved by D's run. |

### D's deferred rows

D supplied five, with signature lines already blank for the PO. **All five cited seats
`POST-SOAK-LEDGER-D-001` … `-D-005`, none of which exist** — the same dangling-seat defect found in
§4d, and with E's three that makes **eight** deferrals across two lanes citing a seat number that is
not a seat. Both lanes numbered sensibly against a file that did not exist yet. Real seats below;
D's labels are kept as aliases so D's own notes still resolve.

| Seat | alias | Row | State | PO signature | Revisit condition |
| --- | --- | --- | --- | --- | --- |
| `PSL-23` | `D-001` | `TAL-DATA-LOAD-ERROR-SURFACE` | **DEFERRED** |  | After seal, scope and fix chart bootstrap error surfacing for bad or stale data seeds. **Same row as §4h's `scoped` entry** — D found it and it is seated once, not twice. D's raising it answers the "no owner named" gap: **D is the owner.** |
| `PSL-07` | `D-002` | `_orderExecutionSeriesByFileId` V8 retainer candidate | **DEFERRED** |  | After E's real-playback forced-GC diff, clear or perturb this map only if the retainer path accounts for material retained growth. Path `OrderManager → _orderExecutionSeriesByFileId → Map → per-file Map → series:Array`. |
| `PSL-07` | `D-003` | `_miSeriesByFileId` V8 retainer candidate | **DEFERRED** |  | After E's diff, clear/bypass the background MI series fetch only if the retained `raw:Array` path is material. |
| `PSL-07` | `D-004` | `_m20Q9PrefixByMaster` V8 retainer candidate | **DEFERRED** |  | After E's diff, invalidate prefixes or run `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1` only if WeakMap prefix arrays account for material retained growth. |
| `PSL-07` | `D-005` | V8 candidate-list underfit branch | **DEFERRED** |  | If D-002…D-004 together account for **less than one tenth** of the measured retained-growth delta, stop naming constructors and switch to retained size by dominator subtree. Precommitted stopping rule; not a product fix. |

> **Why D-002…D-005 share `PSL-07`.** That seat was opened as "D's V8 candidates" and seeded with
> exactly these three constructors plus the precommitted underfit branch, before D's rows arrived.
> Giving each its own seat would split one decision — *does E's rerun name any of them* — across four
> rows that can only ever be resolved together. They are listed individually here so no candidate can
> go missing inside the cohort.

---

## 4g · Ticket census — all 149 ticket-ledger rows, by rule

Every row of `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` appears below. This section exists because
§4 stated **7** of them and the law requires all **149**.

**The mapping rule is stated so it can be argued with, and applied mechanically so it cannot drift row
to row.** The table is *generated* from the ticket ledger, not transcribed — 149 rows typed by hand is
149 chances to move a status word.

| ticket status | maps to | why |
| --- | --- | --- |
| `fixed` | **KILLED** | commit and green gate recorded in the ticket ledger's own columns |
| `superseded` | **CLEARED** | replaced by a later row; the successor carries the work |
| `feature-request` | **CLEARED** | not a defect. A defect ledger is the wrong instrument for it |
| `cleared`, `closed-scratched`, `intended` | **CLEARED** | already retired, withdrawn by its author, or behaving as designed |
| `po-eyes` | **DEFERRED** `PSL-18` | needs a PO decision, which is precisely what a deferral seat is for |
| `owner-blocked` | **DEFERRED** `PSL-19` | real open work behind a named owner |
| `blocked-on-build` | **DEFERRED** `PSL-20` | fix may exist; verification needs a build |
| `scoped`, `broken`, `verify-gone` | **refuses mapping** | stated individually in §4h. A rule that cleared these would be the defect |

**Four rows carry a lane override**, where a submitted fix beats a stale status word: TAL-01696,
TAL-01698, TAL-01865 (D, §4) and Rayan #8. Their basis cell names D's evidence and points at §4, so
each id still holds exactly one state across the whole file.

**Cohort seating, and its honest cost.** 49 deferred tickets share three seats rather than holding 49
of their own. The cost is real — a cohort can hide an individual, which is the failure this census is
against. Accepted for `po-eyes`/`owner-blocked`/`blocked-on-build` because those rows are deferred
*for the same reason* and will be worked as a batch; **refused** for the six rows in §4h, which get
individual seats precisely because a cohort would swallow them.

**Read the KILLED basis cells literally.** `switch UNRECORDED` appears on **48 of 49** and means what
it says: three axes evidenced, the fourth recorded nowhere. See §0.

| ID | ticket-ledger status | state | PO signature | basis | post-soak seat |
| --- | --- | --- | --- | --- | --- |
| M24 / TAL-01926 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01930 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01888 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01813 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01758 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01908 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01919 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01924 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01904 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01897 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01933 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01809 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| SEL-01 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Timezone EST-to-CST override | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01861 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01885 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01905 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01932 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01777 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01750 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01927 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01903 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01810 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01683 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01751 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01697 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01699 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01895 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01792 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01896 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| M23 / TAL-01937 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01800 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #8 | `fixed` | **KILLED** | — | D: `f2e9d4fdb`, `analysis-only-symbol-order-gate`, 4 served mutants killed — see §4 | — |
| TAL-01798 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01815 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01802 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01886 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #1 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #2 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #3 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #4 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #5 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #6b | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #9 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| Rayan #11 | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01807b | `fixed` | **KILLED** | — | commit + green gate + switch | — |
| PO value-box shaky | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| PO hover one-by-one | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| PO pending SL/TP resurrect | `fixed` | **KILLED** | — | commit + green gate + switch UNRECORDED | — |
| TAL-01756 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01653 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01692 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01658 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01691 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01805 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01795 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01780 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01781 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01789 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01791 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01760 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01688 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01709 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01719 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01723 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01725 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01726 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01728 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01732 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01736 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01737 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01739 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01740 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01743 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01769 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01824 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01831 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01847 | `superseded` | **CLEARED** | — | replaced by a later row; cite the successor | — |
| TAL-01784 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01814 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01849 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01851 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01852 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01894 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01906 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01907 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01915 | `feature-request` | **CLEARED** | — | not a defect; out of scope for a defect ledger | — |
| TAL-01617 | `cleared` | **CLEARED** | — | already cleared with a reason | — |
| TAL-01941 | `cleared` | **CLEARED** | — | already cleared with a reason | — |
| TAL-01912 | `closed-scratched` | **CLEARED** | — | withdrawn by its author | — |
| TAL-01744 | `intended` | **CLEARED** | — | behaviour is as designed | — |
| TAL-01696 | `po-eyes` | **KILLED** | — | D: `a1a270692`+`c0a0d7620`, 4 gates, 9 served mutants killed on b126 — see §4 | — |
| TAL-01698 | `po-eyes` | **KILLED** | — | D: `231df7bb5`, 2 gates, served mutant `release-only-average` killed — see §4 | — |
| TAL-01940 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01700 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01717 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01724 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01734 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01735 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01755 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01768 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01796 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01821 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01823 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01838 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01862 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01898 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01909 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01911 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01916 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01917 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01923 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01925 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01928 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01929 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01934 | `po-eyes` | **DEFERRED** |  | needs a PO decision, which is what a deferral seat is for | PSL-18 |
| TAL-01865 | `owner-blocked` | **KILLED** | — | D: served suite `710313adc`, 5 mutants killed incl. `refresh-symbol-resets` — see §4 | — |
| TAL-01747 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| M20-A timezone sha pin | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01733 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01759 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01799 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01850 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01854 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01864 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01887 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01893 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01910 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01913 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01914 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01921 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01931 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01935 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01936 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01938 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| TAL-01939 | `owner-blocked` | **DEFERRED** |  | real open work behind a named owner | PSL-19 |
| M17-DI2 / TAL-01918 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01718 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01892 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01899 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01900 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01902 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |
| TAL-01922 | `blocked-on-build` | **DEFERRED** |  | fix may exist but verification needs a build | PSL-20 |

---

## 4h · Stated individually, because a rule would have got them wrong

Six rows carry a status the mapping refuses to apply. That refusal earned its keep immediately: **two
of the six do not land where the rule would have put them.**

| ID | ticket status | state | PO signature | Seat | Statement |
| --- | --- | --- | --- | --- | --- |
| TAL-01677 | `verify-gone` | **CLEARED** | `PO-SIGNED: PO (asserted)` | — | The rule would have deferred this. **It is cleared, and the ticket ledger says why:** *"PO-DECISIONS: already fixed (PO)"*, *"PO asserts fixed; no re-ask"*. Same basis as TAL-01617 and TAL-01941 — the PO's own verification, explicitly not a gate, explicitly not to be re-asked. No runtime evidence is claimed and none is owed. |
| TAL-01891 | `broken` | **DEFERRED** |  | `PSL-21` | **The most serious row in this file.** A live P0 candidate, owner **A**: a real decoded chart screenshot measures **20.7 MB**, and heavy account scale can plausibly reach multi-GB. Individually seated because a cohort seat for a live P0 would be indefensible. **Do not read §1's cleared decoded-image row as clearing this.** That row disproved a *per-closed-trade coefficient* — ~16.6 MB/closed-trade, which failed the matched-bars test and was bar-driven growth wearing a trade label. The *absolute* 20.7 MB decode is a different claim and was never disproved. Note also *"fresh harness accounts are not representative"*: **the soak may well not surface it**, so a quiet soak is not evidence against this row. |
| TAL-01920 | `verify-gone` | **DEFERRED** |  | `PSL-22` | PO reopened with a specific instruction: *"positively verify absent on stamp (PO-CHECK §17)"*, and *"Not find-original-repro"*. This is **verification debt against the sealed build**, not an unfixed defect: the ask is to prove absence on the stamp and nobody has. It cannot be CLEARED without that positive verification — the whole point of `verify-gone` is that the evidence went missing. |
| Rayan #7 | `verify-gone` | **DEFERRED** |  | `PSL-22` | Same instruction, PO-CHECK §15. Settings/profile monitor item. Verify-absent-on-stamp debt. |
| Rayan #10 | `verify-gone` | **DEFERRED** |  | `PSL-22` | Same instruction and same PO-CHECK §15, explicitly a monitor item paired with Rayan #7. |
| TAL-DATA-LOAD-ERROR-SURFACE | `scoped` | **DEFERRED** |  | `PSL-23` | **Found during b126 TAL smoke seed triage**, so it is the newest row here. A *product* row, not a harness artifact: on a stale or non-owned `/api/file/:id/bars` 404 with a `/smart` fallback 404, the chart initializes its UI and order managers but **leaves the user in an apparent infinite loading state with no surfaced failure message**. Deferred rather than cleared. Seated once, shared with D's `D-001` in §4f, and **D is the owner** — the "no owner named" gap the `scoped` status implied is closed by D having raised it. |

> **Why `verify-gone` cannot be mapped.** Three of these rows are the PO asking for proof of absence on
> the stamp; one is the PO asserting a fix directly. A rule reading the status word alone would have
> deferred all four, burying a legitimate PO clearance in a cohort, or cleared all four, inventing
> three verifications that do not exist. Both are the same error in opposite directions, and it is the
> error this ledger is being rewritten to remove.

---

## 4i · The PO's ten named items, and six campaign controls whose gaps are suspects

The PO named ten items directly. They are stated here with the other six curated controls, because a
control's *gap* is a suspect even though the control itself is a rule and cannot be killed.

~~**Two of the ten could not be located in the tracked corpus, and are marked `REFERENT_NOT_LOCATED`.**~~
**Corrected 08:5x+01:00: both were located, and both of my "not located" verdicts were wrong.** The
second GPU box was in the corpus all along, in the frozen soak recipe; the unlit dark rooms were in
`scripts/`, which this census never reads. **Zero of the ten are now unlocated.** Full accounting in §0g
and `PSL-37`.

The paragraph that stood here argued that an honest *"I could not find this"* is a valid entry and better
than a confident verdict over a referent I never located. That is still true, and it is not what happened.
Two of those entries were not honest limits — one was a search that missed a line in a document everyone
reads, and the other was a corpus boundary I never declared. **A stated inability to find something is
only honest if the search behind it was real**, and "I could not find it" is a claim about the world that
needs the same evidence as any other.

> **Row 10 was one of three until 00:3x+01:00, and the correction is worth reading.** I reported "R7's
> machine-coverage backfill" as unlocatable after checking A's M20-Q6 gate R7 and the M21-2 R7 review
> round. **It is the seventh row of my own requirement series to A**, which stops at R6 — so the referent
> was not missing from the corpus, it was missing from my search, and the document it lives in is one I
> wrote. A census that searches for other people's vocabulary and not its own author's has a blind spot
> shaped exactly like this. Two remain genuinely unlocated; the third was self-inflicted.

| # | Item | State | PO signature | Seat | Basis |
| --- | --- | --- | --- | --- | --- |
| 1 | **SHELL-PLAY-01** — V9 shell play override | **DEFERRED** |  | `PSL-26` | Present and mirrored in the shipped bytes (`apply(this)`, `__shellPlayOverrideInert`) and **bound to nothing**: the host instance's `play()` stayed inert on b124 and no mechanism has been found. Receiver divergence was tested and **disproved** as the mechanism, which is why §4b's sibling-wrapper row is deferred separately rather than as the cause. A fix with no mechanism is not a fix, so this cannot be KILLED. |
| 2 | **The `replay-system.js:4297` product change** | **DEFERRED** |  | `PSL-03` | `startIdx = rd.length - 1` at `:4297` then `sessionStartIndex = this.currentIndex` at `:4301` pins the rollback floor to the last bar, so a realm in that state can **neither advance nor be rewound by construction**, and the fallback is **silent**. Confirmed at runtime: `seekTo(1760)` left four realms at 1880. The pre-soak **refusal** landed at `46bf8e848`; the **product semantics are unchanged in the sealed bytes**, deliberately, on A's judgement that changing replay session semantics on seal eve was not defensible. Ruling pending. |
| 3 | **The m20Q6 cross-domain suspect** — V8 retainer claim | **CLEARED** | — | — | **Two lanes, independently, one number.** E's complete diagnostic-C retainer hunt found **13 instances / 416 bytes**; D measured **416 bytes** on real-playback and demoted it against a precommitted **2 MB** single-path threshold. Below threshold by three orders of magnitude. The earlier A–B **+7.270 MB** constructor salvage remains **two-point salvage only**, not a standing retainer owner. Reopen only if a post-soak authoritative V8 read names it again. |
| 3b | **The m20Q6 CPU-freeze angle** | **DEFERRED** |  | `PSL-28` | **Split out deliberately.** m20Q6 was originally a *cross-domain* match — CPU-freeze stacks *and* monotone V8 heap-grower shapes. Only the **V8 half** was resolved above. I found no evidence that the CPU-freeze half was separately closed, and clearing a cross-domain suspect on one domain's evidence is `C-SUS-14` cross-basis borrowing in a new costume. Related and *not* the same: A's discarded first capture shape allocated **358 MB** in five minutes with `m20Q6PatchTarget`/`Set`/`Map` at the top, fixed by making discoveries ephemeral behind gate **R7** and switch `__TALARIA_DISABLE_M20Q6_CAPTURE_REUSE_V1` (**94–95.4% off** the M20-Q6 stack). That was instrument allocation, not the product CPU freeze. |
| 4 | **The zero-trade lag census** | **KILLED**, with a named unproven arm | — | — | The lag roster is closed: `LAG-1a`, `LAG-1b`, `LAG-2`, `LAG-3`, `LAG-4` are all **KILLED** at PROC-3 GREEN in §1, `LAG-1a` with a mutant proof. The census machinery from `FINDING-LAG-IS-RESIDUE-20260728` is **LIVE**, not merely designed: `TEARDOWN-CENSUS-GATE-V1`, `LAG-SESSION-HISTORY-CONTROL-V1`, `INDICATOR-LAG-ORACLE-V1` — the last of which **refuses GREEN or RED** unless sealed via the session-history control — with four orphan discriminators (interval, listener, rAF, MessageChannel) each RED on a known defect. **The named gap:** `BROWSER-TEARDOWN-CYCLE` reads **UNPROVEN** without a real browser, so the browser arm of this census is not evidenced by this ledger. `REFERENT_PARTIAL` — I found no document titled "zero-trade lag census"; this is the nearest and largest match, and if the PO meant the lag census restricted to the zero-trade soak arm, that arm-specific run is not in the corpus. |
| 5 | **The ~724 ms/s owner** | **DEFERRED** |  | `PSL-29` | **The owner was never named**, which is the item. The figure family is real and the readings disagree by design: C measured **867.3 ms/s** unthresholded main-thread task total, **657.7 ms/s** blocking time, and **861 ms/s** busy by a second decomposition (86.1% of wall); B measured **302 ms/s** thresholded and a **~700–800 ms/s** floor. The exact value **724 is not in the tracked corpus** — `REFERENT_NOT_LOCATED` for that number specifically, though the quantity it belongs to is unambiguous. The only candidate mechanism on record is a **working diagnosis**, not an attribution: the host computing indicators through the asynchronous worker pipeline, busy-coalescing at high speed. A working diagnosis is not an owner. |
| 6 | **The hoard-floor curve** | **DEFERRED** |  | `PSL-14` | `C-SUS-22`. Ruled post-soak by the Director: the end-of-arm paused curve was **removed from both arms**, recorded as Amendment 2 of `RECIPE-SEALED-SOAK-FROZEN-20260803.md` at `f0531a352`. The hour-0 curve remains and covers the boot end. Related and separately seated: the canonical floor itself is `FLOOR_FOUND` but **`NOT_QUOTABLE_COVERAGE`** at 59.84% (`C-SUS-06`, `PSL-11`), and on the corrected criterion its curve **could never have graded settled** because the instrument's default ladder had a 300 s last gap against a 600 s minimum (`C-SUS-17`). |
| 7 | **The drawings full verification** | **DEFERRED** |  | `PSL-27` | **Two different claims about one feature, and the distinction is the answer.** D's is the stronger: fix `f2e9d4fdb`, gate `drawing-market-time-persist.test.mjs`, and served mutant **`drawings-index-persist` killed on b126** — a runtime kill on the sealed build, so market-time drawing persistence *is* verified. B's `DRAW-SMOKE-01` grader is a different claim and a weaker one: **13/13 as a pure function, symbols present in the served b126 bytes, and it has never executed against a build.** A grader that has never run is not a passing gate. Deferred on B's half only; D's half is KILLED in §4f. |
| 8 | **The unlit dark rooms** | **DEFERRED** |  | `PSL-30` | **`REFERENT_LOCATED_OUTSIDE_MY_CORPUS` — corrected 08:5x+01:00.** The phrase is at **`scripts/n1-heavy-vs-fresh.mjs:5`**: *"WHY THIS IS NOW LOAD-BEARING RATHER THAN A DARK ROOM. The 1,122 MB first-paint reading is what…"* — a dark room is an **unmeasured baseline**, and an unlit one is a comparison nobody has taken. That reading fits the PO's phrasing and nothing in the docs did. **My census searched `docs/plan3` prose only**, so any suspect named exclusively in code or script headers was invisible to it by construction. Still DEFERRED: the referent is now named, the measurement is not taken, and the nearest adjacent gaps stay real — 14 gates that never ran (`PSL-04`) and the first-paint reading this comment is about. ~~The word "dark" does not appear anywhere in the tracked `docs/plan3` corpus.~~ I will not guess: the nearest concepts are gates that never ran (14 of them, `PSL-04`), roster switches absent from the served build (11 of 14, `PSL-17`), the 2,049 swallowed catches of which 189 are CRITICAL (`PSL-16`), and `DRIFT-ABBA`, which was reported complete having never run (`C-SUS-07`, `PSL-12`). Any of those fits "an unlit room" and they are all separately seated. **The PO's referent needs naming before this can be stated on evidence.** |
| 9 | **The second GPU box** | **DEFERRED** |  | `PSL-30` | **`REFERENT_LOCATED` — my "not located" was FALSE, corrected 08:5x+01:00.** It is in the corpus, in the **frozen soak recipe**: `RECIPE-SEALED-SOAK-FROZEN-20260803.md:240` — *"A second GPU-bearing box is endorsed and **blocks nothing** — it buys parallelism later, not validity now"* — and at `BOARD-C.md:1263`, where C recorded host conditions as **exclusivity, not relocation**: the soak stays on the RTX box, the EC2 r6i is **refused** for having no GPU (software rasterisation), and a second GPU-bearing box is endorsed. **State: endorsed, not procured, blocks nothing.** No fix, switch or gate, and none required — it is capacity, not a defect. My original claim below was a search failure inside a corpus I said I had searched, which is the one error a census is not allowed to make. ~~`REFERENT_NOT_LOCATED`. No request for a second machine appears in the corpus.~~ "GPU" occurs only as GPU-private *memory* in A's competitor bands — reference band **433–501 MB GPU** for one chart, and the finding that **GPU private is flat across 2 and 4 panels** (138.95–142.95 MB), against an advisor expectation of 130–180 MB. **That entire series is withdrawn** (`PSL-01`) because the window overlapped E's V8 run, and the flat-GPU finding is withdrawn with it — A's own note is that it was the one they most wanted to keep. If "second GPU box" means a second host to escape the contention that withdrew those arms, that need is real and evidenced throughout, but the phrase itself is the PO's and not the corpus's. |
| 10 | **R7's machine-coverage backfill** | **DEFERRED** |  | `PSL-31` | **`REFERENT_CONTESTED` — downgraded 08:5x+01:00 from a confident single answer.** There are **three** live candidates and I cannot rule between them: (1) **my own unwritten seventh requirement**, below; (2) **A's real R7** at `BOARD-A.md:856` and `:871` — the *ephemeral-discovery gate* in `m20q6-capture-reuse.test.mjs`, which **landed** with the capture-reuse fix, so if this is the referent the item is KILLED rather than deferred; (3) **checklist item #7**, `COV-01 coverage calibration: named categories ≥95% of total private`, owner **C**, due **Tue 4 Aug** — still **RED** at 59.8% with 271.05 MB unattributed, and "coverage backfill" describes it almost exactly. Only the PO can say which was meant, and the underlying hazard — five independent `R<n>` namespaces — is seated at `PSL-36`. **#7's ownership is RULED, 10:3x+01:00: C owns the calibration, E owns the parser.** I reported this as "one of those is stale" — the checklist naming **C**, the Director assigning **E** — and that framing was wrong in a way worth keeping visible. **Neither was stale; COV-01 is two jobs.** I saw two names on one label and assumed one had to be obsolete, which is the same reflex that made me collapse the R7 ambiguity into a single confident answer at 00:3x. Two owners on one row is not always a contradiction, and treating it as one is how a split gets flattened into a stale record. ~~`REFERENT_LOCATED` — corrected 00:3x+01:00, and it is mine.~~ `R7` is the seventh row of **my own** requirement series to A in `docs/plan3/RUN-LOCK-01-HOST-SCOPE-REQUIREMENT-20260803.md`, which stops at **R6**. R1–R6 all scope the lock to **one machine**: R1 host scope not declinable without a reason, R2 name the state at acquisition, R3 the artifact records `scopesHeld`, R4 `inspectLocks()` reports the class, R5 document the asymmetry, R6 one detector or the detector is decorative (added from a live incident where `inspectLocks()` read **none** while three runs were live). **R7 does not exist because I stopped at R6** — the machine-coverage backfill is the unwritten row that extends coverage across machines and backfills which machine each existing artifact ran on. Two red herrings I checked first and discarded: A's ephemeral-discovery gate R7 in the M20-Q6 capture reuse, and M21-2 R7 the review round. **Neither is the PO's R7.** |

### The six B-lane controls

| Control | State | PO signature | Seat | Basis |
| --- | --- | --- | --- | --- |
| `COPY-ABSENCE-01` | **KILLED** | — | — | Census built, bound and committed, with the three refusal states writing citable artifacts carrying `counts: null` and `notACensus: true` so a refusal cannot be read as zero absences. Two real defects were found and fixed in it: it aborted on the one path where it had something to report (`process.exit()` with undici sockets open), and it exited 0 while reporting a silent absence. **Its own floor caveat stands and is the honest limit** — end-to-end cells stay `SUITE_INCOMPLETE_E2E_UNPROVEN` and unquotable when the box is busy. |
| `CLOCK-01` file-scope relabel | **KILLED** | — | — | Both figures relabelled **file-scoped, not lane-scoped**, on the Director's instruction — B's own row and D's 9. The count is of files, not of a manager's stamping correctness, and the rows now say so. 21 future-dated stamps were corrected and a `FUTURE_STAMP` check added to `board-state-block.mjs`. |
| `GATE-DEPTH-SWEEP` | **DEFERRED** |  | `PSL-04` | **121** gates resolve the repo root by fixed directory depth, corrected **up** from a 76 undercount. Of the mirrored pairs, **26 of 29 are broken by depth and 14 never ran at all.** A gate that never ran is not a passing gate, and 14 had been counted as coverage. |
| `EVIDENCE-CITE-01` | **DEFERRED** |  | `PSL-06` | **65 live citations point at gitignored paths.** Of those only 22 are recoverable by an ignore change, and **38 cite artifacts that exist on no disk in the project** — unverifiable when written, by anyone including their author. Patch measured and reverted byte-identical; `.gitignore` is not B's to change. |
| `TERRITORY-FOUR-TRAILERS` | **DEFERRED** |  | `PSL-08` | The gate requires `Manager`, `Row`, `Packet`, `Tier`; the installed hook guarantees **`Manager` only**, so B's own trailered commits still report **0 attributed, 3 UNATTRIBUTABLE of 3**. "Attribution starts now" was **overstated by B** — enforcement covers a quarter of the requirement. |
| `TERRITORY-DUPLICATE-MANAGERS` | **DEFERRED** |  | `PSL-09` | D and E are each declared **twice** with contradictory grants; **six paths are owned by one block and denied by the other.** Three mechanical defects repaired at `f3c6a58b8`; this is the single remaining blocker and it is the Director's to rule. **A union is not the neutral option** — proved, not assumed: `resolveOwnership` returns on the first matching `denied` rule before it looks at `owned`, so unioning D's blocks voids CHARTER-D's five module grants while reading like a merge that kept both. |

> **What §4i does not claim.** Twelve of these sixteen rest on evidence I could cite. Three rest on my
> having failed to find the PO's referent, and one (`R7`) on finding two candidates and matching
> neither. Those four are stated as DEFERRED because the law forbids absence, **not** because deferral
> is the evidenced answer — the evidenced answer is "not located", and `PSL-30` exists to get the
> referents named rather than to hold work.

---

## 4j · B-lane suspect rows — the assembler's own lane

Supplied by B at **00:4x+01:00** under the same instruction sent to every lane, and it caught a gap in
my own assembly: I integrated C's 31 rows, D's 13 and E's 7 and **never consolidated my own.** B-lane
rows were scattered across §1, §2, §4b, §4c and §4i, which is not the same as being stated as a lane.

**A has still sent nothing.** Row count by lane in this file: C **31**, B **28** (below), D **13**,
E **7**, A **0**. A's suspects are represented only where another lane's row happens to name them, and
that is a real hole in §2 rather than an observation about A.

### KILLED — fix landed, switch named where one exists, gate green, commit cited

| Seat | Suspect | State | Evidence, and which of the four axes it carries |
| --- | --- | --- | --- |
| `B-SUS-01` | DEF-05(a) canvas context recovery | **KILLED** | `27eaebdc4`; oracle **27/0**; switch `__TALARIA_DISABLE_CANVAS_CONTEXT_RECOVERY_V1`. **All four axes.** |
| `B-SUS-02` | DEF-05(b) / DEF-07 prefs bootstrap defaults | **KILLED**, with named debt | `6959c2ce9` / `a42cbb02e`; deterministic oracle **23/0**. **Named debt, not hidden:** the browser 20× cold-load is still owed against the final tip. Verification debt against the stamp, not an unfixed defect. |
| `B-SUS-03` | PASSPORT-3 — badge + digest + SHA | **KILLED** on canary | Live `VERIFIED` on the canary. Door triage distinguishes production `WRONG_DOOR_AUTH` (exit 3) from a build defect, so a locked door cannot be misread as a bad build. |
| `B-SUS-04` | Emitter `package.json` side effect | **KILLED** | Removed; version pinned 1.4.31; discriminating mutant. |
| `B-SUS-05` | Pre-cut integrity gate root inference | **KILLED** | `1c69bebb4`; container-layout proof in `_evidence/manager-B/precut-gate-layout`. |
| `B-SUS-06` | `r1-render-killswitches` | **KILLED** | `a83d75c09`; **11/0**; switches proven by direct probe rather than by their presence in source. |
| `B-SUS-07` | LIFE-3 | **KILLED** | PROC-3 GREEN; canary serves `Cache-Control: no-store` on the passport. |
| `B-SUS-08` | HYG-1 | **KILLED** | PROC-3 GREEN. |
| `B-SUS-09` | `TAL-01865-VIEWPORT-CONSUMER` | **KILLED** | `823e32cec`; switch `__TALARIA_DISABLE_VIEWPORT_RESTORE_V1`; gate `viewport-restore-consumer` **11/11** with two mutants, four anti-vacuity arms, a bars-arrive-late cell and a mirror-identity cell. **All four axes.** The chain was capture → persist → write `restoreStart`/`restoreEnd` onto the panel URL → **nobody reads it**: every link present, mirrored and green, and zoom never restored. |
| `B-SUS-10` | `BUILD-CONTEXT-01` | **KILLED** | `bf0de225c`; `test:build-context-coverage` **7/7**. Closed the `module-contract-preflight` failure that had made **every cut since `c0c013b9c` unbuildable** — b123, b124 and b125 all sat under it, and b126 is the first id to carry the fix. |
| `B-SUS-11` | `TAG-FIRST-01` — `ckpt-ship.sh` failing closed into a hand-build | **KILLED** | **Two** fail-closed paths, found and closed separately: the first at 13:35+01:00, the second at `aedf44081` where `--tag-prefix=<name>` now creates the tag rather than requiring it to exist. Gate **8/8**, `RUNTIME` class. The second path existing at all is why the PO had to raise this twice. |
| `B-SUS-12` | `RUN-LOCK-01` / `LAUNCH-LOCK-01` | **KILLED** | **23/23**. My lock was retired in favour of A's shared primitive on the Director's instruction and my parts contributed rather than kept — the correct outcome, since two locks on one box is the hazard, not the solution. |
| `B-SUS-13` | `acquireRunLock` returns no `ok` field | **KILLED** by A | Found by me when it broke my own census selftest; **recurred in `box-availability.mjs` after a second adopter read my report**, which is the argument that documentation could not fix it. A made the misuse impossible at `b99d50558`. A trap that propagates to a second adopter is an API defect, not a reader defect. |
| `B-SUS-14` | `COPY-ABSENCE-01` — the silent half of the COPY allowlist class | **KILLED**, with a stated floor | `cefd3d8da`. **The first version of this census was a false green and I almost published it:** it reported 0 of 0. Refusal states now write citable artifacts carrying `counts: null` and `notACensus: true`, so a refusal cannot be read as zero absences. Floor stands and is the honest limit: end-to-end cells stay `SUITE_INCOMPLETE_E2E_UNPROVEN` and unquotable when the box is busy. |
| `B-SUS-15` | The census aborted on the one path where it had something to report | **KILLED** | `process.exit()` with undici sockets open produced a stack-buffer-overrun abort, so the `SILENT_ABSENT` finding surfaced as a **crash rather than a failure**. Replaced with `process.exitCode` and natural drain. Found by the discriminating cells the Director asked for, on the one input that mattered. |
| `B-SUS-16` | A refusal wrote no artifact, then wrote a dangerous one | **KILLED** | `BASE_UNREACHABLE` and `NO_REFERENCES_FOUND` exited without an artifact, leaving a **stale `census.json` to be quoted as current**. Both now write a minimal refusal artifact with `counts: null`. |
| `B-SUS-17` | `CLOCK-01` gate had two false greens | **KILLED** | `8f4b92448`, `093ef99ad`, `3e6…`. Three defects found **by pointing the gate at my own board**. Now covers all five boards. |
| `B-SUS-18` | I future-stamped 21 board lines and CLOCK-01 passed every one | **KILLED** | The gate checked that an offset was *present*, never that the time was *possible*. 21 stamps corrected and a `FUTURE_STAMP` check added to `board-state-block.mjs`. **It caught me again tonight** — see `B-SUS-27`. |
| `B-SUS-19` | The digest was crediting one lane's work to another | **KILLED** | Progress matched any commit mentioning a tag rather than the item's **owner**. Fixed with `classifyProgress` and `PROGRESS_UNATTRIBUTED`; **17 cells** including the exact cross-credit bug. Measured consequence: three items reading "on pace" had no owner-attributable progress, and C02's staleness was understated **sevenfold**. |
| `B-SUS-20` | The state-block staleness check was file-scoped, so a working lane's block could rot | **KILLED** | Now lane-scoped via `laneActivity`, with `STATE_BLOCK_STALE_LANE` and `STATE_BLOCK_STALENESS_UNPROVEN` (exit 9) as distinct states. **It caught my own board first**, on my first attributable commit. |
| `B-SUS-21` | Commits carried no attribution, so territory could not be enforced | **KILLED** for the `Manager` trailer | `commit-msg` hook installed 22:48+01:00, `HOOK_ACTIVE` exit 0, and it binds across all worktrees. Adoption is real: last untrailered commit 22:35+01:00, then consecutive valid per-lane trailers against **0 of the previous 250**. **The four-trailer gap is a separate row** — `B-SUS-25`. |
| `B-SUS-22` | `territory-preflight` gave one exit code to a missing trailer and a real violation | **KILLED** | `TERRITORY_UNATTRIBUTABLE` is now its own state and exit **9**, distinct from `RED` exit 1. A BIND-01 anchor collapse: a broken gate and a genuine policy breach were indistinguishable. 250 pre-existing commits baselined SHA-keyed, no retrofit, red only for new. |
| `B-SUS-23` | b126 — one id, two compiled bundles | **KILLED** | `c356ce029`, 13:07+01:00: served bytes hashed against all three claimed commits, **b126 is one bundle**, two compilations of identical inputs. PO confirmed and made the tag-first binding. **§6 of this file carried the "cuts are held" sentence for eleven hours after the hold lifted** — corrected at 00:4x+01:00 and recorded there, because a stale hold reads as a live blocker. |
| `B-SUS-24` | The suspect ledger had never been a census | **KILLED** | `702060cb4` (instrument, committed before any number was quoted), `d045e4d94` (closure). **2 → 165 stated of 165; 158 → 0 absent; 5 → 0 illegal; 8 → 0 dangling seats.** Selftest **12/12**. Four defects found in the instrument by running it, all four of which would have produced a **false accusation** rather than a missed row. |

### CLEARED — proven innocent or closed with cited evidence

| Seat | Suspect | State | Evidence |
| --- | --- | --- | --- |
| `B-SUS-25a` | Did B's lock suite refuse C's arena run? | **CLEARED** | Raised by me against myself and answered with evidence rather than assurance: **it did not.** `inspectLocks()` output shown at the time. Worth keeping because the honest version of "did I break your run" is a probe, not a denial. |
| `B-SUS-26` | I caused the fifth contention incident, on E's run | **CLEARED** as an incident, and it **produced R6** | My selftest deadlocked on the shared box during E's run. The incident is closed; its output is the R6 requirement — *"a lock nobody can discover is not a lock"* — after `inspectLocks()` read **none** while three runs were live, one of them mine. The finding outlived the mistake, which is the only defensible ending for a self-inflicted incident. |

### DEFERRED — named, seated, PO signature deliberately empty

| Seat | Suspect | State | PO signature | Post-soak seat | Revisit condition |
| --- | --- | --- | --- | --- | --- |
| `B-SUS-27` | I future-dated the §2 handoff by 1h47m | **DEFERRED** |  | `PSL-32` | Stamped `02:1x+01:00` against a commit time of **00:28:03**, and told the Director I was "one minute inside the deadline" when I was **1h48m early**. Corrected at `5147ac894`. Deferred rather than killed because the *class* is not closed: `FUTURE_STAMP` catches board blocks, and **nothing checks a stamp inside a handoff document or a commit message**. Revisit: extend the check to prose stamps, or accept the gap explicitly. |
| `B-SUS-28` | `SHELL-PLAY-01` — present, mirrored, bound to nothing | **DEFERRED** |  | `PSL-26` | Three attempts have landed bytes that are present, mirrored and **inert**, which is the signature of fixing the wrong thing carefully. Receiver divergence was **disproved** as the mechanism. Revisit: find the mechanism before attempting a fourth fix. |
| `B-SUS-29` | `DRAW-SMOKE-01` has never executed against a build | **DEFERRED** |  | `PSL-27` | Grader **13/13** as a pure function with all nine verdict branches reachable from fixtures, symbols present in the served b126 bytes, and **never run**. Presence is not binding. D's served mutant kill covers the product question; this row is only about my instrument. Revisit: run it against a live build. |
| `B-SUS-30` | `SHELLPLAY-SIBLINGS-BIND-SHAPE` | **DEFERRED** | `PO-SIGNED: PO 2026-08-02T22:34Z` | §4b | Already PO-signed with a revisit condition. Eleven wrappers, not nine — my miscount, carried into the ruling before I corrected it, and it argues **more** strongly for deferring. |
| `B-SUS-31` | The hook enforces 1 of the 4 required trailers | **DEFERRED** |  | `PSL-08` | `territory-preflight` requires `Manager`, `Row`, `Packet`, `Tier`; the hook guarantees `Manager`. My own trailered commits still report **0 attributed, 3 UNATTRIBUTABLE of 3**. *"Attribution starts now" was overstated by B.* Not widened unilaterally: the other three vary per commit, so env-var sourcing would refuse every lane again. |
| `B-SUS-32` | `TERRITORY.yml` declares D and E twice, with contradictory grants | **DEFERRED** |  | `PSL-09` | Manifest ships **partially repaired** on the Director's 00:35+01:00 instruction: three mechanical defects fixed at `f3c6a58b8`, parses past line 430, all four one-block-each combinations validate. Remainder is a charter ruling only the Director can make, and **a union is not neutral** — proved via `resolveOwnership`, which returns on the first `denied` match before it looks at `owned`. |
| `B-SUS-33` | `EVIDENCE-CITE-01` — 65 live citations point at gitignored paths | **DEFERRED** |  | `PSL-06` | Of the 65 only 22 are recoverable by an ignore change, and **38 cite artifacts that exist on no disk in the project.** Patch measured and reverted byte-identical; `.gitignore` is not mine. |
| `B-SUS-34` | R7 — the machine-coverage requirement I never wrote | **DEFERRED** |  | `PSL-31` | The host-scope series stops at **R6**. All six scope the lock to one machine. I reported this to the Director as *unlocatable* before finding it was **my own document**. Revisit: write R7, covering every machine that can run an instrument plus a `MACHINE_UNRECORDED` backfill. |
| `B-SUS-35` | The passport does not require its SHA to be the tag's peel | **DEFERRED** |  | `PSL-33` | Handed to C as a decision at 16:09+01:00 and not resolved. `writeBuildInfo()` accepts whatever SHA it is given. **b126's identity survived on determinism and luck, not by design** — my own words at the time — and that is the row. Revisit: bind the passport SHA to the tag peel, or state on the record that it is advisory. |
| `B-SUS-36` | A second writer absorbed my work into their commit, three index leaks tonight | **DEFERRED** |  | `PSL-34` | The shared index on this box takes whoever commits, not whoever staged. My `package.json` scripts went into `f01507ea0`, another lane's commit. `INDEX-SCOPE-01` and `commit-scoped.mjs` are the mitigation and they work — but the bypass `INDEX_SCOPE_OFF=1` is documented in the refusal message itself, so the guard is advisory against anyone who reads it. Revisit: decide whether an advisory guard is the intent. |

**Count: 36 rows — 24 KILLED, 2 CLEARED, 10 DEFERRED.** Counted mechanically, because my first attempt at
this line said "28 rows" over a breakdown that sums to 36 and I published nothing until I had counted the
rows instead of trusting the sentence. **0 absent.** Every DEFERRED row cites a seat that exists in
`POST-SOAK-LEDGER.md`, checked rather than read.

> **The pattern in my own lane, stated because it is the useful part.** Of the 24 kills, **6 were
> defects in my own instruments**, found by pointing them at my own work: the CLOCK-01 gate passing 21
> of my own future-stamps, the digest crediting the wrong lane, the state-block hole catching my board
> first, the census reporting 0 of 0, the census aborting on its one real finding, and tonight's census
> exiting green having scanned nothing. **Only two of the 24 carry all four KILLED axes with a named
> switch** (`B-SUS-01`, `B-SUS-09`), which is the same weakness §0 measures across the whole file —
> the switch axis is the one this campaign consistently skipped.

---

## 4k · A-lane suspect rows — never supplied, stated rather than left silent

Every other lane sent rows: C **31**, B **36**, D **13**, E **7**. **A sent none**, and A's remaining
instruction is the governor reference-timeframe pre-flight and then stop, so none are coming before the
PO's verification pass. Absence being the only forbidden state, the absence itself takes a row.

| Seat | Suspect | State | PO signature | Post-soak seat | Revisit condition |
| --- | --- | --- | --- | --- | --- |
| `A-SUS-00` | **A-lane suspects were never enumerated as a lane** | **DEFERRED** |  | `PSL-35` | A owns SPEED-01, the A3 speed-fill journal, the daily-bucketing row, the gate-depth sweep, the withdrawn comparison series, the shared `run-lock` primitive and the W1 arm whose 0.08 turned out to be the harness. Whatever A would have raised against those is **not in this file**. Revisit: A supplies rows post-soak, or the PO accepts that §2's coverage of A is whatever other lanes' rows happen to name. |

**What this does and does not claim.** It does not say A has no suspects, and it does not say A's work is
unexamined — ten rows in this file carry A as an owner cell, written by other lanes. It says the
**self-declaration** that every other lane made is missing for one lane, and that a reader who takes this
ledger as complete would be wrong in exactly one direction, for exactly one lane. I did not reconstruct
A's rows from the log, because the Director's own instruction when sending this task to the lanes was
that B should not be reconstructing ten days of other people's suspects — and a reconstruction signed by
me would read as A's self-declaration while carrying none of its authority.

---

## 5 · Seal gate on this ledger

- **Soak-legal only when** `node scripts/suspect-ledger-census.mjs` exits **0**, meaning every one of the
  165 enumerated items is stated under exactly one of KILLED / CLEARED / DEFERRED, no row is `OPEN`, no
  row carries two states, and **no DEFERRED row cites a post-soak seat that does not exist.** This
  replaces the old "zero OPEN per section" wording, which could be satisfied by a section that simply
  never mentioned a suspect.
- **Every DEFERRED row carries a seat and a revisit condition.** A deferral without a revisit condition
  is an OPEN row wearing a better word, and a seat number pointing at nothing is absence wearing one.
- **PO signature cells for DEFERRED rows are deliberately empty** and are signed at packet review. An
  empty signature cell is the expected state tonight, not an omission.
- Re-run PROC-3 on the **final tip** the day of the seal; paste the tip SHA and GREEN count into the board when publishing the sealed copy of this file.
- Do not invent CLEARED. A row without evidence stays OPEN.

**Current tip when this draft was written:** see `git rev-parse HEAD` at commit time.
**b122 canary (shakedown only, not the seal):** badge `20260802b122`, digest `5f0378407c214999ec822eb6a17e165e`, source `1c69bebb496f1fb3bdf4f90317dae84d1507d427`.

## 6 · Build identities

| Build | Status | Why |
| --- | --- | --- |
| `20260802b122` | Shakedown only | Never the seal. Passport above. |
| `20260802b123` | Superseded | Local stamp; never deployed. |
| `20260802b124` | **RETIRED — never citable** | Its bundle was compiled from a tree containing uncommitted source, so it cannot be reproduced from the SHA it is stamped with. No measurement taken against b124 can be cited, including A's `order01b-readback-canary-step1s-b124.json`, whose served engine of 545,015 bytes matches no committed state. Retired by the PO 2026-08-02, on the provenance evidence. |
| `20260803b125` | **RETIRED — UNSHIPPED** | Cut cleanly and correctly, and then could not be built in the checkpoint context. Source tag `roster-20260803b125-source` (tag object `fb9c2171d5e1b9d`, peels to `dd2ae121e73668c`) **stays pointing where it points and ships nothing.** The tag was deliberately NOT re-pointed at the fix: re-pointing a tag under a certified build is what retired b124, and doing it to rescue an id would have repeated the defect to save a name. See the retirement note below — this is a *different* retirement from b124's and the difference matters. |
| `20260803b126` | **DEPLOYED — IDENTITY SETTLED, ONE BUNDLE** | **Resolved at `c356ce029`, 13:07+01:00, and this row was stale until 00:4x+01:00 — my own section carrying a hold that had been lifted eleven hours earlier.** The byte comparison landed: served bytes hashed against all three claimed commits, **b126 is one bundle**, and the PO confirmed it and made the tag-first binding for the seal. **Cuts are not held.** Anyone who read the sentence below tonight would have thought the seal was blocked on me; it was not, and the staleness is exactly the defect I caught in the ticket ledger's status column and then reproduced here. The original finding is kept below because the reasoning is what settled it. — **One id, two compiled bundles.** The door serves bytes built `09:59:48Z` from **`5dceb6368`**; the source tag `roster-20260803b126-source` peels to **`1cf60b607`** (verified on origin, not from memory), which was committed 49 s *before* the container finished and therefore cannot be the input. **`c481ec6bc` is not a third bundle** — it is D's canary-watcher repoint, 5 files, no `dist-v9`, no stamps. Source-side finding, `EVIDENCE CLASS: STATIC_SOURCE`: **zero bundled-source files differ between `5dceb6368` and `1cf60b607`** — the whole diff is `dist-v9` outputs, cache stamps, one board doc and D's watchers — so these are two compilations of identical inputs, not two codebases. ~~B's byte comparison decides whether this is bookkeeping or a second b124; all cuts are held until it lands.~~ **It landed at `c356ce029` and the answer was bookkeeping: one bundle, two compilations of identical inputs. The hold is lifted.** Distinguish from b124 before assuming the worst: b124's bytes traced to *no* committed tree, whereas b126's served bytes trace to `5dceb6368`, a committed and pushed commit that the passport names correctly. The live hazard survives even a clean byte match: `HEAD` now carries a b126-stamped bundle that is not the served one, so a deploy from `HEAD` would serve different bytes under the same id. Cut 2026-08-03 from `1cf60b607`, source tag `roster-20260803b126-source`, both pushed. First id to carry B's `BUILD-CONTEXT-01` fix (`bf0de225c`), which closes the `module-contract-preflight` failure that had made **every cut since `c0c013b9c` unbuildable** — b123, b124 and b125 all sat under it. Stamps uniform across **16 governed files at b126, zero stragglers**: no b122, b123, b124 or b125 remains on any served surface. Gates green at the tagged commit: module-contracts `"ok": true`, B's `test:build-context-coverage` 7/7, pre-cut mirror gate passed (598 files, 0 parse failures, 0 truncated), `clean-build-tree` reproducible from HEAD. Canary answers `20260802b122` until B deploys. |

> **b124 and b125 are both retired, and they are not retired for the same reason. Read the two words.**
>
> **b124 was retired as CONTAMINATED.** Its bundle was compiled from a tree containing uncommitted
> source, so it cannot be reproduced from the SHA it is stamped with. It was deployed and it was
> measured against, and **those measurements are uncitable** — A's `order01b-readback-canary-step1s-b124.json`
> among them. The cost of b124 was evidence: real runs, on a real surface, that cannot be used.
>
> **b125 was retired UNSHIPPED.** Nothing was ever deployed against it and nothing was ever measured
> against it. Its bytes were never wrong — the cut was clean, the tree was clean, the stamps were
> uniform, and its provenance was verified green at 00:45+01:00. It died because the checkpoint image could
> not be built from any commit of that era, a defect in the Dockerfile copy allowlist that belonged to
> neither the cut nor the tagger. **The cost of b125 was time only.** No artifact needs withdrawing,
> no row needs re-taking, no number anywhere in this file rests on it.
>
> The practical consequence for a reader in a month: if you find a measurement citing b124, discard
> it. If you find one citing b125, **you have found a bug in the ledger, not a tainted measurement** —
> no such measurement can exist, because that build never served a byte to anything.
>
> Neither is retired as *work*: every source row compiled into b124 and b125 is committed and
> recompiles into b126. Nothing in `scripts/` or `package.json` pins any retired id — checked, not
> assumed, at each retirement.

## 7 · Mixed-provenance commits inside the b125 stamp chain

One commit in the b125 chain has two authors. It is recorded here so nobody later reads it as one
manager's work, and so nobody "cleans it up" in a way that destroys the other manager's.

**`d4015a2be` — "REVERT A14.3 REGRESSION: remove the public legacy shell my b125 commit resurrected"**

| Field | Value |
| --- | --- |
| Committed by | **C** |
| Intended content | Deletion of `homepage/public/chart/legacy-index.html` (61,584 lines) — the A14.3 revert |
| Also contains, unintentionally | **A's** four instruments and three of A's documents, 1,566 lines |
| Position | Between `60960ecc7` (stamp phase two) and `f16c94b70` (b125 final stamp) |
| Total paths | 9 |

**The four swept instruments, all A's:**

- `scripts/c02-pairswitch-pane-measure.mjs`
- `scripts/c09-c12-scratch-zero-measure.mjs`
- `scripts/competitor-arena-reference.mjs`
- `scripts/order01b-edge-play-probe.mjs`

Plus `docs/plan3/COMPETITOR-ARENA-REFERENCE-PROTOCOL.md`, `docs/plan3/CANVAS-LIFECYCLE-MATRIX-20260802.md`
and `docs/plan3/board/BOARD-A.md` (A's), and `docs/plan3/A-TO-B-SHELL-PLAY-STILL-INERT-ON-B124.md`.

**How it happened:** the git index is shared on this box. A had staged their INSTRUMENT-01 work and had
not yet committed; C's `git commit` took the whole index. A's own `git commit` then reported
*"no changes added to commit"* because the bytes were already in C's. Nothing was lost — all six of A's
files verify byte-identical between worktree and HEAD — but the authorship in `git log` is wrong.

**b125's bytes are clean, and this is the fact that makes the commit survivable.** Verified rather than
assumed: the governed build roots are `chart v 1.4/talaria-design/src/`, `chart v 1.4/talaria-design/live/`
and `chart v 1.4/chart/` (per `clean-build-tree-guard.mjs --list`), and the **intersection of those roots
with `d4015a2be`'s nine paths is empty**. The sweep landed entirely in `scripts/` and `docs/`, neither of
which is a build input. The one non-script path, the `legacy-index.html` deletion, is a mirror-side
removal of a file the module contract requires to be absent, so it removes no byte the build emits.
**Therefore no swept file can have reached the b125 bundle**, and the stamp chain's provenance stands.

**Ruled: the commit stands, unsplit.** Splitting it would rewrite `f16c94b70`, the final stamp whose
provenance was verified green at 00:45+01:00. Rewriting history under a certified build is precisely what
retired b124, and it is not worth doing to correct an authorship line. PO ruling 2026-08-03.

**This section did not expire when b125 was retired.** `d4015a2be` and the whole b125 stamp chain are
ancestors of `b126`, so the mixed-provenance commit is inside the shipping build's history and the
ruling above still governs it. The governed-root proof carries across unchanged — the intersection
with the build roots is still empty, so b126's bytes are clean for the same verified reason b125's
were. Kept under its original heading rather than renamed, because the b125 chain is what it is
called in every board entry that discusses it.

**Two standing warnings:**

1. **Never revert `d4015a2be` wholesale.** It would silently delete A's four instruments along with the
   legacy-shell deletion. Revert by path if the deletion ever needs undoing — which it should not, since
   the contract requires that file absent and `sync-v9-to-homepage` no longer recreates it (`77620b615`).
2. **The mechanism is not fixed, only known.** Use `git commit --only <paths>` on this box. A second
   variant surfaced the same morning: `git reset HEAD~1` discards whoever is at HEAD rather than whoever
   typed it, and it deleted C's commit `99958ebcc` (re-landed as `dd2ae121e`).
