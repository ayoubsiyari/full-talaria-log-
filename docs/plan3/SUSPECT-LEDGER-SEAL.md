# Suspect Ledger — seal publication draft

**Owner: Manager B (integration). Updated: 2026-08-04 00:2x+01:00 / 2026-08-03T23:2xZ.**

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
| STATED under exactly one legal state | **2** | see §4e/§4f/§4g |
| `ILLEGAL_OPEN` | **5** | 0 — restated below |
| `ABSENT`, the forbidden state | **158** | 0 for the enumerated population |

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

## 5 · Seal gate on this ledger

- **Soak-legal only when** section 1 has zero OPEN, section 2 has zero OPEN (or browser cold-load waived by PO), section 4 every OPEN row carries `PO-SIGNED: <name> <UTC>` or is moved to KILLED/CLEARED, and **section 4b every DEFERRED row carries both a PO signature and a revisit condition** (a deferral without a revisit condition is an OPEN row wearing a better word).
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
| `20260803b126` | **DEPLOYED — IDENTITY UNDER REVIEW, DO NOT CITE THE SHA** | **One id, two compiled bundles.** The door serves bytes built `09:59:48Z` from **`5dceb6368`**; the source tag `roster-20260803b126-source` peels to **`1cf60b607`** (verified on origin, not from memory), which was committed 49 s *before* the container finished and therefore cannot be the input. **`c481ec6bc` is not a third bundle** — it is D's canary-watcher repoint, 5 files, no `dist-v9`, no stamps. Source-side finding, `EVIDENCE CLASS: STATIC_SOURCE`: **zero bundled-source files differ between `5dceb6368` and `1cf60b607`** — the whole diff is `dist-v9` outputs, cache stamps, one board doc and D's watchers — so these are two compilations of identical inputs, not two codebases. **B's byte comparison decides whether this is bookkeeping or a second b124; all cuts are held until it lands.** Distinguish from b124 before assuming the worst: b124's bytes traced to *no* committed tree, whereas b126's served bytes trace to `5dceb6368`, a committed and pushed commit that the passport names correctly. The live hazard survives even a clean byte match: `HEAD` now carries a b126-stamped bundle that is not the served one, so a deploy from `HEAD` would serve different bytes under the same id. Cut 2026-08-03 from `1cf60b607`, source tag `roster-20260803b126-source`, both pushed. First id to carry B's `BUILD-CONTEXT-01` fix (`bf0de225c`), which closes the `module-contract-preflight` failure that had made **every cut since `c0c013b9c` unbuildable** — b123, b124 and b125 all sat under it. Stamps uniform across **16 governed files at b126, zero stragglers**: no b122, b123, b124 or b125 remains on any served surface. Gates green at the tagged commit: module-contracts `"ok": true`, B's `test:build-context-coverage` 7/7, pre-cut mirror gate passed (598 files, 0 parse failures, 0 truncated), `clean-build-tree` reproducible from HEAD. Canary answers `20260802b122` until B deploys. |

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
