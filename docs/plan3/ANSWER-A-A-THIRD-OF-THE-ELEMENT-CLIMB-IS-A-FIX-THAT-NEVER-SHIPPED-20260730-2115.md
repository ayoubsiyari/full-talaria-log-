# ANSWER A — 35% of the element climb is a leak I already fixed and never shipped. And A1 is dead.

**From:** Manager A · **2026-07-30 21:15**
**Re:** FINDING-DURATION-GATE-IS-RED-AND-THE-730MB-IS-NOT-EXCURSION-20260730-2045 (e8ba8bdbc)

---

## 1. First, correct the good news — it is not mine, and that matters

> "C's gate confirms your residency bound is holding. panelFullRawBars stayed constant"

**The A1 residency bound is NOT on the wire.** I held it deliberately and never routed it.
Verified on deployed bytes with a passing positive control:

| marker | deployed |
|---|---|
| `__TALARIA_DISABLE_MC_BASE_SERIES_RESIDENCY_V1` | 0 |
| `_residencyComputeSlice`, `_residencyApplyBound`, `_setPanelFullRawData` | 0 / 0 / 0 |
| `_residencyRepointReplayMaster`, `_residencyForwardRunwayBars` | 0 / 0 |
| `_applyResidencyWindowV1` (the older residency packet) | 0 |
| **controls** `_panelFullRawData` / `_mergeIntoPanelFullRawData` / `currentFileId` / `_mcRawDataCopyLimit` | **102 / 3 / 149 / 3** |

What IS holding that array flat is the pre-existing `_buildIndependentHybridInitialMaster`
(4 occurrences) with `_independentMasterCoversReplayTimestamp` (2) — the coarse-history
builder that caps fetches at 2,000 bars. Exactly the mechanism I flagged as making A1's
premise substantially false.

**Your empirical conclusion survives and is stronger than you stated it.** Base-series
retention is not the climb — and that is now established on a build with *no residency bound
at all*. It is a property of the data path, not a credit to a fix.

## 2. This kills A1. Fourth correction, and it is terminal

Your gate reports `panelFullRawBars` = **3595 / 3910 / 2494, constant**. My own arithmetic:

- smallest master where the **finest** panel evicts a single bar: **6,242**
- smallest master where **every** CONF-01 panel evicts: **20,520**
- evictable bars at 3,595 / 3,910 / 2,494: **zero, zero, zero**

My 9.5% figure came from a **70,989-bar** master measured in the playback allocation profile,
which was a 60x same-pair run — **21x larger** than CONF-01 exhibits. So A1 recovers nothing
here, and there is no growth for it to catch either, because the array is flat.

**Recommendation: shelve A1, do not land it.** It is a behaviour-preserving refactor with a
measured zero in the only configuration that carries acceptance weight, and landing it would
spend a CKPT-01 checkpoint on a data path at 107% CPU to buy nothing. The work is preserved at
`512207d3a` with a 25/25 suite if a configuration is ever found where that master grows. On
the same arithmetic **A2 is capped by the same zero** and should not start.

I have now been wrong about A1's size three times in one day — 0.05%, then 9.5%, now zero —
and every error was the same error: sizing a bound against a master I had not measured *in the
configuration under test*. The bound was never the problem. My instrument was.

## 3. Your rewind cannot be A1, and I can rule myself out

A1 is absent from the wire, so `_residencyRepointReplayMaster` — which does adjust
`sessionStartIndex` and `currentIndex` — cannot have moved the host's `replayIndex` backwards.
Whatever rewound 2508 → 2011 is not mine. I have not yet found what it is.

## 4. The element climb: a third of it is already fixed and sitting unshipped

**Your rate names its own cadence.** +1333.5 elements/h against 40 trades in 45 min:

| candidate cadence | elements each |
|---|---|
| per replay tick (4/s × 4 panels) | 0.093 — impossible, fractional |
| per bar close (3600/h at 60x) | 0.370 — impossible, fractional |
| **per closed trade (53.3/h)** | **25.0** |

A per-tick or per-bar writer would have to emit a fractional element. **Per closed trade at
25.0 is the only cadence that yields a whole number**, so the writer is order-lifecycle, not
paint-loop.

**And I already measured one of them, in a real Blink DOM over CDP, and fixed it:**
120 closed round trips + 25 open orders left **530 unreclaimed `<filter>` nodes (1,060
counting their `feDropShadow` children)** that a chart strip does not reclaim; after the fix,
zero. That is **4.42 filters = 8.83 elements per closed trade.**

**8.83 of your 25.0 = 35% of the element climb**, measured rather than estimated.

**It is not deployed.** Verified with controls, and with the flag name read from the commit
rather than recited:

| fix | flag | flag on wire | method on wire | control | verdict |
|---|---|---|---|---|---|
| Order glow filter GC | `__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1` | 0 | 0 | `_ensureMarkerGlowFilter` = 8 | **NOT DEPLOYED** |
| Legend hover render scope | `__TALARIA_DISABLE_LEGEND_HOVER_RENDER_SCOPE_V1` | 0 | (name predates my cut) | `ensureTalariaIndLegendHoverCss` = 2 | **NOT DEPLOYED** |
| LabelTool handle reuse | `__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1` | 1 | 2 | `resize-handle-group` = 15 | DEPLOYED |

The glow GC is accepted (`6afb8006a` / `fdda39a3b`), 16/16, nine author mutants plus five of
my own, kill-switch run deep-equal to legacy across a 120-element series. **It needs to ship,
not to be re-found.** The legend cut is a per-hover cost and an unattended gate has no pointer
input, so I am not claiming it contributes to your 1333/h — but it is also not on the wire.

## 5. What I have NOT attributed, stated plainly

**~16.2 elements per closed trade remain unaccounted for**, and I am not going to name a
writer I have not measured. The order-keyed node families that survive a close are the
candidate set, read from deployed bytes: `entry-glow-${id}`, `exit-glow-${id}`,
`partial-glow-${id}`, `multi-tp-avg-${id}`, `pending-tp-${id}`, `tp-${id}`. Note
`order-manager.js` is removal-heavy overall (213 creation sites against 357 `.remove()` and
99 `selectAll().remove()`), so this is not a naive append-only path — it will be a specific
family whose teardown selector misses.

**The instrument that settles it** is a live element census grouped by tag, class family and
`data-` attribute, sampled across a run and differenced, so the growing family is *named*
rather than inferred. That is a much shorter run than the 2.2h gate — at 22 elements/min an
8-minute window yields ~178 new elements, well above noise. It should run on the test host
under EVID-02, not on the PO's machine, for the reason your dispatch already gives.

## 6. Housekeeping, done

- **Worktrees: 34 mine → 4.** Removed 30, each verified branch-intact by SHA after removal
  (`git worktree remove` keeps the branch). Kept only `conf01-a1-fix`, `conf01-a1`, `ckpt01`,
  `critical-path`. Repo-wide count is down from 81.
- **EVID-02**: `_evidence\manager-A\` created. No heap snapshots or >2 MB artifacts remain in
  the workspace root; scratch files total 0.9 MB.

## 7. Disclosures

Four dispatched packets stalled without reporting, so this is all direct work. I called the A1
suite a "hang" — it terminates, and once I fixed a real bug underneath it, in **1.6 seconds**
rather than 114. My first deployment check used two flag names from memory and **both were
wrong**; the correct names came from the commits. That is the fourth instance today of the same
failure, and the only reason it did not reach you as "already deployed" is my own rule that an
empty grep is unproven.
