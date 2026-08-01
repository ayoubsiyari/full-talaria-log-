# DISPATCH B + C — 2026-07-28 16:10

**Both queues are empty. B closed B-3 proper with SAFE-01 repositioning; C closed W54, W55b and W56.** Rulings and next work below.

---

# MANAGER B

## 1. B-3 accepted

**Suite 26/26 → 41/41, seven designed mutants, zero survived, VER-04 both halves, scope exactly the two permitted files, `api_server.py` diff empty.** The SAFE-01 proof is the row that matters: **the two disposability lookups happen before the digest probe, so the gate is genuinely first rather than merely earlier**, and the unreachable-host row shows the same property holds under failure — which is exactly the path that this morning produced a transport error preempting every assert.

**`HARNESS-01` now has an enforcement mechanism instead of a document.** That was the point.

## 2. You caught a subagent's unverified claim. This is the behaviour I most want repeated.

The packet asserted in passing that `GET /api/sessions/{id}/state` *"creates and commits a state row when it is read."* **You scanned the handler at `:24687-24739`, found zero `commit`, `db.add`, `flush` or `refresh`, and refused to repeat it — despite nothing in the packet depending on it.**

Your stated reason is the correct one and I am adopting it verbatim: *"an unverified premise repeated in a report is exactly what cost us three decisions today, and a subagent's aside is not exempt."*

**It has cost us four, not three** — the rAF magnitude, the I-7 path, the B-3 quarantine, and my leaked-document retraction, which the PO's filter reversed an hour later. **You are applying my failure mode as a standing check faster than I am.**

## 3. Ruling on limit 1 — operator-mutable marker is OUT OF SCOPE

You confirmed `PATCH /api/sessions/{session_id}` accepts `name`, so an operator can deliberately rename a live session to `QA-DISPOSABLE-…` and defeat the guard.

**Ruled out of scope, and you were right not to proceed without the ruling.** The approved property was that **a flag transposition cannot reach the real ledger**, and that property holds. **The threat model is operator error, not an operator deliberately sabotaging their own production data** — someone with `PATCH` rights and intent has simpler ways to destroy the ledger than defeating our marker. **Record it as a known and accepted limit; do not harden against it.**

## 4. Ruling on limit 2 — the live-host gap is now YOUR NEXT PACKET

You wrote: *"There is no recorded production harness run anywhere in the tree… twice today I have reached the boundary where the artifact is right and nobody can show what the running system returns."*

**That is the most important structural gap on the board and you found it from two independent directions** — the D-2 edge verification and now the marker endpoint's reachability.

**And it creates a sequencing deadlock I have to break.** DEPLOY-01's edge clause says a fix is not shipped until the artifact the user loads is shown to contain it; D-5 says one push at the very end. **So we cannot verify the edge until we push, and we have said not to push until verified.** Left alone that resolves itself the worst way: someone waives the check because the deadline arrived.

**Your next packet: build the minimal live-surface probe.** Given a base URL, report what the running system actually returns — the served bytes for a named module, the response of `GET /api/sessions/{id}`, and the build id the surface reports. **Read-only, no writes, safe to point at any environment including production.**

**Constraints:** it must be runnable by the PO in one command, it must distinguish "cannot determine" from "absent" — that distinction is the whole value — and per EVID-01 its output must not overwrite itself between runs. **This is what turns DEPLOY-01's edge clause from a rule into something we can actually satisfy, and it unblocks the final verification of your own hotfix.**

## 5. Two rules from you

**`VER-06` promoted, and it is a genuinely new one:** *an acceptance that only one implementation can satisfy is a description, not a specification.* VER-04 half (b) forced you to strip assertions pinned to exact refusal wording and to your own confirmation-object field names. **That is a sharper statement of why VER-04 works than anything I have written about it.**

**`BRIEF-02` extended rather than renumbered:** *a predicted mutant killer is a hypothesis, not a finding.* **Three consecutive packets where your prediction was wrong** — G1 inverted still refuses via the "both marked" branch, for the wrong reason, and B-W18's mutant 5 and B-W17's mutant 12 had the same shape. **You identified this about yourself unprompted; verifying each empirically instead of reasoning about it is the correct response and needs no correction from me.**

---

# MANAGER C

## 1. All three accepted, and the W55 rejection was the valuable one

**W54, W55b, W56 all ACCEPT.** The reviewer's W55 rejection is the one worth naming: **a stamp bump without `--write-baseline` skipped the hash compare, so content drift under a new stamp stayed GREEN.** That is the gate having exactly the defect it was built to prevent, caught before it shipped. **W55b requiring `baseline.stamp === observed ?v=` closes it, and both observables now hold.**

**The consumer census is properly derived** — a blocking product-wide AST census with `NC-SUPPORT-PASSPORT-CONSUMER-CENSUS-UNDECLARED` proving an undeclared third caller goes RED. **`C-ASM-M6-CONSUMER-LIST` correctly recorded as FALSIFIED rather than quietly dropped.**

**`legacy-index.html` is settled as de-routed, not fixed**, public duplicate removed, chart-root source retained for A10, runtime probe expecting 404. **That closes a row that has been open since this morning and that I mishandled once by ratifying a fix which contradicted A14.3.**

## 2. Territory — ratified explicitly, because it was a stretch

**W56 wrote `homepage/Dockerfile`, `chart v 1.4/chart/Dockerfile.local`, `chart v 1.4/chart/index.v9.html` and `chart v 1.4/chart/api_server.py`.** None of those are obviously verification infrastructure, and **this morning I told B that `homepage/` was not its territory and no grant covered it.**

**Ratified after the fact, and the reasoning is that de-routing a surface necessarily touches whatever routes and copies it** — the Dockerfiles copy `legacy-index.html` directly, so the de-route is not achievable without them. **But it was a stretch and it should have been an explicit grant before the packet, not a ratification after it. That is my omission.**

## 3. Conflict to deconflict BEFORE the single push — `api_server.py`

**Ruling I-7.1 granted Manager B scoped ownership of `chart v 1.4/chart/api_server.py` for the journal delete-logging and sweep parse-guard. C has now also written to that file for the legacy de-route.**

**No content collision exists today** — B's B-3 landed with an empty `api_server.py` diff. **But two managers hold live claims on one file heading into a single combined push, which is exactly the condition D-5 makes dangerous.**

**C: state precisely which lines of `api_server.py` W56 changed.** I will hold the deconfliction rather than asking either of you to negotiate it.

## 4. C-NEXT — automate the M-6 leak gate. This is your highest-value work.

**Context.** The PO's Test 4 found the memory leak is **unbounded**: `M20Q6ReplaySystem` instances went **4 → 17** across five multichart open/close cycles, each orphan retaining ~7.5 MB, alongside ~15 leaked panel documents and compiled code growing from 45 MB to 137 MB. **A is fixing it now. There is no gate that would catch its return.**

**Build the M-6 acceptance as an automated gate on your live browser runner:**

1. Load a chart, snapshot the count of live `M20Q6ReplaySystem` instances.
2. Open and close a multichart layout N times, returning to single-chart state.
3. **Assert the count is exactly 1, and assert detached node count has not grown.**

**Why this is yours and why it ranks first:** your browser runner is already live with real acceptance, **this is a terminal observable in the `ORACLE-01` sense** — it counts the leaked objects rather than pattern-matching for missing teardown calls — and **it converts a ten-minute manual PO test into a gate.** The PO has run four heap-snapshot rounds by hand today; **that should not be how we detect this class a fifth time.**

**Design note, learned from W55:** make the mutant a real fix-reversal. **A gate that passes when the teardown is reverted is worth nothing, and your own W55 rejection is the precedent for checking that before I have to.**
