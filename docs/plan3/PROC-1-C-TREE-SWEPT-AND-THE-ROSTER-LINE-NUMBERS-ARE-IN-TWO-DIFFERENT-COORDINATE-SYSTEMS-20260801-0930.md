# PROC-1: the tree is swept — and two things the sweep found that the wave needs before it edits anything

**Manager C — 2026-08-01 09:30.** PROC-1 complete, well inside the +2 h deadline.

---

## 1 · The sweep: 418 → 0

| | before | after |
|---|---|---|
| tracked modifications | 39 | 0 |
| tracked deletions | 2 | 0 |
| untracked | 377 | 0 (`.ckpt/`, `_evidence/` now ignored) |

**Nothing was deleted. Everything is recoverable by SHA.**

```
salvage/main-worktree-uncommitted-20260801   87b6f7b17f947353027b01afaca13c58ba3e3e12
git checkout salvage/main-worktree-uncommitted-20260801 -- <path>
```

### Why a plain revert would have been a disaster

The ruling says "revert what isn't declared". Executed literally, that would have destroyed work that exists
nowhere else. `chart v 1.4/chart/chart.js` carried **576 insertions** of M21-1 product work — desynchronized
main canvas, layout-resize teardown lifecycle wired to `pagehide`/`pageshow`, panel host-commit listener
release — each with its own kill-switch, moving `CHART_ENGINE_BUILD` from `20260724b61` to `20260727b80`.

I checked before touching it, on two independent routes:

- **Not in the deployed build.** Fetched b120 and grepped for three of its identifiers: all absent.
- **Not in any commit, on any branch.** `git log --all -S` over that path returns nothing.

It existed **only** as unsaved edits in a shared directory that 45 worktrees branch from. Alongside it, 174
untracked files of the M21 workstream (w6 fixtures, red gates, audit models, scorecards) and 205 `.scratch-*`
probes belonging to several managers. All captured in the salvage commit before the tree was cleaned.

**Declaration on the instrumentation question: none of it was mine.** I did not patch a product file at any
point. My work is `scripts/`, `docs/plan3/` and evidence artifacts. This also settles the question put to me
at 01:30 about "23:13 patches" to `chart.js`, `chart-window-limit.js`, `multichart-manager.js` and
`serve.mjs` — see §2.

Excluded from salvage deliberately: `.ckpt/` (4,948 files, 74.9 MB — checkpoint snapshots, themselves a
backup mechanism) and `_evidence/`. Both now in `.gitignore`, along with `.scratch-*`, so the tree **stays**
clean rather than needing this sweep again.

## 2 · The 23:13 timestamps were not 23:13 edits

283 files carry an identical `07-31 23:13` mtime — including scratch probes demonstrably written days
earlier (`w88`, `w89`, `w92`, `w93`). That is a **bulk mtime-stamping event**, a checkpoint restore or a
sync, not 283 edits made at 23:13. The `chart.js` content is b61→b80 work from around 27 July.

Nothing uncommitted has been touched since 23:13 last night. Nobody was working in this directory.

## 3 · The working tree is 59 builds behind production, and that is a seal fact

With the tree clean, both local copies of `chart.js` read **`20260724b61`**. Production serves
**`20260731b120`**.

**A clean tree is not a reproducible build.** SOAK-SEAL asks for badge + digest, and my passport supplies
both over the *served bytes* — which is the only thing that describes what was measured. But nobody should
read "C's tree is clean" as "C's tree builds b120". It does not, and it is not close.

## 4 · THE ONE THE WAVE NEEDS THIS MORNING: the roster's line numbers are in two different coordinate systems

The roster cites line numbers so owners can go straight to the code. I supplied several of them, so this is
mine to catch. **Only 2 of 6 checkable citations resolve in the working tree** — and the failure is not
uniform, which is what makes it dangerous:

| row | citation | resolves in the **tree**? | where the symbol actually is |
|---|---|---|---|
| **LAG-1a** | `order-manager.js:40388` | **yes** — tree coordinates | tree 40388 / deployed 42043 |
| **LIFE-2** | `chart-indicators-full.js:8001` | **yes** — tree coordinates | tree 8001 / deployed 8048 |
| **LAG-1b** | `chart.js:30185` | **no** — deployed coordinates | tree **30184–30185 is `const n = Number(step)`**; `updateOrderLines` is at tree 29029–29030 |
| **LAG-2b** | `replay-system.js:9800` | **no** — deployed coordinates | `m20Q6CapturedClear` at tree **9421** |
| **LAG-3** | `chart-indicators-full.js:10526` | **no** — deployed coordinates | `_m19iB62WindowFp` at tree **10242** |
| (my innerHTML row) | `indicator-ui.js:2968` | **no** — deployed coordinates | `talariaAppendIndicatorLegendRow` at tree **2962** |

**There is no single correction to apply.** The offsets are not constant (+1,246 in `chart.js`, +379 in
`replay-system.js`, +284 in `chart-indicators-full.js`, +6 in `indicator-ui.js`) and two rows are already in
tree coordinates, so a manager who "adds the offset" to LAG-1a lands in the wrong place.

**The roster itself is sound — all 6 symbols exist in the working tree.** Only the coordinates are mixed.

**Recommendation, one line: locate by symbol, not by line.** Every row on the roster names a function. Every
one of those names is unique enough to find. Verified with `scripts/roster-line-check.mjs`, which any manager
can re-run against their own tree.

## 5 · What I am NOT claiming

I have not audited the salvaged M21 work for correctness, and I do not know who owns it — no `TERRITORY.yml`
exists in this tree, so I attributed by path convention and workstream tag rather than by the charter. The
salvage commit is a rescue, not a review. **Someone needs to claim 576 lines of unshipped canvas and
lifecycle work before it is lost to a less careful sweep than this one.**
