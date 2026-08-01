# A → Director. Queue 1 landed. Queue 2 invokes your override.

**2026-07-31 10:18 UTC+01:00** · branch `manager-a/tick-mode-off-20260731` · base `e675e5d1b`

---

## 1. TICK-OFF-01 is landed — `801783777`

Candle is the only playback mode. Nothing deleted; removal stays post-canary as you
instructed.

**Where it is forced.** `getPlaybackMode()` in `replay-system.js`, not the call sites.
Every behavioural read of the mode already routes through that accessor (17 reads),
and `startTickAnimation()` *already* re-routes to `startCandleByCandle()` whenever the
mode is not tick. So the switch selects a state the product already ships and users
already reach, rather than inventing a new one. `syncPlaybackModeControls()` reads the
same accessor, so the control cannot display "Tick" while the engine runs candle.

`this.playbackMode` keeps the user's stored preference untouched — the setting returns
intact when the switch is removed.

**FLAG-01/02/03.**

| | |
|---|---|
| 01 | `__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1`, one window read, read per call (not sampled at construction — pinned by mutant M5). |
| 02 | Truthy semantics. `[true, 1, 'yes', 'true', {}, [], '0']` all restore tick; `[undefined, null, false, 0, '', NaN]` all keep the kill. **Not** `=== true` — the defect I have been recording against other people's flags all week. Pinned by mutant M2. |
| 03 | **Both arms asserted to be a working product, and "working" is a MOVED REPLAY INDEX** — never an `isPlaying` boolean, never "the feature is inactive". Default arm advances 10→16 on the candle loop. Restored arm advances 10→90 on the tick loop. PURGE-2 turned three panels black behind an OFF state that satisfied "the feature is inactive". |

**Evidence.** 15/15 cells. 7/7 mutants applied *on disk* to *both* mirrors, each killed
by a **named behavioural** cell, negative control `NOT_APPLIED`, restore sha256-verified.
A 15-suite A/B against the base commit shows **no suite goes green→red** from this change.

**CONF-03 clears.** The choke point is config-independent: zero same-pair guards in
`replay-system.js` (`_multichartSamePairAsHost`, `_multichartFinerSamePairPanelSelfOwns`,
`_shouldAnchorPairSwitchToHostPlayhead`, `_mcCopySamePairFullRawData` all 0) against a
matcher proven live by 20/21/5/10 in `chart.js`. Unlike the clone and reseed cuts, this
one is reachable at four different symbols.

**Two disclosures.**

- **Nothing paints.** `node:test` cannot see a canvas, so the working-product assertion
  is at engine level. It is a far better assertion than an `isPlaying` boolean, but a
  browser must still confirm four panels play under the kill. This is the same gap I
  flagged on the trade-row virtualisation; it now generalises to every FLAG-03 on a
  visual path, and it is the strongest argument for a React/paint harness existing at all.
- **One existing suite had to declare the switch.** `b75-po-v5-1d-tick-speed-routing`
  characterises the *legacy tick* path. Without the flag it does not merely fail — it
  **hangs**, because the re-route arms a real `setInterval` it has no fake timers to
  clear. I set the flag in its window stub with the reason written next to it. Its
  coverage is preserved, not weakened; what it does *not* cover — default behaviour — is
  covered by the new suite.

**Pre-existing red, raised as a row, not mine:** `m20-q6-replay-lifecycle-binding` is
11p/2f on **both** arms — base and mine. Needs an owner.

---

## 2. Queue 2 — bar de-duplication. **I am invoking your override.**

> *"Override if the 14 are load-bearing — e.g. derived timeframes counted as copies of
> the same bar — in which case report that and the fix becomes eviction policy instead."*

**The 14 are load-bearing, in very nearly the exact way you anticipated.** They are not
14 redundant deep clones of one bar. Counted at four different symbols, one resident 1m
bar is referenced by roughly:

| Category | Count | What de-duplication would recover |
|---|---:|---|
| **Canonical object** (`_normalizeCandlesFromApi`) | 1 | — it is the origin, not a copy |
| **Shallow pointer arrays** — `_panelFullRawData`, `replay.fullRawData`, `replay.fullData`, the playhead prefix, `_btTfDataCache` | ~5 | **Zero bar objects.** 8 bytes of pointer each, not 231 bytes of bar. |
| **Derived timeframe / aggregate layers** — resampled `chart.data`, `_resampleCache`, `displaySeries`, `_prepareBarsForResampling` | ~4 | **Nothing.** A 1h bar cannot be deduped into a 1m bar; it holds different numbers. |
| **Shared bar-store deep clone** (`cloneBarsForStore`) | 1 | A real duplicate — but see below. |
| **Same-pair deep clones** (`_mcCopySamePairFullRawData`, 10 sites) | ~2 | **Zero — unreachable at four different symbols.** Already proven inert. |

Verified by me, not taken on report. The two spreads that carry the most weight:
`replay-system.js:2747-2748` is `[...this.chart.rawData]` / `[...this.chart.data]`, and
`chart.js:6179-6181` is `[...this.rawData]` — and that last one sits in the branch
guarded by `String(hostFid) !== String(fileId)`, i.e. **the different-symbol path**. It
is a shallow copy on exactly the configuration you measure.

**This is the same wall A1 hit, arriving from a different direction.** I measured, and
reported, that bounding `_panelFullRawData` frees **zero** bar objects because the slots
are pointer arrays over the same objects. The census reproduced that conclusion
independently. "One canonical copy per series per realm" is therefore already close to
true for the objects that cost real memory — the multiplicity is in array slots and in
derived timeframes, and neither is recoverable by de-duplication.

**The one genuine duplicate is smaller than it looks.** The shared bar store deep-clones
via `scalarClone` (`chart.js:3652-3660`), so its bars are real extra objects. But it is a
**singleton on the host window**, shared across all four realms — one clone total, not
one per realm — and it already has a working refcount release (`releaseFile` deletes the
file at zero refs, `chart.js:3705-3712`). It is one extra copy of the working set, not
fourteen.

**What I would build instead.** The store's ceiling, not its duplication, is the
interesting number: `MAX_FILES = 12` and `MAX_BARS_PER_TF = 200000` (`chart.js:3618-3619`),
and `put()` **unions by time** (`3664-3675`) so a `(fileId, tf)` entry's peak is set by
the widest publish ever made for it, never by the current working set. Twelve files
resident while four are open, each able to hold multiple timeframes of up to 200,000
bars, is an eviction-policy problem — which is where you said this lands.

**Bound I am putting on myself:** I have *not* measured that the store is actually large
in a running session, only that its ceiling is. I am not asserting a leak. Per EVICT-01
that needs a bytes-down number, and it depends on whether `releaseFile` is genuinely
called on panel close — the same open question as my eviction lane.

---

## 3. This re-points me at queue 3, and I think that is the right answer

The census reconciles **202,000 resident against 2,618 drawn** as roughly *history depth
× four realms*, not copy multiplicity. The draw budget (`RENDER_BAR_BUDGET = 500` plus
viewport buffer) accounts for the 2,618 almost exactly; the 77× is how much history each
realm holds, not how many times each bar is held.

That is your queue 3 — bound pre-session history — which you already called the largest
single baseline term. Two independent lines now point at it: your PO's report that a
3-year session also loads all preceding candles, and this census finding the resident
mass in depth rather than duplication.

**So unless you redirect me, I am taking queue 3 next rather than building a dedup that
the numbers say would recover almost nothing.** I will coordinate with E on the
indicator warm-up table rather than guessing it, as instructed.

One thing I will carry into it from this pass: because the slots are shallow, bounding
history has to bound *the canonical array* — trimming any one pointer array will produce
a confident, green, entirely fictional win. That is the trap A1 already walked into once,
and it is now the first oracle I will write.
