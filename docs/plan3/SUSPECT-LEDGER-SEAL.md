# Suspect Ledger — seal publication draft

**Owner: Manager B (integration). Updated: 2026-08-03 09:32+01:00.**
**Rule: nothing OPEN rides into the soak without the PO's signature on that row.**
**Vocabulary: `KILLED` = fix Present/Bound/Mirrored/Discriminating (PROC-3 GREEN). `CLEARED` = withdrawn / not guilty / cannot-apply with reason. `OPEN` = still needs work or PO eyes. `DEFERRED` = real, understood, and deliberately NOT fixed before this seal — requires a PO signature and a written revisit condition, and is never a synonym for CLEARED.**

> `DEFERRED` was added to this vocabulary at 23:40+01:00 on the PO's instruction to publish a deferral here. It is recorded rather than assumed because the previous three-word vocabulary had no way to say "we know, and we are shipping anyway on purpose": such a row could only be filed as CLEARED, which is a lie, or OPEN, which reads as unfinished work. Both bury it.

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
| ~16.6 MB/closed-trade resident (decoded-image family) | **CLEARED** | Director 09:15 §0.1 — coefficient fails matched-bars test; bar-driven growth wearing a trade label |
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

| ID | Status | Note |
| --- | --- | --- |
| TAL-01696 | **OPEN** | PO signature packet: `docs/plan3/LEDGER-CLOSEOUT-PACK-20260803.md` |
| TAL-01698 | **OPEN** | PO signature packet: `docs/plan3/LEDGER-CLOSEOUT-PACK-20260803.md` |
| TAL-01617 | **CLEARED** | `PO-SIGNED: PO 2026-08-03` — cleared on PO's word |
| TAL-01865 | **OPEN** | owner-blocked on A (symbol persist) |
| M17-DI2 / TAL-01918 | **OPEN** | blocked-on-build in ticket ledger; product guard restored on train tip — needs stamp confirmation |
| Rayan #8 | **OPEN** | PO signature packet: `docs/plan3/LEDGER-CLOSEOUT-PACK-20260803.md` |
| TAL-01941 | **CLEARED** | `PO-SIGNED: PO 2026-08-03` — cleared on PO's word |

> Deployed-build Script rows that are "open until Script N on stamp" are **not** listed as product defects once the fix is KILLED above; they are **verification debt** against the final tip. They still need a green Script run or an explicit PO waiver before soak fire.

---

## 4b · Deferred by ruling — known, understood, deliberately not fixed before this seal

These are **not** CLEARED and **not** unfinished work. Each is a defect or hazard we can describe precisely and have chosen, on the record, not to touch before the seal. Every row carries a signature and a revisit condition, so it cannot decay into folklore.

| ID | Owner | Status | PO signature | Revisit condition | Evidence it is latent, not live |
| --- | --- | --- | --- | --- | --- |
| `SHELLPLAY-SIBLINGS-BIND-SHAPE` | B | **DEFERRED** | `PO-SIGNED: PO 2026-08-02T22:34Z` — *"leave the nine wrappers … that is the right risk call"* | The day anything replaces the host `ReplaySystem` **in place**, or a twelfth wrapper is added to `MultichartGrid.jsx`. Then it becomes live and wants one mechanical pass with a gate. | Eleven wrappers capture their original as `patchedRs.<m>.bind(patchedRs)`, freezing the receiver at patch time. Can only bite if the instance is replaced while they stay installed; A's b124 artifact records `patchState.sameReplaySystem: true`. Receiver divergence was separately disproved as the `SHELL-PLAY-01` mechanism. |

> **`TAL-01865-VIEWPORT-CONSUMER` was withdrawn from this section on 2026-08-03 and is now KILLED.** It was deferred at 23:27Z on the reasoning that the seal was imminent and the fix touched the engine on seal night. `b125` turned out not to be the seal build, so the premise expired; the PO reopened it in daylight and it landed at `823e32cec`. Kept visible here rather than deleted, because a deferral that vanishes without trace teaches the next reader that 4b is where things go to be forgotten. The kill is recorded below.

> Count note: the ruling says "nine wrappers", the row says eleven. Eleven is correct — `enterReplayMode`, `exitReplayMode`, `pause`, `setSpeed`, `setPlaybackMode`, `setStepTimeframe`, `goToReplayTimestamp`, `requestStepForward`, `requestStepBackward`, `stepForward`, `stepBackward`. Nine was my miscount, carried into the ruling before I corrected it at 23:11. The decision is unaffected — it argues *more* strongly for deferring, not less.

---

## 4c · Withdrawn from deferral and closed

| ID | Owner | Status | Landed | Evidence |
| --- | --- | --- | --- | --- |
| `TAL-01865-VIEWPORT-CONSUMER` | B | **KILLED** | `823e32cec` | The chain was capture → persist → manager writes `restoreStart`/`restoreEnd` onto the panel URL → **nobody reads it**. Every link present, mirrored and green, and zoom never restored. The consumer went into `multichart-prod/sync-bridge.js`, not the engine: `setVisibleTimeRange(chart, startSec, endSec)` already takes seconds, already handles the no-overlap case, and is already exercised on every panel add by the initial-sync snap — a proven path, where a new `chart.js` viewport writer would have been a fresh one running on every boot. Restore-only by construction: boot URL only, applies at most once, abandons on first user input, bounded 25-attempt retry. Kill switch `__TALARIA_DISABLE_VIEWPORT_RESTORE_V1`. Gate `viewport-restore-consumer` **11/11** with two mutants (cut the apply; cut the kill-switch check), four anti-vacuity arms, a bars-arrive-late cell and a mirror-identity cell. **All six fields of the PO's per-panel list now restore end to end.** |

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
> uniform, and its provenance was verified green at 00:45. It died because the checkpoint image could
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
provenance was verified green at 00:45. Rewriting history under a certified build is precisely what
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
