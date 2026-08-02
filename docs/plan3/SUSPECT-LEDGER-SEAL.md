# Suspect Ledger — seal publication draft

**Owner: Manager B (integration). Updated: 2026-08-02 12:05+01:00.**
**Rule: nothing OPEN rides into the soak without the PO's signature on that row.**
**Vocabulary: `KILLED` = fix Present/Bound/Mirrored/Discriminating (PROC-3 GREEN). `CLEARED` = withdrawn / not guilty / cannot-apply with reason. `OPEN` = still needs work or PO eyes.**

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

## 5 · Seal gate on this ledger

- **Soak-legal only when** section 1 has zero OPEN, section 2 has zero OPEN (or browser cold-load waived by PO), and section 4 every OPEN row carries `PO-SIGNED: <name> <UTC>` or is moved to KILLED/CLEARED.
- Re-run PROC-3 on the **final tip** the day of the seal; paste the tip SHA and GREEN count into the board when publishing the sealed copy of this file.
- Do not invent CLEARED. A row without evidence stays OPEN.

**Current tip when this draft was written:** see `git rev-parse HEAD` at commit time.
**b122 canary (shakedown only, not the seal):** badge `20260802b122`, digest `5f0378407c214999ec822eb6a17e165e`, source `1c69bebb496f1fb3bdf4f90317dae84d1507d427`.
