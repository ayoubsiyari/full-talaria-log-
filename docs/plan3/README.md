# Plan 3 — Bugless Product Sprint

**Start:** 2026-07-20 · **Director:** (this plan's author) · **Manager:** GPT 5.6 · **Workers:** 4 × Grok 4.5
**Goal:** a bugless product as soon as possible. Root-cause solutions only — no patches, no guards-instead-of-ownership, no symptom-silencing. Every fix must kill the mechanism, not the ticket.

## Operating context

- The product is live with ~120 external users (D-036 wave). The PO pulls their tickets every **6–12 hours**; the Director triages each pull into this plan (same discipline as plan 2's `DAILY-INTAKE.md`, but faster cadence).
- **Priority filter (PO-set):** replay · rendering · sync · UX-harmful interaction · orders (storage + placing). Tickets outside these classes go to the polish batch or backlog — they do not consume lane time this week.
- **Everything from plan 2 still binds:** `docs/tickets-overhaul/INVARIANTS.md` (I1–I16, L1–L2, P1–P6), D-033 diagnostic-first, D-034 provenance/tripwire + checkpoint identity, D-031 checkpoint cadence + I16 customer data, D-030 money-path ship-gate, D-032 flake-decouple. Plan 3 changes the tempo, not the brakes.
- **Scoreboard:** plan-3 rows feed `PLAN2-SCOREBOARD.csv` (same file, `origin=plan3`) — one progress number continues.

## Team and lanes

| Lane | Worker | Charter |
|---|---|---|
| **L1 — Rendering** | Grok 4.5 | Invalidation/paint correctness: stuck-until-interaction, flicker, partial renders, axis/grid ticks, candle paint determinism |
| **L2 — Sync + Replay** | Grok 4.5 | Multichart coupling/isolation contract, replay cadence/labels across panels |
| **L3 — Orders** | Grok 4.5 | Order line anchoring, drag-follow, multi-TP, risk model, cross-panel order store (A6-4 completion) |
| **L4 — Interaction/UX + intake absorption** | Grok 4.5 | Pointer-capture/gesture ownership, first-click, persistence, polish batch; absorbs each new intake wave |
| **L5 — Trade Lifecycle** (opened 2026-07-27) | Grok 4.5 | Replay rollback trade-state (M23) + trade registration/ledger integrity (M24): rollback must transactionally revert orders; order writes must be serialized/idempotent with unique IDs. Exclusive writer of `order-manager.js` + trade-persistence backend while active. See `INTAKE-MERGE-20260727.md` |

Manager (GPT 5.6): triage support → mechanism clustering, worker-prompt authoring, independent verification (P1), checkpoint assembly + reports to PO, escalations to Director.

**Dispatch model — CHANGED 2026-07-27 (supersedes the PO-relay model): the Manager dispatches workers directly** within the file-ownership matrix. The PO is no longer the message bus; the PO remains the human visual tester and the business decision-maker. Full policy: `DIRECTOR-RULINGS-20260727.md` §B1. Therefore:
- Every dispatch the Manager produces is still a **self-contained worker prompt**: lane, mechanism row, named files, invariants inline, expected deliverable format, and the exact evidence the worker must return. Workers have no other context — the prompt must carry everything.
- The Manager verifies worker reports (P1) and proceeds without a PO round-trip, **escalating to Director/PO only for**: money-path (D-030), cross-lane file-ownership conflicts, acceptance-criteria changes, anything I16-relevant, any packet rejected twice, and business decisions.
- The PO receives a **per-train digest** (shipped / queued / escalated), not per-message involvement.
- Anything needing **live visual confirmation is phrased as a short PO test script** (numbered steps, expected result per step, build id to confirm first per L1) — the PO is the eyes; keep each script under ~2 minutes.
- The Manager batches relays to respect the PO's time: per cycle, at most one prompt per worker + one PO test script, clearly labeled "→ Worker N" / "→ PO visual test".
- Every relay cycle starts with a **two-line board pulse**: current mechanism rows by phase, then the concrete phase movement or declared stall expected from that cycle.
- Every dispatch carries one complete **acceptance checklist** covering setup, actuation, provenance, verdict precedence, evidence, files allowed, and stop/dead-end conditions. The Manager runs a local preflight against that checklist before consuming another PO relay round-trip; requirements are not added piecemeal after submission.
- Production QA sessions/orders may be created only under dedicated QA account ids supplied by the PO. Never use admin or real-user accounts; QA records must remain excludable from I16 customer data by account id.

## The one process rule that makes this fast AND root-cause

**Fix mechanisms, not tickets.** The 36 residuals cluster into ~10 mechanisms (see `PLAN3-BOARD.md`). A lane's unit of work is a **mechanism**, and its closure closes every member ticket at once. Per mechanism:
1. **Provenance check first** (D-034): confirm the symptom reproduces on the current verified build — several residuals are recurrences of families plan 2 already fixed; if the user was on a stale surface, the row closes by retest, zero engineering.
2. **Diagnostic names the mechanism** (D-033: file:line + state matrix + blast radius) — Grok workers get tightly-scoped diagnostic prompts from the Manager; a diagnostic that comes back with "add a guard here" is bounced (I11 posture: ownership > guards).
3. **One gated fix per mechanism**, RED-first, switch-OFF discriminator, member tickets listed in the fix report.
4. **Checkpoint per D-031/D-034** (identity: SHA + build id + digests + tripwire), PO/tester re-verify closes the tickets (P5).

**Speed levers (allowed):** mechanisms on disjoint files run fully parallel across the 4 lanes; diagnostics for the next mechanism start while the previous fix is in verification; the Manager may pre-stage RED scenarios for the top mechanisms in parallel with diagnostics.
**Speed non-levers (forbidden):** skipping the RED, bundling mechanisms in one commit, accepting harness-green without the live surface, patch-over-mechanism.

**Risk-priced delivery — added 2026-07-27** (full policy: `DIRECTOR-RULINGS-20260727.md` §B3–B5). Ceremony is charged by risk, not flat rate:
- **Three change tiers.** Tier 1 fast lane (isolated, *demonstrated* kill-switch, non-money-path) keeps the provenance floor + RED→GREEN + negative controls + pinned rollback + one independent review pass, and moves PO verification to post-deploy. Tier 2 standard. Tier 3 heavy (money-path, data integrity, I16, architecture, ungated) keeps full ceremony plus pre-deploy PO eyes. Any Tier-1 fix that regresses auto-promotes its area to Tier 2 for 3 builds.
- **Two deploy trains per day**, anchored to the PO's verification windows. **Trains never wait** — a fix that misses one takes the next. Completion-gated bundles are retired as the default.
- **TEST-2** carries candidates, soaks and parked builds so TEST-1 stays the PO's stable verification surface. TEST-2 must not share a database with TEST-1.

## Intake protocol (every 6–12h)

1. PO drops the new export folder; Director diffs against the previous pull, translates unclear/Arabic/Darija bodies, extracts one row per distinct bug.
2. Each bug: **assign to an existing mechanism** (most will match — recurrences strengthen the RED set), or open a new mechanism row, or route to polish/backlog if outside the priority filter.
3. **Understanding gate (PO-set, strengthened 2026-07-21):** the Manager dispatches NOTHING to a worker before he fully understands **what the user is seeing and suffering from** — the visible symptom, the user's intent, and the expected behavior. For every ticket, before dispatch, the Manager must be able to state in one sentence: *"the user does X, sees Y, and expected Z."* If he cannot — unclear description, ambiguous symptom, untranslatable body, uninformative screenshot, or ANY doubt about what the user means — he **asks the PO first**, with the ticket number and a precise question (batched per intake: "TAL-xxxxx — what I understood / what I'm unsure about"). No guessing, no best-effort dispatch, no solving before understanding. The row sits in `NEEDS-PO-CLARIFY` until the PO confirms; it never blocks other rows in the same lane.
4. Tickets that are understood but not yet reproducible get instrumentation per D-033, never speculative fixes. Reporter follow-up questions (P5) may run in parallel once the PO has confirmed the reading.
5. Board updated; Manager re-prioritizes lanes at each intake; PO gets the delta summary (including the NEEDS-PO-CLARIFY list, if any).

## Closure durability & sticky bugs (PO-set, 2026-07-22)

Context: ticket volume is down significantly, but some bugs are **coming back on user devices** batch after batch. Two rules:

**1. Resolved means resolved once and for all.** A mechanism row may only be declared resolved when the Manager has done everything to make recurrence impossible, not just make the symptom pass today:
- The fix is a **mechanism cure with a RED that encodes the user's exact scenario** (not a neighboring one), and that RED joins the permanent regression gate — it runs on every future checkpoint forever.
- The fix's **state matrix names the recurrence surfaces** (other TFs, other symbols, multichart, replay on/off, refresh/session-re-enter, device class) and each named cell is verified, not assumed.
- **Closure requires reporter/PO re-verification on the user's own surface** (their device/URL, build id confirmed per L1/I8-R) — a fix that works on the harness and the Manager's build but not on user devices is NOT resolved.

**2. Sticky-bug protocol.** The Manager tracks recurrence across batches (same bug can also appear multiple times within one batch — that counts once; across batches is the signal). When a symptom that was CLOSED-VERIFIED (or FIX-LANDED) reappears in a later batch, the row is re-flagged **STICKY** and gets escalated treatment:
- **Recurrence triage first, in this order:** (a) **stale surface on the user's device** — old build/service-worker (the D-034 class; check the ticket's build id / ask the reporter before anything else); (b) **same symptom, different mechanism** — new row, cross-linked, the old closure stands; (c) **genuine fix failure** — the original fix is presumed wrong-mechanism (D-033 rule 5), its diagnostic reopens, and the previous "root cause" is treated as unproven.
- A STICKY row outranks new work in its lane until killed. Its kill bar is higher: the re-diagnostic must explain **why the first fix didn't hold** (which cell was missed), the new RED must encode the recurrence condition itself, and closure needs **two consecutive batches with zero recurrence** plus reporter confirmation before it may be declared dead.
- Sticky rows are listed by name in every checkpoint report to the PO until dead. Three-time recurrence escalates to the Director with the full fix history — at that point the surface itself (not the bug) is presumed mis-designed and an ownership-level redesign is on the table.
- **Canonical tracker:** `docs/plan3/STICKY-REGISTRY.md`. A recurrence with no reporter-device URL/build/SW evidence is `RECURRENCE-A-PENDING`, not yet `STICKY`; this preserves the required stale-surface-first ordering. Every checkpoint report copies the registry's current sticky-watch list, including an explicit `none` when no row has survived step (a).

## Definition of done (plan 3)

Every mechanism row CLOSED-VERIFIED (member tickets re-verified by reporters on a named checkpoint) · priority-class intake pulls trending to zero new mechanisms (only recurrences/polish) · no open P1 in replay/rendering/sync/orders · scoreboard number reflecting it.
