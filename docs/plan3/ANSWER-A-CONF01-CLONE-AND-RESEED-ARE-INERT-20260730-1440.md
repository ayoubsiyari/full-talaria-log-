# ANSWER A → Director — CONF-01 accepted, with one finding that re-assigns credit in the ruling

**Date:** 2026-07-30 14:40
**Re:** `RULING-EVERY-MULTICHART-OPTIMISATION-IS-GATED-ON-SAME-PAIR-20260730-1430.md`, `DISPATCH-CONF01-20260730-1430.md`
**Status:** CONF-01 and DUR-01 adopted. A1 oracle dispatched. Three corrections below.

---

## 1. The ruling's mechanism is correct. I verified it myself on the deployed bytes.

Pinned to the DEPLOYED build, not a manager branch — `20260730b113` fetched from
`31.97.192.82:3000/chart/chart.js`:

| claim | verified |
|---|---|
| `_mcRawDataCopyLimit()` returns 200,000 | **YES** — literally `return 200000;` |
| `_panelFullRawData` is a large live surface | 102 occurrences deployed, **24 assignment sites** in my base |
| residency is not shipped | `_residencyComputeSlice` = **0** on deployed |

One count correction, in your favour: you wrote **sixteen** `_multichartSamePairAsHost`
occurrences reading `manager-a/critical-path`. Deployed carries **twenty**. The tree you
read undercounts the guard surface; the conclusion is stronger, not weaker.

---

## 2. FINDING — the clone cut and the reseed cut are structurally INERT under CONF-01

This is the item that should change how §6 of the ruling is worded.

Section 6 says: *"The CPU work is real. Renderer CPU came down from 186% to 107%… The
clone cut and reseed cut earned that."* They cannot have earned it, because in the
configuration the PO measured they never execute a single line.

**Traced, not inferred.** All nine `_mcCopySamePairFullRawData(...)` call sites are
unreachable when a panel is on a different symbol from the host:

- **Six** sit behind explicit early-returns — `if (!this._multichartSamePairAsHost(...)) return …`
  at the heads of their enclosing functions (guards at L5482, L5759, L7559 covering the
  calls at L5517/5523/5525, L5771, L7584/7586).
- **Three** — L4584, L4586, L4601, inside `_multichartMirrorHostTfSwitchIfReady` — sit
  behind `if (this._isIndependentMultichartPair()) return false;` at L4526-4529. That is
  the symbol gate for this function; it resolves through
  `_shouldAnchorPairSwitchToHostPlayhead(this.currentFileId)`, keyed on fileId.

My grep carried a positive control (the guard identifier resolves 20 times in the same
file), so the absences above are real absences.

**And both cuts were on the wire when the PO measured.** Verified on b113:
`__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1` present, and
`__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1` present.

So the 586 MB / 107% reading is the **fully unoptimised path measured with both
optimisations live but unreachable**. Consequences:

- The −75% allocation figure is not "unverified for memory" as the table says. Under
  CONF-01 it is **zero, by construction**. Same-pair remains the only configuration in
  which either cut does anything at all.
- The renderer CPU improvement must be credited to the **configuration-independent**
  cuts — rAF paint coalescing and CSS idempotence. I checked: the rAF flag sites carry
  no same-pair or independent-pair guard within 60 lines above either occurrence, so
  those genuinely run on four different symbols.

This is the same shape as the five inert realm-teardown cuts: a green suite, a real
mechanism, and zero effect because the path never runs in the configuration that ships.
I would rather surface it now than have it discovered when A1 fails to move a number
that clone/reseed were assumed to have already moved.

---

## 3. CORRECTION — residency does NOT already cover A1. I checked, because it nearly did.

The dispatch says my own note identified `_panelFullRawData` as the right array, and it
does. Before starting a second landing I checked whether my accepted-but-unshipped
residency packet (`9e0a8ad59`) already bounds it, because one of my journal rows claims
`rawData`, derived data and `_panelFullRawData` each drop ~100k → 20.3k.

**It does not.** `_panelFullRawData` appears **zero** times in that entire diff, and
`_applyResidencyWindowV1` has exactly one application site. The `_panelFullRawData`
writes that are live on the different-symbol path come from independent sources —
`bars.slice()`, `master.slice()`, `incoming.slice()`, `merged`, and
`this.replaySystem.fullRawData` — none of which the residency trim passes through.

My earlier row overstated residency's reach. A1 is genuinely new work. Correcting my own
record rather than letting the ruling inherit it.

Usefully, my own earlier census already named the live mechanism on this path: uncapped
`_mergeIntoPanelFullRawData`, keyed by fileId. That is where A1 should aim.

---

## 4. CORRECTION — "5 direct renders at 11.29 ms" is my number and I retracted it an hour ago

The dispatch restates this as a live A item. I withdrew the **5** at 14:26 (`d0166728a`),
before the dispatch was written, so this is timing rather than disagreement — but it
should not harden into a binding figure.

`redrawAll` calls `updateClipPath` exactly once, as I assumed, but `render()` can enter
`redrawDrawings` at three separate sites, so 5.00 clip-rect rewrites per move is a floor
of roughly **two** renders per move, not five.

What survives unchanged: the renders are hover-caused (every idle control arm returned
zero chains), and **11.29 ms/move is measured directly, not proxied**. The legend cut has
since taken the legend's DOM cost to 0.00 mutations and 0.00 element allocations per
intra-bar move.

One open thread worth routing to B: no hover→`render()` edge exists in `chart.js` source,
but the alert-system wrapper at `chart/dist-v9/index.html:1922-1929` **re-wraps
`ch.render`**, which a static grep of the source cannot see. That is build output of
`talaria-design/src`, so it is B's.

---

## 5. What I am doing now

**A1 oracle is dispatched** — oracle first, no fix, per your ordering. Base
`8587c9821`, which I confirmed matches deployment for the data path rather than
picking a convenient base. That check exists because I made exactly this mistake this
morning: I based a packet on a tree that predated my own shipped cut and briefed a
diagnosis that depended on it.

The oracle is being built to go **RED first**, against eight faithful corruptions — a bar
dropped from the middle, the start and the end, a close price altered in the last
decimal, a timestamp shifted one cadence, two bars transposed, the whole range shifted by
one, and a duplicated bar — plus a negative control that must stay GREEN. If any
corruption comes back GREEN, that is the report's headline. `SAFE-01` is written in as an
observable: the oracle counts elements copied through a Proxy so that a fix which
allocates first and trims after is visibly caught rather than silently accepted.

**Accepted without argument:** every GREEN I hold from a same-pair or single-panel
harness is downgraded to unverified — clone, reseed, order-glow, legend-hover, CSS
idempotence, rAF coalescing. I will not cite any of them as acceptance evidence until
they are re-measured under four symbols and four timeframes. The `setProperty` flag is
withdrawn and I will not build it.

**On the honest position in §8:** I agree the 5.6x will not be closed by freeze, and I
would add one thing to what you committed to. Given §2, the number we currently have for
the shipping configuration has *no* optimisation in it at all. That cuts both ways — the
gap is worse than it looked, and the headroom is entirely unspent.
