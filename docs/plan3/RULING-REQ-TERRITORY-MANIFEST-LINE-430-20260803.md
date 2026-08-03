# RULING REQUEST — `TERRITORY.yml` line 430, and what D's grant should be

**To:** Director · **From:** B · **Raised:** 03-08 22:2x+01:00
**Decision needed because the fix changes which paths a manager owns.** It is not a syntax fix, and
I am not taking it.

---

## STATUS 03-08 23:1x+01:00 — line 430 is REPAIRED. A different ruling now blocks the gate.

Ruled at 22:47+01:00: *repair the manifest*. Done in `f3c6a58b8`, and it did **not** need the grant
change this document was asking for — see "How line 430 was repaired without a grant change" below.

Repairing it made the parser reach the rest of the file **for the first time since 08-01**, and two
more defects of the same class were waiting there, plus one that is not mechanical at all:

| # | defect | status |
|---|---|---|
| 1 | line 430 indent 8, and a glob character class that cannot be expressed | **fixed**, no grant change |
| 2 | D `denied_paths` `chart v 1.4/chart/modules/**` has no `provenance` key | **fixed**, labelled `inferred` |
| 3 | E `denied_paths` `chart-indicators-full.js` has no `provenance` key | **fixed**, labelled `inferred` |
| 4 | **managers D and E are each declared TWICE, with contradictory grants** | **RULING NEEDED — see below** |

The gate is still RED and the same **12 cells** still fail, byte-identical counts before and after
(75 pass / 12 fail both ways). Nothing regressed and nothing was rescued: the manifest still does not
load. What changed is that the blocker is now one named ownership question instead of a queue of
syntax errors hiding behind each other.

---

## The finding

`docs/plan3/TERRITORY.yml` **does not parse**, and has not since at least 08-01.

```
$ node scripts/territory-preflight.mjs --base HEAD~3 --head HEAD
RED packet manifest-unloadable: docs/plan3/TERRITORY.yml — the territory manifest could not be
loaded; territory manifest line 430: unexpected indentation
```

Verified unloadable at `HEAD`, `HEAD~40` and `HEAD~120`. The file last changed on 08-01 at
11:55:21 (`69870c491`). **12 cells** in `scripts/tests/territory-preflight.test.mjs` are RED for
this reason alone, and were RED before any of today's changes.

So the territory gate has been dead for **two independent reasons**. The missing `Manager:` trailer
was only the first; even with trailers on every commit it would still RED here.

## Two defects stacked on one line

```
427       - pattern: docs/plan3/journal/MANAGER-D.md        indent 6
428         provenance: ruling                              indent 8
429         authority: A16.1 - each manager holds ...        indent 8
430         - pattern: docs/plan3/D[0-9]*.md                 indent 8   <-- both defects here
431         provenance: ruling                              indent 8
432         reason: D's own findings, prefixed to avoid ...  indent 8
433     denied_paths:                                       indent 4
```

**First: indentation.** Every sibling list item in that block begins at indent 6. Line 430 begins
at indent 8, so it parses as a child of `MANAGER-D.md`'s mapping rather than as a new list entry,
and `parseStrictYaml` stops there. This is the error you actually get.

**Second: the glob.** Dedent it to 6 and this surfaces instead — `parseScalar` rejects `[` in a
bare scalar (`territory-manifest.mjs:82`), and `globToRegExp` rejects `[` and `]` in a pattern
**even when quoted** (`:171`). A character class cannot be expressed in this glob subset at all.

I initially committed a quoting fix (`f5df3466e`) on the belief that the `[` was the cause. That
was wrong — the `[` is never reached — and I **reverted it** in `489c0f494`. Quoting parses fine and
changes nothing, because the pattern is then rejected one layer down.

## Why this is yours and not mine

The written intent is *"D's own findings, prefixed to avoid collision with the Director's
`docs/plan3/*.md` grant"* — i.e. `D` followed by digits. That intent **cannot be expressed** in the
supported glob subset. So making the manifest load requires choosing a different grant, and every
available choice changes which paths D owns:

| option | consequence |
|---|---|
| `docs/plan3/D*.md` | **Widens** D's grant. Matches any `docs/plan3` file starting with D, e.g. `DIRECTOR-RULINGS-*.md`, `DRAWINGS-*.md`. Would hand D paths the Director currently holds. |
| enumerate D's actual files | Exact, no wildcard, but needs a manifest edit each time D adds a findings doc — and a missing entry is a fail-closed RED for D. |
| drop the pattern | D keeps only the journal grant. Narrowest and safest; D loses the ability to land `docs/plan3/D*.md` findings without a manifest edit. |
| extend `globToRegExp` to support classes | Widens the *pattern language* for every manager, not just D. A change to the language a security-relevant manifest is written in. |

The first option is the tempting one because it is a two-character edit, and it is the one I would
most want a ruling on before anyone makes it: it silently transfers Director-owned paths to D, and
the gate would go green while doing it.

## What is blocked meanwhile, and what is not

**Blocked:** any real territory verdict on any commit range. Ranges will report RED on
`manifest-unloadable` regardless of attribution.

**Not blocked:** the attribution work landed today is proven independently against fixture
manifests, so `TERRITORY_UNATTRIBUTABLE` (exit 9) and its distinctness from a real violation
(exit 1) do not depend on this ruling. 14 cells, all on scratch repositories.

**Also not blocked:** `docs/plan3/baselines/territory-trailer-baseline.json` is landed and correct.
When the manifest is fixed, the gate becomes useful immediately with no further work from me.

## How line 430 was repaired without a grant change

The table above asks which grant to substitute. It turned out none was needed. The character class
`D[0-9]` is exactly expressible in the supported subset as **ten single-digit prefixes**:

```yaml
      - pattern: docs/plan3/D0*.md
      ...
      - pattern: docs/plan3/D9*.md
```

Same three files match today (`D1-J1-SETTLE-BROWSER`, `D1-JOURNAL-BITMAP-DELTA-BROWSER`,
`D2-ATTRIBUTE-497MB-RENDERER-RESIDUAL`), nothing is widened, and no future edit is needed when D adds
a `D3-*.md`. It is verbose and it is exact, which is the correct trade for an ownership manifest.

**Measured the tempting option before rejecting it.** `docs/plan3/D*.md` would have granted D **23
further files**, including `DIRECTOR-RULINGS-20260727.md`, all eleven `DIRECTOR-DISPATCH-*.md` and
`DIRECTOR-NOTE-A-20260728-1428.md`. A two-character edit that turns the gate green while handing D the
Director's own rulings is worse than the red it replaces.

---

## RULING NEEDED — D and E are each declared twice, with contradictory grants

Not a syntax defect and **not mine to settle.** `69870c491`, whose subject is *"union package scripts
and territory"*, **concatenated** both sides of the merge instead of unioning them. Nobody could see it
because the parser was still dying at line 430.

| manager | block 1 | block 2 |
|---|---|---|
| **D** | line 396 · *mechanism forensics, payload measurement, Phase 4 parity oracle* · authority `PLAN3-PHASE-4-THE-REALM-COLLAPSE-20260731-1300.md` | line 489 · *trade correctness, order mechanics, preference and timezone persistence* · authority `CHARTER-D-TRADE-CORRECTNESS-20260729-1310.md` |
| **E** | line 568 · *indicator correctness oracles, warm-up contract, overlay and drawing parity* · authority `PLAN3-PHASE-4-...` | line 609 · *indicator lifecycle and eviction, chart overlay labels* · authority `PLAN-FULL-EVICTION-CANARY-SUNDAY-1800-20260730-1620.md` §4 |

**Six direct contradictions**, where one block denies exactly what the other owns:

```
D  block 1 DENIES chart v 1.4/chart/modules/**
   block 2 OWNS   chart v 1.4/chart/modules/order-manager.js
   block 2 OWNS   chart v 1.4/chart/modules/timezone-manager.js
   block 2 OWNS   chart v 1.4/chart/modules/v9-theme-bridge.js
   block 2 OWNS   chart v 1.4/chart/modules/drawing-tools-manager.js
   block 2 OWNS   chart v 1.4/chart/modules/favorites-manager.js

E  block 1 DENIES chart v 1.4/chart/modules/chart-indicators-full.js
   block 2 OWNS   chart v 1.4/chart/modules/chart-indicators-full.js   (on an explicit
                  director carve-out, 20260730 17:05, "carved out of A's modules grant")
```

`order-manager.js` is the first line of that list, and **this manifest's own comment at line 478 says
that file is where the unrecorded B/D overlap happened** — the one the Director found by trial merge at
20:20. So the duplicate is not cosmetic; it is unresolved on the exact file that has already cost a
reconciliation.

### A union is not the neutral option — I probed this rather than assuming

`resolveOwnership` checks `denied` **before** `owned` and returns immediately
(`territory-manifest.mjs:414-417`). There is **no specificity contest between a manager's own deny and
own lists** — specificity only decides between *owned* grants across different managers, which is what
`TB-1`'s default in force describes. Probe result on a fixture with both rules in one block:

```
path      chart/modules/order-manager.js
owned by D as an EXACT pattern, denied by D as chart/modules/**
verdict   denied   ok=false      rule hit  chart/modules/**
```

So unioning D's two blocks **voids CHARTER-D's five module grants** while looking like a merge that
kept everything. Whoever resolves this picks a charter whether they mean to or not, which is why it
should be picked knowingly.

### All four combinations validate, so this is the only remaining blocker

In-memory probe, nothing written:

```
as committed on disk now       fails: managers D: duplicate manager
keep D block 1, E block 1      VALIDATES
keep D block 2, E block 2      VALIDATES
keep D block 1, E block 2      VALIDATES
keep D block 2, E block 1      VALIDATES
```

One ruling — which charter governs D, and which governs E — and the gate produces real verdicts on the
next range. My read, offered as input and not as a decision: **D block 2 and E block 2** match what D
and E have actually been shipping all day (order manager, timezone, drawings, favorites; indicator
lifecycle and eviction), and block 1's blanket `modules/**` denial for D is what would refuse D's own
committed work. But block 1 cites the newer authority (`20260731` versus `20260729`), so if
`PLAN3-PHASE-4-THE-REALM-COLLAPSE` was meant to *supersede* `CHARTER-D-TRADE-CORRECTNESS`, then the
opposite is right and D has been working outside its territory all day. I cannot tell which from the
files, and the answer changes who owns the money path.

---

## Reproduce it in one command

```
node --input-type=module -e "const{loadTerritoryManifest}=await import('./scripts/lib/territory-manifest.mjs');try{loadTerritoryManifest({file:'docs/plan3/TERRITORY.yml'})}catch(e){console.log(e.message)}"
```

Verified 22:2x+01:00, prints `territory manifest line 430: unexpected indentation`.

Or point the gate at any range:

```
node scripts/territory-preflight.mjs --base HEAD~3 --head HEAD
```
