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
