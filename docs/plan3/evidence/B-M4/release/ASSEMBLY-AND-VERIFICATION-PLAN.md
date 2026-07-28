# D-5 SINGLE PUSH — ASSEMBLY AND VERIFICATION PLAN

**Release owner:** Manager B · 2026-07-28 · supersedes nothing (first release plan on the board)
**Scope:** the one push D-5 permits, carrying work from three managers.

---

## 0. Observed starting state — not inferred

Every prior claim about deployment today was read off source. This section is the
first **observation of a running system**, taken with the B-6 probe at 15:39 against
the test server `31.97.192.82:3000` (no users; production `talaria-log.com` was not
contacted).

| What | Observed |
|---|---|
| `order-manager.js` served | HTTP 200, **2,419,821 bytes**, `application/javascript`, LF endings |
| Guard marker `journalVouchedFor` | **ABSENT** — 0 occurrences |
| Served bytes identity | git blob `ff6e9df18446595fd3148ca36efe358259ba6af6` — byte-identical to the file at `f38333b95` (25 Jul 00:44) |
| `?v=` stamp | dist-v9 / legacy-index / chart-embed all report **`20260726b75`**, coherent |
| `/chart/index.html` | served, **carries no recognisable build id** |
| `GET /api/sessions/886` | HTTP **401**, reachable, unauthenticated read refused — reported UNDETERMINED, not ABSENT |
| Cache headers | `etag: W/"6a66a9e1-24ec6d"`, **no `cf-cache-status`** |
| Verdict / exit | **ABSENT** / exit 1 |

Three findings follow from this, and each changes an assumption in the plan below.

**(a) The served bytes are also byte-identical to the committed `homepage/` mirror.**
That is a coincidence, not evidence of mirror-serving, and I want it on record before
anyone reads it the other way. The discriminator is dates: no commit touched
`order-manager.js` between `f38333b95` (25 Jul 00:44) and `9dac31d1a` (27 Jul 03:37),
so a 26 July build from source necessarily produces exactly these bytes. The mirror
snapshot is simply from the same era. **The mirror ruling stands and my B-0116
blocker stays withdrawn** — but note that byte identity alone could never have
separated these two explanations, and on a future build it will not be a coincidence.

**(b) ~~`/chart/index.html` is unstamped.~~ WITHDRAWN 16:02 — it is auth-gated, and the
defect was in my probe.** Corrected finding below; the original is struck rather than
deleted because the 15:39 ruling assigned an owner to fix it.

`/chart/index.html` returns **HTTP 307 to `/login/?next=…`**. My probe was running
`redirect: 'follow'`, so it silently landed on the login page, found no build id in
that page, and reported "served, but carries no recognisable build id". The shell was
never unstamped; the probe described a different page and attributed it to the shell.

The source file `chart v 1.4/chart/index.html` is a 1,384-byte developer stub whose own
text says *"This file is not the live Talaria UI"* and that production
`/chart/index.html` is served from `dist-v9/index.html` — which is stamped
`20260726b75`, observed. So a signed-in user on that URL is served a stamped shell.

**There is nothing here for an owner to fix, and no stamping work is owed by anyone.**
What remains genuinely unknown is what the *authenticated* response carries, and that
needs a session cookie (§7.3) — it is CANNOT DETERMINE, which is not the same as a
missing stamp and must not be booked as one.

**(b-2) Three chart shells are served with no authentication at all.**
`dist-v9/index.html`, `legacy-index.html` (1.4 MB, the full monolith) and
`multichart-prod/chart-embed.html` all return 200 with complete chart content to an
unauthenticated client, while `/chart/index.html` redirects to login. I am reporting
the asymmetry, not judging it — it may be deliberate. But it means any conclusion of
the form "the chart is behind auth" is false for three of the four shells.

**(c) There is no Cloudflare in front of the test server.** No `cf-cache-status` on
any response. The test surface therefore **cannot** exercise the edge-cache path, so
the DEPLOY-01 edge clause is unverifiable here and can only be closed against
production. Do not let a green test-server probe be read as edge coverage.

---

## 1. What goes in, and in what order

Merge order is by **increasing blast radius**, so that the riskiest change is the top
commit and can be reverted by itself without disturbing the data-loss guards beneath it.

| # | Content | Branch | Blast radius | Runtime kill-switch |
|---|---|---|---|---|
| 1 | **B — D-2 hotfix train.** Client hydration guard, backend parse guard, deletion logging | `manager-b/plan3-20260727` | Two files, both guards fail-closed | **Yes, both** |
| 2 | **C — cache-stamp gate, deploy-path preflights, legacy de-route** | `manager-c/verification-infra` | Build-time gates + routing | Build-time only |
| 3 | **A — orphan replay teardown (memory fix)** | `manager-a/orphan-replay-destroy` | Lifecycle teardown | **None known** |
| 4 | **A — render-path lag fix** | *not yet delivered* | **How the chart draws** | **None — see §7.1** |

Rationale for the order. B first because it is the only item that stops live user
data loss, it is already sealed, and both halves can be switched off at runtime — so
if anything later in the stack misbehaves, the guards are not what you have to remove.
C second because its gates must be in the tree **before** the build runs or the stamp
is not enforced on the artifact this push produces. A's memory fix third. A's render
change **last and alone in its own merge commit**, because it is the only item in the
train with no way to disable it short of shipping again.

---

## 2. Collisions — flagged in advance, by trial merge

I merged all four branches in a scratch worktree rather than reasoning about the
diffs. Results:

**2.1 `chart v 1.4/chart/api_server.py` — RELEASED as a non-issue by the Director, 16:52.**
My I-7.1 hunks are lines **12356–12522**, entirely inside
`_sync_trading_session_journal_trades`. C's W56 hunk is a single 3→1 line change at
**26922** in `CHART_ROOT_FILES`. Roughly 14,400 lines apart, different functions,
different concerns, and the trial merge produced **no conflict**. Both can land as
written; no line-level negotiation is needed. I still want C's stated lines to
confirm we are describing the same change, but nothing is blocked on it.

**2.2 `scripts/checkpoint-provenance.mjs` — the real collision, and it conflicts three ways.**
This file conflicts against C **and** both A branches. Cause: the identical change
was committed twice on separate branches one minute apart — `51b6e0da1` (B side,
26 Jul 10:13) and `75d6a16e8` (C side, 26 Jul 10:12), both "fix(release): model
contract-bound forwarding provenance". The blobs are **byte-identical**
(`d8ddfb3d6`), so the conflict is spurious in origin — but it is not safe to resolve
carelessly, because C then built `90e0e0cf8` ("enforce module presence contracts") on
top of its copy.

This matters more than its size suggests: **this is the build-provenance script that
DEPLOY-01 depends on.** A conflict resolved the wrong way here silently damages the
mechanism that stamps and records the build, and every subsequent verification would
be reporting on a broken stamper.

> **Resolution rule, fixed in advance:** take **C's side in full** (`90e0e0cf8`),
> then diff the result against B's `51b6e0da1` to confirm the only delta is C's
> module-presence-contract addition. Do not hand-merge hunks.

**2.3 `docs/plan3/journal/MANAGER-B.md` — C's branch carries a copy of my journal.**
C's `7472228d5` (28 Jul 00:52) added a 559-line snapshot of my journal.
**Ruled 16:52: journal conflicts always resolve to the owner's side, and no manager
writes another's journal, ever.** Applied here without inspection — B's side wins.
The Director records this as the second journal-integrity incident today.

**2.4** No collision found on `order-manager.js`, `chart.js`, or any module in the
guards' path.

---

## 3. Kill-switches — what exists and how to throw them

| Guard | Switch | Default | Throw it by | Takes effect |
|---|---|---|---|---|
| Client hydration guard | `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | unset → **guard ON** | Set to `true` in the browser console | Next write, **no redeploy** |
| Backend parse guard | env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | unset → **guard ON** | Set `false`, restart `trading-chart` | On restart |
| Deletion logging | *(none, deliberately)* | always on | — | — |
| A — memory fix | none known | — | — | redeploy only |
| A — render-path fix | **none** | — | — | **redeploy only** |

Both B switches recognise an **explicit vocabulary only**, and anything else leaves
the guard ON:

- `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` disables on `true`, `1`, `'1'`,
  `'true'`, `'yes'`, `'on'` (trimmed, case-insensitive). Everything else — including
  `'false'`, `''`, `0`, `null`, garbage, absent `window` — keeps the guard on.
- `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` disables on `0`, `false`, `no`, `off` (trimmed,
  case-insensitive). Everything else — including `""`, `"disabled"`, `"fasle"` —
  keeps the guard on.

**Operational consequence:** if you disable a switch and behaviour does not change,
check the spelling before concluding the switch is broken. A typo leaves the guard
active by design. The two are inverted by construction — one names disabling, the
other names enabling — which is a wart I am keeping rather than renaming inside a
hotfix.

---

## 4. Build — DEPLOY-01

1. Assemble in the §1 order onto a release branch; apply the §2 resolution rules.
2. Build through the **checkpoint path**: `CHECKPOINT_BUILD=1`. An ordinary build does
   not stamp a build id *by design* — that is the root cause of our not being able to
   name what is live, and it is not a thing to discover again at 2am.
3. Pass `CHART_BUILD_ID=20260728b81`. It must exceed every stamp already served:
   observed **b75** on the test server, **b80** on Director HEAD, **b21** recorded on
   production. b81 clears all three.
4. `seal-evidence.mjs record-build` with the **image digest** — it refuses a build id
   below the floor and refuses to record without a digest.
5. `seal-evidence.mjs seal`, then `verify`. The seal refuses a dirty tree by requiring
   every sealed file be tracked and byte-identical to HEAD.
6. Record build id **and** commit SHA in the artifact and in the journal.

---

## 5. What the probe must confirm on the served artifact

Run **after** the push, against the surface that was pushed to. Read-only, GET/HEAD
only, safe on a defective build:

```
node docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs \
  --base-url=<surface> --session-id=<id> --token=<qa-token> \
  --shell=/chart/index.html --shell=/chart/dist-v9/index.html \
  --shell=/chart/legacy-index.html --shell=/chart/multichart-prod/chart-embed.html \
  --out=docs/plan3/evidence/B-M4/live-surface-probe/observations
```

All five must hold. Any one failing means the push is not verified:

1. **`order-manager.js` reports PRESENT for `journalVouchedFor`**, and is *identified
   as the module* — a PRESENT on an unidentified body is not a pass.
2. **Served bytes differ from `ff6e9df1…`.** If they match, we shipped and the surface
   is still serving the 25 July file — a cache or build-path failure, not a code failure.
3. **Every shell the probe can read reports `20260728b81`**, and they agree with each
   other. The three unauthenticated shells (`dist-v9/index.html`, `legacy-index.html`,
   `multichart-prod/chart-embed.html`) must all be PRESENT at b81.
   `/chart/index.html` will report UNDETERMINED behind its auth gate unless a cookie is
   supplied; **that is a pass, not a failure** — see §0(b). With a cookie it must also
   report b81, since it resolves to `dist-v9/index.html`.
4. **`GET /api/sessions/{id}` returns 2xx with a token.** A 401 is UNDETERMINED, not a
   pass — it means reachable-but-unread, and it is the state we are in today.
5. **Exit code 0.** Exit 1 is ABSENT (shipped without the fix); exit 3 is UNDETERMINED
   (we cannot tell, which is not the same thing and must not be recorded as one).

**On production only:** re-run once more after the edge TTL and confirm `cf-cache-status`
is not serving a pre-push copy. The test server has no Cloudflare (§0c), so this step
cannot be rehearsed there.

---

## 6. Rollback

Three tiers, fastest first. Choose by what is misbehaving.

**Tier 1 — throw a kill-switch. Seconds, no redeploy.** Covers only B's two guards. If
trades stop persisting, or the backend refuses sweeps it should allow, use §3. This is
the only tier that does not require a build.

**Tier 2 — revert one merge commit.** A's render-path fix is the top commit for exactly
this reason: `git revert -m 1 <merge-sha>`, rebuild, repush. Removes the render change
and leaves the data-loss guards in place. Expect ~1 build cycle. This is the tier for
render regressions during canary, which is the most likely failure given a render
change ships with no runtime switch.

**Tier 3 — redeploy the previous image by digest.** Full rollback of everything,
including the guards, which returns testers to the trade-loss path — so it is the last
resort and it needs a stated reason. **This tier only works because `record-build`
captured the digest.** If we had not recorded it we would be rebuilding from a guessed
commit under incident pressure.

**Rollback does not un-delete trades.** If the guards are switched off or rolled back,
the exposure is live again immediately. The tester export notice is still the only
thing that protects data already on disk.

---

## 7. Gaps I cannot close as release owner

**7.1 ~~A's render-path fix has no kill-switch~~ — RULED 16:52. A adds the switch and it
blocks the train.** The Director did not accept the one-build-cycle rollback floor: the
switch is the precondition for A's fast-shooting authority, and a render-path change
with no runtime rollback inverts that trade. **The train does not assemble until A's
switch exists**, built on the §3 pattern — default on, explicit disabling vocabulary,
anything unrecognised leaves the change active. Item 4 in §1 is blocked until then.

**7.2 The edge clause cannot be verified before production.** §0c — no Cloudflare on
test. **Ruled 16:52:** cache verification is a **post-push production step, executed
before testers are released.** It is a release gate, not an observation, and it is the
last thing between the push and the testers.

**7.3 I need a QA session credential** — a cookie for the gated shell, a token for the
endpoint. Without them, check 5.4 and the authenticated half of check 5.3 stay
UNDETERMINED. This is now the only unresolved input I am waiting on.

**7.4 A's render-path fix is not yet delivered.** Assembly order is fixed but the
content is not in hand; the trial merge in §2 covered the other three only.

---

## 8. OPEN ESCALATION — hot path bypasses the hydration guard (B-0126)

See `docs/plan3/evidence/B-M4/FINDING-HOT-PATH-BYPASSES-HYDRATION-GUARD-20260728.md`.
Until the Director picks option 1, 2, or 3 in that finding, **the release note must not claim the trade-loss path is closed.** Other train items may still assemble.
