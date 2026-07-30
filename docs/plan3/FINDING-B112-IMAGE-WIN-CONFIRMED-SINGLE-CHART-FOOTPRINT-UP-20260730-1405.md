# FINDING — b112: the image win is confirmed, and single-chart footprint is up ~200 MB

**Director · 2026-07-30 14:05 · binding on A, B, C**

## The measurement

PO, Brave Task Manager, DevTools closed, hard-refreshed, fresh tab started 13:59.
Build **20260730b112**, which contains the clone cut, the reseed cut, LabelTool, the
countdown guard, the TF-downshift trio and D's merged lane.

**Single chart, b112 vs this morning's b103 single chart:**

| Column | b103 (morning) | b112 (now) | Delta |
|---|---|---|---|
| **Image cache** | 63,075K | **5,346K** | **−58 MB — CONFIRMED KILL** |
| Memory footprint | 309,208K | **509,597K** | **+200 MB** |
| JavaScript memory | 113,876K (104,188K live) | **177,700K (154,035K live)** | **+64 MB total, +50 MB live** |
| Script cache | 32,304K | 49,679K | +17 MB |
| GPU memory (tab) | 43,729K | 79,352K | +36 MB |
| GPU process | 288,452K | 269,540K | −19 MB |
| CPU (tab) | 16.7% | 36.8% | — (fresh tab, still loading) |

**Two charts, b112:**

| State | Footprint | JS memory | CPU (tab) | CPU (GPU proc) |
|---|---|---|---|---|
| 2 charts idle | 418,917K | 162,156K (156,954K live) | 14.6% | 6.5% |
| **2 charts playing** | **980,276K** | **359,140K (251,588K live)** | **110.4%** | **51.2%** |

## Finding 1 — the logo kill is real and it is the first confirmed kill of the day

63,075K → 5,346K. **Fifty-eight megabytes removed from every page load, for every
user, permanently**, plus the decode time that came with it. Measured on the PO's own
machine with the instrument that found it, on a hard-refreshed fresh tab, against a
stated build.

That is the whole of B's asset packet delivered and verified. The CI decoded-size budget
means it cannot return with the next design handover.

## Finding 2 — single-chart footprint rose ~200 MB and I am flagging it before anyone celebrates

We removed 58 MB of images and the process got **200 MB heavier**. So something in b112
added roughly **258 MB** on a single chart. JavaScript is up 64 MB total and **50 MB
live**, script cache up 17 MB, tab GPU up 36 MB.

**Leading hypothesis, and it is a hypothesis (BRIEF-02): the clone cut traded allocation
for retention, exactly as its own design implies.** "Copy once and append the tail" means
the copy is **kept alive** for the life of the panel. Before, each 70,989-bar clone was
created and discarded — 176 MB/s of short-lived garbage that a generational collector
reclaimed almost free. Now there is one retained array per panel instead of a torrent of
temporary ones.

If that is the mechanism then **the A/B was right and incomplete at the same time**:
allocation down 75%, script CPU down 44%, heap "down 71%" measured as *churn*, and the
resident floor up because the thing we stopped throwing away is now being held. Lower
CPU, higher memory. That is a real trade and it may still be the right one — but nobody
chose it deliberately and the PO's bar is no leak *and* no CPU issue, not one bought with
the other.

**Competing candidates, to be settled by flag A/B rather than by argument:** the reseed
cut retaining a second copy on the same principle; the TF-downshift trio; D's merged lane;
or a fresh-tab artifact, since this tab was 39 seconds old and mid-load when sampled.

**Every one of these ships behind a flag.** The A/B is four flag flips and costs minutes.

## Finding 3 — the CPU picture is genuinely ambiguous and must not be reported either way yet

This morning's 186% was **four** charts. The PO measured **two** this time, at 110.4%
tab plus 51.2% GPU.

Two charts at 110% is not obviously better than four at 186%, and the GPU share nearly
doubled. But it is not obviously worse either, because these are different panel counts,
different sessions and a different pair. **The comparison the plan needs is four charts
playing on b112 against 186% on b103, and it does not exist yet.**

I am not claiming the CPU improved. I am not claiming it regressed. **MEAS-01 and the
same-instant discipline apply to panel count as much as to gauges**, and I have broken
that rule twice today already.

## Orders

**C — grade the clone and reseed cuts NOW. This is ahead of everything except the soak
that is already running.**

1. Four charts playing, b112, versus this morning's b103 baseline. Same gauge, same panel
   count, post-forced-collection. **Renderer CPU across all three processes, allocation
   rate, and resident heap.** The A/B predicted −75% allocation and −35% renderer CPU; we
   need the live number.
2. **Resident floor with each flag ON and OFF**:
   `__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1` and
   `__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1`. If footprint drops when they are
   disabled, Finding 2 is confirmed and we know the price of the CPU win.
3. Report allocation and resident memory as **two separate numbers**. Conflating them is
   what let the original 0.258% reading mislead us for a day.

**A — one question, answered from the code, not from the harness.** Does the incremental
copy retain an array per panel for the life of the panel? If yes, state the resident cost
per panel at 70,989 bars and whether the retained copy can be a view or a windowed slice
rather than a full duplicate. **Do not change anything until C's flag A/B returns** — this
may be the correct trade and reverting it blind would give back a −44% script CPU win.

**B — nothing to fix yet.** b112 is a good ship and the asset packet is verified. Hold the
wire on b112 and do not displace it while C grades (DEPLOY-02).

## Method note

The PO asked for one chart, four charts, and four charts playing. What came back was one,
two, and two playing — and the two-chart data is still useful, but it cannot answer the
question the plan is waiting on. **A baseline is only a baseline at the same panel count.**
The four-chart run is requested again, unchanged.
