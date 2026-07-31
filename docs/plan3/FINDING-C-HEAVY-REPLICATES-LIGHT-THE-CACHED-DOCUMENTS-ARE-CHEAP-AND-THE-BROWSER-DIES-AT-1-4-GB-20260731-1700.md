# FINDING — heavy replicates light: the cached documents are cheap, reload returns clean, and the browser dies at 1.4 GB

**2026-07-31 17:00** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** `RESET-01` — the third axis · **Rules applied** `MEAS-01`, `UNIT-01`, `KILL-02`
**Instrument** `RESET-RETURN-PROBE-V1` · **build** `20260731b120` (moved b118 → b120 mid-session)
**bfcache state**: declared per arm below, now a required field on every artifact
**Artifacts** `RESET-RETURN-{RELOAD-BFON,LOGOUT-BFON,LOGOUT-BFOFF,TABCLOSE-BFON}-20260731.json`,
`PAGEHIDE-RELEASE-VERIFY-20260731.json`, `BROWSER-SURVIVAL-CANARY-20260731.json`,
`SELF-RELOAD-CHECK-20260731.json`

## Verdict first

The Director asked whether a heavy document is released or whether the light test was measuring nothing.
**Heavy replicates light on the memory question, and the answer is more specific than either of us
expected: bfcache does retain documents, and the documents it retains are cheap.**

At a document carrying **1.34 GB**, taken out through logout:

| arm | peak | after logout | released | documents retained |
|---|---|---|---|---|
| bfcache **ON** (what users run) | 1,340.3 MB | **511.8 MB** | 828.5 MB (61.8%) | 7 → **4** |
| bfcache **OFF** | 1,318.2 MB | **528.8 MB** | 789.4 MB (59.9%) | 4 → **1** |

The arms differ by **17 MB, and the bfcache-ON arm is the lower of the two** — inside run-to-run noise on
this gauge. So the back-forward cache holds **four documents that cost nothing measurable**. This is
exactly the distinction the Director insisted on: counting documents would have reported a 4-to-1
difference and implied retention, and pricing them shows there is none. Three light documents and three
1.5 GB documents are a different product, and what we have is the first kind.

**And the reason is the one that closes the loop.** Chrome declines to put a very large document in the
back-forward cache. The light session — 369 MB, 17 MB heap — was small enough to be cached, which is why it
showed the 3 → 6 → 9 document staircase. The heavy session is not, so the catastrophic case does not occur:
the cache protects itself against exactly the document we were afraid it would hold.

## The reload exit, which the PO named first and which had never been run

Fully graded, and it is the one arm whose re-entry is trustworthy:

- session 1 single-chart first paint **649.6 MB**, four-panel first paint **901.0 MB** (heap 186.8, 7 docs)
- heavy peak **1,317.7 MB** — **+416.7 MB** above four-panel first paint
- after reload **570.9 MB**, documents 7 → 4, **746.8 MB released (56.7% of peak)**
- re-entry **637.0 MB** with a real chart present (1 realm, 2,011 resident bars)
- **RETURN DELTA −12.6 MB** against session 1's single-chart first paint, documents equal

**Reload passes the return axis.** Session N+1 started 12.6 MB *below* where session 1 started, at a
document 3.5x heavier than the light test's. Note the like-for-like: re-entry restored **one** realm, not
four, so it is graded against the single-chart baseline. The four-panel layout does not restore itself
after a reload, which means this arm does not test re-entry into a four-panel session.

## Tab close, for completeness

Peak 1,313.9 MB → **305.6 MB** after close, documents 7 → 1, **1,008.3 MB released (76.7%)**. The most
thorough exit, as expected once the renderer is gone.

## The thing that should decide the next day of work: the browser dies at 1.4 GB

I could not reach the gigabyte-above-baseline state the ruling asked for, and the reason is not patience.
**The browser exits at about 1.38 GB total footprint.** It has now done so three times:

| run | last good reading before death |
|---|---|
| ten-hour bend soak, died at 10 minutes | **1,377.6 MB**, 13,485 resident bars |
| RESET-01 reload arm, first attempt | **1,377.9 MB** — renderer 877.1, GPU 337.2, heap 243.5, 4 renderers, 8,542 bars, 20 closed trades |
| RESET-01 reload arm, second attempt | died at the sample after 1,407.7 MB |

**Exit code 1, no signal.** Chrome's own stderr contains nothing but unrelated GCM registration noise. This
is not the renderer being killed and replaced — the whole browser process goes, which is why my gauges
reported `Session closed. Most likely the browser has been closed`.

Three things follow, and they matter more than the return axis:

1. **The PO reports 1.5 GB sessions. We die at 1.38 GB.** If this reproduces off my machine, users are not
   experiencing a slow leak at the top end, they are experiencing a crash.
2. **The ten-hour soak cannot answer the bend question** until this is fixed. It did not get killed by
   another manager's rehearsal, which I initially suspected and then disproved: it reached the ceiling and
   died of it, at the same footprint as the reload arm. Every long run is capped at roughly ten minutes.
3. **The ruling's heavy bar is unreachable as stated.** A gigabyte above a 901 MB baseline is 1,925 MB,
   past the point where the browser stops existing. I ran the return axis at the heaviest survivable state
   instead, behind a declared 1,300 MB ceiling, and this shortfall is the finding rather than an excuse.

## What is NOT settled, stated as unresolved rather than passed

**The logout and tab-close return axes are VOID, not passing.** On both, re-entry never produced a chart:
zero realms and zero resident bars after 126 seconds, with the page sitting at `/chart/`. My grader
initially reported these as **RETURN AXIS PASSES** — because an unloaded page uses less memory than a
chart, it "returned" 88 to 358 MB *below* baseline. That verdict flattered us on an instrument that never
reached the state it claimed to compare, and it is now a hard gate: a re-entry with no chart is VOID.

Whether that is a probe gap or a product defect is open. It is suspicious that a **reload** re-initialises
the chart fine while a **fresh navigation to `/chart/` in the same browser** — after re-login, or in a new
tab — does not within two minutes. If that is the product, it is a serious second-session defect and it is
on the same axis the ruling is about. It needs a browser and one focused hour.

## Reconciling this with the four disabled release hooks

`PAGEHIDE-RELEASE-VERIFY-V1` re-read the served bundle independently, because that claim arrived in my
namespace from another manager's process and is load-bearing. Confirmed: **four distinct release handlers,
eight registrations, every one beginning `if (ev && ev.persisted === true) return;`**, and the only
`pageshow` listener does not branch on `persisted`, so there is no restore path. Corrected: there are nine
`pagehide` registrations, not four — each release handler is registered twice, benignly.

**The ninth handler is the sharper point.** `flushPendingSessionState` does *not* guard on `persisted`. So
on being put into the cache we run the handler that flushes session state and none of the handlers that
free memory. The document is not unaware it is being put away; it acts, and the action it takes is the one
that costs nothing to keep.

That remains true and remains worth fixing — but this measurement changes its priority. The hooks are
disabled on a path that **the heavy document does not take**, because Chrome will not cache it. They are
latent, not currently expensive. `Cache-Control: no-store` on the document response is still the cheap
lever and `/chart/` currently carries no such header, so the document is bfcache-eligible by header; but it
buys tens of megabytes on light sessions, not the gigabyte I implied this morning.

## My own defects, caught and fixed today

- **My grader would have published a pass built on an empty page.** Fixed as a hard VOID gate.
- **I forced garbage collection every twelve seconds during the heavy phase**, which both suppressed the
  heaviness the ruling asked for by roughly 200 MB and perturbed the measurement. A user's Chrome is not
  told to collect garbage fifty times in twenty minutes. GC now happens only at the three readings where a
  settled number matters.
- **`realms` was an array compared against `4`**, so every re-entry silently graded against the wrong
  baseline.
- **The single-chart baseline referenced a function defined later** and threw silently, leaving me with no
  like-for-like reference at all on the first two runs.
- **Both gauges swallowed their errors into `{}`** and I logged `undefined` for four minutes without a
  cause. They now record why they failed and stop after two blind reads.
- **I blamed another manager before checking.** 21 Chrome and 9 node processes from a release rehearsal were
  running when my soak died, and I suspected an external killer. A blank Chrome then survived 8.76 minutes
  untouched, so the deaths were mine. The canary artifact stands as the negative result.
- **I reported a signature/filename discrepancy the Director raised as already-fixed without re-checking
  the timestamps first.** The file was wrong at 11:50 when the check was made and was restored at 12:09;
  the check was accurate, and what is on disk is a replication rather than the original.

## Recommendation

1. **Escalate the 1.38 GB browser death to A and B as a P0 above the return axis.** It caps every long
   measurement at ten minutes, it sits below the footprint the PO reports, and it is the difference between
   shipping a leak and shipping a crash.
2. **Item 7 closes on the memory question at heavy weight**, on the reload exit and on the cost of the
   cached documents. It does **not** close on logout or tab-close re-entry, which are VOID.
3. **Resolve why a fresh navigation to `/chart/` does not initialise a chart** while a reload does. If that
   is the product, it belongs on this axis and it is worse than the staircase ever was.
