# FINDING (C) — The dress rehearsal found three launcher defects, and my heap snapshot reported 386.8 MB into an empty file

**2026-08-01 21:40** · manager C · rehearsal artifacts are THROWAWAY and stamped non-publishable

---

## 0. The instruction that produced this, and why it worked

> "Launch through the real repaired launcher, kill it mid-run on purpose, watch auto-resume record a
> segment boundary, flip the badge and watch the series refuse itself, and drive the R3 falsifier logic
> once. This retires R4 instead of mitigating it: 'tested' becomes 'exercised.'"

All four ran. **Every one of the three launcher defects below sat behind a green self-test.** The suite was
23/23 this morning. It tested the pieces the launcher is built from and never the launcher driving a run.

---

## 1. The binding rule was respected: no instrument entered the sealed bytes

The LoAF logger installs through `Page.addScriptToEvaluateOnNewDocument` plus a live-frame `evaluate`,
recorded per segment as `loafInstall: {onNewDocument: true, liveFramesInjected: 4, viaProductBytes: false}`.

One detail worth stating because it would have produced a census of nothing: `addScriptToEvaluateOnNewDocument`
**only reaches documents created after the call**, and this soak's four documents already exist by the time
the boot gate passes. Registration alone would have run all night and attributed zero. Both routes are used.

The served digest is unchanged by every addition in this finding.

---

## 2. Three launcher defects, none of which a self-test had caught

| # | Defect | What it would have cost tonight |
|---|---|---|
| 1 | **Relaunch archived the series instead of resuming it.** `fire-sealed-soak` renamed the existing JSONL aside on every launch. | A crash at hour eight relaunches into an **empty file**. DETACH-01's resume, torn-line truncation and segment-boundary marker all work perfectly — on a series nobody would ever join. The one case the harness exists for. |
| 2 | **The launch proof read a stale heartbeat.** It waited for a heartbeat to *exist*; on a resume one always does. | It reported `heartbeat: ALIVE, child pid 14372` for a pid I had killed 30 seconds earlier. A failed relaunch reads as a success. Now the heartbeat must **change** (new pid or newer timestamp). |
| 3 | **The concurrency guard skipped the arm being launched** (`if (name === ARM) continue`). | Two children appending to one JSONL. This is not hypothetical: the rehearsal produced it — pid 19000 at `--hours=0.12` and pid 3628 at `--hours=0.11`, both writing `REHEARSAL-SOAK-TRADES.jsonl`. Two interleaved series in one file, very hard to detect afterwards. Now refused at exit 2, **exercised**. |

Defect 3 is the one I would not have predicted. The guard was written to enforce sequencing between arms
and I never asked what it did about a second copy of the same arm.

---

## 3. The four rehearsal mechanics, exercised

- **Launch** — real launcher, WMI-detached, parent is `WmiPrvSE`. First time `launchDetached` has actually
  launched a soak; every prior detached run was a hand-rolled WMI call typed at a shell.
- **Kill mid-run** — hard `Stop-Process` at 4 samples. Relaunch resumed with `resumedFrom: 4`, prior samples
  intact, restart recorded as **segment 2**.
- **Badge flip** — one byte appended to a mirrored `chart-window-limit.js`. Next sample:
  `__void: "Served build changed mid-run: 3de605fb… -> 51cd1134…. Stopping rather than producing a series
  across two builds."` The series refused itself.
- **R3 falsifier** — driven on five inputs, 5/5, including the branch that matters (below).

**On the mirror:** mid-run seal drift is the one refusal that cannot be exercised against production
without changing the bytes real users are served. The soak now takes `--sealOrigin`, **defaulting to the
boot origin** so a real firing runs the identical code path with no test-only branch. When the two differ
the artifact is stamped `rehearsal: true, publishable: false`.

---

## 4. Two defects in my own manifest additions, both found by exercising them

**The heap snapshot reported success into an empty file.** The artifact says
`{"attempted":true,"ok":true,"mb":386.8,"elapsedMs":9783}`. On disk: **0 bytes**. I resolved the write on
`stream.end()` instead of the stream's `close` event, so the process finished the run and exited with
everything still in the buffer — and then reported a figure for it. Fixed two ways: resolve on `close`,
and **stat the file and compare against the counted bytes**, failing if they disagree. A by-product that
lies about existing is worse than one that is missing.

**The LoAF census attributes more script time than the frames it came from.** Sample 2 attributes
25,755 ms of script inside 17,960 ms of animation-frame time. Same shape as the three instrument defects
the ≤1000 ms/s invariant caught. Rather than quietly publishing a wrong decomposition, the census now
carries `scriptMsTotal`, `frameMsTotal`, `attributionRatio` and `overAttributed`, with an explicit note:
**use it for ranking and for naming who calls what; do not quote its ms/s as a share of the thread** until
the overlap is explained.

The ranking itself is already informative and consistent with the 23:40 LoAF-invoker result — the top two
entries every sample are `chart.js <- Response.json.then` and `chart-window-limit.js <- Window.fetch.then`,
i.e. fetch/JSON continuations, ahead of `m20Q6InertableScheduledCallback <- FrameRequestCallback`.

---

## 5. Host health earned its place on its first run

Worst headroom during the rehearsal: **1.2%**, with `node.exe` aggregate at **66,565 MB across 9 processes**
— other managers' test runs sharing the host, including `node --test scripts/sr04/evict-behind-playhead.test.mjs`.
By the last two samples the same columns read 77.8% headroom and 182 MB across 2.

Samples 1–4 of that rehearsal were taken under severe host contention and samples 5–6 were not. Without
these columns that would have been an unexplained bend in a memory series, exactly like the 22:16 orphan.

---

## 6. R3, implemented to the Director's stated contract

**Provenance:** the PO directive numbering R1–R4 is not in my tree. I implemented the two properties as
stated at 14:45 and this should be corrected against the directive if it differs.

The branch that matters is `SCENARIO_ARTIFACT`: no plateau, **but** an open position old enough that
MEM-1a's floor is pinning bars behind it by design. Without it the falsifier returns `MODEL_VOID` on a run
where eviction behaved exactly as specified, and the night is aborted on a correct build.

On a clean `MODEL_VOID` the harness now sets a stop at **~2 h** — abort the night, keep the hour.

Not yet exercised on live data: `oldestOpenPositionAgeBars` read `null` on every rehearsal sample because
the governor's positions were closed at each sample point. The reader's negative path works; its positive
path is unproven and I will not claim otherwise.

---

## 7. The build moved, and not the way the wire notice says

The origin has served **`20260802b121` since 14:00 UTC**, roughly seven hours before the notice that it
"will flip b120 → b121 shortly". More importantly it **re-cut under its own badge**: at 14:50 the passport
read `sourceCommitSha a17e00e8…`, and it now reads `c0585e68…` for the same `buildId 20260802b121`.

That is the exact case PASSPORT-3 exists for — a digest-only seal would have called these the same build.
It also means a badge is not a build identity, which is worth remembering when the 18 cherry-picks land.

---

## 8. Build smoke, staged

`fire-sealed-soak --smoke` runs the **real** harness against the **real** origin under the **real** seal —
only the duration (20 min) and the output path differ. `build-smoke-grade.mjs` grades it on eleven gates
written down in advance so the answer is not a judgement call at 22:20. FAIL gates: fewer than 8 samples,
any browser death, any sample under 4 live playheads, bars not accumulating, the governor not closing
trades, a null memory or blocking gauge, seal or source-commit drift, any harness error. A missing artifact
exits 3 — **the smoke not running is not a pass**.

---

## 9. Standing

| | |
|---|---|
| R4 | **retired by exercise**, and it cost three defects to do it |
| Manifest additions | wired, exercised, two defects found and fixed |
| Build smoke | staged, grader exercised on a real artifact |
| Blocking the fire | b122 does not exist yet; origin still serves b121 |
| Last gate | full-shutdown proof with Cursor closed |
