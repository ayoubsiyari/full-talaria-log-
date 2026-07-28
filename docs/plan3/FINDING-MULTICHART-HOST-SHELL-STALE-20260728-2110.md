# FINDING — the multichart panel shell is frozen at `a10` from 24 May. It loads the engine with NO cache stamp, pins two modules at `a10`, and is missing every module added since. This is the defect class Plan 3 was created to kill, sitting in the feature the PO has complained about all day, and it may explain the original indicator lag.

**2026-07-28 21:10. B proved live panels resolve to the `a10` host at 21:04. Source read confirms three separate defects.**

---

## 1. What the file actually says

**`chart v 1.4/chart/multichart/chart-host.html` — the page every multichart panel iframe loads, per `multichart-manager.js:466`:**

```
294:  <script src="../chart.js"></script>
299:  <script src="./engine-api-guards.js?v=20260524a10"></script>
300:  <script src="./sync-bridge.js?v=20260524a10"></script>
```

**Three defects, of increasing consequence.**

## 2. Defect one — the panel engine has no cache stamp at all

**`<script src="../chart.js"></script>`.** No `?v=`. **Every other shell in the product stamps this file; the panel shell does not.**

**Consequence: each panel runs whatever `chart.js` the browser last cached, which could be from any date.** The path resolves correctly to the current engine, so a cold browser gets `b75` — **but a browser that has been used for weeks may be running a months-old engine inside multichart panels while the main chart runs `b75`.**

**This is a candidate explanation for measurement instability we have fought all day.** The 4.5 percentage-point variance between two idle recordings, inconsistent multichart behaviour between sessions, and the general difficulty of reproducing multichart symptoms **are all consistent with panels running an engine version that varies by browser cache state.** Stated as a hypothesis; it is testable and B's census tooling can test it.

## 3. Defect two — every module added since 24 May is absent from panels

**The script list in this shell is the `a10` list.** Modules added to the main shells afterwards were never added here.

**Including `indicator-performance.js`.**

**That is the symptom that started this entire investigation.** We opened with indicator lag on the host chart and a `perfLoaded: false` reading, spent a day on rAF loops and orphaned engines and allocation churn — **and the panel shell simply never loaded the performance module.** Also absent: `module-presence-runtime.js`, which is the tripwire designed to *detect exactly this*.

**The tripwire that would have caught this defect is one of the modules the defect prevented from loading.** That is not irony, it is a design lesson: **a presence check that lives inside the shell it validates cannot report its own absence.**

**This is the `capability loss without failure` class that Plan 3 was created to eliminate**, found in the highest-profile feature we have, on the last day of the plan.

## 4. Defect three — two modules pinned to 24 May content

**`engine-api-guards.js?v=20260524a10` and `sync-bridge.js?v=20260524a10`.** If either file's content changed since, **browsers holding the `a10` stamp serve the old bytes.** This is the same cache-stamp coherence failure as `order-manager.js`, except it has been live since May rather than for hours.

## 5. What this does and does not change about today's findings

**It does NOT invalidate the memory work.** The orphaned engines, `fullData` retention and detached documents all live in `chart.js`, which panels do load at a current version on a cold cache. **A's M26 and M27 work remains correctly aimed.**

**It DOES change the multichart indicator story completely.** Indicator lag inside panels was never going to be fixed by anything we did to `chart.js`, because the module responsible was not loaded at all.

**And it may substantially reduce the multichart lag problem from an architectural one to a delivery one** — which, if true, is the best news of the day, because **adding script tags is hours of work and re-architecting a renderer is weeks.** Not yet established. Measure it.

## 6. Assignments — three managers, one file, no overlap

**A owns the fix.** Bring `chart-host.html` and `multichart-shell.html` to parity with the current shell module list, stamp `../chart.js`, and correct the two `a10` pins. **This is a shell repair, not a de-route** — unlike `legacy-index.html`, this route is live, required and load-bearing, so ruling A14.3 does not apply and I am saying so explicitly to prevent A from applying the wrong precedent.

**B holds the 404 — already done, correctly, at 21:04.** **Do not block this route under any circumstance; it is the multichart feature.** B additionally: test defect one by comparing panel engine versions across a cold and a warm browser profile.

**C owns the gate.** The cache-stamp coherence gate must cover `/chart/multichart/` — it did not, which is how a May stamp survived to today. **And per GATE-01, the module-presence gate must be shown RED against today's `chart-host.html` before it is trusted**, since today's file is a guaranteed-defective input.

## 7. The lesson I want recorded above the fix

**We found this because B ran a census aimed at a different question, on the last day, by luck.** Our module-presence enforcement, reachability sweeps and shell audits all ran today and **none of them covered the panel shell** — because every one of them enumerated shells from a list that did not include it.

**Every audit we own inherits its blind spots from its own inventory.** The correct instrument is not a better checker but an inventory derived from what the server will actually serve, which is precisely what B's census does. **B's census should become the source of the shell list for every other gate, rather than each gate keeping its own.**
