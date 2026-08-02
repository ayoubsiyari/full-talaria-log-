# Suspect Ledger — seal publication draft

**Owner: Manager B (integration). Updated: 2026-08-02 23:39+01:00.**
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

## 4 · Ticket / canary order rows still OPEN — need PO signature or closeout before seal

Pulled from `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` and `docs/plan3/CANARY-LEDGER-20260730.md`. Anything still `po-eyes` / `open` / `owner-blocked` / `blocked-on-build` is **OPEN** here until closed or PO-signed into the soak.

| ID | Status | Note |
| --- | --- | --- |
| TAL-01696 | **OPEN** | po-eyes — order-line leftover cluster |
| TAL-01698 | **OPEN** | po-eyes — order-line leftover |
| TAL-01617 | **OPEN** | po-eyes — order-line leftover |
| TAL-01865 | **OPEN** | owner-blocked on A (symbol persist) |
| M17-DI2 / TAL-01918 | **OPEN** | blocked-on-build in ticket ledger; product guard restored on train tip — needs stamp confirmation |
| Rayan #8 | **OPEN** | NEEDS-INFO — no reproducible steps |
| TAL-01941 | **OPEN** | NEEDS-INFO — instrumentation/repro only |

> Deployed-build Script rows that are "open until Script N on stamp" are **not** listed as product defects once the fix is KILLED above; they are **verification debt** against the final tip. They still need a green Script run or an explicit PO waiver before soak fire.

---

## 4b · Deferred by ruling — known, understood, deliberately not fixed before this seal

These are **not** CLEARED and **not** unfinished work. Each is a defect or hazard we can describe precisely and have chosen, on the record, not to touch before the seal. Every row carries a signature and a revisit condition, so it cannot decay into folklore.

| ID | Owner | Status | PO signature | Revisit condition | Evidence it is latent, not live |
| --- | --- | --- | --- | --- | --- |
| `SHELLPLAY-SIBLINGS-BIND-SHAPE` | B | **DEFERRED** | `PO-SIGNED: PO 2026-08-02T22:34Z` — *"leave the nine wrappers … that is the right risk call"* | The day anything replaces the host `ReplaySystem` **in place**, or a twelfth wrapper is added to `MultichartGrid.jsx`. Then it becomes live and wants one mechanical pass with a gate. | Eleven wrappers capture their original as `patchedRs.<m>.bind(patchedRs)`, freezing the receiver at patch time. Can only bite if the instance is replaced while they stay installed; A's b124 artifact records `patchState.sameReplaySystem: true`. Receiver divergence was separately disproved as the `SHELL-PLAY-01` mechanism. |

> Count note: the ruling says "nine wrappers", the row says eleven. Eleven is correct — `enterReplayMode`, `exitReplayMode`, `pause`, `setSpeed`, `setPlaybackMode`, `setStepTimeframe`, `goToReplayTimestamp`, `requestStepForward`, `requestStepBackward`, `stepForward`, `stepBackward`. Nine was my miscount, carried into the ruling before I corrected it at 23:11. The decision is unaffected — it argues *more* strongly for deferring, not less.

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
| `20260802b125` | **NEXT CUT** | Clean tree, explicit `BUILD_ID`, under `CLEAN-TREE-01`. C times it. This build is what unblocks A's canary run and B's `SHELL-PLAY-01` discriminator. Verify with `npm run rebuild-constraint:provenance` after stamping. |

> b124 is retired as an *identity*, not as work: the source rows compiled into it are committed and will recompile into b125. Nothing in `scripts/` or `package.json` pins b124, so retiring it costs no tooling changes — checked, not assumed.
