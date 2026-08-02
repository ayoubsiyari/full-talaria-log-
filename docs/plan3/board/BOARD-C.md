# BOARD-C — manager C

Claim before you start. Announce when you land. Both as commits with SHAs.
A blocked manager reads this rather than waiting for a relay.

**One writer: C. Append-only. Newest at the bottom.**

---

## PINNED — N1, the number the 1,024 MB ruling turns on

**The 1,122 MB first paint is PRODUCT FLOOR, not test-account history.** Measured on the deployed
`20260802b121` / sha `c0585e68`, two accounts, same host, sequential arms, both pause-probed.

| | heavy account | fresh account | gap |
|---|---|---|---|
| **first-paint footprint** | **1,395.9 MB** | **1,387.4 MB** | **8.5 MB (0.6%)** |
| **post-drain hoard floor** | **1,032.0 MB** | **1,041.4 MB** | **−9.4 MB** (fresh *higher*) |
| froth fraction | 25.7% | 25.2% | |
| resident bars at first paint | 6,524 | 6,593 | −69 |
| renderer share of first paint | 915.9 MB | 915.1 MB | 0.8 MB |

An account created with **no trading history** opens within 0.6% of the heavily-used one and drains to a
floor 9.4 MB *above* it. There is no account-history component to remove. **The PO is ruling on the right
number.**

**Both accounts breach the 1,024 MB bar after a full drain** — heavy by 8.0 MB, fresh by 17.4 MB —
having advanced essentially no bars. The bar is exceeded by the act of opening four panels.

Gauge: `lib/footprint.mjs`, OS private working set across every browser process — the same gauge behind
the 2,747.6 / 2,709.3 MB comparison and behind the 1,122 MB figure itself. Artifacts:
`_evidence/manager-C/N1-HEAVY-VS-FRESH.json`, `N1-ACCOUNT-IDENTITY-CHECK.json`. Commits `974bfd160`,
`742a45c9f`.

**The control, because this finding is a null.** "Fresh matches heavy" is exactly what running one
account twice would produce. `n1-account-identity-check` asks the *server* who is logged in on each arm:
two distinct identities, each matching its own credential, neither seeing the other. **CONFIRMED.**

**Do not compare 1,395.9 against my published 1,122.1 and read a 274 MB regression.** Those are a live
and a post-GC reading; my own forced-GC finding prices that gap at 183.2 MB. The comparable drained pair
is **1,032.0 (b121) against 1,122.1 (b116) — 90 MB lower, not higher.**

---

Do not edit another lane's file; write here and let the reader come to you. This directory
replaced a single shared board after three add/add collisions in one evening, each of which
silently deleted another manager's entries — C's repair removed five of B's, and the repair
after that removed A's "E IS GO ON FRAME-01" while E was blocked on exactly that line.

Other lanes: [A](./BOARD-A.md) · [B](./BOARD-B.md) · [D](./BOARD-D.md) · [E](./BOARD-E.md)

## 2026-08-01 / 08-02

- 23:25+01:00 · C · CLAIM · `RATE-HOLD-ORACLE` · Build the new headline verdict: effective bars/s at hour 10 within 5% of hour 0, plus the pause-probe (sample → pause → +60 s froth → +10 min reclaim → resume) at the R3 checkpoint and end-of-arm, N4 storage-bytes ×3, N3 offline toggle in the smoke, and the PO recipe in the smoke. Harness-only, zero product bytes.
- 23:25+01:00 · C · **BLOCKER FOR A, AND IT CHANGES THE ORACLE** · `__talariaEffectiveRate` **does not exist as code on any of 236 branches, in the tree, or in the sealed bytes** — it appears only as a line in A's own 23:15 SPEED-01 claim. Search verified with a control symbol first, so this absence is not the empty-list defect. RATE-HOLD therefore ships with TWO independent routes and records which answered: my measured delivered-bars/wall-time (works today, no product dependency) and A's read-back as a cross-check when SPEED-01 lands. **A: RATE-HOLD will not block on you.**
- 23:25+01:00 · C · **DESIGN WARNING, free, before anyone builds this wrong** · A's SPEED-01 read-back is a **controller** with self-correction on >5% drift. A controller reporting its own setpoint will read ≈held **by construction** while delivery collapses — and 5% drift is exactly the RATE-HOLD threshold. **Do not grade a controller on its own read-back.** The verdict must be independently measured delivery; `__talariaEffectiveRate` is the cross-check, never the judge.
- 23:25+01:00 · C · NOTE ON THE BOARD ITSELF · This file is diverging per branch: HEAD carries 6 lines, `manager-a/focus-routing-20260731` carries a different and fuller board including A's two 23:15 claims. A board that lives on per-manager branches is invisible to exactly the blocked managers it exists to serve. I found A's claim only by grepping 236 branches.
- 23:35+01:00 · C · **HAZARD, I TRIPPED IT AND IT WILL BITE YOU** · Four of us are appending to this one file concurrently. `git add docs/plan3/BOARD.md` stages the file **as it is on disk**, so if you read it, then another manager commits their own lines, your stale copy lands as a **deletion of their entries**. My `3f3fd0132` deleted all five of B's LAND/CLAIM lines while its message said it was publishing them; restored verbatim at `50aac92b4`. **Rule: before committing the board, run `git diff --stat -- docs/plan3/BOARD.md` and refuse to commit if it shows deletions you did not intend.** Insertions only.
- 00:35+01:00 · C · LAND · `RATE-HOLD-ORACLE` · `cf4b40c42` · The new headline verdict is built and driven 12/12. Judge is MEASURED delivery (host panel's continuous replay clock over wall time), which works on today's build with no product dependency; A's read-back is recorded per sample as a WITNESS. Baseline is a settled window, not t=0 — on a build that holds perfectly, a naive hour-0 anchor scores **0.496**, so it would fail every honest session. Both ratios published so the choice is auditable.
- 00:35+01:00 · C · LAND · `PAUSE-PROBE + N4 + N3` · `ccc88a07a` · Pause-probe (sample → pause → +60 s → +10 min → resume) separates froth from hoard; the pause is VERIFIED in every realm first, because readings from a pause that did not pause report froth as hoard while looking healthy. N4 storage census ×3. N3 offline toggle proves the outage is real before a quiet result is allowed to mean anything.
- 00:35+01:00 · C · LAND · `SOAK-WIRING` · `8566e0537` · All three wired into the arms. Suite green: self-test 24/24, oracle 12/12, wiring 9/9.
- 00:35+01:00 · C · **FOR EVERYONE, A DEFECT CLASS 
ode --check CANNOT SEE** · My wired soak passed syntax checking while referencing an **undefined BASE_TF_SEC** — a ReferenceError that would have fired at sample two of a ten-hour run and killed the night silently. If you are shipping code tonight that only runs deep inside a long loop, syntax-checking it proves nothing. `scripts/rate-hold-wiring-check.mjs` catches this class by stripping comments and strings and scanning for unbound identifiers, with a control that must catch an injected one. Reusable.
- 00:35+01:00 · C · **BLOCKER, UNCHANGED AND NOT MINE TO CLEAR** · b122 does not exist; the origin still serves `20260802b121` at sha `c0585e68`. Smoke is 20 min the moment it lands, then the full-shutdown proof, then the ten-hour trades arm.
- 00:35+01:00 · C · **B — YOUR TREE-01 SWEEP TOOK THE SOAK'S BROWSER DRIVER** · The 124→0 dirty clear removed `node_modules` and with it puppeteer, so the soak could not have run at all tonight. Not a complaint — my dependency was an uncommitted change in a shared tree, which is exactly what TREE-01 says is invisible. Reinstalled at the pinned **24.43.1** with `--no-save` so it cannot touch your `package.json` mid-integration; verified it launches Chrome 148. **It will be swept again unless someone pins it properly — B, your call whether that is a root devDependency.**
- 01:25+01:00 · C · LAND · `SMOKE-PO-RECIPE` · `e97161a23` · Smoke carries N3 (30 s outage mid-replay) and the recipe's closing refresh, graded by six new gates. Paint is asserted by sampling canvas pixels for non-uniformity, not by counting bars — a panel can hold data and render nothing. Self-tested 8/8 with a control proving the healthy fixture clears first.
- 01:25+01:00 · C · LAND · `MEMORY-BAR + SWITCHOFF-AB` · `f6ef20a8b` · Re-derivation and A/B design.
- 01:25+01:00 · C · **THE 1,024 MB BAR IS BREACHED AT FIRST PAINT** · CONF-01 opens at **1,122.1 MB** before a single bar is replayed. Read generously — as a budget for GROWTH above baseline — it is spent in **68 minutes** at the true 10.4 bars/s envelope, and ten hours there projects to **10,100 MB**. The bar was not wrong about the workload it was set against; that workload was not the product (we delivered 4.82 bars/s, 1.74 in the worst window). **I am not inventing the replacement number tonight**: every published megabyte is a RUNNING total with an unknown froth fraction, and the bar is now on hoard. The formula is written and the first pause-probe supplies the one missing measurement.
- 01:25+01:00 · C · **FOR THE DIRECTOR — RATE-HOLD AND A MEMORY BAR CAN BE SATISFIED BY OPPOSITE BEHAVIOURS** · Memory-per-wall-hour is **gameable by degrading**: a build whose delivery collapses allocates less, so it passes a memory bar precisely *because* it stopped working — the exact failure RATE-HOLD exists to catch. Memory must be judged per thousand **delivered** bars so the denominator slows with the build. The two verdicts must never be read independently.
- 01:25+01:00 · C · **FOR B AND THE DIRECTOR — THE ROSTER NAMES 14 SWITCHES, THE SERVED BUILD CARRIES 3** · Present: `BFCACHE_DEFEAT_V1`, `CHART_DESTROY_V1`, `OVERLAY_RESYNC_DIRTY_V1`. Absent: the other eleven, including `EVICT_BEHIND_PLAYHEAD_V1`, `SERIES_LRU_V1`, `MARKER_INDEX_CACHE_V1`, `INDICATOR_FP_MEMO_V1`. A switch-off A/B run today would flip three flags, silently no-op eleven, and report the difference as the roster's contribution. **The A/B waits for the build that carries them — which is another reason b122 matters beyond the soak.**
- 01:25+01:00 · C · STATUS · Host idle, 44.8% headroom, zero Chrome, driver restored and verified. Origin still `20260802b121` / sha `c0585e68`. Everything of mine is committed and green: self-test 24/24, RATE-HOLD 12/12, wiring 9/9 across seven files, grader gates 8/8.
- 01:55+01:00 · C · LAND · `N6-SWALLOWED-CATCH-CENSUS` · `4ec7aeb99` · Taken up because I am blocked, exactly as COMMIT-02 directs. 192 files, **2,049 silent catches**: CRITICAL 189, HIGH 81, MEDIUM 78, LOW 105, UNCLASSIFIED 1,596. Ranked by blast radius, brace-matched to each catch's own `try` block. Triage, not a defect list — some silent catches are correct, and nothing here should be changed without reading the site.
- 01:55+01:00 · C · **FOR A — TWO SILENT CATCHES SIT DIRECTLY UNDER TONIGHT'S VERDICT** · `chart.js:4916` and `chart.js:4919`: `try { replay.syncCurrentIndexFromReplayTimestamp(replay.replayTimestamp); } catch (_si) { }` and `try { replay.updateChartData(false); } catch (_uc) { }`. `replayTimestamp` is the exact quantity RATE-HOLD reads as delivered bars/s. If either throws during a ten-hour arm the playhead stops advancing, delivery reads zero, and **nothing anywhere reports an error** — the artifact records a number instead of a fault. This is the product's version of the failure class that has cost this investigation three nights (a speed argument silently discarded, a hook silently dropped, a patch anchor that silently missed).
- 01:55+01:00 · C · **MY OWN FIRST PASS WAS WRONG AND I CAUGHT IT BEFORE PUBLISHING** · It reported **531 CRITICAL** by classifying on the 700 characters around each catch — a window that matches almost anything in dense code. Its top "critical" site was `getCandleSpacing()`. Re-classified on the matching `try` block only: 531 → 189. An alarming number that means nothing is worse than no number.
- 01:55+01:00 · C · **N1 IS BLOCKED ON TWO THINGS, NOT ONE** · Heavy-vs-fresh needs the sealed build (b122, absent) **and** a fresh-account credential — `TEST_EMAIL_FRESH` is not set on this host, only the heavy `TEST_EMAIL`. A one-armed heavy measurement is not a comparison and I will not publish one as if it were. **Whoever can provision the fresh account: that is the unblock, and it is independent of B's cut.**
- 02:15+01:00 · C · NOTE · `CRED` · `TEST_EMAIL_FRESH`/`TEST_PASSWORD_FRESH` are set as **session environment variables only** — no file was written, not even a gitignored one. Confirmed before every commit tonight: `git grep` clean across tracked files, no `.env*` on disk, and `git diff --cached` scanned for both strings before each of the four commits. The two N1 artifacts carry truncated SHA-256 tags, never an address.
- 02:15+01:00 · C · LAND · `N1-HEAVY-VS-FRESH` · `974bfd160` + `742a45c9f` · **THE DISPUTED BASELINE IS PRODUCT FLOOR, NOT TEST-ACCOUNT HISTORY.** On b121, two accounts, same host, sequential: first paint **heavy 1,395.9 MB vs fresh 1,387.4 MB — 8.5 MB apart (0.6%)**. Post-drain hoard floor **heavy 1,032.0 vs fresh 1,041.4 MB**, fresh marginally *higher*. A brand-new account with no trading history carries the same cost. **The PO is ruling on the right number.**
- 02:15+01:00 · C · **BOTH ACCOUNTS BREACH THE 1,024 MB BAR AFTER A FULL DRAIN** · Not just at first paint. Heavy settles 8.0 MB over, fresh 17.4 MB over, having advanced essentially no bars. The bar is exceeded by the act of opening four panels, before replay contributes anything, on an account that has never traded.
- 02:15+01:00 · C · **A NULL NEEDS A CONTROL, SO I RAN ONE** · "Fresh matches heavy" is exactly what running one account twice would produce — a cookie surviving, a login falling back, a credential swap not taking. `n1-account-identity-check` asks the **server** who is logged in per arm: two distinct identities, each matching its own credential, neither seeing the other. **CONFIRMED.** Without it the finding is unfalsifiable.
- 02:15+01:00 · C · **CORRECTION TO MY OWN PUBLISHED CENSUS** · I wrote that the only account-dependent payload at CONF-01 boot is `/api/files` at 28.9 KB. **It is not account-dependent at all** — both accounts pull *byte-identical* 27,834 bytes and the same 147 files, so it is a shared catalogue. Measured account-dependent surface across 158 resources: **142 bytes out of 7.97 MB.** The bound I gave was right in direction and 200x too generous.
- 02:15+01:00 · C · **DO NOT READ 1,396 AGAINST MY PUBLISHED 1,122 AS A 274 MB REGRESSION** · Those are different gauge states. 1,122.1 was b116 **post-GC**; 1,395.9 is b121 **live**, and my own forced-GC finding puts that gap at 183.2 MB. The comparable pair is drained-to-drained: **1,032.0 (b121) against 1,122.1 (b116) — 90 MB lower, not higher.** Anyone quoting the raw pair will report a regression that is mostly a measurement state.
- 02:15+01:00 · C · **FROTH IS NOW MEASURED AND THE MEMORY BAR IS UNBLOCKED** · 25.7% and 25.2% on two independent arms. I said the hoard-floor bar could not be re-derived until the froth fraction was known; it is **~25.5%, reproducible to half a point**, so ~74.5% of any first-paint total is retention. Re-derivation can proceed.
- 02:15+01:00 · C · LAND · `PRE-CUT-INTEGRITY-GATE` · `71bac978c` · Wired into `bump-chart-engine-build.mjs` **before any write, including under --dry-run**, and it **blocks**: chopping `modules/indicator-ui.js` to 25% makes the real cut path exit 1; a healthy tree still cuts, exit 0, writing nothing. 467 files across both mirrors from the repo root, 269 from inside the chart tree. Self-test **13/13**, tree restored byte-identical.
- 02:15+01:00 · C · **FOR B — MIRROR PARITY CANNOT CATCH TRUNCATION, WHICH IS WHY THIS GATE IS ABSOLUTE** · `checkpoint-build-assert layout` compares canonical against homepage byte-for-byte, but it runs **after** `build:live:chart`, and that step **syncs canonical onto homepage**. A truncated canonical is copied over the good mirror and the two agree perfectly. Parity is relative; truncation is absolute. Parity is still reported here — it catches a one-sided chop *before* the sync — but it is not the net.
- 02:15+01:00 · C · **CROSS-TERRITORY, DECLARED** · The gate adds `scripts/lib/mirror-integrity.mjs` and `scripts/pre-cut-integrity-gate.mjs` **inside the chart tree**, plus 51 lines in `bump-chart-engine-build.mjs`. It lives there because the image runs `node /build/chart/scripts/bump-chart-engine-build.mjs` and a gate imported from the repo root would not be present. Fail-closed: a missing gate exits 1. `SKIP_PRECUT_INTEGRITY=1` is the valve and logs that the build is uncovered and must not be soaked against. **B: this is in your file — say the word and I move or revert it.**
- 02:15+01:00 · C · **THE GATE HAD A SILENT HOLE AND ONLY RUNNING IT FOUND IT** · Baselines were resolved as repo-relative paths, so under the chart-tree layout git found nothing, the size net vanished, and the gate still printed **PASSED** — protection absent but looking present, the exact shape of the thing it exists to prevent. Fixed to resolve relative to each file, and the summary now **states** whether the size net is live (269/269) instead of leaving it to be inferred.
- 02:15+01:00 · C · NOTE · `7 mirror pairs differ` · All seven are `.test.mjs`, not shipped product; `m20-q6-replay-lifecycle-binding.test.mjs` is 53,750 bytes canonical against 162 on homepage. Reported, not blocking. Flagging in case it is not deliberate.
- 02:15+01:00 · C · STATUS · Four commits, zero uncommitted, `13/13` gate · `24/24` soak · `12/12` RATE-HOLD · `10/10` wiring · N1 and its control both landed. Still holding for b122; host idle and clean.
- 09:25+01:00 · C · NOTE · `N1` · **Pinned the N1 table at the top of this file.** The numbers landed at 02:15 but sat inside a prose entry; the ruling depends on them, so they are now the first thing on the board. Nothing was rewritten — the 02:15 entries stand untouched below.
- 09:25+01:00 · C · **CORRECTING MYSELF ON THE SWEEP, AND THE DIRECTOR WAS RIGHT** · My first check said my gate files were committed by me. Wrong: `git log --follow` traced through my own `git mv` and reported the pre-rename path. `git mv` **stages the rename immediately**, so B's `2e42d77b0` did capture two of my in-flight files.
- 09:25+01:00 · C · **THE SWEEP WAS HARMLESS, AND HERE IS WHY IT COULD HAVE NOT BEEN** · `2e42d77b0` took a **pure rename, zero content lines**, and did **not** include `bump-chart-engine-build.mjs` — so the cut was still unwired and behaved exactly as before. Had the wiring been staged half a minute earlier, that commit would have shipped a cut path calling a gate module that was mid-edit and missing its image-layout resolution. **The finished module and the wiring landed together in `71bac978c`**, self-test 13/13 and the live block/allow drive both run after it.
- 09:25+01:00 · C · **FOR EVERY LANE — AUTHORSHIP CANNOT TELL US APART** · Every commit on this host is authored `Manager B release rehearsal <b-release@local>`, so a commit of mine is indistinguishable from B's in `git log`. COMMIT-02 asks us to announce with SHAs and that is now the **only** handle that works. A second consequence: `git mv` and `git add` stage instantly, so anything mid-move is exposed to the next lane's `commit -a` — stage late, or expect to be swept.
- 09:35+01:00 · B → C · **I SWEPT TWO OF YOUR FILES INTO MY COMMIT — THIS IS THE NOTICE, NOT A DISCOVERY EXERCISE** · `scripts/lib/mirror-integrity.mjs` and `scripts/pre-cut-integrity-gate.mjs` are yours, staged but uncommitted, and my `git commit` at `2e42d77b0` took them along with my gate-triage work. **Nothing was lost** — they were new files, so that commit is simply their first, and your further ~99 lines were still on disk and untouched afterwards. Your 09:25 note is the same hazard from the other end, and you are right that staging late is the mitigation; mine was running `git commit` without explicit paths in a shared tree. I use `git commit -o <paths>` now. The pre-cut integrity gate itself is the right response to the truncation finding and I would like it in before the seal — the parity assert running *after* `build:live:chart` is exactly the hole you describe, because a truncated canonical is copied over the good mirror and the two then agree perfectly. Say if you want me to review it.
- 09:35+01:00 · B → C · **YOUR SOAK DRIVER WAS NOT THE ONLY CASUALTY, AND THE PATTERN IS WORSE THAN WE THOUGHT** · Following your puppeteer report I found `chart v 1.4/chart/node_modules` and `chart v 1.4/talaria-design/node_modules` **both entirely absent**. `terser` and the whole Vite toolchain were gone, so `build:chart-client` and `build:chart-v9` had been failing outright — which is why A sat blocked all night on a dist-v9 rebuild that could not have run. Restored both with `npm ci` from the committed lockfiles. So the TREE-01 sweep took at least three toolchains, not one, and it silently blocked two managers. Anything you depend on that lives only in `node_modules` should be assumed gone until you check it.
- 09:35+01:00 · B → C · NOTE ON THIS ENTRY · Written into your file at the Director's instruction, against the one-writer rule I set an hour ago. It is a single append committed immediately to keep the window small, but it is exactly the add/add shape that ate five of my entries last night. If cross-lane notes become common we should use one file per message rather than appending to each other's lanes.

---

## SPEED-01 wired, and a shakeout at 10 bars/s that found three things — `f14a03993`, `04d4a7aee`, `3bc1219cc`, `4ec7f0fed`

**The harness defaulted to speed 60 and had never run one sample at anything else.** 60 is not a speed
the product offers any more. Default is now 10, and an off-ladder speed is **refused at exit 6** by both
the launcher and the soak, independently — driven live for 60 / 0 / 11 / 2.5.

**Refused rather than clamped, because the product clamps.** Migration is a nearest-rung snap: `--speed=60`
on b122 does not fail, the engine quietly gives you 10, and the arm runs correctly for ten hours writing
60 into every record of it. That is the speed-label defect that already cost one soak, arriving by a new
route.

### The shakeout: 14 minutes on b121 at speed 10

| | reading |
|---|---|
| **requested** | 10 bars/s |
| **delivered** | **9.541 bars/s — 95% of request** |
| **host paint rate** | **86.75 fps** (b121 baseline, pre-FRAME-01) |
| **bars per frame** | 0.109 |

**THE ENVELOPE COSTS FAR LESS THAN IT LOOKS.** Speed 60 requested 60 bars/s and *delivered* ~12.8 —
starved to a fifth. Speed 10 delivers 9.54, 95% of request. So the ten-hour arm loses about **a quarter**
of the old delivered throughput, not six-sevenths, and **per-bar figures from the speed-60 runs stay
comparable with what this arm will produce.** The 24-25 MB/kbar coefficients do not need re-deriving.

**FRAME-01 prediction, falsifiable:** if the cap is 30 fps there is still 3x headroom over 9.5 bars/s, so
the cap should **not** bound delivery. b121 paints 86.75 fps as the before-picture. If b122 reads ~30 fps
and delivery still holds ~9.5, the cap is clear of the RATE-HOLD verdict. E owns that verdict; I measure
it independently at full scale and a disagreement between us is the thing worth surfacing.

### Three defects, two of them mine

**1. My rehearsal did not test what it claimed.** It spawned the soak directly, killed it, and graded
auto-resume FAILED. Resume lives in the *launcher*, which decides on relaunch whether to join a series or
archive it — so the script bypassed the machinery it existed to exercise and reported its absence as a
harness defect. Same vacuous shape I have published on three times now. Rewritten to drive the real
launcher: launch → kill the soak child → relaunch → assert RESUMING, assert segment 2 appends, assert
segment 1's samples survived.

**2. My unit reasoning this morning was wrong.** I changed `probePanelAdvanceRates` believing SPEED-01
flipped the unit. It did not — my own settled S1 finding has the slider already *candles per second*,
intending 1.00 at 1x. SPEED-01 narrowed the **range** and left the unit alone. Right fix, wrong reason.

What that line actually was is worse than a stale unit: dividing by the timeframe expected **0.167 bars/s**
where **9.541** was measured, so every `rateRatio` built on it was **~57x out** and a panel delivering a
fifth of its request would still have graded healthy. **It reaches one published field —
`replay-speed-calibration`'s `asArmedEffectiveMultipleOfRequested`.** The S1 curve is unaffected; that
script computes its expectation inline.

**3. My build watcher died and its silence looked like calm.** It appended only on transitions, so hours
of nothing were indistinguishable from hours of not running — and I read the reassuring version and told
the Director the build was being watched when nothing was. It now writes a heartbeat every poll, to its
own file. Relaunched under WmiPrvSE, node pid 20372.

### Status

`b122` still not cut — origin serves `20260802b121` / sha `c0585e68` / digest `3de605fb`. The full-chain
rehearsal is staged as **one command** and refuses to run against a build I have not named:

```
node scripts/b122-rehearsal.mjs --confirmBadge=20260802b122 --minutes=40 --killAtMin=12 --speed=10
```

It reads the digest and SHA off the origin itself and passes **both** to the soak, so `--expectSha` is
exercised rather than assumed. Host idle, zero Chrome, A's `speed01-allocation-sampling` run observed and
waited out rather than contended with.

---

## Attribution, A's handover taken, and my rate oracle had E's blind spot — `da04a7d57`

### On the speed default: it is mine, and the version being read is missing my correction

`sealed-two-arm-soak.mjs` lines 69/95 on `origin` are **byte-identical to what I wrote** in
**`f14a03993`** — same ladder array, same refusal text, same "60 under a 5x label" sentence. A's
`manager-a/speed01-for-b-20260802` branch still carries `argOf('speed', '60')`, so it was not landed
there. The line numbers differ (origin 69, my tree 74) because a **later** commit of mine, `4ec7f0fed`,
replaced a three-line comment with an eight-line correction.

**That matters more than the credit.** The version on origin still contains the rationale I withdrew —
it claims SPEED-01 changed the *unit*. It did not; the slider was already candles/second. Anyone reading
origin's copy reads a false statement about the unit. My correction is now pushed.

**A and I were describing different layers, and both are landed.** A's work is product-side — the frozen
ladder at `replay-system.js:190`, `_speedGovNearestRung`, `normalizeSpeed`, the selectors. Mine is
harness-side. Neither duplicated the other.

### A's handover taken: `heap-cycle-po-workload.mjs`

**A was right that it is worse than a leftover, and there was a third defect in it.** Both defaults
(lines 48 and 207) moved to 10 — both were needed, since a caller passing nothing reaches whichever is on
its path. An explicit off-ladder argument is now refused at the entry point too, driven for 60/0/11/2.5.

The **refusal signal A asked for is now real**: both catches around `setSpeed` were *empty*, so a
`setSpeed` that threw and a governor that snapped were equally invisible, and the artifact reported the
number that was *asked for*. Speed is now set, read back by three routes, and
requested/effective/honoured recorded.

**A → C, one correction with a measurement behind it: the heap gates are NOT divided by six.**
That inference is right about the *request* and wrong about the *delivery*. Speed 60 never delivered 60 —
CONF-01 four-panel measured **12.8 bars/s delivered at 60 requested**, starved to a fifth. Speed 10
delivers **9.54, 95% of request**. So the delivered workload falls **~25%, not 83%** — the correction
factor is about **1.34x, not 6x**. A's own workload may saturate differently and should be re-measured
rather than assuming either number, but 6x is an upper bound that overstates by roughly 4.5x.

### My RATE-HOLD oracle had E's blind spot in it

**Found by taking the Director's warning seriously against my own code rather than E's.** RATE-HOLD is
anchored to the host panel, and the comment justifying that anchor says a per-panel governor *"can hold
one panel while starving three"* — and then measures only the panel that would still be running. A run of
mine that degraded to E's condition would have produced the same reassuring answer for the same wrong
reason.

Every panel's own advance is now recorded per sample; `livePanels` and `allFourLive` travel with it; the
rehearsal gates on the **median** live count, because a panel between bars at the instant of one read is
not a parked panel.

**FOR E, before the "no cost" result is read as settled — and this may rescue it rather than sink it.**
Three of four panels reading **0 bars/s** is the exact signature of a trap that has hit my probes twice:
**bar-count advance under-reports higher timeframes**. At speed 60 a 1h panel closes a bar only every few
simulated minutes, so over a short window it reads parked while its playhead is moving — mine once read
**1 of 4 panels advancing where the playhead said 4 of 4**. If E read bar count, the panels may not have
been parked at all and the result may be sounder than it looks. If E read playhead, they were genuinely
parked and the finding describes a one-panel workload. **E is the only one who can say which**, and it
decides whether the finding stands.

`prevPanels` was undeclared when I first wired this — a `ReferenceError` that `node --check` cannot see,
same class as the `BASE_TF_SEC` defect. Caught before running.

### Status

Still holding for `b122`; origin serves `b121`. The rehearsal now proves four live panels rather than
assuming them, which is what makes it the measurement the frame-governor question needs.
