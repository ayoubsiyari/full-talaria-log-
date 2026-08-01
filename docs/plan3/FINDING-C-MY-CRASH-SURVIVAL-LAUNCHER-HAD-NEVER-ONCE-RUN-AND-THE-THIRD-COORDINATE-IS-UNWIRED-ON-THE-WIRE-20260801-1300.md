# Finding — the launcher that never ran, and a coordinate that is wired in source and not on the wire

**C — 2026-08-01 13:00 — on the 12:27 correction: bind TOOL-01 and PASSPORT-3, and verify the third coordinate end to end**

---

## 1 · The correction was right, and the shape is the one I built PROC-3 to catch

My 11:54 commit added `build-info.mjs` and `heap-cap.mjs` — 189 lines — and **nothing imported either**.
`sealed-two-arm-soak.mjs` imported nine modules and neither was among them; there was no
`--max-old-space-size` anywhere in the harness or in `detach01.mjs`. Present, not bound. I wrote a
paragraph that morning about an oracle testing a model of the code and then shipped the same defect in my
own file, one commit later.

The mechanism was not carelessness about the code, it was carelessness about the tree. I wrote the wiring
into `sealed-two-arm-soak.mjs` and `detach01.mjs` in the **shared** worktree, and it was swept while B
worked in the same directory. The two library files survived because I had committed them; the wiring did
not because I had not. **TREE-01 is stronger than it is written:** in a shared worktree uncommitted work is
not merely invisible to gates, it is *destructible*, and what it leaves behind can be worse than nothing —
a harness importing modules that no longer exist.

Both are now bound, and the binding is proven the way the gauge guards were: by reverting it and requiring
the self-test to go red.

| Mutant | Result |
|---|---|
| M4 · TOOL-01 present but **uncalled** — `heap-cap.mjs` exists, the soak never calls it | **CAUGHT** |
| M5 · PASSPORT-3 present but **unenforcing** — the SHA is read, the refusal never fires | **CAUGHT** |
| M6 · the cap flag **built and then dropped** before the detached child is launched | **CAUGHT** |

Plus the three original gauge mutants. **6/6 caught, every file restored byte-identical, self-test 15 → 23.**
The three refusal paths are now distinct and separately observable: **exit 4** heap cap, **exit 2** digest,
**exit 3** source commit.

---

## 2 · The finding that is larger than the task: `launchDetached` had never once run

Proving TOOL-01 reached the detached child meant calling `launchDetached` — and it returned `ok=false`
while the identical `Win32_Process.Create` call typed at the shell returned `ReturnValue=0`.

The cause: it interpolated the command into a PowerShell `-Command` string with `JSON.stringify`, which
produces backslash-escaped quotes. **PowerShell does not use backslash escaping for quotes** — it uses
backtick or doubled quotes — so the string terminated at the first `\"` and the call failed. Every time.

Which means **every detached run I have launched was launched by a hand-rolled WMI call typed into the
shell**, not by the primitive. The self-test covered `openRun`, append-as-taken, fsync, heartbeat, torn-line
resume and the segment boundary — and never the launcher. The one function the entire crash-survival story
rests on was the one function with no test, and it had never worked.

It fails loudly now: `-EncodedCommand` with base64 UTF-16LE has no quoting surface, and a failed launch
returns its reason instead of a silent `ok=false`. Proven end to end by a child that reports **its own** V8
limit — 704 MB under a 512 MB cap, with `--max-old-space-size=512` in its own `execArgv` — so a flag that is
constructed and dropped cannot pass.

**This changes nothing about the runs already taken** (the hand-rolled launches genuinely were detached, and
`WmiPrvSE` was verified as parent at the time) and everything about the ten-hour run, which was going to be
the first to use the primitive.

**Still outstanding from the 11:31 instruction:** the deliberate full-Cursor-shutdown proof. It now has to
run through the *fixed* launcher, because the version that would have carried it did not work.

---

## 3 · The third coordinate: verified against B's emitter, unverified on the wire

`/chart/build-info.json` on the live origin returns **HTTP 200, `text/html`, 29,406 bytes of app-shell
login HTML.** Not a 404 — a 200. A reader that checks `res.ok` is green; a reader that does `res.json()`
inside a try/catch records `sourceCommitSha: null`, which B's own commit message names as *worse than no
passport, because it looks like an answer.*

So the reader names every failure separately: `SPA_FALLBACK`, `NOT_DEPLOYED`, `NULL_SHA`, `MALFORMED`,
`WRONG_SIGNATURE`, `HTTP_ERROR`, `UNREACHABLE`. There is no path that returns a quiet null.

**The success path had never executed anywhere.** Every observation to date was of the failing branch, so a
green at B's cut would have been the first time the accepting code had ever run — and the first execution of
a code path should not be the one you are trusting a ten-hour result to. So I ran **B's own emitter**,
`bump-chart-engine-build.mjs`, served its exact bytes over HTTP, and pointed the reader the soak imports at
them:

| Check | Result |
|---|---|
| B's emitter produces `build-info.json` for a checkpoint build | PASS |
| **the success path executes** — the reader accepts those bytes over HTTP | PASS, `state=OK` |
| the SHA is recovered intact, not truncated or case-mangled | PASS |
| `buildId` travels with it, so badge and source are one record | PASS |
| a non-checkpoint build emits `sourceCommitSha: null` | PASS |
| **the null trap is caught** — a well-formed passport naming no source is REFUSED | PASS, `state=NULL_SHA` |
| a 200 carrying HTML is refused as `SPA_FALLBACK` | PASS |
| a 404 is `NOT_DEPLOYED`, distinct from every other failure | PASS |
| the verifier leaves no product file modified | PASS |

**9/9.** The null case my own file names as the trap is now *observed being refused*, not asserted to be.

**Exactly one thing remains unverified at B's cut:** whether the deployed front door serves the file at all.
B's gates lock the nginx ordering and the whitelist, but every one of them reads the repo — none makes an
HTTP request — which is precisely why they are green while the origin serves HTML. `passport3-verify
--mode=live` is the one-line check; run at the cut, the transition is witnessed rather than inferred.

---

## 4 · Two things found by checking rather than trusting

**B's emitter has three product side effects, not one.** It writes `build-info.json`, rewrites `chart.js`'s
build constant, *and bumps the version in `chart/package.json`*. Six emitter runs walked it 1.4.31 → 1.4.37
in a tree that is supposed to be quiescent. I caught it only by running `git status` after committing rather
than trusting the `finally` block I had just written. The verifier now captures every file the emitter can
touch and **asserts** the tree clean afterwards instead of claiming it.

**The verifier passed 9/9 and then aborted on exit** with a libuv assertion, returning `0xC0000409`. A
verifier whose exit code contradicts its own result reads as a failure to any gate that consumes it —
strictly worse than failing honestly. `process.exitCode`, not `process.exit`.

---

## 5 · Worktree

`manager-c-verification` on `manager-c/soak-infra` arrived with **no `node_modules`**, so the soak could not
have run from here at all. `puppeteer` is installed pinned to **exactly 24.43.1** — the version behind every
number I have published — because a different puppeteer is a different instrument, and `^24.10.2` would have
resolved to whatever shipped this week. 0 vulnerabilities.

Tree clean. Three commits: `c9101ec7b` (binding), `9c9de03d3` (verifier), `ef82485f1` (side-effect fix).
