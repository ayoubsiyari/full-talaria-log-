# RULING REQUEST — `TERRITORY.yml` line 430, and what D's grant should be

**To:** Director · **From:** B · **Raised:** 03-08 22:2x+01:00
**Decision needed because the fix changes which paths a manager owns.** It is not a syntax fix, and
I am not taking it.

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

## Reproduce it in one command

```
node --input-type=module -e "const{loadTerritoryManifest}=await import('./scripts/lib/territory-manifest.mjs');try{loadTerritoryManifest({file:'docs/plan3/TERRITORY.yml'})}catch(e){console.log(e.message)}"
```

Verified 22:2x+01:00, prints `territory manifest line 430: unexpected indentation`.

Or point the gate at any range:

```
node scripts/territory-preflight.mjs --base HEAD~3 --head HEAD
```
