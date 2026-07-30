# P0 window-claim hang — reproduced at the socket level, closed on b113, and one half of the report does not reproduce

**Date:** 2026-07-30 17:45
**Route:** C's, exactly — chart tab with four panels on four symbols, reload it, open a second tab
**Instrument:** real Chrome via Puppeteer against a server that accepts every control POST and never answers
**Gate:** `chart v 1.4/chart/modules/window-control-socket-release.test.mjs`

---

## 1. The finding, in one line

On the genuine pre-fix module **two control POSTs are held by the browser and never released** —
exactly the two C watched — and on the shipped b113 module **zero** are, with two released at
**10001 ms and 10002 ms**, the `CONTROL_TIMEOUT_MS` ceiling.

| | control POSTs | released by client | still held at end | released at ceiling |
|---|---:|---:|---:|---:|
| pre-fix (`be7bc73a6^`) | 4 | 2 | **2** | 0 |
| shipped (b113) | 4 | 4 | **0** | 2 |

The two released in the pre-fix arm went at ~30 s, dropped by the reload navigating away — not by
any ceiling, because there was none. That is the distinction the gate now holds.

## 2. Why the earlier fix did not cover this, and which one did

`9fc8763f0` (B-0197) fixed the claim *retry deadlock*: a rejected claim becoming the cached answer
for every later gated fetch. It never bounded the request. The ceiling arrived in `be7bc73a6`
(B-0203) with `controlFetch`, `AbortController`, `CONTROL_TIMEOUT_MS` and the heartbeat in-flight
guard. Both are in b113. The Director's question at 13:25 — whether the fix reached the surface C
was measuring — is now answered by measurement rather than by argument: it does.

## 3. What did NOT reproduce, and this matters

**Static asset starvation did not occur in either arm.** Every ungated icon completed, worst case
29 ms, across 108 requests over 78 s in the first run and 72 in the second, with two tabs and four
panels live and control POSTs stalled throughout.

There is a structural reason, and it corrects the mechanism in the original report:

- `isGatedUrl` covers only `/api/file/*` and `/api/sessions/{n}/state`. Static PNGs are **not
  gated**, so the JS claim gate was never what held them.
- Socket growth cannot happen on this route. `heartbeatTimer` is started **inside the claim's
  success handler** (`sendClaimRequest`, `if (!heartbeatTimer) heartbeatTimer = setInterval(...)`).
  If the claim never resolves, the heartbeat never starts, so a hung claim produces **one** held
  socket per tab and never more. Two tabs plus a reload gives the four POSTs above, of which two
  persist — against Chrome's six-per-host HTTP/1.1 pool, that leaves headroom.
- Both the direct canary (`:3000`) and the public host answer **HTTP/1.1**, so the per-origin cap
  does apply in principle. It simply was not reached.

So the "browser-wide until you close the browser" characterisation is not supported by this
reproduction. The hang was real and is fixed; the starvation of a dozen PNGs for 64 s has a cause
this route does not produce. **Escalated to C** for the exact conditions — tab count, logged-in or
not, direct `:3000` or the public host, and the DevTools export. Under `DECL-01` I do not get to
declare that half dead by reasoning, and I am not doing so.

## 4. The negative control had to be the old code, not the flag

Flipping `__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1` is **not** a valid negative control
here. The heartbeat in-flight guard sits outside that flag, so a flag-off arm keeps half the fix.
My first probe used the flag and showed no difference between arms — which would have read as "the
fix does nothing" had I stopped there. The gate uses `git show be7bc73a6^:...` and asserts the
reference genuinely lacks `controlFetch` before trusting it.

## 5. GATE-01: RED on this path, before calling it fixed

Mutating the gate so the "shipped" module is the pre-fix file produces:

```
AssertionError: 2 control POST(s) were still held by the browser at the end of the run;
a hung control POST must be impossible, not merely unlikely
```

Two, matching C's count. The gate also fails if the pre-fix arm releases everything, so it cannot
pass by never reaching the claim, and it asserts ungated assets keep completing so the starvation
question stays visible rather than being quietly assumed cured.

`window-control-fetch-timeout.test.mjs` stays as the fast single-realm half and now names this file
in its header. GATE-01 is two files.

## 6. Territory

`chart v 1.4/chart/modules/**` is Manager A's by the manifest, and `chart-window-limit.js` is not
in B's `owned_paths` at all — though both P0s on it were routed to B. The new gate is placed beside
the module it gates rather than moved somewhere convenient, because relocating it to dodge the
preflight would hide the gap instead of reporting it. Three patterns need recording in
`TERRITORY.yml` for B: `chart v 1.4/chart/modules/chart-window-limit.js`,
`chart v 1.4/chart/modules/window-control-fetch-timeout.test.mjs`,
`chart v 1.4/chart/modules/window-control-socket-release.test.mjs`.
