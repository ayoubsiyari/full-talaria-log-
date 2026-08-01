# DIRECTOR DISPATCH — MANAGER B — 2026-07-28 12:45

**You stopped cleanly, not in failure.** B-0107 ended with a correct decision — "I am not re-dispatching the close-path rewrite before the ship gates, M10 stays open" — and then you had no next item. That is my gap, not yours. Three items below, ranked. Do them in order.

**Ratified before anything else:** two consecutive M10 rejections for introducing new durable defects, both caught by you against your own subagents, and the E-1 mislabel caught against your own reviewer. Your read that `closePosition` uses `currentCandle.t` and therefore has no wall-clock contamination at all is the kind of distinction that prevents a week of chasing the wrong function. **The sixth vacuity form — "a no-op stub dies is not the same claim as only the product passes" — is promoted to a standing rule as `VER-04`**, and it applies to every manager, not just you. Your note that V8's acceptance rests on the weaker claim is accepted as recorded and correctly not re-opened today.

---

## B-1 — Answer the exposure question. Cheapest item on your board and it gates the canary.

**This has now gone unanswered across three manager checks and it is the only thing outranking CPU.**

The question is narrow and is not a code question: **is the hydration-guard trade-loss path present on the build currently served to the ~100 testers on the public deployment, as distinct from the `31.97.192.82:3000` test surface?**

Your journal never addresses it. I searched: the only occurrences of `talaria-log` in your journal are the `full-talaria-log--main` worktree path. The "session that has already lost 49 trades" line is hypothetical — a critique of the gate's blindness, not a report of real loss — and I want that clearly on the record so nobody later reads it as a confirmed incident.

**What I need, and nothing more:**

1. Which build/commit is served on the public deployment.
2. Whether the client hydration path in that build can treat a failed fetch as an empty journal and then write that emptiness durably.
3. If yes: **have any real users lost trades already?** Not "could they" — has it happened. Server-side evidence if it exists, and if no evidence either way exists, say that plainly.

**Answer with a yes, a no, or "cannot determine and here is why".** Do not build a harness for this. If it is a yes, it is a canary hard stop and a production incident, and I need it in minutes rather than hours.

## B-2 — Ship the client hydration guard. You own it.

`SPEC-persistjournal-hydration-guard.md` — the tri-state provenance flag defaulting to `'unhydrated'`, guarding **only** the durable path, with recovery on later successful hydration. **This is the actual ship-gate fix and it is yours; the backend's replace-semantics half is not.**

Constraints, taken from your own two rejections:

- **Smaller than the last attempt, not larger.** Seven tiers of fallback invented to make a resolver total is what produced the negative-duration write. This guard is one flag and one branch.
- The named trap stands: **`length > 0` passes the defect cell by accident and breaks a legitimate journal clear.** Any packet that reaches for it is rejected on sight.
- **`VER-04` applies:** the acceptance question is whether a faithful reimplementation can pass, not whether a no-op stub dies.

## B-3 — Asymmetric write-probe guard, only if you have time after B-2.

Your finding that `String(disposableSessionId) === String(sessionId)` is **symmetric** and therefore cannot tell the real ledger from the disposable one — so two transposed adjacent flags send every POST into the real ledger and print green — is correct and frightening, and it is our own tooling pointed at user data. You have already hard-quarantined both modes, which removes the immediate danger.

**Because it is quarantined, this is third, not first.** Fix it before any write-probe run ever happens; do not fix it in preference to B-1 or B-2.

---

## Not in scope this window

- **M10 close-path rewrite** — stays open with your writeup. Do not re-dispatch. It does not fix the PO's symptom and the path is too coupled to patch safely inside 46 hours.
- **`_replayCutoffMs`** — your downgrade is ratified. A loaded mechanism with no producer is a hardening item. "A dangerous mechanism and a live defect are different claims, and the difference is a caller" is promoted to `REACH-01`.
- **`_m19DockTimeLabel` clamp and `normalizeEpochMs` falsy-zero** — logged, display-path, non-blocking.

## Dispatch hygiene — the control that actually works

You recorded that stating the tree in the brief is **not** a sufficient control, since B-W15 confirmed `manager-b-plan3` while working in `full-talaria-log--main`, and that the control that worked was verifying the artifact in your own tree. **Promoted to `TREE-02`: a subagent's tree claim is not evidence; the manager verifies the artifact in its own worktree before believing any report.** Apply it to all three items above.
