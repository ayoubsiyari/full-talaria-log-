# RULING — two blockers. B's assembled train is missing thirteen A commits including every fix that unblocked it, so `20260728b81` must be re-assembled. And A is right that the de-route is incomplete: FastAPI mounts `/chart/multichart` directly at `api_server.py:27022`, which is a second door the nginx redirect never touches — so my 22:15 "unreachable" ruling was wrong.

**2026-07-28 22:25. Both found by checking rather than by report.**

---

## 1. B's train is stale — thirteen A commits missing

**`git log manager-a/critical-path --not manager-b/plan3-20260727` returns thirteen commits, including every one that cleared the hold:**

- `20:45` Merge R2 — the order-eviction kill-switch (**P2**)
- `20:53` Merge R3 — IndicatorPerf bridge and presence tripwire switches (**P3, P4**)
- `21:19` Merge P6 — the restored live shell
- `22:17` revert of STAMP-1

**So the stamped train `20260728b81` at tip `f8a6c28a8` does not contain the fixes that unblocked it.** B assembled at 20:07; A landed everything afterwards.

**Ordered: B re-assembles from A's current tip and re-stamps.** The previous ship-go evidence describes a tree that is no longer the candidate.

**Nobody erred here.** B assembled the moment it was cleared to, and A landed the fixes after. **This is a normal consequence of a moving tip, and it is exactly why TIP-01 exists — the artifact is the authority and the artifact changed.**

## 2. A's de-route finding is correct, and it invalidates my 22:15 ruling

**A's note: *"de-route needs the FastAPI mount removed too."*** **Verified:**

```
api_server.py:27020  _MULTICHART_DIR_PATH = _CHART_ROOT_PATH / "multichart"
api_server.py:27022  app.mount("/chart/multichart", StaticFiles(directory=..., html=True), name="chart_multichart")
api_server.py:27023  print("✅ Multichart sandbox mounted at /chart/multichart/ …")
```

**The application serves that directory itself.** B's redirect is an nginx change, and **nginx only governs traffic that passes through nginx.**

**And here is the part that matters most: the host we have been probing all evening is `31.97.192.82:3000`, which is FastAPI directly.** So **B's redirect has been landing on a path that our own verification does not exercise**, and on that host the mount still serves the prototype shells.

**Consequence — I withdraw the central claim of `RULING-D3-SRI-EXPOSURE-SCOPED-20260728-2215.md`.** I wrote that all three CDN-loading shells were de-routed and the d3 exposure was *"unreachable on every served surface."* **It is not. The FastAPI mount is a second door, and it is the door our test host actually uses.** The exposure is reachable there today.

**This is the fourth premise of mine to fail on contact tonight, and it failed the same way as the others: I accepted a mitigation as complete without asking what else serves the path.**

## 3. Ruling — remove the mount rather than harden the shells

**A14.3 says de-route, do not repair, and removing the mount is the purest form of that.** It also closes the d3 exposure, the `a10` pins and the engine divergence **without editing either shell**, which is what made me reject the two-line swap earlier — and that reasoning survives.

**Line 27021 appears to be a guard, so this is likely a condition change rather than a deletion.** Establish that before writing.

**Ownership: `api_server.py` mount block is granted to B**, which owns delivery surfaces and already holds a scoped grant on that file. **A does not touch it.** This is deliberately kept away from A's queue because A's remaining items are the switch sweep and the two lag fixes, and those are the critical path.

**Both doors must close together in this train: the nginx redirect and the FastAPI mount.** Either alone leaves the route reachable by some path.

## 4. Verification requirement, because our test host is the one that exposes this

**The de-route is not accepted until `/chart/multichart/chart-host.html` fails to serve on `31.97.192.82:3000` — the FastAPI surface — not merely behind nginx.** **We have been verifying delivery against a host that bypasses the mitigation we were shipping.** That is worth recording as its own hazard, distinct from this bug: **a mitigation must be verified on the surface the verification actually uses.**

## 5. Credit, and the pattern I want noted

**A reverted STAMP-1 unprompted.** It had implemented my stamp instruction at 22:12, and when the de-route ruling landed it recognised that stamping files scheduled for deletion is wrong, reverted at 22:17, and **verified the revert was complete rather than assuming it** — the journal records `(empty = fully reverted)`.

**And A found the FastAPI mount while doing so.** A was not asked to audit the de-route; it noticed that a de-route ruling it had been handed was unimplementable as stated. **That is the third Director error A has caught tonight.**

**My wrong finding did cost real work this time** — A wrote STAMP-1 and then reverted it. The earlier avoided cost was a fifty-three-module write; this one was not avoided, merely small.
