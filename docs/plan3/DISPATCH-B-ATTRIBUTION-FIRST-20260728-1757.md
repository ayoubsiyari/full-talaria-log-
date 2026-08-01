# DISPATCH B — Build attribution is now the highest-value item in the project, and it is yours. Without it the PO's verification round cannot tell a working fix from an unshipped one.

**2026-07-28 17:57. B reports done. One message, per DISP-01.**

---

## 1. Why attribution outranks B's other work right now

**A is about to land four fixes: the render kill-switch, the hidden-replay pause, M26's two missing parts, and the two lag fixes.** Then the PO tests.

**Today every measurement the PO took was unattributable to a build,** because `/chart/index.html` — the shell the PO actually opens — **carries no build ID.** We have spent the day reasoning about numbers we cannot tie to a commit.

**Play that forward.** The PO retests after A's fixes. Memory is still high. **We will not be able to distinguish these three cases:**

1. The fix is wrong.
2. The fix is right but was not built into the served bytes.
3. The fix is right and built, but Cloudflare or a stale `?v=` stamp served the old file.

**We have already been bitten by 2 and by 3 separately today** — the mirror question, and `order-manager.js` changing without its cache stamp moving. **A third occurrence during the final verification round, with the deadline where it is, is the single most expensive thing that could happen to this project.**

**So: no fix is verifiable until the PO can read, from the running page, which build they are looking at.** That is B's charter stated exactly — *what we ship is what users get, provably* — and it is now the critical path.

## 2. B's queue, in order

**1. Stamp a build ID on every servable shell, and make it readable from the running page.**

Not just `/chart/index.html`, though that is the urgent one because it is what the PO opens. **Readable means the PO can obtain it in one action without DevTools archaeology** — a console one-liner or a visible string is fine, your call. **Deliver this before A's fixes land, not after.**

**2. Cache-stamp coherence for the files A is changing.**

**A is about to modify `replay-system.js` and `chart.js`.** Both are cache-stamped. **The `order-manager.js` incident — content changed, stamp did not — will repeat on these files unless the stamp movement is mechanical rather than remembered.** C is building a coherence gate; make sure yours and C's meet rather than overlap, and say which one owns enforcement.

**3. Close the hotfix train the moment A's kill-switch lands.** A has it as item 1 precisely because it blocks you.

**4. Pre-clear FIX 3's delivery path.** Which shells and mirrors carry `replay-system.js`, which are rebuilt versus served from committed bytes, which stamps must move. **Hand A the answer before A ships. We have discovered delivery hazards after building a fix twice; do it in front this time.**

**5. B-3 proper** — asymmetric server-confirmed disposability, asserts repositioned ahead of network contact per SAFE-01.

## 3. On items already completed

**If you have already finished any of the above — the PO may have delivered my 17:42 message before you stopped — skip it and say so in one line.** Do not redo it. **I cannot see your worktree and I would rather risk telling you something you know than have you idle waiting for me to ask.**

## 4. Parallelism

**Items 1, 2, 4 and 5 have disjoint writable sets.** Per PAR-01 they run concurrently; only item 3 waits, and it waits on A rather than on you. **There is no reason for you to be serial across these, and no reason for you to stop between them.**

## 5. Standing instruction

**Your charter says never idle. "Done" is not a state you should reach while items 1 through 5 exist.** If you finish all of them, the next thing is not to stop — **it is to answer the question your charter implies: name every way a fix can be correct in the repository and absent from what the PO opens, and close each one.** Today we found two such ways by accident. **Find the rest on purpose.**
