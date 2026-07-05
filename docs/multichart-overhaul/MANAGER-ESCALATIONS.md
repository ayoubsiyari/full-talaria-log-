# Manager Escalations — Director Decision Log (inbox)

**Purpose.** A dedicated, self-contained report for every **crossroad, risk, or major
plan deviation**. Each entry is written so the Product Owner can hand it directly to the
Director and get a binding decision without needing the rest of the chat context.

**When the Manager MUST write an entry here (not just a §6 finding):**
- A **crossroad**: two or more viable paths with real trade-offs (e.g. A vs B).
- A **risk**: something that could break production, invalidate measurements, or waste
  worker effort if we proceed as planned.
- A **plan deviation**: measured evidence contradicts a plan assumption or a prior
  Director decision (per D-003: record + escalate, never silently re-plan).

**Routing:** raw measurement/verification detail lives in `MANAGER-FINDINGS.md`; the
Director's rulings live in `DIRECTOR-DECISIONS.md`. This file is only the **escalation
request** — the question put to the Director. Each entry links the finding it came from
and is closed by citing the Director decision that resolved it.

---

## Entry template (copy for each new escalation)

```
## ESC-00N — <short title> (YYYY-MM-DD)
**Type:** Crossroad | Risk | Plan deviation
**Source:** MANAGER-FINDINGS §6x (+ any capture/diag doc)
**Status:** OPEN → (resolved by D-0NN)

### Context (what we know, measured)
<1–3 short paragraphs; numbers, not feelings.>

### The decision needed
<the single question the Director must answer.>

### Options
- **A — <name>:** <what it means>. Pro/Con.
- **B — <name>:** <what it means>. Pro/Con.

### Risk if we choose wrong / do nothing
<blast radius, reversibility, kill-switch availability.>

### Manager recommendation
<one option, with the one-line reason.>

### Director ruling
<filled after the fact: D-0NN summary + date.>
```

---

## Escalation history (retro-logged for continuity)

These crossroads were already raised and resolved inline before this file existed;
listed here so the ledger is complete.

| ID | Title | Type | Source | Resolved by |
|----|-------|------|--------|-------------|
| ESC-001 | Option A vs B — plan order vs measured pain | Crossroad | §5, §3 | D-001 (Option B) |
| ESC-002 | B-FIX-2 held pending objective repro (RC1 maybe not-a-bug) | Plan deviation | §6f | D-004 / D-005 / D-006 |
| ESC-003 | Retarget to host pair+TF switch latency | Crossroad | §6h, §6i | D-006 |
| ESC-004 | §6i latency is multichart-only (contradicts "not panel-gated") | Plan deviation | §6j | D-007 |
| ESC-005 | B-FIX-3 partial win — TF-switch path still eager | Plan deviation | §6n | D-011 (B-FIX-3b) |

## ESC-006 — viewport-first regressed same-pair panel data ownership (2026-07-05)
**Type:** Risk / Regression
**Source:** MANAGER-FINDINGS §6p (build b601)
**Status:** OPEN

### Context (measured)
The viewport-first family (B-FIX-3 pair + B-FIX-3b TF) fixed host switch latency, but
introduced a regression in the same-pair panels. On a 2×2 host TF switch:
- Before (S6 baseline): B/C/D `fetches = 0`, `extendsFromParent = 85–89` — copying host.
- After (b601): B/C/D `fetches = 47–77`, `fetchedBars = 94–150k`, `extendsFromParent = 1–3`
  — each panel self-fetches the full history and re-renders on every host TF switch.
Aggregate fetches increased (host + N panels paging). `seams = 0` (no corruption).
Single chart unaffected. PO-visible symptom: "other panels re-render each time I switch
TF on host A."

Root: viewport-first defers the host's full 1m master to background; same-pair panels
require a COMPLETE host master to clone and fall back to self-fetch when it is incomplete.
The panel-feed contract (DIAG-B4 #2 / D-011 assumption "panels tolerate a short master-lag
window") did NOT hold — panels self-fetch instead of waiting/mirroring.

### The decision needed
How to resolve the ownership regression while keeping the host-latency win?

### Options
- **A — Kill-switch rollback now, then fix panel-feed (recommended):** flip the relevant
  kill-switch(es) to restore panels-copy immediately (no redeploy), then a scoped fix so
  panels adopt the host's viewport-first window / wait for host master instead of
  self-fetching. Pro: instant safety, keeps the process (fix root, measured). Con: host
  fast-switch temporarily reverts where the kill-switch is applied.
- **B — Leave 3/3b on, fix-forward panel-feed directly:** keep host latency win, add the
  panel-side wait/mirror in a new gated task. Pro: no user-visible revert. Con: ships a
  known-regressed behavior to users until the fix lands (violates rollback-first policy).

### Risk if we choose wrong / do nothing
Doing nothing = every same-pair panel re-fetches ~100k bars on each host TF switch:
worse aggregate load than the original bug, constant re-render. Reversible via kill-switch
(no corruption — seams 0).

### Manager recommendation
**A.** Kill-switch first (isolate whether TF-switch flag alone, or both, restores
panels-copy), capture evidence, then a gated panel-feed fix (panels go viewport-first /
wait for host master rather than self-fetch). Do NOT patch-on-patch live.

### Director ruling
**D-013 (2026-07-05): Option A.** Kill-switch isolation first (TF flag alone, then both;
include one pair-switch probe), record the matrix; then B-DIAG-5 (read-only — name the
exact file:line where a same-pair panel decides to self-fetch on incomplete host master);
then B-FIX-3c (panels WAIT-AND-MIRROR host hydration, own kill-switch, re-enabled with
3/3b in the same build). New standing acceptance criterion: same-pair panel `fetches = 0`
in every 2×2 capture. Status → resolved by D-013 pending Step-1 matrix.

**Update (D-014/D-015):** Step-1 matrix run — TF-flag-alone did NOT restore panels-copy;
both-flags-off DID (B/C/D fetches 0). D-015 accepted matrix CONCLUSIVE: viewport-first
family = source, B-FIX-3 pair-load the essential culprit. **ESC-006 step 1 CLOSED.**
Durability ruling = option (a): ship minimal default-OFF build. Remaining fix work under
D-015 sequence: default-OFF build → PO S6 re-capture (settles extendsFromParent=0 anomaly
+ fresh 3c "before") → B-DIAG-5 → B-FIX-3c. **ESC-006 RESOLVED.**

---

## ESC-007 — B-FIX-3c direction: re-enable viewport-first, or solve host latency another way? (2026-07-05)
**Type:** Crossroad
**Source:** MANAGER-FINDINGS §6r/§6s; BASELINE-RESULTS §S6-b/§S6-c; DIAG-B5
**Status:** OPEN

### Context (what we know, measured — build b604, viewport-first default-OFF)
The default-OFF rollback is confirmed durable and is a genuinely GOOD state for the core
scenario:
- **Same-pair, same-TF 2×2, host 1m→1h→1m (S6-b):** host 4 fetches / 8000 bars, panels B/C/D
  `fetches = 0` (pure mirror), renders 23→32, seams 0, no errors. Fast and correct.
- `extendsFromParent = 0` was a false alarm — it just scales with host master size (settled).

Two pains survive the rollback:
1. **Deep-history / high-TF host switch is slow ("candle by candle").** The multichart host
   builds high TFs by resampling a huge 1m master. S6-a (1d): host 91 fetches / 178k bars /
   1152 renders. Single-chart reference for the same TF: 4 fetches / 4000 bars. So multichart
   host pays ~22× fetches / ~44× bars because it is forced onto a 1m master. This was the
   original B-FIX-3 target; B-FIX-3 (viewport-first) attacked it but regressed ownership (ESC-006).
2. **Cross-TF same-pair panels self-fetch (S6-c):** panels on 4h with a 1m host self-fetch
   (10/19) because the host's 1m viewport master (24k bars) does not span the 4h panel
   viewport, so there is nothing to extend (DIAG-B5 §Verdict). Note this is NOT the
   hydration-race DIAG-B5 assumed — it happens with viewport-first OFF too.

DIAG-B5's specced B-FIX-3c (panels consult `_mcViewportFirstMaster*` and wait-and-mirror
instead of self-fetch) only has meaning **if viewport-first is re-enabled** — those host
hydration fields are dormant when the flag is OFF.

### The decision needed
What is B-FIX-3c, given the rollback is already a good same-pair/same-TF state?

### Options
- **A — Re-enable viewport-first + ship the DIAG-B5 wait-and-mirror in the same build.**
  Solves pain #1 (host fast-switch) and, via the panel wait-and-mirror, prevents the
  ESC-006 ownership regression. Pro: keeps the host-latency win; matches D-013's original
  3c intent. Con: highest risk — re-introduces the exact family that regressed; requires the
  panel-feed contract to actually hold this time; two coupled behaviors under test at once.
- **B — Leave viewport-first OFF permanently; solve host latency by letting the multichart
  host fetch the display TF directly (like the single chart), instead of forcing a 1m master.**
  Attacks pain #1 at its architectural root (the 1m-master tax) rather than hiding it behind
  background hydration. Pro: removes the 22×/44× penalty at the source; no deferred-master
  race, so panels never see an incomplete master. Con: larger architectural change; must
  preserve replay frame-stepping and cross-TF panel resample, which currently rely on the 1m
  master; needs its own DIAG.
- **C — Ship rollback as-is for now; scope 3c only to the cross-TF panel gap (pain #2), defer
  host-latency (pain #1).** Pro: lowest risk; locks in the good same-TF state; the cross-TF
  fix is small (make cross-TF same-pair panels ask the host to extend its 1m master, or
  resample from it, before self-fetching). Con: 1d "candle by candle" slowness remains
  unsolved (the user has flagged it explicitly).

### Risk if we choose wrong / do nothing
Rollback is safe and correct today, so "do nothing" has no correctness risk — only the
unsolved 1d slowness. Choosing A wrong = re-live ESC-006. Choosing B wrong = a larger refactor
that could disturb replay. All paths keep the default-OFF kill-switch as the safety net.

### Manager recommendation
**B**, with a read-only DIAG first (name exactly where/why the multichart host is pinned to a
1m master and what breaks if it fetches display-TF directly). Rationale: pain #1 is the
user's actual complaint and B-FIX-3's viewport-first was only a way to *mask* the 1m-master
tax; removing the tax is more durable than re-attempting the background-hydration dance that
already regressed once. Keep viewport-first OFF. If the Director prefers to preserve the
existing architecture, fall back to **A** with the DIAG-B5 wait-and-mirror as a hard gate.

### Director ruling
**D-016 (2026-07-05): Option B direction, gated on B-DIAG-6 (read-only, dispatch now).**
Remove the 1m-master tax at the source rather than masking it; expected landing zone is
a HYBRID (display-TF master for browsing/switching; 1m session master hydrated LAZILY
only when replay needs bar-level stepping). B-DIAG-6 must name every 1m-pinning site +
consumer (replay stepping, panel feed, cross-TF resample, indicators, playhead), rule on
hybrid feasibility, and answer what cross-TF panels (pain #2) consume under B — pain #2's
fix is DEFERRED until then. Viewport-first stays default-OFF permanently (superseded;
cleanup after B lands). Fallback to Option A only via a new escalation with DIAG evidence.
Follow-up #2 (high-limit `/smart`) folds into B. S6-b/S6-c on b604 = canonical "before".
**ESC-007 CLOSED.**

---

## ESC-008 — Is the 6b replay smoke test still a hard pre-B8 gate? (2026-07-05, build b14)

### Context
D-018 approved DIAG-B8b as the B8 implementation contract; the pre-dispatch tree-attribution
gate is CLEARED (working tree clean vs HEAD, both `chart.js` byte-identical `bfbe1f62…`, every
hunk attributed to a signed-off task — see FINDINGS §6y). The one remaining blocker per
D-017/D-018 #4 is the **6b replay smoke test** ("prove 6b's finer-than-display boundary live
before B8 builds on it"). PO ran a smoke pass on b14 and asked the Manager to escalate the
next call to the Director rather than iterate on test configs.

### Live evidence (b14, `__mcDiagReport()`, seams column = contiguity)
- **Same-TF 2×2 (host 1m, panels 1m):** HOST/B/C/D all `fetches 0, fetchedBars 0, seams 0`;
  resamples ~384, renders ~437–580. No flood, no freeze reported. (Same-TF mirror is clean.)
- **Boot single host 1m:** `fetches 6, fetchedBars 0, seams 0` (served from cache).
- **4-layout 1m:** HOST `fetches 12`, B/C/D `fetches 0, seams 0`.
- **Mixed-TF (host 4h, panels 1m) — the PO pain config:** HOST `fetches 29 / fetchedBars 32000 /
  lastFetchMs 665`; B/C/D (1m, finer than host) `fetches 0 / bars 0 / seams 0`. PO qualitative:
  host 4h "loads too slow", panels B/C/D "drift/move even with all sync off".

### Key interpretation
1. The mixed-TF slowness + drift is the **known B8 pathology** (host hauls a fine master to feed
   finer same-pair panels; panels stay coupled → drift). It is NOT a 6b regression and NOT caused
   by any Manager change this session (docs-only). §6x already isolated it: toggling the 6b
   kill-switch made **no difference** to the drift → **6b is not the cause**.
2. The PO's A/B/C runs landed on **host = 1m (same-TF)**, which structurally **cannot exercise
   6b** — 6b only engages when replay steps *finer than the host display TF*. So those runs prove
   same-TF mirroring is clean (valuable) but do **not** prove 6b's boundary.
3. The only 6b-relevant capture (host 4h) is a static snapshot: it cannot distinguish
   lazy-hydrate-on-step (6b working) from eager-at-boot, and has no kill-switch comparison.

### The decision needed
Given (a) §6x already cleared 6b as the drift cause, (b) live same-TF captures show no flood /
no freeze / seams 0, and (c) B8 re-touches the exact replay-master ownership path and ships with
its own kill-switch + owner counters — **is the full standalone 6b replay smoke test still a hard
precondition for the B8 build, or can its proof be reduced / folded into B8 acceptance?**

### Options
- **A — Hold the line (D-018 #4 as written).** PO runs the corrected host-4h backtest replay
  smoke (boot-bars capture → play → lazy-vs-eager kill-switch comparison) before B8 dispatch.
  Pro: proves 6b's boundary independently before B8 builds on it; cleanest audit trail. Con:
  another PO test cycle on a fiddly config; PO fatigue; B8 acceptance re-verifies the same path
  anyway.
- **B — Fold 6b smoke into B8 acceptance.** Dispatch B8 impl now; B8's live acceptance already
  exercises host-TF-switch across the panel TF in both directions + replay playhead sharing +
  owner counters, which subsumes the 6b replay proof. Keep `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER`
  as the revert. Pro: one test cycle instead of two; proves the shared path once, at the layer
  that changes it. Con: departs from D-018 #4; a latent 6b replay bug would surface entangled
  with B8 (though both share a kill-switch to isolate).
- **C — Minimal residual proof (Manager recommendation).** Accept the same-TF live evidence as
  partial 6b closure now (no flood, no freeze, seams 0). Require only ONE cheap capture before
  B8 dispatch: host 4h backtest, `__mcDiagReport()` at boot with the lazy flag OFF (default) vs
  `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER = true` — proving HOST boot `fetchedBars` is small
  when lazy (deferred) and large when eager (kill-switch reverts). No long replay-play session
  required; the replay-correctness risk is already covered by the clean same-TF captures + §6x.

### Risk if we choose wrong / do nothing
All paths keep the 6b kill-switch as the safety net, and B8 keeps its own. Choosing A costs only
PO time. Choosing B risks entangling a (so-far-unobserved) 6b replay bug with B8 diagnosis.
Choosing C leaves the long replay-play path formally unproven standalone but relies on B8
acceptance to cover it — acceptable because B8 owns that path next.

### Manager recommendation
**C.** It honors the *intent* of the D-018 #4 gate (prove the lazy-defer + kill-switch revert)
at minimal PO cost, and lets B8 acceptance carry the replay-correctness proof for the code it is
about to rewrite anyway. Fall back to **A** if the Director wants the boundary proven fully
independent of B8; **B** only if the Director judges the two-test overhead not worth it.

### Director ruling
**Resolved by D-019 (2026-07-05).** D-019 did not pick A/B/C by letter but ruled the operative
question directly: **B8 impl dispatch is authorized now; the 6b replay smoke test blocks B8
*ship*, not *dispatch*.** That is effectively Option B — dispatch proceeds, and the 6b boundary
proof lands before ship (and is carried by B8's own live acceptance, which re-exercises the
replay-master path in both handover directions). The lazy-defer + kill-switch causality
(Option C's cheap capture) remains a sensible pre-ship check but no longer gates the worker
prompt. **ESC-008 CLOSED.**

---

## ESC-009 — B8 does not fire in the PO's canonical repro (1m panels over a 1m backtest master) (2026-07-05, build b15)

### What happened
B8-IMPL is code-correct and signed off (FINDINGS §6aa). PO ran the §6x scenario on b15
(host displaying 4h, three same-pair panels on 1m, backtest armed, all sync OFF) and reports
**no change**: dragging the host (chart A) into empty space to load old candles still makes the
1m panels drift/shift backward each time.

### Root cause (code evidence, not yet PO-diag-confirmed)
B8's self-own gate `_multichartFinerSamePairPanelSelfOwns()` fires only when
`panelMs < hostMs * 0.92`, where `hostMs` is the host's **committed native TF**. That native TF is
emitted by `_emitMultichartHostDataCommit()` as
`replaySystem.isActive ? replaySystem.rawTimeframe : _nativeRawFetchTf`. In a backtest the host's
replay master is **1m**, so the host commits nativeTf = **1m**. The PO's panels are **1m** →
`1m < 1m*0.92` is false → **panels never self-own** → they remain same-native-TF mirror panels
coupled to the host's shared 1m master. When the host pan-loads older 1m candles, the shared
master grows and the mirror panels shift → the observed drift.

**B8 keyed "finer-than-host" on the host's NATIVE master (1m); the PO's scenario is host
DISPLAYING 4h over a 1m master with 1m panels — identical native granularity, so B8 cannot
fire.** B8 was built to spec; the spec's axis does not cover this repro. The drift is a
mirror-coupling / viewport-stability issue on host master growth, not a finer-owner case.

### PO confirmation pending
Reproduce → `__mcDiagReport()`; expect the 1m panels to show `fetches 0` AND `ownerFetches 0`
(mirroring, B8 not engaged). This distinguishes "B8 didn't engage" (this diagnosis) from "B8
engaged but drifts anyway."

### The decision needed
How do we kill the drift for same-native-TF mirror panels when the host master grows on backward
pan-load — and do we also want to decouple their loading?

### Options
- **A — Viewport-stability fix (lowest risk, keeps zero-fetch mirror).** When the shared host
  master prepends older bars (host backward pan-load), mirror panels compensate `offsetX` so the
  visible candles stay anchored (I3: viewport channel only, no data-ownership change). Kills the
  drift while preserving the same-pair `fetches=0` win. Does NOT reduce host-side "group-by-group"
  loading — that stays a separate host-loading concern.
- **B — Re-key "finer-than-host" to the host's DISPLAY TF, not native.** Then 1m panels ARE finer
  than a 4h *display* → they self-own bounded 1m windows and decouple entirely (no drift, no
  group-by-group dependency on the host). Matches the user's mental model. Higher risk: it re-opens
  the same-pair ownership axis (ESC-006 territory), doubles 1m storage (host + panel both hold 1m),
  and must still preserve replay playhead sharing.
- **C — A now, B later.** Ship the cheap viewport-stability fix to stop the drift immediately;
  evaluate B (loading decoupling) as a separate gated task if group-by-group loading remains a
  complaint after A + 6c.

### Manager recommendation
**Read-only DIAG first, then most likely C.** The confirmed part (B8 can't fire here) is solid,
but the *exact* drift mechanism (offsetX-not-compensated-on-prepend vs. panel re-anchoring to the
new extent) should be named by a read-only diagnosis before any code, so the fix targets the real
line. Then A is the safe, high-value immediate win (kills the drift, keeps zero-fetch); B is a
larger ownership change to consider only if loading smoothness is still unacceptable after A.
Rationale: the drift is the user's sharpest pain and A addresses it without re-entering ESC-006
risk; B changes what the render path owns and should not be bundled with a drift fix.

### Director ruling
_(pending)_

