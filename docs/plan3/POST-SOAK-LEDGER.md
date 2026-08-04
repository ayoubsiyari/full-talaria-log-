# POST-SOAK LEDGER

**Opened 03-08 23:4x+01:00 / 2026-08-03T22:4xZ by B, on the Director's ruling at 23:33+01:00.**
**Owner: B. Any lane may append. Nobody needs permission and nobody needs to discuss it first.**

---

## What this file is for

Every finding from now until soak completion that is **not seal-corrupting** goes straight in here.
No discussion, no queue, no status report, no waiting for a reply. Write the row and carry on.

This exists because the alternative is worse in both directions. A finding raised during a soak
either interrupts the soak or gets swallowed by the effort of not interrupting it — and the second
failure is silent, which is how a real defect ends up remembered by nobody. A row here costs sixty
seconds and survives the night.

## The intake test — one question

> **Does this finding mean the sealed bytes are wrong, or that the soak now running is measuring the
> wrong thing?**

- **No** → append it here. Do not report it. Do not ask.
- **Yes** → it is **seal-corrupting**. Stop and take it to the PO immediately. This file is not where
  that goes, and putting it here to avoid a hard conversation is the one way to misuse this ledger.
- **Unsure** → append it here **and** say so in the row's `seal-corrupting?` cell. An honest "I do not
  know" is a valid entry; a guess dressed as a verdict is not.

**Deferral is not clearance.** A row in this ledger is real, understood, and deliberately not being
fixed yet. It is never a synonym for "cleared", "not guilty", or "turned out to be nothing" — the
`SUSPECT-LEDGER-SEAL.md` vocabulary applies here unchanged.

## Row format

| field | meaning |
|---|---|
| **id** | stable handle, `PSL-nn`. Never renumbered, never reused, even if a row is later voided. |
| **owner** | the lane that has to do the post-soak work. Not the lane that found it. |
| **finding** | what is true, in one or two sentences, with the number if there is one. |
| **state** | where it actually stands. `FIX_COMMITTED_NOT_SHIPPED`, `WITHDRAWN_NEEDS_RETAKE`, `RULING_PENDING`, `MEASURED_NOT_FIXED`, `PROPOSED_NOT_APPLIED`, `ARMED_AWAITING_INPUT`. |
| **evidence** | committed path, SHA, or gate name. If it is not committed it is not citable — say `UNCOMMITTED` rather than citing it. |
| **post-soak action** | the next concrete step, and who it is blocked on. |
| **seal-corrupting?** | `no`, or `unsure — why`. Every row must answer. |

---

## Rows

### PSL-01 · A's withdrawn comparison series

- **owner:** A
- **finding:** Every reading in A's `21:10:17+01:00 → 21:30:43+01:00` series — **all twelve arms**, not
  the two originally named — is withdrawn. The whole window overlapped E's V8 dominator run, which was
  37 minutes in. That retires the TradingView band (**760–825 MB**), our 2-up and 4-up bands, and the
  **31.6–36.5 MB** per-panel marginal. The flat-GPU finding is withdrawn with the rest, and A's own note
  is that it was the one they most wanted to keep.
- **state:** `WITHDRAWN_NEEDS_RETAKE`
- **evidence:** `docs/plan3/board/BOARD-A.md:35` (quotable table, struck through), `:68-73` (the full
  withdrawal), `:74-77` (the two r2 arms that predate the witness). Separately `:1824` records a one-up
  band withdrawn for three independent reasons, where the artifact was deleted and A says deleting it
  was the wrong instinct.
- **post-soak action:** re-take all arms under host scope, with the exclusivity witness recording
  `scopesHeld`. Blocked on nothing but box time; the queue reservation
  `A/competitor-reference-arms` already exists behind `C/canonical-floor-retake-clean`.
- **seal-corrupting?** **no.** These are comparative memory readings against a competitor. Nothing in
  the sealed bundle depends on them, and withdrawing them removes claims rather than adding risk.

### PSL-02 · `_smartPrefetchCache` hoard discipline — fixed, green, and deliberately not shipped

**Alias: `POST-SOAK-LEDGER-E-02`**, the seat E cited for `E-SUS-04` before this file existed.

- **owner:** E
- **finding:** A real asymptotic hoard: `0.384 → 10.827 → 13.239 MB` retained across four cache
  instances, one per panel filling toward capacity — **not** cache multiplication (occurrence count
  stays `4 → 4 → 4`) and **not** the monotone **36 MB/hour** JS-side slope owner. All four hoard
  questions are now answered in code: payloads clamped to **7,048** rows (5,000 + 2,048), released on
  `destroy()`, on non-bfcache `pagehide`/refresh, and on `returnedToSinglePanel`.
- **state:** `FIX_COMMITTED_NOT_SHIPPED` — static-green only. Product freeze says it rides the
  post-soak build.
- **evidence:** commits `64b0a7a01` (discipline row) and `afcb87e5f` (canonical destroy release
  corrected to match the mirror). Gate `smart-prefetch-cache-discipline.test.mjs` **PASS 2/2** at
  22:47+01:00, both chart mirrors. Ledger row `E-SUS-04` in `docs/plan3/SUSPECT-LEDGER-SEAL.md:121`.
- **post-soak action:** ship on the first post-soak build, then re-run the perturbation arm to confirm
  the hoard is gone rather than merely capped. E's own framing is the one to keep: this explains the
  retained-node snapshot delta lead, **not** the full CDP `jsHeapUsedMB` slope, so closing it does not
  close the slope.
- **seal-corrupting?** **no.** The fix is *absent* from the sealed bytes by decision. The soak measures
  the unfixed cache, which is exactly the behaviour in production today.

### PSL-03 · The `replay-system.js:4297` product change

- **owner:** A, with a PO ruling attached
- **finding:** When a session start is later than every loaded bar, the backtest path sets
  `startIdx = rd.length - 1` at `:4297` and then `sessionStartIndex = this.currentIndex` at `:4301`,
  pinning the rollback floor to the last bar. A realm in that state **can neither advance nor be
  rewound, by construction**, and from outside is indistinguishable from one refusing to play.
  Confirmed at runtime: `seekTo(1760)` left four realms at 1880, floor observed at 1774 and 1880.
  The fallback is **silent** — no state recorded, no toast, no exception.
- **state:** `RULING_PENDING` on the product semantics. A explicitly declined to change replay session
  semantics on the eve of a seal unilaterally, which was the right call.
- **evidence:** `docs/plan3/board/BOARD-A.md:29` (quotable), `:1809` (the mechanism, with
  `seekTo` clamping at `replay-system.js:8962`), `:1814` (why it stays open), `:87-90` (the two PO
  rulings). Recent commit `46bf8e848` "Refuse R3 session-start fallback before soak" is the
  pre-soak refusal, not the product fix.
- **post-soak action:** land the semantic fix — a session start beyond loaded data should **refuse or
  clamp to a position with runway**, and must record state either way. Note A's second observation
  while it is here: this is a **candidate cause for C's soak exhaustion**, because the signature is
  identical — a realm pinned at its dataset end that never resumes. If the soak reproduces that
  signature, this row is the first place to look.
- **seal-corrupting?** **no**, and the reasoning is explicit: the refusal landed before the soak, so
  the soak will not silently sit on a pinned floor. The *product* semantics are unchanged in the sealed
  bytes, which is the deliberate decision rather than an oversight.

### PSL-04 · The gate-depth sweep

- **owner:** A
- **finding:** **121** gates resolve the repository root by fixed directory depth — corrected **up**
  from a **76** undercount that matched only `__dirname` anchors. Of the mirrored gate pairs, **26 of
  29 are broken by depth, and 14 never ran at all.** A gate that never ran is not a passing gate, and
  14 of them had been counted as coverage.
- **state:** `MEASURED_NOT_FIXED` — the population is known; the sweep is not complete.
- **evidence:** `docs/plan3/board/BOARD-A.md:32-33`. Tooling: `scripts/gate-root-depth-audit.mjs`
  (tracked), and `gate-root-depth-fix` now calls `assertParity()` before exiting per MIRROR-PARITY-01
  (`BOARD-A.md:1692`, `b64c79d36`).
- **post-soak action:** finish the sweep across all 121, prioritising the 14 that never ran, since
  those are the ones whose green was vacuous. Worth recording that B's original sample of 2 was "the
  two B touched" — the population is A's number, and the correction direction was upward both times.
- **seal-corrupting?** **no.** This is gate infrastructure, not product code. It does mean some
  pre-seal green was weaker than it read, which is a reason to distrust *those specific gates* rather
  than the bundle.

### PSL-05 · The index guard (INDEX-SCOPE-01)

- **owner:** whoever owns `scripts/commit-scoped.mjs` (landed by the lane committing at 23:06+01:00)
- **finding:** A commit-time guard that refuses a commit carrying paths its author did not name.
  `NOTHING_NAMED` is a distinct refusal from a mismatch, so a commit that names nothing cannot pass
  vacuously. Landed at `ff3d9aa8c`, 23:06+01:00.
- **state:** `MEASURED_NOT_FIXED` — working as designed; the ledger row is about its consequences.
- **evidence:** `ff3d9aa8c`, `scripts/commit-scoped.mjs` (tracked). Confirmed live by B at
  23:20+01:00: a plain `git commit` was refused with `NOTHING_NAMED`, and `commit-scoped.mjs -F <msg>
  <path>...` reported `INDEX_SCOPED`, `COMMIT_SCOPED`.
- **post-soak action:** two loose ends. (1) The bypass `INDEX_SCOPE_OFF=1` is documented in the
  refusal message itself, so the guard is advisory against anyone who reads it — decide whether that
  is intended. (2) It is a hook-class control and therefore shares the binding problem in **PSL-08**:
  installed per worktree, invisible until it fires.
- **seal-corrupting?** **no.** It governs how commits are made, not what is in the bundle. It landed
  *after* the b126 cut, so it did not gate the sealed bytes either way.

### PSL-06 · The gitignore evidence gap

- **owner:** C for `.gitignore`; every lane for its own citations
- **finding:** **65 live citations point at gitignored paths.** Across 528 tracked `.md` files under
  `docs/plan3`, 177 distinct evidence paths are cited, **77 are absent from git** (89 references), 65
  of those gitignored and 12 merely never added. Behind that is the worse number: of the 65, only
  **22** are recoverable by an ignore change, 2 cite a directory rather than a file, 3 cite 150 MB+
  heapsnapshots, and **38 cite artifacts that exist on no disk in the project** — unverifiable when
  written, by anyone including their author. The ignore rule is not protecting the repo either: **378**
  files under the two evidence roots are already tracked *through* it, so which half landed is a coin
  flip.
- **state:** `PROPOSED_NOT_APPLIED` — `.gitignore` is not B's and was not changed.
- **evidence:** `docs/plan3/RULING-REQ-EVIDENCE-GITIGNORE-20260803.md` (the patch, the measurements
  and the revert proof), commit `6be820cf4`. Patch measured then reverted byte-identical
  (`b6cc50772cbac613` before and after): **289** artifacts / **11.1 MB** become committable, **12 of
  12** heapsnapshots (**1.85 GB**) stay out, **23 of 23** `probes/` files stay out.
- **post-soak action:** apply the two-part patch, then decide the harder half. The awkward mechanical
  detail is recorded so nobody rediscovers it: `_evidence/` with a trailing slash makes git refuse to
  **descend**, so negations underneath silently never fire. Dependency: `open_rulings: SH-1` in
  `TERRITORY.yml` already asks whether the evidence roots are shared across managers, and if they are
  per-manager territory then tracking them changes who may commit into whose directory.
- **seal-corrupting?** **no.** No product code involved. It does mean a share of the pre-seal evidence
  trail is unverifiable by anyone but its author, which is a reason to re-derive a number rather than
  quote it — not a reason to distrust the bundle.

### PSL-07 · D's V8 candidates

**Aliases: `POST-SOAK-LEDGER-D-002`, `-D-003`, `-D-004`, `-D-005`** — the seats D cited for
`_orderExecutionSeriesByFileId`, `_miSeriesByFileId`, `_m20Q9PrefixByMaster` and the underfit branch.
All four share this seat because they resolve on one input, E's real-playback forced-GC diff, and are
listed individually in `SUSPECT-LEDGER-SEAL.md` §4f so none can go missing inside the cohort.

- **owner:** D, blocked on E
- **finding:** Three constructor/retainer candidates remain **armed** with signatures and confirming
  perturbations written in advance: `_orderExecutionSeriesByFileId`, `_miSeriesByFileId`,
  `_m20Q9PrefixByMaster`. `m20Q6CapturedClear` was promoted to top candidate at 16:26+01:00 and
  **demoted at 18:13+01:00** when E cleared it at **416 bytes** retained, below the single-path
  threshold. The null branch and the stopping rule were both written before the data arrived.
- **state:** `ARMED_AWAITING_INPUT` — needs E's real-playback three-snapshot rerun. E's first diff met
  the pre-written null threshold numerically, but the page was idle (`currentIndex=0`,
  `isPlaying=false`), so the playback precondition was never satisfied and the null does not count.
- **evidence:** `docs/plan3/V8-RETAINER-DIFF-LOOKUP-20260803.md` (tracked),
  `docs/plan3/board/BOARD-D.md:149`, `:153`, `:184`, `:186`, `:188`, and the precommitted threshold at
  `:27`.
- **post-soak action:** run E's real-playback rerun, then apply D's own precommitted rules without
  renegotiating them: if the three candidates together account for **less than one tenth** of E's
  measured retained-growth delta, D reports `V8-CANDIDATE-CENSUS-UNDERFIT` and **stops naming
  constructors**, and the next instrument becomes retained size per dominator subtree. If E's
  forced-GC 30-minute retained delta is `<=5 MB` with no single path over 2 MB, D reports
  `V8-LIST-STAND-DOWN` and makes **no speculative fixes**.
- **seal-corrupting?** **no.** Diagnostics. No candidate has produced a product change, and the
  stopping rules are designed to prevent one being invented from a weak signal.

---

## Rows added under the same rule by B, 23:4x+01:00

Both were closed out of status by the Director's ruling at 23:33+01:00 — *"not a seal gate, and neither
appears in a status report again"*. Neither is fixed, so they are recorded here rather than allowed to
disappear with the status line that used to carry them. This is the mechanism working as intended.

### PSL-08 · The commit-msg hook enforces 1 of the 4 required trailers

- **owner:** B, with a ruling needed
- **finding:** `scripts/territory-preflight.mjs:73` requires `['Manager','Row','Packet','Tier']`. The
  installed `commit-msg` hook guarantees only `Manager`. Measured on B's own commits, which carry
  `Manager: B`: the gate still reports **0 attributed, 3 UNATTRIBUTABLE of 3**, *"absent trailer(s):
  Row, Packet, Tier"*. So "attribution starts now" was **overstated by B** — enforcement covers a
  quarter of the requirement.
- **state:** `RULING_PENDING`. Not widened unilaterally: `Row`, `Packet` and `Tier` vary **per commit**
  rather than per lane, so sourcing them from environment variables the way `TALARIA_MANAGER` is
  sourced would refuse every commit from every lane again.
- **evidence:** commit `7919144f5`, `docs/plan3/board/BOARD-B.md` current-state block. Hook install
  22:48+01:00, `HOOK_ACTIVE` exit 0. Adoption did happen for the trailer that *is* enforced: last
  untrailered commit 22:35+01:00, then 9 consecutive commits carrying valid per-lane trailers, against
  0 of the previous 250.
- **post-soak action:** rule whether the territory gate should require four trailers or one. If four,
  the hook needs a per-commit input path rather than a per-lane environment variable, and the 250-SHA
  baseline in `docs/plan3/baselines/territory-trailer-baseline.json` needs a matching decision.
- **seal-corrupting?** **no.** Attribution metadata on commits. Nothing in the bundle.

### PSL-09 · `TERRITORY.yml` declares managers D and E twice, with contradictory grants

- **owner:** Director — this one cannot be closed by a lane
- **finding:** Managers **D and E are each declared twice**, at lines 396/489 and 568/609, with
  different roles and different citing charters. **Six paths are owned by one block and denied by the
  other**, the first being `chart v 1.4/chart/modules/order-manager.js` — the same file this manifest's
  own comment says caused an unrecorded B/D overlap found by trial merge. Cause: `69870c491`, subject
  *"union package scripts and territory"*, **concatenated** both sides instead of unioning them.
- **state:** `RULING_PENDING`. Three mechanical defects were repaired at `f3c6a58b8`, including line
  430, which needed **no** grant change after all — `D[0-9]` is expressible exactly as ten `D0*`–`D9*`
  prefixes. All four one-block-each combinations then validate, so this is the single remaining blocker.
- **evidence:** `f3c6a58b8`, and
  `docs/plan3/RULING-REQ-TERRITORY-MANIFEST-LINE-430-20260803.md` for the full diff, the six
  contradictions and the probe. Gate is still RED: territory suite **75 pass / 12 fail**,
  byte-identical before and after the repair.
- **post-soak action:** rule which charter governs D and which governs E. **A union is not the neutral
  option** and this was probed rather than assumed: `resolveOwnership` returns on the first matching
  `denied` rule before it ever looks at `owned` (`territory-manifest.mjs:414-417`), so unioning D's
  blocks voids CHARTER-D's five module grants while reading like a merge that kept both. Whoever
  resolves it picks a charter whether they mean to or not.
- **seal-corrupting?** **no.** The manifest governs who may edit what; it does not enter the bundle.
  It does mean the territory gate has produced no real verdict for the whole pre-seal period, so
  "territory was clean" is not a claim anyone can make about this seal.

---

## Row added by C, 23:5x+01:00

### PSL-10 · The three first-paint boots for the allowance

- **owner:** C
- **finding:** The first-paint allowance has a **ratified method and no measurement**. R2 approved the
  number in advance conditional on two falsifiers, so the arithmetic is settled and only the three boots
  are outstanding. The allowance is `settled bar + Σ(attributed, structurally unavoidable construction
  transients)`; **unattributed transients are excluded by construction**, which is the whole point — an
  allowance that absorbs whatever it cannot explain is a budget for ignorance.
- **state:** `ARMED_AWAITING_INPUT` — method, derivation and both falsifiers are written and self-tested;
  the input is box time, nothing else. **Nothing waits on these boots**: R2 ratified in advance, so if a
  falsifier trips the allowance is the settled bar plus attributed transients and the gap is reported.
- **evidence:** `scripts/lib/first-paint-allowance.mjs` and its self-test (tracked);
  `docs/plan3/C-FIRST-PAINT-ALLOWANCE-PROPOSAL-20260803.md` for the method and the falsifiers.
- **post-soak action:** three boots on a clean box, Cursor closed, each producing a
  `SETTLE-CRITERION-V2`-compliant curve, then run the derivation. ~60 min including settle curves.
  They were scheduled to ride the W2 floor re-take; **W2 is cancelled** — the floor moved into the soak's
  hour-0 endpoint (`BOOT-ENDPOINT-READING-01`) and the boots have no remaining dependency on it.
- **seal-corrupting?** **no.** The allowance grades a boot transient against a bar. It is not in the
  bundle and the soak does not measure it.

---

## Seats for C's DEFERRED suspect rows, 00:2x+01:00

Opened so that every `DEFERRED` seat cited in `SUSPECT-LEDGER-SEAL.md` §4e resolves to a real numbered
row. A seat number pointing at nothing is absence wearing a better word.

### PSL-11 · The canonical floor and its COV-01 block

- **owner:** C
- **finding:** The **674.9 MB** post-play floor is `FLOOR_FOUND` and **not quotable** — 59.84% coverage,
  **271.05 MB unattributed** — and on the corrected criterion its curve would not have graded settled
  either, because the instrument's default ladder had a 300 s last gap. Both defects are fixed; the
  number has not been re-taken.
- **state:** `WITHDRAWN_NEEDS_RETAKE`
- **evidence:** `docs/plan3/board/BOARD-C.md` current-state table; suspect rows `C-SUS-01`, `C-SUS-06`,
  `C-SUS-17`. Corrected basis at `2f548462d`, corrected ladder at `99198d15d`.
- **post-soak action:** none, if the soak's hour-0 endpoint produces a reading that passes
  `READING-VALIDITY-01` — that is now the canonical floor and it fires inside the arm. **This seat
  exists for the failure branch:** if the hour-0 reading ships a failure sidecar, re-take on a clean box
  with Cursor closed, `node scripts/canonical-floor-retake.mjs`, ~63 min.
- **seal-corrupting?** **no.** A blocked number is not a wrong number in the bundle; nothing shipped
  depends on it.

### PSL-12 · `DRIFT-ABBA` has never run

- **owner:** C
- **finding:** `SELF_TEST_ONLY`. `abbaSequence` is called by exactly one file — its own self-test — and
  I had reported the item completed. Withdrawn from the completed list rather than quietly re-scoped.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `scripts/lib/abba-drift.mjs` (tracked), `docs/plan3/board/BOARD-C.md:1040`.
- **post-soak action:** arm it with a genuine paired ABBA arm on the host. **Explicitly not** to be
  bound somewhere convenient to turn the audit green — that would make the gate say BOUND while proving
  nothing, which is the failure mode the audit exists to expose.
- **seal-corrupting?** **no.** A drift instrument, not product code and not a seal gate.

### PSL-13 · The 2026-08-02 arena series

- **owner:** C
- **finding:** Every figure keyed to `totalPrivateMB` in that series is unusable. Host contention
  covered the **whole run, not a tail**, so there is no clean interior window to salvage.
- **state:** `WITHDRAWN_NEEDS_RETAKE`
- **evidence:** `docs/plan3/board/BOARD-C.md:778` (the correction against my own earlier posts).
- **post-soak action:** re-run under host scope with the exclusivity witness recording `scopesHeld`.
  C's arena re-run is deliberately last in the measurement queue and waits on E's retainer verdict.
- **seal-corrupting?** **no.** Withdrawing readings removes claims rather than adding risk.

### PSL-14 · Hoard floor curve at the drained end

- **owner:** C
- **finding:** The hoard floor binds at both ends of the arm, and under `SETTLE-CRITERION-V2` each end
  needs a paused curve rather than a single read. The Director ruled the curve post-soak, so the
  end-of-arm curve was **removed from both arms** and the recipe amended; the hour-0 curve covers only
  the boot end.
- **state:** `PROPOSED_NOT_APPLIED`
- **evidence:** `docs/plan3/RECIPE-SEALED-SOAK-FROZEN-20260803.md` Amendment 2, commit `f0531a352`.
- **post-soak action:** one paused curve at the drained end on the same ladder — three reads at 600 s
  rungs, quiesce verified, forced collection at each. ~22 min of box time.
- **seal-corrupting?** **no.** It is the soak's second gate, not a property of the sealed bytes.

### PSL-15 · `chart.js:4916` / `:4919` — silent catches under RATE-HOLD's own quantity

- **owner:** A, raised by C
- **finding:** `try { replay.syncCurrentIndexFromReplayTimestamp(replay.replayTimestamp); } catch (_si) { }`
  and `try { replay.updateChartData(false); } catch (_uc) { }`. `replayTimestamp` is exactly the quantity
  RATE-HOLD reads as delivered bars/s. If either throws during a ten-hour arm the playhead stops
  advancing, delivery reads zero, and **nothing anywhere reports an error** — the artifact records a
  number instead of a fault.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `docs/plan3/board/BOARD-C.md:142`; census `4ec7aeb99`.
- **post-soak action:** make both catches record state. **Product file under freeze — no edit was made
  or proposed tonight.** If the soak produces a flat-delivery segment with no error, this is the first
  place to look, alongside `PSL-03`.
- **seal-corrupting?** **unsure — this is the honest answer.** It does not make the sealed bytes wrong,
  but it can make the *soak measuring them* report a number where it should report a fault. It is
  recorded rather than resolved because resolving it means editing a frozen product file.

### PSL-16 · N6 swallowed-catch census

- **owner:** C for the census, product owners for the sites
- **finding:** **2,049 silent catches across 192 files** — CRITICAL 189, HIGH 81, MEDIUM 78, LOW 105,
  UNCLASSIFIED 1,596 — ranked by blast radius and brace-matched to each catch's own `try` block. This is
  **triage, not a defect list**; some silent catches are correct and no site should be changed without
  being read.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** commit `4ec7aeb99`. Recorded against myself: the first pass reported **531** CRITICAL by
  classifying on a 700-character window that matches almost anything in dense code — its top "critical"
  site was `getCandleSpacing()`. Re-classified on the matching `try` block only: 531 → 189. An alarming
  number that means nothing is worse than no number.
- **post-soak action:** work the 189 CRITICAL sites by blast radius, starting with `PSL-15`.
- **seal-corrupting?** **no.** A census of existing behaviour. It changes nothing in the bundle and
  describes the code as shipped.

### PSL-17 · Eleven of fourteen roster switches are absent from the served build

- **owner:** B for the build, C for the A/B
- **finding:** Present: `BFCACHE_DEFEAT_V1`, `CHART_DESTROY_V1`, `OVERLAY_RESYNC_DIRTY_V1`. Absent: the
  other eleven, including `EVICT_BEHIND_PLAYHEAD_V1`, `SERIES_LRU_V1`, `MARKER_INDEX_CACHE_V1`,
  `INDICATOR_FP_MEMO_V1`. A switch-off A/B run against this build would flip three flags, **silently
  no-op eleven**, and report the difference as the roster's contribution.
- **state:** `ARMED_AWAITING_INPUT` — the A/B design is landed at `f6ef20a8b`; the input is a build that
  carries the switches.
- **evidence:** `docs/plan3/board/BOARD-C.md:139`.
- **post-soak action:** run the switch-off A/B only against a build that actually carries the roster.
  Until then the roster's contribution is **unmeasured**, which is not the same as zero.
- **seal-corrupting?** **no.** It means one planned measurement cannot be taken against this build, not
  that the build is wrong.

---

## Seats opened by the suspect-ledger census, 00:5x+01:00

The census in `SUSPECT-LEDGER-SEAL.md` §0 found the suspect ledger stated **2** of a **165**-item
population and left **158 absent**. Closing it produced these seats. Every `DEFERRED` row over there
now resolves to a numbered row here, because a seat number that points at nothing is absence wearing a
better word.

**Three of these are cohorts** — `PSL-18`, `PSL-19`, `PSL-20` — holding 49 deferred tickets between
them. The cost is stated rather than hidden: a cohort can hide an individual. It is accepted only where
the rows are deferred *for the same reason and will be worked as a batch*, and refused for every row
with its own reason, which is why `PSL-21` through `PSL-23` are individual.

### PSL-18 · `po-eyes` ticket cohort — 23 tickets awaiting a PO decision

- **owner:** the PO to decide, B to route
- **finding:** 23 rows in `TICKET-STATUS-LEDGER-20260729.md` carry status `po-eyes`: nobody is blocked
  on engineering, they are blocked on a decision. Two more (**TAL-01696**, **TAL-01698**) were in this
  class until D's evidence killed them, so the cohort is 23 rather than 25.
- **state:** `RULING_PENDING`
- **evidence:** `docs/plan3/SUSPECT-LEDGER-SEAL.md` §4g, generated from the ticket ledger. Signature
  packet for the named subset: `docs/plan3/LEDGER-CLOSEOUT-PACK-20260803.md`.
- **post-soak action:** put the 23 in front of the PO as one batch. **Expect the batch to shrink on
  contact:** three of the five rows that had sat in §4 for days turned out to be already fixed the
  moment a lane looked, so a stale `po-eyes` is as likely as a real one.
- **seal-corrupting?** **no.** Decisions, not bytes.

### PSL-19 · `owner-blocked` ticket cohort — 19 tickets behind a named owner

- **owner:** the named owner per row; B to chase
- **finding:** 19 rows carry `owner-blocked` — real open work, with an owner, not started or not
  finished. **TAL-01865** left this class on D's evidence, so 19 rather than 20.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4g.
- **post-soak action:** confirm each owner still holds the row, since ownership has moved repeatedly
  this week. Ticket-ledger line 167 already records routing changes (`TAL-01677/01733 → A`), so the
  status column and the routing note can disagree.
- **seal-corrupting?** **no.**

### PSL-20 · `blocked-on-build` ticket cohort — 7 tickets that are verification debt

- **owner:** B
- **finding:** 7 rows carry `blocked-on-build`, including **M17-DI2 / TAL-01918**, whose product guard
  is restored on the train tip and needs stamp confirmation. These are mostly **verification debt
  against a stamped build rather than unfixed defects** — the distinction the suspect ledger's own
  closing note has always drawn.
- **state:** `FIX_COMMITTED_NOT_SHIPPED` for the subset with landed fixes; the rest `MEASURED_NOT_FIXED`
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4 and §4g.
- **post-soak action:** run the owed Script/stamp confirmations against b126 and re-state each row on
  the result. **Cheapest cohort here** — the work is running gates, not writing fixes.
- **seal-corrupting?** **no.** But note the shape: a row that only needs a stamp check has been sitting
  behind builds since b123, because b123, b124 and b125 were all unbuildable under the
  `module-contract-preflight` failure that `bf0de225c` closed.

### PSL-21 · TAL-01891 — the 20.7 MB decoded screenshot, a live P0 candidate

- **owner:** A
- **finding:** A real decoded chart screenshot measures **20.7 MB**, and heavy account scale can
  plausibly reach multi-GB. Status in the ticket ledger is `broken` — the only row carrying that word.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `docs/plan3/TICKET-STATUS-LEDGER-20260729.md:110`, citing
  `PULL01-ORDER-MEMORY-TERMS-20260731.md`.
- **post-soak action:** hunt it on a **representative** account. The ticket's own warning is the load-
  bearing part: *"fresh harness accounts are not representative"*, so **a quiet soak is not evidence
  against this row** and must not be quoted as one.
- **seal-corrupting?** **unsure — and this is the one row where I will not claim otherwise.** It is a
  live P0 memory candidate in product code that is inside the sealed bytes. It does not make the bytes
  *wrong*, and it long predates this seal, so by the intake test it belongs here. But if the soak
  exhausts memory on a heavy account, this row and `PSL-03` are the first two places to look, and
  whether the soak is then "measuring the wrong thing" depends on whether its accounts are
  representative — which the ticket says they are not. Recorded as unsure rather than resolved.
- **do not read the cleared decoded-image row as clearing this.** §1 disproved a *per-closed-trade
  coefficient* (~16.6 MB/closed-trade, failed the matched-bars test, bar-driven growth wearing a trade
  label). The *absolute* 20.7 MB decode is a different claim and was never disproved.

### PSL-22 · Verify-absent-on-stamp debt — TAL-01920, Rayan #7, Rayan #10

- **owner:** B to run, PO to accept
- **finding:** Three rows the PO reopened with one instruction: *"positively verify absent on stamp"* —
  PO-CHECK §17 for TAL-01920, §15 for Rayan #7 and #10 — and explicitly *"Not find-original-repro"*.
  Their status is `verify-gone`: the verification went missing, not the fix.
- **state:** `MEASURED_NOT_FIXED` — nothing is known to be broken and nothing is proven absent
- **evidence:** `TICKET-STATUS-LEDGER-20260729.md:129`, `:148`, `:150`.
- **post-soak action:** run the three PO-CHECK items against the stamped build and record the result
  inline. **These cannot be cleared by argument** — the ask is positive verification, so an absent
  repro is not a pass.
- **seal-corrupting?** **no.** Verification debt against the stamp. Worth noting these are the rows the
  soak's own smoke could plausibly discharge for free if its checklist already covers them.

### PSL-23 · TAL-DATA-LOAD-ERROR-SURFACE — the silent infinite loading state

- **owner:** D, who raised it
- **finding:** On a stale or non-owned `/api/file/:id/bars` 404 with a `/smart` fallback 404, the chart
  initializes its UI and order managers but **leaves the user in an apparent infinite loading state
  with no surfaced failure message.** A product row, not a harness artifact. Found during **b126 TAL
  smoke seed triage**, making it the newest row in the suspect ledger.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `TICKET-STATUS-LEDGER-20260729.md:7`;
  `docs/plan3/D-SUSPECT-LEDGER-ROWS-20260803.md:28` as D's seat `POST-SOAK-LEDGER-D-001`.
- **post-soak action:** scope and fix bootstrap error surfacing for bad or stale data seeds. The
  status was `scoped` with no owner named; **D raising it closes that gap.**
- **seal-corrupting?** **no.** A missing error message on a failure path, not a wrong byte. It does mean
  that if a soak panel silently fails to load bars, the harness sees a loading state rather than an
  error — worth knowing before reading a quiet artifact as a healthy one.

### PSL-24 · E-SUS-03 — marker defs / SVG defs

- **owner:** E
- **finding:** A named E-lane memory suspect with no current E-owned KILLED or CLEARED proof shape.
  Neither confirmed nor disproved.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4d. E cited this seat as `POST-SOAK-LEDGER-E-01`, which did
  not exist until now — kept as an alias.
- **post-soak action:** revisit with MB-priced forced-GC/settle evidence, or hand the row to an explicit
  owner. Under C's `SETTLE-CRITERION-V2` and `READING-VALIDITY-01` the bar for "MB-priced" is now
  higher than it was when this suspect was named.
- **seal-corrupting?** **no.** An unresolved diagnostic.

### PSL-25 · E-SUS-05 — the V8 monotone slope, still unresolved

- **owner:** E
- **finding:** The **36 MB/hour** JS-side monotone slope remains the unresolved finding. The diagnostic
  run was contaminated and non-authoritative. `PSL-02`'s `_smartPrefetchCache` hoard explains the
  retained-node snapshot delta lead but is explicitly **not** the slope owner.
- **state:** `ARMED_AWAITING_INPUT`
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4d. Cited by E as `POST-SOAK-LEDGER-E-03`, kept as an alias.
- **post-soak action:** run the committed smart-cache perturbation and take an authoritative read when
  the box is released. Sequenced behind C.
- **seal-corrupting?** **no.** The slope is in the shipped bytes and the soak will measure it, which is
  the point of the soak rather than a defect in it.

### PSL-26 · SHELL-PLAY-01 — present, mirrored, and bound to nothing

- **owner:** B
- **finding:** The V9 shell play override is **present and mirrored in the shipped bytes** — `apply(this)`,
  `__shellPlayOverrideInert` — and the host instance's `play()` stayed **inert** on b124. No mechanism
  has been found. Receiver divergence was tested and **disproved** as the cause, which is why §4b's
  eleven sibling wrappers are deferred as a separate shape rather than as the explanation.
- **state:** `MEASURED_NOT_FIXED` — a fix with no mechanism is not a fix, so this cannot be KILLED
- **evidence:** `docs/plan3/SUSPECT-LEDGER-SEAL.md` §4b and §4i;
  `docs/plan3/A-TO-B-SHELL-PLAY-STILL-INERT-ON-B124.md`.
- **post-soak action:** find the mechanism before attempting another fix. Three tries have landed bytes
  that are present, mirrored and inert, which is the signature of fixing the wrong thing carefully.
- **seal-corrupting?** **no.** The override is inert in the sealed bytes, which is the same behaviour
  the soak will exercise. It does mean any measurement that assumed the override was live is invalid.

### PSL-27 · DRAW-SMOKE-01 — a grader that has never executed against a build

- **owner:** B
- **finding:** The drawings grader passes **13/13 as a pure function** and the symbols it binds to are
  present in the served b126 bytes, but **it has never run against a build.** Distinct from D's half,
  which is stronger and already KILLED: served mutant `drawings-index-persist` killed on b126 plus gate
  `drawing-market-time-persist.test.mjs` at `f2e9d4fdb`.
- **state:** `FIX_COMMITTED_NOT_SHIPPED` for the smoke step; the feature itself is verified by D
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4f and §4i.
- **post-soak action:** execute the smoke against a running build. **Until then it is one of the 14
  gates in `PSL-04` that have never run** — the fact that its symbols exist in the bundle is presence,
  not binding, which is the distinction BIND-01 exists to enforce.
- **seal-corrupting?** **no.** D's mutant kill already covers market-time drawing persistence on the
  sealed build, so the product question is answered even though B's instrument is unproven.

### PSL-28 · The m20Q6 CPU-freeze half, cleared only on the V8 half

- **owner:** D and E jointly; neither has claimed it
- **finding:** m20Q6 was a **cross-domain** suspect — CPU-freeze stacks **and** monotone V8 heap-grower
  shapes. The V8 half is properly CLEARED: **416 bytes** retained, measured independently by E (13
  instances) and D (real playback), against a precommitted 2 MB threshold. **I found no evidence the
  CPU-freeze half was separately closed.**
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4d (`E-SUS-07`), §4f, §4i row 3b;
  `docs/plan3/V8-RETAINER-DIFF-LOOKUP-20260803.md`.
- **post-soak action:** either produce the CPU-domain evidence or restate the suspect as V8-only. **The
  reason this is its own seat:** clearing a cross-domain suspect on one domain's evidence is exactly
  `C-SUS-14` cross-basis borrowing, the defect C built `BASIS-GUARD-01` for, and it would be the fourth
  time this week that error appeared in a new costume.
- **seal-corrupting?** **no.** Diagnostics, and the V8 half genuinely is cleared.

### PSL-29 · The main-thread busy-time owner was never named

- **owner:** unassigned — this is the item
- **finding:** The quantity is real and large, and the readings disagree **by construction rather than by
  error**: C measured **867.3 ms/s** unthresholded main-thread task total, **657.7 ms/s** blocking time,
  and **861 ms/s** busy by a second decomposition (86.1% of wall); B measured **302 ms/s** thresholded
  and a **~700–800 ms/s** floor. **No owning code was ever named.** The only mechanism on record is a
  working diagnosis — indicators computed through the asynchronous worker pipeline, busy-coalescing at
  high speed — which is a hypothesis, not an attribution.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** `docs/plan3/FINDING-C-CALIBRATION-PASSES-THE-THRESHOLDING-TEST...-20260731-2100.md:15-26`;
  `docs/plan3/B-LIFE-3-AND-HYG-1-...-20260801-1030.md:62`; `docs/plan3/ADVISOR-BRIEF-MEMORY.md:75`.
- **post-soak action:** attribute it, and **state the basis before comparing any two numbers** — the
  2.18× spread between B's 302 and C's 657.7 is a thresholding difference, not a host difference, and
  reading it as a host difference is what sent an earlier night sideways.
- **seal-corrupting?** **no.** Unattributed performance, present in the sealed bytes and unchanged by
  the seal. **The PO named this as "~724 ms/s" and that exact figure is not in the tracked corpus** —
  the quantity is unambiguous, the specific number's provenance is not.

### PSL-30 · Three PO-named items whose referent could not be located

- **owner:** the PO, to name the referent; B to state them once named
- **finding:** Three of the ten items the PO named cannot be tied to anything in the tracked corpus, and
  the honest report is that rather than a verdict over a finding I never found.
  - **"the unlit dark rooms"** — the word *dark* appears **nowhere** in tracked `docs/plan3`, boards
    included. Candidates that fit the metaphor, all separately seated: 14 gates that never ran
    (`PSL-04`), 11 of 14 roster switches absent from the served build (`PSL-17`), 189 CRITICAL
    swallowed catches of 2,049 (`PSL-16`), and `DRIFT-ABBA` reported complete having never run
    (`PSL-12`).
- **"the second GPU box"** — **RETRACTED 08:5x+01:00. This bullet was false.** The referent is in the
  corpus and in the **frozen soak recipe**: `RECIPE-SEALED-SOAK-FROZEN-20260803.md:240`, *"A second
  GPU-bearing box is endorsed and blocks nothing — it buys parallelism later, not validity now"*, plus
  `BOARD-C.md:1263` recording host conditions as exclusivity rather than relocation — soak stays on the
  RTX box, EC2 r6i **refused** for having no GPU. State: **endorsed, not procured**. My guess that "the
  need is evidenced everywhere, the phrase is not" was **exactly wrong in both halves**: the phrase is
  there and the need is explicitly *not* blocking. ~~no request for a second machine exists in the
  corpus…~~
- **withdrawn from this seat at 00:3x+01:00:** *"R7's machine-coverage backfill"* was here as a third
  unlocatable item. **It is located and it is mine** — see `PSL-31`. I had searched for other lanes'
  vocabulary and not my own; the referent is the seventh row of a requirement document I wrote.
- **state:** `RULING_PENDING` — specifically, pending a name, not a decision
- **evidence:** `SUSPECT-LEDGER-SEAL.md` §4i rows 8, 9, 10, each recording the search performed.
- **post-soak action:** ask the PO which finding each phrase points at, then state it on evidence. **This
  seat holds a question, not work.** It exists because the alternative — picking the nearest-looking
  candidate and writing a confident verdict over it — is the manufactured zero in prose form, and this
  ledger was rewritten specifically to stop doing that.
- **seal-corrupting?** **unsure, and unavoidably so.** I cannot rule on the seal-corrupting status of a
  finding I have not located. If any of the three is a product defect in the sealed bytes it belongs
  with the PO tonight rather than here. **That risk is why this row is flagged in the handoff rather
  than filed quietly.**

### PSL-31 · R7 — the machine-coverage backfill I never wrote

- **owner:** B to write R7; A to implement, as with R1-R6
- **finding:** `docs/plan3/RUN-LOCK-01-HOST-SCOPE-REQUIREMENT-20260803.md` carries requirements **R1
  through R6** and stops. Every one of them scopes the lock to **a single machine**: R1 host scope is not
  declinable without a stated reason, R2 a host-less acquisition must not return `LOCK_ACQUIRED`, R3 the
  artifact records `scopesHeld`, R4 `inspectLocks()` reports the class so the gap has a detector, R5
  document the asymmetry where the flags are defined, R6 one detector or the detector is decorative --
  that last added from a live incident in which `inspectLocks()` read **none** while three runs were
  live on the box, one of them mine. **R7, the machine-coverage row, does not exist because I stopped at
  R6.**
- **state:** `PROPOSED_NOT_APPLIED` -- and weaker than that: not written, let alone applied
- **evidence:** `docs/plan3/RUN-LOCK-01-HOST-SCOPE-REQUIREMENT-20260803.md:77-117` for R1-R6, handed to
  A at `fb88cf1d1` 15:11+01:00 with R6 added in `cefd3d8da`. `docs/plan3/board/BOARD-B.md:156`
  records the handoff as **"host scope R1-R6"**, which is the record showing where the series ends.
- **post-soak action:** write R7. Two halves, and the second is the one with a cost: **(a)** the lock and
  its detector must cover every machine that can run an instrument, not just the one the run started on;
  **(b) backfill which machine each existing artifact ran on.** Half (b) is the awkward one, because an
  artifact that does not record its machine cannot be retro-attributed to one, so the honest backfill
  marks those `MACHINE_UNRECORDED` rather than guessing -- the same shape as the 250-SHA trailer
  baseline, where the answer was to grandfather rather than to invent.
- **why this row exists at all:** I reported this item to the Director as having no locatable referent
  after checking two unrelated things called R7. **The referent was a document I wrote myself.** A census
  that searches the corpus for other lanes' vocabulary and never for its own author's has a blind spot
  shaped precisely like this one, and it is worth more as a recorded blind spot than as a quiet fix.
- **seal-corrupting?** **no.** A requirement about measurement hygiene, not product bytes. It does mean
  every measurement taken this week records at most which *process* held a lock and not which *machine*,
  so cross-machine contention is undetectable in the existing evidence rather than absent from it.

### PSL-32 · Nothing checks a wall-clock stamp outside a board block

- **owner:** B
- **finding:** `FUTURE_STAMP` in `board-state-block.mjs` catches an impossible stamp in a board's
  CURRENT STATE block. **It checks nothing else.** I future-dated the §2 handoff document by **1h47m**
  and told the Director I was one minute inside a deadline I beat by 1h48m; no gate could have caught
  either, because neither lives in a board block.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** corrected at `5147ac894`; the breach is recorded inside the handoff itself.
- **post-soak action:** extend the check to prose stamps in `docs/plan3/*.md` and to commit-message
  stamps, or state on the record that CLOCK-01 covers boards only. **The second option is defensible and
  the current silence is not** -- CLOCK-01 was made binding on "every wall-clock number in board prose,
  commit messages, reports and verdict lines", and enforcement reaches one of those four.
- **seal-corrupting?** **no.** Timestamps in documents. It does mean a stamp in a report is worth exactly
  the care its author took, with nothing behind it.

### PSL-33 · The passport does not require its SHA to be the tag's peel

- **owner:** C, handed over by B at 16:09+01:00
- **finding:** `writeBuildInfo()` accepts whatever SHA it is given and does not verify it against the
  source tag's peel. b126 had three commits claiming the id and the identity **survived on determinism
  and luck rather than by design** -- zero bundled-source files differed between the two candidates, so
  two compilations of identical inputs produced identical bytes. Had any source file differed, the
  passport would have named a commit that did not build the served bytes.
- **state:** `PROPOSED_NOT_APPLIED`
- **evidence:** `docs/plan3/board/BOARD-B.md:505`; byte comparison `c356ce029`; §6 of the suspect
  ledger.
- **post-soak action:** bind the passport SHA to the tag peel at write time, or state on the record that
  the passport is a self-report and must never be the sole basis for an identity claim. **b124 was
  retired for exactly this class** -- bytes that traced to no committed tree -- and the only thing that
  stopped b126 repeating it was that the diff happened to be empty.
- **seal-corrupting?** **no.** b126's identity is settled by hashed bytes, not by the passport. The gap is
  in what the passport *guarantees* for the next build.

### PSL-34 · The shared index takes whoever commits, not whoever staged

- **owner:** whoever owns `commit-scoped.mjs`; B as a reporter
- **finding:** Three index leaks tonight. My `package.json` scripts landed in `f01507ea0`, another
  lane's commit. Earlier the same mechanism put **A's four instruments and three documents** into C's
  `d4015a2be`, and a `git reset HEAD~1` deleted C's `99958ebcc` because reset discards whoever is at
  HEAD rather than whoever typed it.
- **state:** `MEASURED_NOT_FIXED` -- mitigated, not closed
- **evidence:** `INDEX-SCOPE-01` at `ff3d9aa8c`, confirmed live refusing a plain `git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"` with
  `NOTHING_NAMED`; §7 of the suspect ledger for the `d4015a2be` ruling.
- **post-soak action:** decide whether the guard should be enforcing rather than advisory. **The bypass
  `INDEX_SCOPE_OFF=1` is printed in the refusal message itself**, so it stops carelessness and not
  haste. Given the mechanism has now cost three lanes' attribution and one lane's commit, advisory may
  be the wrong setting -- but that is a ruling, not a patch.
- **seal-corrupting?** **no.** Authorship metadata and process. §7 already proves the b125/b126 stamp
  chain's bytes are clean, because the swept paths never intersected the governed build roots.

### PSL-35 · A-lane suspects were never enumerated as a lane

- **owner:** A
- **finding:** Four of five lanes supplied self-declared suspect rows to §2 -- C 31, B 36, D 13, E 7.
  **A supplied none.** A's remaining pre-verification instruction is the governor reference-timeframe
  pre-flight and then stop, so none are coming before the PO's five-package pass.
- **state:** `STATED_NOT_SUPPLIED`
- **evidence:** row counts by lane in `SUSPECT-LEDGER-SEAL.md`; `A-SUS-00` in section 4k. Ten rows in
  that file carry A as an owner cell, all written by other lanes.
- **post-soak action:** A supplies its lane's rows under the same law, or the PO accepts on the record
  that section 2's coverage of A is whatever other lanes happened to name. **The unexamined surface is
  not small** -- SPEED-01, the A3 speed-fill journal, daily bucketing, the gate-depth sweep, the
  withdrawn comparison series, the shared `run-lock` primitive, and the W1 arm whose 0.08 turned out to
  be the harness rather than the product.
- **seal-corrupting?** **no**, and this is the honest boundary of that answer. It does not make the sealed
  bytes wrong. It does mean §2's completeness claim is a **four-of-five-lanes** claim, and any reader who
  treats the ledger as a whole-campaign census is wrong in one direction, for one lane. I would rather
  that be written down than inferred from a row count.

### PSL-36 · Five independent R-numbering namespaces, and a hold cited against the wrong one

- **owner:** unowned; B as reporter
- **finding:** `R<n>` is not a project-wide identifier. At least five live namespaces use it, and two
  collisions have already cost real time in a single night:
  - **RUN-LOCK-01 R1–R6** (B → A) — host-scope requirements. **No R7 exists.**
  - **C's soak packet R1–R3** — `ARM-EQUALITY-01` landed `991607f77`, first-paint ratification, forced-GC
    pause-probe.
  - **E's R3** — session-start soak preflight, landed `46bf8e848`.
  - **A's R7** — ephemeral-discovery gate in `m20q6-capture-reuse.test.mjs`, landed with capture-reuse.
  - **The Director's instrument checklist 1–13**, where **#7 is COV-01 coverage calibration**.
  - Plus historical `B-R1..B-R9`, `R-W22 R1–R4` and `M21-2 R6/R7` in the journal.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** the soak was held "under R5" at 00:47+01:00. **R5 in the only R-series addressed to a lane
  is "document the asymmetry where the flags are defined"**, about `--no-host-lock`. The citable basis was
  C's `RATE-FLOOR-01` at `305497bf5`. Separately, "R7's machine-coverage backfill" has three candidate
  referents across three namespaces and remains unresolved.
- **post-soak action:** namespace the identifiers — `RUNLOCK-R5`, `SOAK-R1`, `CHECKLIST-07` — or accept
  that every `R<n>` citation needs its document named beside it. **Two of tonight's confusions were mine
  and one was the Director's**, which is the argument that this is the notation and not the reader.
- **seal-corrupting?** **no.** Naming. It does mean a hold, a requirement and a due-today checklist item
  can share a label, and that a reader who resolves the wrong one investigates the wrong thing.

### PSL-37 · The suspect census reads prose only, so code-named suspects are invisible

- **owner:** B
- **finding:** `suspect-ledger-census.mjs` builds its population from `docs/plan3` markdown — the ticket
  ledger, the suspect-ledger sections and a curated control list. **Nothing named only in a script
  header, a comment or a gate name can enter the population.** "The unlit dark rooms" was published as
  unlocatable and lives at `scripts/n1-heavy-vs-fresh.mjs:5`.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** §0g of the suspect ledger; census population definition in the instrument.
- **post-soak action:** extend the corpus to script headers and gate names, or state the scope limit in
  the census output itself so a floor is never read as a ceiling. **The output currently does not say
  which corpus it searched**, which is what let a scope limit be published as an absence.
- **seal-corrupting?** **no**, and worth being precise about why: it cannot make a stated row wrong. It can
  only hide a row that should have existed, which is a floor problem, and §0 already says the number is a
  floor. This makes the floor's *shape* explicit rather than the count larger.

### PSL-38 · CENSUS-TREE-01 — the gate census executed inside the tree it was auditing

**Written by A at 11:18+01:00 / 2026-08-04T10:18Z on the Director's ruling. This row is a rule, not a
proposal, and the rule is enforced by the instrument rather than by whoever runs it.**

> **CENSUS-TREE-01, hard.** The gate-depth audit never executes against the working tree again.
> `--scan-only` (read-only, any tree) or `--tree=<scratch copy outside the repo>`. Nothing else runs.

- **owner:** A
- **finding:** `gate-root-depth-audit.mjs --all-gates` executes every gate **and every mutation suite** in
  the tree it walks, and a mutation suite killed mid-run leaves its mutant in the file. Stopped on
  instruction at 23:47+01:00 on 03-08, it left **five product mutations**: the scalar clone removed at
  `chart.js:4191` so the incremental copy aliased its source, `_evictBehindPlayheadDisabled()` negated in
  **both** `replay-system.js` mirrors (playhead eviction off by default), a deleted `_m20J1PumpThumbs()`
  call in **both** `order-manager.js` mirrors, and B-W18's entire `parse_guard_enabled` rollback lever
  removed from `api_server.py`. It also rewrote **sixteen evidence artifacts belonging to other lanes**,
  one of which flipped `tests/evidence/session-calendar-red/m22-session-calendar-fixed.json` from
  `verdict: GREEN` to `RED`. **An instrument that rewrites the evidence of the lanes it audits can turn a
  healthy product into a red record with nobody watching**, and it does so at the exact moment everyone
  is reading records rather than the product.
- **state:** `FIX_COMMITTED_NOT_SHIPPED` — the refusal is in the instrument; the census it guards has
  still never completed, so the never-run gate population remains unmeasured.
- **evidence:** four refusals live and exercised — `WORKING_TREE_EXECUTION_REFUSED` (executing mode with
  no `--tree`), `SCRATCH_TREE_IS_INSIDE_THE_WORKING_TREE`, `SCRATCH_TREE_ABSENT`,
  `SCRATCH_TREE_NOT_A_CHECKOUT` (a `--tree` with no `scripts/`, which would census an empty population
  and report it clean). `--scan-only` verified still legal against the working tree; a scratch tree
  outside the repo verified executing there, with the artifact still landing in the real repo and
  `report.subject` naming which tree the population came from. Damage restored and disclosed on
  `BOARD-A.md` at 00:55+01:00 in `7d6161861`.
- **post-soak action:** run the census **once**, against a scratch copy, off a shared box, and publish the
  never-run gate count. The guard makes that safe; it does not make it done. **The refusal has no
  documented bypass and should not acquire one** — `INDEX-SCOPE-01` printing `INDEX_SCOPE_OFF=1` in its own
  refusal message (PSL-34) is the lesson, and this instrument's failure mode is worse than a mislabelled
  commit.
- **seal-corrupting?** **no**, and this needs stating precisely rather than briefly. The five mutations and
  the sixteen artifacts are all restored to HEAD, product source is clean, and every mirror pair is
  byte-identical — verified before the b126 work continued. But it was *nearly* seal-corrupting in the
  worst available way: had the flipped verdict not been noticed, the seal would have carried a RED record
  against a healthy gate, and the lane that owned it would have spent the morning of the PO's
  verification pass debugging an artifact my instrument wrote.

### PSL-39 · A mirrored gate with a fixed-depth root writes its evidence into `homepage/`, and exits green

- **owner:** the gates' owners (D by artifact name); A as reporter
- **finding:** `resolve(__dirname, '../../..')` from `homepage/public/chart/modules/` lands on `homepage/`,
  and three mirrored pairs still carry it: `excursion-single-owner-v1-conf02-bytes.test.mjs`,
  `m19-d-marker-delta.green.test.mjs`, `m19-e-hotpath-log.green.test.mjs`. **This is worse than the read
  case B found, not the same case.** A reading gate dies on ENOENT and shows up as a red. A *writing* gate
  calls `mkdirSync(dirname(p), { recursive: true })` first — so it creates `homepage/docs/plan3/`, writes
  its artifact there, asserts against what it just wrote, and **exits green**. The evidence exists, in a
  tree nobody reads, and the gate reports success.
- **state:** `MEASURED_NOT_FIXED` — the gate sweep is frozen, so this is recorded rather than repaired.
- **evidence:** observed live during the census window. The canonical copies were written to
  `docs/plan3/EXCURSION-...json` and `docs/plan3/evidence/L2-M19-{D,E}-unit.json` between 23:39+01:00 and
  23:40+01:00 on 03-08; the mirror copies appeared at `homepage/docs/plan3/...` between 23:41:18+01:00 and
  23:41:27+01:00, one minute later, same content, wrong root. Four stray files, now removed; the canonical copies are untouched at
  HEAD. Population still standing per a `--scan-only` pass at 11:09+01:00: **90 gates anchor by fixed
  relative depth, 26 of them in a mirrored tree, 25 present in both locations.**
- **post-soak action:** fold into the gate-depth fix pass — root-walk these three pairs, then re-run each
  in **both** locations and diff the artifact paths, because the failure is invisible in the verdict and
  visible only in where the file landed. Worth a general check while there: **any gate that writes under a
  root it computed by counting directories.**
- **seal-corrupting?** **no.** No sealed byte depends on where a gate filed its artifact. It does mean any
  "the gate produced its evidence" claim is a claim about *a* file rather than the file a reader will open,
  and that a green from a mirrored writing gate has never proven which tree it wrote to.

### PSL-38 · ORDER01B-SUBBAR-STEP-RATE — 1s step delivers 0.08 instead of 10

**Alias: `POST-SOAK-LEDGER-D-006`.**

- **owner:** D for Package 2 triage; product owner TBD after mechanism attribution
- **finding:** The product genuinely delivers **0.08 market-s/wall-s** at speed **10** with explicit
  step **1s** on the sealed 1-minute chart path, where the requested rate is **10 market-s/wall-s**.
  That is **125x slow**. The harness refusal added on 2026-08-04T09:34Z protects future W1/soak
  measurements by keeping them inside the shipped native-bar envelope, but it does **not** fix this
  product defect and must never be read as doing so.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** A's canary-as-written readings: **0.07** yesterday and **0.08** last night, both through
  the old default `--step=1`; D's governed-rate proof at the shipped envelope read **601.65, 601.65,
  603.64, 602.64 market-s/wall-s**. Harness guard now refuses explicit steps below **60s** in
  `scripts/lib/heap-cycle-po-workload.mjs`, and the queued wrapper default moved from `--step=1` to
  `--step=60` in `scripts/order01b-readback-canary-run.mjs`.
- **post-soak action:** Package 2 rows 2.1-2.3 should reproduce and attribute the generated intra-bar
  path. First split the failure into scheduler/governor cadence versus slow tick work, then name the
  owning panel/call if the tick itself is slow. Do not remove the harness refusal until the product
  path has a red-capable gate and a shipped fix.
- **seal-corrupting?** **no.** W1 is satisfied at the configuration actually shipped and measured in
  the envelope. This row preserves the out-of-envelope product defect so the refusal cannot hide it.

### PSL-40 · The commit-msg hook and git disagree about what a trailer is

> **Renumbered from PSL-38 at 11:0x+01:00.** D claimed PSL-38 for `ORDER01B-SUBBAR-STEP-RATE` at
> 10:41+01:00 and I appended a second PSL-38 afterwards, so D's earlier claim stands and mine moves.
> Two findings under one number, in the ledger whose entire discipline is one state per item — and my
> own instrument could not see it, because `suspect-ledger-census.mjs` checks that a **cited** seat
> exists and never checks that a seat number is **unique**. It reported 36 of 36 seats present while two
> of them were the same integer.

- **owner:** B
- **finding:** The hook matches `^Manager:` on **any** line of the message. Git only recognises a
  trailer in the message's **final paragraph**. The two therefore disagree on real inputs, and the
  disagreement is silent in the direction that loses attribution: a message consisting solely of
  `Manager: B` satisfies the hook -- it sees its own trailer and appends nothing -- while
  `git log --format='%(trailers:key=Manager)'` returns **empty**. The commit lands unattributed and
  nothing reports it.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** cell *"a message that is ONLY a trailer line has no git trailer at all"* in
  `scripts/tests/commit-msg-hook.test.mjs`, added at `fc9894d13`. Found by the suite failing during
  the BOM-01 fix, not by review.
- **post-soak action:** make the hook assert what **git** will parse rather than what `sed` can find --
  verify with `git interpret-trailers --parse` after writing, and refuse if the trailer it just
  guaranteed is not the trailer git reports. **The hook currently proves the text is present, not that
  the field is readable**, which is the presence-versus-binding distinction it was built to enforce on
  everyone else.
- **seal-corrupting?** **no.** Attribution metadata on future commits.

### PSL-39 · 41 commit subjects carry a UTF-8 BOM

- **owner:** unowned; B as reporter
- **finding:** 41 of the last 400 commits have a subject beginning with U+FEFF, from PowerShell's
  `Set-Content -Encoding utf8` writing message files. The cause is closed for future commits at
  `fc9894d13`; the 41 existing subjects are unchanged.
- **state:** `MEASURED_NOT_FIXED` -- deliberately, since fixing it means rewriting history
- **evidence:** census over `git log -400`; 3 of the 41 are post-hook and **all 3 are correctly
  attributed**, and **no commit in the repo carries conflicting attribution**. The vulnerability was live
  and unexercised.
- **post-soak action:** leave them. Rewriting 41 commit objects to clean a leading invisible character
  would break every SHA cited across the plan3 corpus, and this file is full of such citations. **Decide
  instead whether any tool matches on a subject prefix** -- the `board(B):` convention is one -- because
  a BOM ahead of an anchored match is the failure mode that would already be silent.
- **seal-corrupting?** **no.** Subject-line bytes. It does not touch a tree, a blob or a build.

### PSL-41 · "this artifact is reproducible from HEAD" is checked against build inputs, not the instrument

- **owner:** whoever owns `run-provenance.mjs` / `clean-build-tree-guard.mjs`; B as reporter
- **finding:** `order01b-readback-canary.mjs` printed **`HEAD 1bd5df0bd / tree clean`** and
  **`PASS the tree was clean, so this artifact is reproducible from HEAD`** during B's step-60 run, while
  **24 tracked files differed from HEAD — including the canary itself and `scripts/lib/canary-realm-probes.mjs`,
  the module the run drove.**
- **why it is not simply a false green:** `run-provenance.mjs` deliberately reuses **CLEAN-TREE-01's**
  definition of a build input, so the scope is *the files that produce the shipped bytes*. On that
  question the PASS is **correct and valuable**: the served bundle was traceable, build id matched page
  and disk, ORDER-01B markers were present.
- **the defect is the sentence, not the scope.** *"Reproducible from HEAD"* is a claim about the **artifact**,
  and an artifact is a product of the instrument as much as of the bytes. An instrument 24 files off HEAD
  cannot be re-run from HEAD to the same result. Two different questions share one PASS line, and the
  stronger-sounding one is the unchecked one.
- **state:** `MEASURED_NOT_FIXED`
- **evidence:** B's step-60 run at 11:0x+01:00; `git status --porcelain` at the same minute listing 24
  modified tracked paths including both instrument files.
- **post-soak action:** say what was checked — *"build inputs clean; instrument not checked"* — or extend
  the check to the instrument's own path set and let it report `INSTRUMENT_DIRTY` separately. **This
  matters because INSTRUMENT-01 exists for precisely this**: results are not citable until the instrument
  is committed, and the check that appears to enforce it is scoped to something else.
- **seal-corrupting?** **no.** It does not touch the sealed bytes, and its product-side claim is sound.
  It does mean any artifact from this family carries a reproducibility claim it has not earned, and B's
  own step-60 numbers are among them — **cited above as investigative, not as seal evidence.**
