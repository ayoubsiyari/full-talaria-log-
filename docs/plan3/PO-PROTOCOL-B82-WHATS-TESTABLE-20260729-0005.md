# PO PROTOCOL — Two fixes in the deployed `b82` are testable now, both of them defects the PO found personally. The lag is NOT among them and expectations are set explicitly, because a PO who tests multichart tonight expecting smoothness will conclude nothing works. Verified present in B's tip before writing this.

**2026-07-29 00:05. Test 2 matters beyond confirmation: A's harness never reproduced the leak, so the PO is the only instrument that has ever produced it, which makes this the demonstration for a fix currently labelled "effect not demonstrated."**

---

## 1. Verified present in the deployed build

**Checked on `manager-b/plan3-20260727` — the tip B deployed as `20260728b82` — not inferred from A's branch:**

- `REPLAY_HIDDEN_PAUSE` present in `replay-system.js`, **both trees**.
- `instance.fullData = null` at `replay-system.js:9935`, **both trees**.
- **Three kill-switches available for A/B:** `__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1`, `__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1`, `__TALARIA_DISABLE_M27_ENGINE_RELEASE_V1`.

## 2. TEST 1 — the Sleepwalker. Ten minutes, mostly waiting.

**The defect the PO found:** a chart left in a background window reached **1.24 GB and 18.8% CPU** while doing nothing, with detached divs climbing 65,036 → 81,423. **Cause: replay had no visibility handling and kept running at full speed in a hidden tab.**

1. Open the chart on the test host. Start replay at any speed.
2. **Note memory in Chrome's Task Manager** (`Shift+Esc`).
3. **Switch to another window for ten minutes.** Do not just cover it — background it.
4. Return. **Note memory and CPU again.**

**Expected: memory roughly flat and CPU near zero while hidden.** **Before this fix it climbed continuously.**

**Then prove it is the fix rather than luck.** In the console, `window.__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1 = true`, repeat, and **the old runaway should return.** Then `delete window.__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1` and confirm it stops again. **A fix that cannot be switched back on to reproduce the defect has not been demonstrated.**

## 3. TEST 2 — the Hoarder. This one is the demonstration, not a confirmation.

**The defect the PO measured:** `M20Q6ReplaySystem` instances went **4 → 17** across five multichart cycles, over 80 MB of orphaned candle data, detached divs 22,151 → 44,953.

**Why this test carries unusual weight: A built a harness to reproduce this and the harness never showed the leak.** The fix was merged labelled **"code-correct, effect not demonstrated."** **The PO's session is the only place this leak has ever appeared.** So this is not a re-check — **it is the measurement that decides whether the memory fix works.**

1. Load the chart fresh. **DevTools → Memory → take a heap snapshot.**
2. In the filter box type `M20Q6ReplaySystem`. **Record the count.**
3. **Open multichart, wait for panels to load, close it. Five times.**
4. **Take a second snapshot. Record the count again.**
5. Also filter `Detached <div>` in both snapshots and record both numbers.

**Expected: the count does not climb toward seventeen.** **If it still climbs, the memory fix does not work and I need to know tonight rather than after canary.**

## 4. What has NOT changed, stated plainly so a null result is not misread

**The multichart lag is unchanged.** FIX 1 is authorised and not yet written. **Four panels will feel exactly as they did — roughly 50% worse, now measured as frame pacing collapsing from 60fps to 10fps at p95 while the bar rate stays identical.** **Do not read this as the fixes failing.**

**Idle CPU is unchanged** — the render-loop guard was deliberately cancelled for a 1–3 point gain against a screen-freeze risk.

**The CPU spikes to 120% are unchanged** and disclosed per D-6.

**The trade-journal fix cannot be seen at all.** It prevents a deletion; **the only way to observe it is to trigger the bug, which is not something to do on a whim.**

## 5. Recommendation — test now rather than wait

**Both tests are independent of FIX 1, so waiting buys nothing.** **Test 2 in particular closes a verdict that has been open for hours and that no instrument other than the PO has ever been able to produce.**

**If either result is bad, the remaining hours get spent on the right thing.** **If both are good, two of the five monsters move from "built" to "demonstrated dead", which is the difference between what we believe and what we can say in the release notes.**
