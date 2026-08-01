# DIRECTOR DISPATCH — MANAGERS B & C — 2026-07-28 14:25

---

# TO MANAGER B — the hotfix train is COMPLETE. Ship it.

**You stopped because you finished, for the second time today.** All three halves are done and committed:

- **B-1** exposure answer: YES on the public build, with the mechanism traced end to end.
- **B-2** client hydration guard: green, admit-list, session-bound, cell 7b + mutant 9.
- **B-W17** backend parse-guard + delete logging: **12/0**, inside the I-7.1 scope.

**That is the whole of PO decision D-2.** Nothing further is owed on the fix itself, and B-3 stays third.

## B-4 — Assemble and ship the standalone hotfix train

**This is now the highest-value action on the entire board.** It is the only item that stops live user data loss, and it has been sitting complete in your tree.

**DEPLOY-01 applies and this train is where it starts being enforced.** You established this morning that we **cannot name what is live** — no manifest, no build-id record, no release tag. **This train does not ship without a recorded build id and commit SHA**, because the first question anyone asks in two weeks is "was my session on a fixed build," and today we cannot answer that question for the *defect*. We will not repeat it for the fix.

Required in the train:

1. **Build id and commit SHA recorded durably**, in the artifact and in the journal.
2. **Kill-switch** per standing policy, defaulting to guard-on.
3. **EVID-01 compliance on your own evidence** — you found that `m19-d-marker-delta.green.test.mjs` re-pins its own evidence file on every run. **Do not let this train's evidence be written by anything a later run can overwrite.** Pin it once, immutably.
4. **A one-page deploy note** stating exactly what changed, what the kill-switch is, and what the PO should verify.

## B-5 — Name the PO's verification steps

The PO must confirm the fix on the deployed build, and **you are the only one who knows what to look for.** Give me a short numbered check — not the full M4 runbook. Include the STOP condition you wrote this morning verbatim, because it remains the operationally important sentence: **if the journal looks empty or short, stop and do not place, close, or reload.**

**Note for the note:** the PO has been asked five times to send the tester export notice and it has not gone out. **Assume some testers are still on the defective build when your fix lands**, and write the verification steps so they are safe to run in that state.

---

# TO MANAGER C — stop. You are eight rejections into a game you cannot win.

**`R-M6-3` through `R-M6-10`: eight consecutive REJECTs in ninety minutes, every one attributed `author-defect`, every one closed by adding one more syntactic pattern to the freeze detector.**

The sequence, in your own words: element access → `Object.assign` → `splice` → bare `typeof indexedDB` → bare `sessionStorage` bypassing the window Proxy → helper indirection → concise-body arrow helpers → in-component helpers invisible to a module-scope walk → `Object.assign` inside helpers.

**Each rejection is correct. The approach is not.** You are trying to prove statically that no consumer mutates the passport context, and **JavaScript has unbounded ways to express a mutation.** There is no version of that AST walk that terminates. W51 will find another pattern, and so will W52. **This is precisely the bug-fixing loop this entire programme exists to break, and it has reproduced inside our own verification layer.**

**Your fail-closed withholding of the M6 ship gate throughout is correct and is not in question.** You did not soft-pass under deadline pressure across eight rejections, which is the behaviour I want. The problem is the target, not your rigour.

## C-4 — Change the mechanism: enforce at runtime, do not detect statically

**Make mutation impossible rather than detectable.** `Object.freeze()` the passport context — deep-freeze it — so that a mutating consumer **fails at runtime** instead of needing to be found by inspection.

The gate then collapses from an unbounded static analysis to a small bounded behavioural one:

1. A cell that **attempts** a mutation through each shape you have already enumerated across W43–W50 — you have the corpus, it becomes the test input rather than the detector's specification — and asserts each one **fails or is a no-op**.
2. A cell asserting the context is frozen at the point of publication.
3. A mutant that removes the freeze and **dies** on cell 1.

**This inverts the burden.** Today, an unenumerated mutation pattern silently passes your gate. After the change, an unenumerated pattern **breaks loudly at runtime**, which is the correct failure direction for a support-diagnostics surface. **Your eight rejections were not wasted — they are the test corpus.**

**Two hazards to state in the brief rather than discover in review**, and I expect you to check both before dispatching:

- **`Object.freeze` is shallow.** Nested objects and arrays inside the passport need recursive freezing, or `degradedModules[]` stays mutable — which is the one field M6 exists to deliver.
- **Freezing may break a legitimate writer.** If any producer legitimately populates the passport after publication, freezing at publication starves it — the same starvation class A hit with `renderPending`. **Enumerate the writers before freezing**, and if a legitimate late writer exists, freeze after it rather than abandoning the approach.

**If you judge runtime freezing unworkable for a reason I cannot see, say so and tell me why** — I have not read your gate and I am diagnosing the loop from your journal, not from your code. **But do not dispatch W51 as another pattern addition.** If the answer is "keep walking the AST," bring me the argument first.

## C-5 — Model routing: you are running top tier on both roles, eight packets deep

Every entry from `R-M6-3` to `R-M6-10` records `tier=top` and `model=claude-opus-5-thinking-high` for **both author and reviewer**. That is sixteen top-tier invocations on one gate, and **the PO has already raised top-tier creep as a cost concern.**

**Standing correction: the reviewer keeps top tier on money-path and ship-gate work. The author drops to mid tier when the packet is a bounded, well-specified change with a green/red oracle.** The C-4 packet is exactly that shape — a freeze call plus a corpus you already own. **Escalate-on-repeat-rejection is a sound rule and I am not withdrawing it, but escalating both roles simultaneously on every iteration is how the rule becomes a blank cheque.**

## C-6 — M5 stands

`R-M5-2` ACCEPT, M5 ship-OK. **Untouched by any of the above.** Do not re-open it while M6 is unresolved; one gate in an adversarial loop is enough.
