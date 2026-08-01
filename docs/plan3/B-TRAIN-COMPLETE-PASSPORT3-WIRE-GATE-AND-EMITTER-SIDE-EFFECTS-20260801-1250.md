# B — train carries everything; C's two findings closed; holding for the cut

**2026-08-01 12:4x** · manager-b/kill-roster-round-one · **DID NOT CUT. DID NOT DEPLOY.**

---

## 1. A's four rows are merged

Merged `db8d57ae0` (carries all four). No conflicts.

| Commit | Row | Note |
|---|---|---|
| `13cc48890` | LAG-1b gate discrimination | gate-only, no product file — the fix was already in the train |
| `0c458b1a1` | MEM-1b per-timeframe series map | mirrors 1:1 |
| `ca5b82b7b` | MEM-1c pre-session history | mirrors 1:1 |
| `db8d57ae0` | MEM-1d display-series copy removal | mirrors 1:1 |

### MEM-1d — the six retained sites survived

I read A's audit before merging and took a baseline of every `fullData` site at the
pre-merge tip so the claim is measured, not asserted.

Removed, exactly as audited: audit rows 2 and 3, the entry-time `[...this.chart.data]`
snapshots at both replay entry points. **0 remain.**

Retained, all present after merge:

- `chart.js:6839`, `8315`, `10579` — the three reseed copies another manager's mutation
  suite mutates by line. Present and unmodified.
- `chart.js:6280`, `30133`, `replay-system.js:251`, `:10538` — the null-outs two teardown
  suites assert on. Present.

A did not delete the two copies outright; they moved into `_seedFullDataSnapshot()` behind
`__TALARIA_SERIES_DEDUPE_V1`. I checked the switch polarity rather than assuming it, because
a removal row shipped inverted is a removal row that removes nothing:
`_seriesDedupeDisabled()` is a *disable* flag, so absent/falsey means the null path runs.
Default is no-copy. Correct.

Mirror parity re-verified at my merge result, not taken from your check — `order-manager.js`,
`replay-system.js` and `chart.js` all byte-identical across canonical and mirror.

**One thing worth knowing:** A's merge touched `order-manager.js`, the file I patched during
D's reconcile. My LIFE-4 null-session fix survived intact in both mirrors. Auto-merge got it
right, but on a money-path file that was luck rather than design, and I verified it rather
than trusting the absence of a conflict marker.

---

## 2. C's two findings — both real, both closed

### Finding 1: my gates never touched the wire

C is right and the framing is right. Thirty green checks, all of them `readFileSync`. The
live origin served 29,406 bytes of app-shell login HTML under a **200** for
`/chart/build-info.json`, and my gate had nothing to say about it.

A 200 is the worst available outcome. A 404 fails loudly; a 200 of HTML satisfies `res.ok`,
gets swallowed by a `res.json()` try/catch, and records `sourceCommitSha: null` — which my
own commit message calls worse than no passport, because it looks like an answer. My gate
proved routing correctness *on disk*, then reported it as if it were routing behaviour. Auth
middleware, an SPA catch-all, or a proxy tier reorder each satisfy the file and break the
wire. That is a false green and it was mine.

Three things now exist:

**`passport3-verify.mjs --mode=live`** — nine wire assertions: status exactly 200;
content-type JSON and not `text/html`; body byte-inspected for an HTML doctype *before*
parsing; parses; `signature`; `sourceCommitSha` full 40-hex and **not null**;
`checkpointBuild === true`; `Cache-Control: no-store`; and `buildId`/`sourceCommitSha`
matched against `--expect-build` / `--expect-sha`.

**`passport3-verify.selftest.mjs` — 9/9.** Per BIND-01 I will not ship a gate I have not
watched fail. It stands up a local origin and serves each defect: login-shell-under-200,
null SHA, cacheable passport, and 404. The verifier rejects all four **and each for its own
distinct reason** — the HTML case reports HTML, not a generic red — and accepts a healthy
passport, so it is usable at the cut rather than merely strict.

**PROC-3 now carries a deliberate RED.** `bound ON THE WIRE: UNPROVEN until
passport3-verify --mode=live passes at the cut`. B's PROC-3 reads **31 green, 1 red**, and
that red clears only by witnessing a live origin — never by editing the file. The two nginx
and no-store rows are relabelled `bound (config only)`, and the repo gate prints a scope
caveat under its own summary saying it does not establish that the passport is readable.
I would rather carry a red that means something than a green that meant nothing.

At the cut: `npm run passport3:live -- --origin=<origin> --expect-build=20260802b121
--expect-sha=<train tip>`. Witnessed, not inferred.

### Finding 1b: the cut would not have fixed it — root cause found and closed

Writing the wire gate made me go looking for *why* the origin serves the shell, and the
answer is not "the old build is deployed". **My cut would have landed and the route would
still have served login HTML.** C's staged launcher would have refused at exit 3, and we do
not get a second cut.

`api_server.py:3680` — `if path.startswith("/chart"): protected = True`. The passport is
under `/chart`, so an unauthenticated GET is redirected to `/login/`; a redirect-following
client lands on the app shell and reports a 200. That is C's 29,406 bytes exactly. nginx was
right, the whitelist was right, the handler was right, the mirrors were right, and the route
was unreadable anyway — a third tier nobody's gate was looking at.

Fixed by adding `/chart/build-info.json` to the `public_paths` set in `auth_middleware`.
**Exact path, never a prefix.** The `/chart` prefix guard is untouched and every other file
under it still requires a session. I checked nginx for a second auth tier: `auth_request` is
bound only to `/register` and `/register/`, so the backend middleware was the single
blocking tier.

**Declaring this as a deliberate security decision for your veto, not burying it in a diff.**
The passport becomes anonymously readable. Its body is build id, commit SHA and a timestamp
— no user or account data. The disclosure is that an unauthenticated reader learns which
commit built the deployment, which is precisely what the row exists to publish and what the
harness reads with no credentials. I did not weaken the guard to make a test pass; I added
one exact-match entry to an existing allowlist and left the prefix rule in force. If you
want the harness to authenticate instead, say so and I will revert this before the cut —
but then PASSPORT-3 cannot be read by C's launcher as currently staged.

Both halves are gated, and both gated checks are shown failing rather than trusted: the
repo gate now asserts the exemption is present **and** that the `/chart` guard survives, and
mutates the source in memory to prove each check goes red when its property is removed.
Repo mode is now 36/0.

### Finding 2: three side effects, and a tree that moved when C looked at it

Confirmed. `bump-chart-engine-build.mjs` writes `chart.js`, bumps `chart/package.json`, and
emits `build-info.json`. Effects 1 and 2 predate PASSPORT-3; effect 3 is mine. That
distinction does not get me off the hook — I made the script something a verifier would want
to run, and six runs walking 1.4.31 → 1.4.37 in a quiescent tree is a false provenance
signal of exactly the kind this row exists to remove.

**Declared and neutralised, not just declared.** The three effects are named in the file
header. `--dry-run` computes everything and writes nothing. Verified: version held at
1.4.31, `chart.js` hash unchanged, no artefact created.

I declared rather than removed the version bump. Removing pre-existing image-build behaviour
days before a seal buys a smaller diff at the cost of an untested build path, and the
observed harm was verification mutating the tree — which `--dry-run` closes.
**My tree is at 1.4.31 and has not moved.**

---

## 3. Gate status on the merged train

| Gate | Result |
|---|---|
| LIFE-3 bfcache | 17 / 0 |
| HYG-1 settings breaker | 26 / 0 |
| KILL-04 source maps | 10 green / 0 red |
| PASSPORT-3 repo mode | 36 / 0 (+ scope caveat) |
| PASSPORT-3 live self-test | 9 / 0 |
| LIFE-4 M8 | **19 / 0** |
| LAG-1a | 29 / 1 — known residual, approved non-blocking |
| PROC-3 B rows | 32 green / **1 deliberate red** |

**A defect I have to report against my own review gates.** LIFE-4 and LAG-1a both defaulted
their repo root to `manager-d-trade`. LIFE-4 read red after I had already fixed the
null-session bug in the train, because it was still measuring D's unfixed checkout. I nearly
filed a fix that was already landed. Both now default to their own tree.

The upside is a clean mutant-red: LIFE-4 is **19/0 on the train and 18/1 on D's tree**, so
the gate demonstrably goes red on known-defective input rather than only ever being green.

LAG-1a's single red is the documented middle-bar `t`-rewrite residual from my 11:36 approval,
unchanged, still with no live writer.

---

## 4. Worktree hygiene

`manager-b-plan3`: **0 dirty**, hard-reset and cleaned. It read 0 before I touched it, so the
116 you saw had already been cleared or regenerate between checks — worth knowing something
may be writing into that worktree unattended.

Main worktree: committed, 0 uncommitted.

---

## 5. Status

**The train carries every row.** A (LAG-1b, LAG-2, LAG-4, LIFE-1, HYG-2, MEM-1a/b/c/d,
census), D (LAG-1a, LIFE-4), E (LAG-3, LIFE-2, PROC-2, PROC-3), B (LIFE-3, HYG-1, KILL-04
guard, PASSPORT-3).

**Both of your two fixes are in.** Holding.

Not soak-ready by my own reckoning, and I want to be exact about why rather than let a green
table imply otherwise: PASSPORT-3 is `RESOLVER_PRESENT_BUT_UNCALLED` on the wire. Everything
on disk is right, the auth root cause is closed, the verifier is proven against the real
defect, and the one thing not yet true is that anybody has read the passport from a live
origin. That is unprovable before the cut, by construction. It resolves in the first thirty
seconds after it — and it is now much more likely to resolve green, because the reason it
would have failed has been found and fixed rather than left to the cut to discover.

Awaiting release: E's final PROC-3 table, and C's proof that DETACH-01 survives a deliberate
full Cursor shutdown through the repaired launcher. Standing: once C fires, no build for any
reason.

---

## 6. For C, unprompted

I read `STAGED-SOAK-COMMANDS-C-20260801-1330.md`, which appeared in the shared main worktree
while I was working — flagging that as another instance of the shared-directory hazard, and
I have preserved it in this commit rather than cleaning it away.

Two things C should know before staging further:

**The exit-3 blocker has a named cause and a fix in this commit.** C's note reads the
symptom as "the SPA fallback swallows the path". It is not the SPA — it is
`auth_middleware` protecting the `/chart` prefix and redirecting to `/login/`. That
distinction matters, because an SPA-fallback theory would have been chased in nginx, where
everything is already correct.

**The verifier is at a different path than C's note assumes.** C staged
`node scripts/passport3-verify.mjs --mode=live`. It lives at
`_evidence/manager-B/passport3-commit-sha/passport3-verify.mjs`, and `_evidence/` is
gitignored — both new files needed `git add -f`, so they would otherwise have been absent
from a fresh checkout. `npm run passport3:live -- --origin=<origin>` is the stable
invocation. My verifier also uses `redirect: 'manual'`, so it reports the 302 rather than
following it to a misleading 200.
