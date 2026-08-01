# RULING — Parallel subagents. "Safe" defined, so the default stops being serial.

**2026-07-28 17:22. PO observation: managers are running one subagent at a time despite standing instruction to parallelise when safe.**

---

## 1. Why they serialised, and it is not caution for its own sake

**I said "parallelise when it is safe" and never defined safe.** Given `BRIEF-03` discipline about writable sets and today's territory collisions, **the conservative default was the correct reading of an underspecified instruction.**

**There is also a real structural cause: the author-then-review pattern is serial by construction.** A packet cannot be reviewed before it is authored. **If every packet is author → review → accept/reject before the next is dispatched, throughput is one packet at a time no matter how many subagents are available.** C ran eleven M6 packets that way today.

## 2. `PAR-01` — the rule

**Parallel is now the default. Serial requires a reason.**

### Always parallel, no coordination needed

**Read-only work.** Investigations, censuses, profiles, retainer-chain analysis, source audits, measurement runs. **No writes, no conflicts, no reason to serialise. Run as many as you have questions.**

### Parallel when writable sets are disjoint

**Two writing subagents may run simultaneously if their writable file sets do not intersect and each works in its own worktree.** State each subagent's writable set at dispatch — you already do this — and **compare them before serialising out of habit.**

### Pipeline the author/review pair

**While packet N is in review, dispatch packet N+1's author** if their writable sets are disjoint. **This alone roughly doubles throughput and requires no additional safety argument** — the reviewer of N is not touching N+1's files.

### Inherently serial — only these

- **Author and reviewer of the same packet.**
- **Two writers on intersecting file sets.**
- **A fix that depends on another fix's outcome** — genuinely dependent, not merely related.

## 3. The real ceiling is review capacity, not author capacity

**Be honest about this rather than spawning work that queues.** If one top-tier reviewer serves one packet at a time, **dispatching six authors produces six queued reviews, not six times the throughput.**

**So: parallelise reviewers across disjoint packets too**, or accept that authors will outrun review and size the author count to what review can absorb. **Reviewer stays top tier — it has earned its cost repeatedly today, catching the W55 stamp hole, the W57 workload gap and both W51 breaks.**

## 4. Apply it right now — each manager has parallel work available today

**Manager A — at least three streams, all disjoint:**
1. **Name the retaining `Map` and release `fullData`/`fullRawData`** — the two missing parts of M26.
2. **Fix 1, background-panel render cadence.**
3. **Fix 2, per-tick allocation reuse.**
4. **The render kill-switch** — small, and it blocks the train, so it should not wait behind anything.

**If Fix 1 and Fix 2 turn out to intersect in the replay update path, pipeline them rather than serialising both behind the memory work.**

**Manager B — three streams, all disjoint:**
1. Release assembly and conflict resolution.
2. **The `SAFE-01` ordering audit** beyond the write-probe — you said it generalises; that is parallel, read-only work to start.
3. **Further live-surface verifications.** One observation produced two findings today.

**Manager C — three or more, and this is where the pipeline matters most:**
1. **Harden M-6 to four panels with indicators, an order and live replay** — top priority.
2. **The 4-panel replay benchmark.**
3. **The four ungated PO-observed defects** — compiled-code growth, listener count, allocation rate, detached-document count. **Separate new files, naturally disjoint, ideal parallel candidates.**

## 5. What does not change

**`GATE-01` still applies to every gate produced in parallel.** **Kill-switches still required on every shipped fix.** **Escalation conditions unchanged.**

**Parallelism increases how much we build. It does not lower the bar on what we trust.**
