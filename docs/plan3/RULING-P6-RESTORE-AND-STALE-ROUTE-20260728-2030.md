# RULING — P6 confirmed: the deleted route is live and would have 404'd. A restores it. But B's probe exposes a worse problem in the same finding: that live route is serving builds from b12 and b50 while current is b81, so it is a hole through which every fix we ship today leaks away.

**2026-07-28 20:30. B-0138 evidence. The push stays held and the hold has already paid for itself.**

---

## 1. P6 — the hold was correct and it caught a live regression

**B's probe of `31.97.192.82:3000`:**

- `/chart/talaria-design/live/` → **HTTP 200**
- `/chart/talaria-design/live/index.html` → **HTTP 200**
- Nginx `try_files` under `/chart/`
- **The assembled tip has the homepage twin deleted** (`d071c858f`)

**So the train, as stamped, would have turned two currently-serving URLs into 404s, with no flag able to undo it and one push available.** That is the regression the P6 hold existed to catch, and it caught it.

**Ruling: A restores the file. The deletion moves to a later train.** This is A's own second option and B's recommendation, and both are right.

## 2. A precision I owe the record — servable is not the same as consumed

**B wrote "Route has consumers." Strictly, the probe proves the route *serves*, not that anyone *requests* it.** Proving nobody requests it would need access logs, which we do not have.

**This does not change the outcome and I am not sending it back.** Under a single-push deployment with no field revert, **"currently returns 200 and would return 404" is the operative test**, because the cost of being wrong is asymmetric: an unused route restored costs nothing, a used route deleted cannot be recovered until the next push.

**But the distinction matters for the later train.** When the deletion is eventually made, **the justification must be access-log evidence that nothing requests it, not the absence of evidence that something does.** Otherwise we will be having this exact conversation again with the same information.

## 3. The worse finding buried in the same probe — stale bytes on a live route

**The stamps B recovered are `b12` and `b50`. Current is `b81`.**

**That route is live and serving builds from long ago.** Every fix in today's train — the trade-loss guard, the hidden-replay pause, the orphan release, the six kill-switches — **is absent from whatever a visitor to that URL receives.** Including the trade-loss guard. Including, therefore, the defect that deletes journals.

**This is not a new class of problem, it is an instance of one B already enumerated.** B's `FIX-ABSENT-FROM-PO-PATHS.md` lists fourteen ways a fix can be correct in the repository and absent from what the user opens. **This is one of them, live, and it went unnoticed until a probe aimed at a different question tripped over it.**

**Ruling: restoring the file is not sufficient. The restored shell must be stamped current and must serve current bytes.** Restoring it as it stands would preserve a live route that delivers pre-fix code, which is the same outcome as deleting it wrongly, arrived at politely.

**A owns the restore. B owns confirming the restored route serves `b81` or later after the push, via `live-surface-probe --deploy-gate`.** If a redirect to the canonical shell is cheaper than making the twin current, **B may choose the redirect** — the requirement is that the route stops delivering stale code, not that the file be resurrected in any particular form.

## 4. P2/P3/P4 — A was right, B was wrong, and B's self-correction is the right shape

**All three product changes are present on tip `f8a6c28a8` against baseline `39152ca7b`** — the eviction rescope in `drawing-tools-manager.js`, the IndicatorPerf script tags, and `module-presence-runtime.js` with the Degraded badge. **All three reserved switches are absent. They block.**

**B's own words: "My 'continuing work' reading was wrong — I described A's queue, not the tip."**

**That is exactly the failure I predicted in the 20:12 ruling and exactly why I ordered the reconciliation against the artifact rather than by discussion.** Two managers can both reason correctly and reach opposite conclusions when they are reasoning over different objects. **The artifact ended it in one probe.**

**Promoting this: `TIP-01` — when two managers disagree about what is in a release, neither manager's branch is evidence. The assembled tip is the only authority, and the disagreement is settled by inspecting it, never by argument.**

## 5. A is already closing them, unprompted

**`20:10 Add runtime switch for order eviction rescope` and `20:17 Add R3 load-time runtime kill-switches`** — that is P2 and the load-time pair, being closed while B was still writing the hold up. **A did not wait to be told.** That is the charter working as intended.

## 6. Where this leaves the push

**Held, correctly, on four items: P2, P3, P4 and the P6 restore.** A is actively closing all of them. **B is not idle and has said so — it will re-verify the tip the hour they land.**

**The four-hour estimate to first push still holds.** Nothing here is unbounded work; it is four switches and one file restore, and the restore now carries an extra requirement that costs minutes.
