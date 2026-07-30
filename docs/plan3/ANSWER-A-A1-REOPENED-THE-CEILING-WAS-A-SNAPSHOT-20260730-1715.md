# ANSWER A — A1 is reopened, and the correction is against me, not you

**From:** Manager A
**Re:** your order to build A1; PLAN-FULL-EVICTION-CANARY-SUNDAY-1800 §4/§6
**Supersedes:** the ceiling in `FINDING-A-A1-MEASURED-DOES-NOT-PAY-AND-CAPS-A2` (16:20). The
structural half of that finding stands; **the 0.05% ceiling does not.**

---

## 1. I broke my own rule and it changed the answer

My "A1 recovers 0.05%" was measured at **fixed master sizes** — 1,440 / 10,000 / 50,000 /
200,000 bars per panel. That is a **snapshot**. `DUR-01` says an acceptance is a slope over
time, and I have spent all day enforcing that on other people's numbers while quoting an
endpoint reading as a ceiling on my own. Same error, my own packet.

**There is an uncapped growth path, and it runs during play, on your reference
configuration.** Verified by me just now:

- `_mergeIntoPanelFullRawData` (`chart.js` L7096, 21 lines) has **zero capping constructs**:
  0 `splice`, 0 `.length =`, 0 `Math.min`, 0 `limit`/`cap`/`MAX`/`trim`/`shift`.
- Its two callers are `_ensureIndependentPanelCoversPlayhead` (L7385) and
  `ensureReplayDataCoversTimestamp` (L8054). Both are **playhead-cover paths that run as the
  playhead advances**, and the first is specifically the *independent* — different-symbol —
  path. That is CONF-01 by construction.

**Your TradeZella datum is the corroboration.** "Their heap falls when playing while ours
triples" is precisely the signature an uncapped merge on the play path produces. A static
retention problem does not triple during playback; a growth path does. That number did more
to reopen A1 than anything in my own measurement, and I would not have had it.

So: **A1 is live work and I have dispatched it.** The number that sizes it is the growth
slope of `_panelFullRawData` over a play session, which nobody has ever measured, and I have
made it a required deliverable rather than an estimate.

## 2. What still holds — it shapes the fix, it does not oppose it

Bounding `_panelFullRawData` **alone** frees **zero bar objects**, at every master size. This
is structural, not numerical: under CONF-01 the reachable write is a shallow copy, so it and
`replaySystem.fullRawData` are two pointer arrays over the *same* bar objects, and the only
deep-clone path is same-pair-gated and inert. Shortening one array releases spine and nothing
else, while a length-based instrument reports a large win.

**So A1 bounds BOTH slots, one shared allocation, accounted in bar objects de-duplicated by
identity.** The choke point I landed at `62b6afcc9` deliberately does not truncate — that is
the work now in flight, not a missing feature.

Carried into the packet as you specified: window = visible range + replay lookahead + stated
margin, paging outward on demand; `__TALARIA_DISABLE_MC_BASE_SERIES_RESIDENCY_V1`
truthy-disabling; `SAFE-01` residency-before-allocation, which the oracle already enforces
through a Proxy read-counter that fails allocate-then-trim even on byte-perfect output; and
`GATE-01` — the oracle must be shown RED on a faithful reversal before its GREEN is trusted.

## 3. One correction to your stated rationale, because it points at a better argument

`_mcRawDataCopyLimit()` returns 200,000 at `chart.js:3530` — correct, and for any realistic
range that is indeed the absence of a cap. But I traced its consumers: there are exactly two,
`_mcCloneRawDataBars` (L3545) and `_mcIncrementalCloneRawDataBars` (L3574). Both are reached
only through `_mcCopySamePairFullRawData`, whose nine call sites are same-pair gated and
therefore **unreachable when four panels hold four different symbols**.

Under your own CONF-01 rule, that 200,000 is not the missing cap. **The missing cap is
`_mergeIntoPanelFullRawData`** — uncapped *and* on the play path *and* on the independent
path. That is a strictly better argument for A1 than the one you gave, and it survives
CONF-01 where the copy-limit argument does not.

## 4. TradeZella costs me my own favourite hypothesis

Their script cache is **twice ours** while their heap is **a fifth** of ours, holding the same
four instruments. That rules out per-realm script source as the differentiator — which was my
leading candidate for the eviction lane, sized at ~10.5 MB UTF-8 / ~21 MB UTF-16 per realm
from two independent censuses. If they ship more code in less heap, code is not the gap.
Recording it against myself before it can quietly survive as an assumption.

## 5. Status of everything else you named

**Realm-eviction grading** — in flight, read-only, five-flags-OFF ablation against default
under CONF-01/CONF-02 with fitted slopes. I will report "already released, nothing to build"
in exactly those words if that is the answer. The five teardown cuts and the stashed-panel
handle that makes them reachable are all confirmed live on b113, so this is a measurement
problem as you said. Worth knowing: my first read said the cuts were *absent* because I
scanned `chart.js`; they live in `multichart-manager.js`. False negative, caught before it
left the room.

**CKPT-01 (`2500c0331`) — chased, and it is half done.** The capture is sound: 120 assets,
14,424,642 bytes of b113, captured 14:29:31Z, honest limitations, commit evidence with a
passing positive control. **The rollback was never exercised.** I searched the manifest
myself: `rollback` 0 occurrences, `exercised` 0, `workingProduct` 0, `replayIndex` 0,
`negativeControl` 0. A retained artifact plus an unexercised rollback plan is exactly the
failure mode `CKPT-01` exists to prevent, so I have sent it back to execute the rehearsal with
a moved-replay-index working-product assertion, proof the browser loaded the retained bytes
rather than live, and a negative control that must go RED. **This gates A1's landing and I am
treating it as the gate, not a formality.**

**A2** — not started, not batched, will not start until A1 is measured. If A1 alone closes
most of the gap I will tell you and stop, per your instruction.

**Withdrawn, no packet spent:** the 35-site `setProperty` flag and the post-exit sampling cut.

**Not touched:** the twenty owner-blocked rows.
