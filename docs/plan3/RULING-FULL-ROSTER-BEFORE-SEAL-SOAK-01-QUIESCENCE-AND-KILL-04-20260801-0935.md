# Ruling — Full roster before seal, SOAK-01 quiescence, KILL-04 kill-on-sight, and the row the PO's reasoning exposed

**Director — 2026-08-01 09:35 — PO ruling on the partial-seal question, plus three new standing rules**

The PO was offered a partial seal (memory rows plus the three lag rows, hygiene rows riding the next seal)
and **declined it.** The full roster executes before anything seals. The reasoning given is the operative
part and is quoted, because it changes more than the schedule:

> "we have a lot of fixes that were never implemented, or partially implemented, or suspects that killing
> them is far more time efficient than confirming they are actual monster … all convicted and partially
> convicted, or suspects must be killed so our roster does not grow more, and to be able to do a proper soak
> on a proper build that we actually know what it contains"

My partial-seal recommendation is withdrawn. It optimised for one overnight window and would have produced
the exact artefact this project has produced four times already: a measurement of a build nobody can fully
describe, followed by a week of arguing what was in it.

---

## 1 · PROC-3 — the row the PO's first clause names, which was not on my roster

"Fixes that were never implemented, or partially implemented" is not a complaint. It is a defect class with
a documented history in this project, and I did not give it a roster row:

- **A's `_resolveTradeJournalAttribution`** — implemented, committed, never wired. Present in `chart.js`,
  called from nowhere. Caught by a human reading code, not by any gate.
- **D's M8 hydration guard** — landed in `chart v 1.4/chart/chart.js`, absent from
  `homepage/public/chart/chart.js`. The live mirror was unprotected while the ticket read GREEN.
- **The overlay kill-switch** — shipped, documented, and guarding one of four call sites. Inert.
- **E's first trade-attribution oracle** — passed against a model of the code rather than the code, so it
  would have gone green whatever A shipped.

Four instances, four different shapes, one common property: **the gate confirmed the fix existed, never that
it ran.** A roster whose rows are verified by presence rather than binding will report a clean wave and soak
a build that still contains the defects.

**PROC-3 — the unwired-fix sweep. Owner: E. This is a seal precondition, not a nice-to-have.**

Every fix declared in the last ten days, and every row on this roster, is verified on four axes:

1. **Present** — the code exists on the train tip.
2. **Bound** — something calls it on the live path. A static reference is not a call.
3. **Mirrored** — both `chart v 1.4/...` and `homepage/public/chart/...` are byte-identical for the changed
   region, or the difference is declared and justified.
4. **Discriminating** — the gate goes RED on known-defective input. A gate that passes with the fix reverted
   is vacuous and its row does not count as killed.

E already owns BIND-01 and PROC-2 (the presence-vs-binding check). PROC-3 is that check applied to the whole
backlog rather than to one function. Any row failing an axis goes back to its owner **inside this wave**.

---

## 2 · KILL-04 — kill on sight, with the two boundaries that keep it from being reckless

**Standing rule.** Where a fix is cheap, reversible, and switch-guarded, **ship it without first proving the
defect is real.** Do not spend an instrument-pass establishing guilt when the bullet costs less than the
trial. The switch is the measurement, deferred: the post-soak attribution pass flips each switch one at a
time and prices what it bought. A suspect that is cheaper to kill than to convict gets killed.

This retires the standing "one instrument-pass per suspect" requirement for the cheap-and-reversible class.
It does not retire it for anything else.

**Two boundaries, and they are not negotiable:**

- **The money path.** Nothing touching trades, orders, the ledger, or the journal is killed on sight. Oracle
  green in both regimes, review by another manager, wrong-instrument trade gate RED-armed throughout. LAG-1a
  and LIFE-4 are inside this boundary. Performance rats die freely; near the treasure chest the wave walks.
- **Removals.** Deleting or dedeuplicating anything requires the consumer audit first — one line naming who
  read the thing being removed. The characteristic failure of aggressive teardown is removing something
  quietly load-bearing, and MEM-1d (the 14-copies dedupe) is precisely that shape. Adding a bound is
  kill-on-sight. Removing a copy is not.

**Applied to the investigation queue immediately.** Three items convert from investigations to kills:

| Was | Now |
|---|---|
| Source-map-in-bundle check → "one look" | **Kill.** If maps are in the bundle, strip them. Cheap, reversible, no measurement earns anything. |
| Documents enumeration (13 vs 18) → "one URL diff" | **Folded into LIFE-1.** Nondeterministic document count is a teardown defect; deterministic teardown is the fix either way. |
| Engine census → gate on ghost-hunt work | **Demoted to verification.** `Chart.destroy()`, worker termination and the registry ship regardless of what the count says. The census then confirms the count returns to baseline and becomes the permanent R3 gate. |

Three survive as genuine investigations because there is no target to shoot without them: the zero-trade lag
trace (LAG-ZT names regime 2's function), the heap-diff per-bar category (refines MEM-1, does not gate it),
and the heavy-vs-fresh account baseline (twenty minutes, decides TAL-01891 and its cohort).

---

## 3 · SOAK-01 — readiness declaration and quiescence

The PO will keep every manager working and nudged until the Director names the moment each must stop. So
stopping is now a declared state with conditions, not an inference from silence.

**A manager declares SOAK-READY only when all six hold:**

1. Every roster row it owns is committed and merged into B's train.
2. Every switch it introduced is named per the reservation table, with its default state declared.
3. Its gates are green **and discriminating** — proven RED with the fix reverted.
4. Its worktree is clean. TREE-01: uncommitted work is invisible to every gate.
5. It holds nothing in flight that writes to a product file.
6. It has passed PROC-3 on its own rows.

On declaring SOAK-READY the manager goes idle and **stays** idle. The PO stops nudging that manager and
keeps nudging the rest.

**Quiescence during the soak — absolute.** When C fires, every other manager is stopped. No commits, no
deploys, no gate runs, no browser work on C's host. **B may not cut a build**: the harness re-verifies the
served digest on every sample and will void the run and stop rather than produce a series across two builds.
A ten-hour run is destroyed by one careless rebuild, and this has already cost us two runs.

**The Director names each stop.** No manager stops because it ran out of obvious work.

---

## 4 · The order of operations, and the honest date

The seal now waits on the whole roster, and the roster's critical path is A: **nine rows plus the census
registry, in a single-writer file.** Cut across parallel worktrees that is still the longest lane by a wide
margin.

| Stage | Gate |
|---|---|
| Wave executes | all 17 rows land and merge |
| PROC-3 sweep | E verifies present / bound / mirrored / discriminating on every row |
| PROC-1 sweep | C's 417 files and the Director's 125 cleared; no dirty worktrees anywhere |
| Harness fix | the sealed soak samples memory (see §5) |
| Five SOAK-READY declarations | all six conditions each |
| B cuts and deploys, passport carries badge + digest | one build, fully described |
| Quiescence | every manager stopped, Director-named |
| C fires the two-arm soak, pinned to that digest | 10 h trade arm, short zero-trade arm |

**Honest forecast: seal Sunday, soak Sunday evening, results Monday morning.** Not tonight. That is the
direct and accepted cost of the PO's ruling, and it buys a soak whose build we can fully describe — which no
soak in this project has yet had.

---

## 5 · Harness defect found before it could cost a night

`scripts/sealed-two-arm-soak.mjs`, as committed at 03:14, **never samples memory.** The per-sample append
writes `residentBars`, `perPanelBars`, `panelsLive`, `panelsLiveByBarCountOnly`, `closedTrades` and the seal
digest. There is no footprint reading and no heap reading, and `detach01.mjs` adds none.
`footprintTotalMB` — the gauge behind every memory number we have published — appears in eleven other
scripts in that directory and not in this one.

Run as committed, the harness would have produced ten hours of detached, fsync'd, crash-proof,
digest-verified **bar counts**, and no memory data at all. C fixes it before the run: per-process footprint
on the same gauge as the 2,747.6 / 2,709.3 MB comparison, the renderer split beside it, and blocking ms/s at
the same cadence so the lag scorecard gets its before/after on one host.

The harness's survival engineering is excellent and every part of it was paid for by a run that died last
night. The dependent variable was the one thing missing.
