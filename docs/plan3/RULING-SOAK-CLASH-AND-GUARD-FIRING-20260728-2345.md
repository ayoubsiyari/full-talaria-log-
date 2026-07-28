# RULING — The COPY hypothesis is confirmed and B found the file I missed. The soak clash is an instrument defect and goes to C with an exemption list rather than a reclassification, because reclassifying would blind the gate to real error spam. But the more important thing in B's report is buried: our own trade-loss guard fired fifty times in a measured run, and if it does that in production we have replaced silent deletion with silent non-writing.

**2026-07-28 23:45. B reported the soak failure verbatim before touching it and refused two available workarounds. That is the behaviour that made this finding possible.**

---

## 1. COPY confirmed, and my reading was incomplete

**B applied it to both Dockerfiles:**

```
COPY ["scripts/module-contract-preflight.mjs", "/scripts/module-contract-preflight.mjs"]
COPY ["scripts/module-contracts.json",         "/scripts/module-contracts.json"]
```

**I named the script. I did not name `module-contracts.json`, which the script reads and which was equally absent** — so my one-line hypothesis was a two-line defect. `checkpoint-docker-context.test.mjs` now requires both to precede `build:live:chart`, which converts a silent omission into a failing test. **That is the correct shape: the next person who adds a build-time dependency gets told.**

**B explicitly declines to claim the preflight is green in-image, because the soak still blocks that stage and the path layout under `repoRoot=/` may need follow-up.** Correct — **it has fixed what it could observe and refused to assert what it could not.**

## 2. The soak clash — instrument defect, goes to C, and not by relaxation

**The mechanism, as B established it:**

- All three canonical runs produce an identical measured-phase count: **50 occurrences of `📔 durable journal write suppressed: this session…`**
- Source is a **`console.warn`** at `order-manager.js` ~7212, from the **B-W16 hydration guard** — the safety that refuses a durable write when the journal never hydrated.
- **The FixE product contract at `order-manager.js` ~106–123 governs hot-path `console.log` and leaves `warn`/`error` untouched.**
- **The soak's `installConsoleSink` counts `warn` and `error` toward `e_hotpathConsole`.**

**So the gate is red on a warning the product contract explicitly permits, emitted by a safety mechanism doing its job.** The instrument enforces a rule nobody wrote.

**Owner: C.** This is verification infrastructure and it sits squarely in C's charter of instruments that can see real defects.

**Ruled: an explicit exemption list, not a reclassification of `warn`/`error` out of the counter.** Reclassification would match the FixE contract literally, **but it would blind the gate to genuine error spam in the hot path, which is a real defect class — we would be removing detection to fix one known-good warning.** An exemption carrying a named prefix and a written justification keeps the gate's power and documents what we know.

**`GATE-01` acceptance, non-negotiable: after the change, injecting a hot-path `console.log` must still turn the soak RED, and injecting an unlisted `console.warn` must also still turn it RED.** A gate that has only ever been observed passing is not evidence.

**And this is not a case of weakening a check to make a build go green.** The check is being corrected to the contract it was meant to enforce, and it must be demonstrated still catching what it exists to catch. **B was right to refuse both workarounds available to it — skipping the soak, or silencing the guard — and silencing would have been the worse of the two, because it removes our only signal that the trade-loss guard fired.**

## 3. The thing that matters more, which nobody has asked yet

**The guard fired fifty times in a measured soak phase.**

**B reported that as a count in a diagnostic. I am treating it as a product question, because of what the guard does when it fires: it refuses to write the user's journal to durable storage.**

**We shipped that guard tonight to stop silent deletion of trade history.** **If it fires spuriously in normal operation, we have not fixed the defect — we have exchanged it for a quieter one.** Instead of a journal deleted in one visible event, a journal that silently stops being saved. **The second is harder to notice and harder to recover from, and we are about to hand it to a hundred people.**

**The benign explanation is available and probably correct: the soak harness has no backend, so hydration never completes, so the guard correctly refuses every write.** **But "probably correct" is exactly the standard that produced four dead premises today, and this one is attached to user data rather than to a frame rate.**

**Ordered to B, above the remaining build work:** determine whether the hydration guard suppresses durable writes under **normal operation against a live backend** — not in the soak harness. **A single session on the deployed `b82` test host, performing a write, and checking whether the warn appears, settles it.** B already has the host.

**If the warn does not appear against a live backend, the soak count is a harness artefact and we proceed with confidence.** **If it does appear, the hotfix we already deployed is suppressing writes it should be permitting, and that outranks every other item on the board including the lag.**

## 4. Sequence

**B:** guard-firing check on the live host, then the build once C clears the soak.
**C:** soak exemption with inverted acceptance, ahead of remaining gate hardening.

**Recorded as a standing observation rather than a rule: tonight the most valuable finding arrived as a diagnostic count inside an escalation about something else.** B was escalating a build gate; **the fifty was incidental to B's argument and is the most consequential number in the report.**
