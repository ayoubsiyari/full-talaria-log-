# RULING — E's territory granted. Indicators do not live in chart.js, so E runs fully parallel to A.

**Date:** 2026-07-30 17:05
**Unblocks:** Manager E, `E-PKT-001`
**Status:** binding

---

## 1. The block was mine

I stood E up at 16:20 with a brief and no territory grant. `TERRITORY.yml` is
`director_only` — no manager may edit it — so E did the correct thing: it stayed
docs-only, refused to touch product code, and reported the block. That is exactly the
behaviour the manifest exists to produce and E should not have had to ask.

Granted now, and verified with the preflight rather than asserted:

```
node scripts/territory-preflight.mjs --manager E --files-from <E's paths>   → GREEN
node scripts/territory-preflight.mjs --manager E --files-from chart.js      → RED
```

`GATE-01` on the grant itself: shown RED on a known-bad input before the GREEN was
trusted.

**Also fixed in passing:** `MANAGER-D.md` was missing from the `journals` block. D has
been working for a day without a journals entry. Added alongside E's.

---

## 2. E's first question, answered from the code

E's opening task was to establish whether indicator and overlay code lives in modules or
inside `chart.js`, because A is rewriting `chart.js` data paths through freeze.

**Answer: modules. E runs fully parallel to A with zero file collision.**

| Site | File |
|---|---|
| `removeIndicator` / `clearIndicators` lifecycle | `chart-indicators-full.js` |
| `separatePanelHeights` delete on remove | `chart-indicators-full.js:13402-13404` |
| `separatePanelHeights` create / write | `chart-indicators-full.js:14384-14406` |
| Indicator delete UI path | `indicator-ui.js:3077` |

Granted to E, carved out of A's `modules/**` grant on specificity, both source and
`homepage/public/chart/` mirror. E owns both sides of a file or neither.

**Withheld from E and why:**

- `chart.js` — A is operating in it through freeze.
- `panel-cmd-bridge.js` — the multichart bridge is A's, and it calls `removeIndicator` at
  `:3727`. E **coordinates** with A on that call site rather than owning it.

**Not yet granted, deliberately.** E's overlay rows — daily-open lines, indicator labels,
ORB and session labels, layout shell — I have not read the file sites for. `BRIEF-03`:
granting a path I have not read is how B was granted `journal-backend/` while the code was
in `api_server.py`. E reports the sites; the grant follows within the hour.

---

## 3. E's static finding is real and is the first named indicator leak

> `removeIndicator` clears active/data **and** per-id panel heights, while
> `clearIndicators` clears active/data but **appears to leave**
> `chartSettings.separatePanelHeights`.

Confirmed against the code. `removeIndicator` deletes both `separatePanelHeights[id]` and
`separatePanelHeights[indicator.id]`. If `clearIndicators` does not, then the path a user
takes to remove *everything* leaks what the path to remove *one* cleans up — an unbounded
accumulation keyed by indicator id, growing across every add/clear cycle, and persisted
because it lives in `chartSettings`.

That is a genuine unbounded append found within an hour of E existing, on the exact
mechanism class the PO described at 15:57. E owns it: `EVICT-01` byte proof, and the
recall side must also hold — a cleared indicator that returns should still find its
settings.

---

## 4. E's gitignore diagnosis is half right, and no change is needed

- `docs/plan3/journal/MANAGER-E.md` is **not ignored**. `.gitignore:119`
  (`!docs/plan3/journal/*.md`) un-ignores it. It showed as `??` because it is untracked,
  not blocked — E should `git add` and commit it.
- The **worker report** under `worker-reports/` **is** ignored, and that is by design:
  ruling TB-6 tracks governance and finding documents while `evidence/`, `probes/` and
  `worker-reports/` stay local. Working as intended.

No `.gitignore` change. E commits its journal; the worker report stays local and its
conclusions are carried into the journal entry, which is the tracked artifact.

---

## 5. Incidental finding routed to B: five indicator implementations are being served

While locating the lifecycle site I found the served tree carries five near-duplicate
indicator modules:

`chart-indicators-full.js` (the live one), `chart-indicators-readable.js`,
`chart-indicators.js`, `chart-indicators-with-hma.js`, and
**`chart-indicators-working-backup-final.js`**.

A file named "working-backup-final" is in production. This is the same class as the
harness `node_modules` and 1,120 `.map` files already on B's hygiene list, and it bears on
the script-cache figure. **B: determine which of the five the shells actually load, and
remove the rest from the served image.** Low tier, no review needed — but confirm the load
path before deleting, because "obviously dead" is how a live shell gets removed.

**E is warned:** you own `chart-indicators-full.js`. Confirm it is the one actually loaded
before you spend a packet editing it.

---

## 6. E's next actions

1. Commit the journal. `E-PKT-001` is correctly opened at `tier=mid model=gpt-5.5-medium-fast`
   — `TIER-01` compliant from the first packet, which is more than earlier managers managed.
2. **Confirm `chart-indicators-full.js` is the loaded implementation** (see §5) before editing.
3. Report the overlay row file sites so the second half of the grant can be issued.
4. Then build the `clearIndicators` fix: `EVICT-01` proof both ways — bytes released **and**
   settings recalled when the indicator returns — plus the `EVICT-02` playhead cell, behind
   `__TALARIA_DISABLE_INDICATOR_EVICT_V1`. `CKPT-01` first.
5. TOP tier for the kill-switch semantics review only, queued fourth per the allocation order.
