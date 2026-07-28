# SHIP BLOCKER — the D-2 hotfix reaches zero users as committed

**Status:** blocking B-4. Train is assembled, verified and sealed. **It must not be
called shipped.** Raised by Manager B; the remedy is outside Manager B's territory.

---

## 1. The finding

`chart v 1.4/chart/modules/order-manager.js` is **not the file the public
deployment serves.** There is a second checked-in copy:

```
homepage/public/chart/modules/order-manager.js
```

and the public entry point loads that one:

```
homepage/public/chart/dist-v9/index.html
  <script defer src="/chart/modules/order-manager.js?v=20260724b61"></script>
```

The served copy contains **zero** occurrences of `journalVouchedFor`. The B-W16
hydration guard and the B-W18 kill-switch are absent from it. Every acceptance
cell, every mutant and the whole VER-04 argument were run against a file that no
user loads.

**Consequence: the client half of D-2 currently protects nobody.** The backend half
(`api_server.py`, single copy, no mirror) is genuinely live-ready.

## 2. It is a stale snapshot, not a divergent fork

Compared by git blob hash rather than by reading bytes through any text API:

| Copy | Blob |
|---|---|
| `homepage/public/chart/modules/order-manager.js` | `ff6e9df18446595f…` |
| territory copy at `f38333b95` | `ff6e9df18446595f…` **identical** |

So the mirror is a clean point-in-time copy of the territory file taken at
`f38333b95` ("chore(checkpoint): assemble D-034 test bundle"). There is **no
independent drift**, which is the good news: refreshing it is a copy, not a merge.

## 3. It is not only my hotfix that is missing

The mirror is four commits behind. Refreshing it carries these, in order:

| Commit | Change | Owner |
|---|---|---|
| `9133fd9e0` | discriminate pending vs executed rows at registry eviction sites | not mine |
| `bb0858bb5` | narrow five interpolated substring selectors to class tokens | not mine |
| `2521a7484` | B-2 tri-state hydration guard | mine |
| `c22c3a9a7` | B-W18 kill-switches | mine |

**Two order-manager fixes that are not mine are also not live.** Whoever shipped
them has had no signal that they did not land. I have not verified whether either
is user-visible; I am reporting the fact, not assessing their severity.

## 4. Why I am not fixing it

- `homepage/` is not in my territory and no grant covers it. The I-7 grant lesson
  from this morning was that a path written from where code *appears* to belong is
  not a grant for where it *lives* — I am not going to make the mirror image of
  that mistake by treating "ship the train" as a grant for whatever tree turns out
  to serve it.
- The refresh would carry two other managers' changes into production under my
  commit. That is a release decision about someone else's code, which is not mine
  to take even if the copy itself is mechanically trivial.
- The mirror is **partial**: 157 files against 166 in the territory tree. A blind
  directory copy is therefore not obviously safe either, and deciding the
  reconciliation rule is a deploy-owner decision.

## 5. What I need

One of:

1. **A grant** for `homepage/public/chart/modules/order-manager.js` alone, with an
   explicit ruling that carrying `9133fd9e0` and `bb0858bb5` is accepted; or
2. **The deploy owner refreshes the mirror** and I verify the result; or
3. **A ruling that the mirror is not the production surface**, in which case I have
   the wrong model of the deployment and need to be told what is.

## 6. This is DEPLOY-01, third instance today

The first two were "we cannot name what is live." This one is sharper: **the tree we
develop in and the tree we serve from are different trees, and nothing tells you
when they diverge.** The mirror carried `?v=20260724b61` on one entry point and
`?v=20260723b12` on another, so it is not even internally consistent.

A fix that passes 70 acceptance assertions, 15 mutants and both VER-04 halves and
still reaches zero users is the strongest argument available that verification
evidence says nothing about deployment. I would suggest DEPLOY-01 grow a clause:
**a fix is not shipped until the artifact the user loads has been shown to contain
it** — by inspection of the served file, not by inference from the build.

## 7. Verification for whoever performs the refresh

After refreshing, this must hold:

```
git hash-object "homepage/public/chart/modules/order-manager.js"
git rev-parse "HEAD:chart v 1.4/chart/modules/order-manager.js"
```

**The two hashes must be equal.** Then confirm the guard is actually present in the
served copy:

```
grep -c journalVouchedFor homepage/public/chart/modules/order-manager.js   # must be 2
grep -c _bW16HydrationGuardEnabled homepage/public/chart/modules/order-manager.js  # must be 2
```

Anything less than 2 on either means the fix is still not being served.
