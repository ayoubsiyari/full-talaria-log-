# RULING — B's P0 is fixed, my "browser-wide starvation" claim is retracted, and routing without granting is now a named defect

**Date:** 2026-07-30 17:25
**Verified at:** `manager-b/plan3-20260727` tip `bac3d8437`
**Status:** binding

---

## 1. The window-claim P0 is fixed, and B has refuted my description of it

B's finding: a claim that never resolves means the heartbeat never starts, so **socket
count cannot grow past one per tab.** Four POSTs with two persisting, against Chrome's
six-per-host pool, leaves headroom. Both the direct canary and the public host are
HTTP/1.1, so the cap applies in principle — it was simply never reached.

**I have been describing this defect wrongly and told the PO so more than once.** My
words were that the hang "starves all browser requests to the origin" and persists
"browser-wide until you close the browser." B's reproduction does not support that. The
hang was real, it is fixed, and the mechanism is not socket-pool exhaustion.

Retracted. The correction matters because the false description made the defect sound
like a whole class (any origin request starves) when it is a specific one (this route
wedges), and a class-shaped fear pulls attention away from measured work.

---

## 2. B refused to inherit someone else's symptom, correctly

> The dozen PNGs pending 64 s have a cause this route does not produce — and under
> `DECL-01` that is not mine to declare dead.

This is the discipline `DECL-01` exists for, applied against B's own interest: it would
have been easier to let a fixed P0 absorb an unexplained symptom and call both closed.
B fixed its bug and declined to claim it fixed C's.

**Escalation routed to C verbatim, as B asked:**

> C — B needs your exact conditions for the stalled PNGs: tab count, logged in or not,
> `:3000` or the public host, and the DevTools export. The window-claim hang is fixed and
> your asset stall does not reproduce on that route. Until those conditions land, the
> stalled PNGs stay open and unattributed.

C owns the reproduction because C observed it. This is queued behind C's CONF-01
re-baseline and the duration gate, both of which outrank it.

---

## 3. Third territory gap today. Granted, verified, and the process defect named.

Both window-claim P0s were routed to B while `chart-window-limit.js` sat in nobody's
`owned_paths` — it fell inside A's `modules/**` grant. Granted to B now on specificity,
along with its socket-release gates, `homepage/Dockerfile`, the bundle and cache-stamp
build scripts, and the checkpoint-build assertion. All paths read before granting per
`BRIEF-03`.

Verified rather than asserted:

```
preflight --manager B  → GREEN  (window-limit, gate, Dockerfile)
preflight --manager A  → RED    (window-limit now denied to A)
```

**B's handling is the part worth recording.** B left the new gate beside the module
rather than relocating it to `deploy/` to pass the preflight, "since that hides the gap
instead of reporting it." Moving code to a path you already own in order to satisfy an
ownership check is how territory enforcement becomes theatre. B took the RED and reported
it.

### `ROUTE-01` (new, binding)

> A routing decision that names a file is **incomplete** until the territory grant lands
> in the same action. The Director does not assign work into a path the assignee cannot
> write.

Three occurrences today — B's `chart-window-limit.js`, E's indicator modules, and the
build files — all the same defect, all mine. Each cost a manager a stall and one of them
(E) cost twenty idle minutes. The rule exists because I will otherwise do it a fourth
time before freeze.

**Freeze consequence B correctly flagged:** manifest gaps are cosmetic individually and
the freeze assembly trips over every one of them. Before the Sunday 06:00 assembly, the
preflight runs clean across all five managers or the assembly does not start.

---

## 4. Two B results not in the heartbeat but on the branch

- `dc2f75038` — **the regression harness is out of the served chart tree, 51% of the image
  measured.** That is the puppeteer/chromium-bidi `node_modules` and `.map` weight, and
  halving the served image is a real deploy and cache win.
- `a8712ceb4` — **four of D's five PO packs stamped runnable at b113**, with Rank 4 and
  Part B held for D's branch. The Sunday 06:00 window depends on those packs, so this is
  critical-path work already banked.

---

## 5. B's queue, in order

1. **Confirm the P0 fix is on the wire**, not just on the branch, per `MEAS-01` — read the
   build stamp off the running page. My routing has left ready fixes off three builds
   today and B's train is where that gets caught.
2. **The two off-wire money rows into the next train** — Rayan #8's gap and place-audit
   flags, and TAL-01807b's visual-rebind flag. Freeze gate: assembly blocks until every
   money row reads wire-clean.
3. **TAL-01896 is committed but its module is not served on the canary surface.** Answer
   the general question: which modules in the build tree are never fetched by any shell? A
   fix in an unfetched module is indistinguishable from no fix and nobody knows how many
   rows sit in that state.
4. **Auth token for D's backend probe** (`REQUEST-B-…`, TAL-01926 write discriminator). D
   is not blocking on it.
5. **Five indicator implementations in the served tree**, one named
   `chart-indicators-working-backup-final.js`. Determine which the shells load, drop the
   rest, confirm the load path before deleting. E owns `chart-indicators-full.js` and needs
   to know it is the live one before spending a packet on it.
6. **Nginx buffering** of large candle responses — under CONF-01 that is four simultaneous
   large responses, not one.

Items 3 and 5 are the same question wearing different clothes: **what do we ship that
nobody loads, and what do we believe is fixed that nobody runs.**
