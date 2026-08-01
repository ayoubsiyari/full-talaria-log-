# CLARIFICATION — Correcting my own overreach. `/chart/index.html` has no structural gap; FastAPI serves the V9 build at that URL and the 49-line repo file is a documented stub pointer. The PO's shell is a **b75 V9 shell**, and b75 predates the fix that added `indicator-performance.js` to the host — the defect we diagnosed and fixed earlier. So the empty result is expected, the two memory tests remain valid, and indicator-lag measurement on this surface is contaminated by a known already-fixed bug.

**2026-07-29 00:32. I was two sentences from publishing "the shell users land on structurally lacks the performance module," which would have been wrong and would have reopened a closed investigation.**

---

## 1. What I got wrong and what stopped me

**I found `chart v 1.4/chart/index.html` at 49 lines with zero module references and began treating that as the served shell.** It is not. **`api_server.py:27040` documents it explicitly: *"3. `chart/index.html` (stub pointer doc only — legacy source is `legacy-index.html`)"*, and line 27071 prints *"V9 build detected; `/chart/index.html` will serve V9."***

**So `/chart/index.html` is the real user entry point** — `TalariaV16.jsx:14993` navigates there with `mode` and `sessionId`, which is exactly the PO's URL — **and it is served from the V9 build, not from that stub.**

**What stopped me was the loader.** `dist-v9/index.html:1591` defines `__loadHostOnlyScript`, which uses `document.write` to emit `<script defer src=… + '?v=' + __TALARIA_CHART_BUILD_ID>`. **That is where the PO's `chart.js?v=20260726b75` comes from.** **The PO is running a V9 shell — a b75 one.**

## 2. The accurate reading

**The PO's page is a b75 V9 shell. And `b75` is the build on which we diagnosed `perfLoaded: false` — `indicator-performance.js` not referenced by the host shell.** That was found, fixed by adding the reference, and **`dist-v9/index.html` on the b82 tip does reference it**, confirmed by direct read.

**So the empty `[]` is not a new defect. It is the old defect, on the old build, behaving exactly as diagnosed.**

## 3. The asymmetry that makes some tests valid and others not

**Two facts combine, and the combination is the interesting part.**

**`stampInert: true` — nginx ignores `?v=` when selecting bytes.** So every module the b75 shell *does* request arrives as **current b82 content**. I verified this directly: `replay-system.js` on the PO's surface is 451,771 bytes and contains both `REPLAY_HIDDEN_PAUSE` and `instance.fullData = null`.

**But the b75 shell carries b75's *list* of script tags.** A module added after 26 July is never requested, so its current bytes are irrelevant.

**Therefore, on the PO's surface right now:**

- **Current code for every module b75 knew about.** FIX 3 and M26 both live in `replay-system.js`, which b75 loads. **The two memory tests are valid and will exercise tonight's fixes.**
- **Total absence for every module added since.** `indicator-performance.js` and `module-presence-runtime.js` are not requested at all.

**And the second of those is the sharpest part: the module whose purpose is to report missing modules is itself among the missing, so nothing raised a warning.** **A tripwire that ships in the same list it is meant to police cannot detect its own omission.**

## 4. Consequence for the measurement record

**Ruled: no indicator-lag observation on this surface is admissible until the shell serves b82.** **Any lag seen now is contaminated by a defect we already found and fixed**, and treating it as evidence would restart an investigation we closed.

**This also finally answers `SURF-1`, the surface-equivalence question I raised at 14:28 and deprioritised.** I asked whether A's measurements on `dist-v9` were comparable to the PO's on `/chart/index.html`. **They were not — not because the shells differ in kind, but because they differed in build.** **A measured b82's shell; the PO measured b75's.** The question deserved an answer when I first asked it rather than a deferral.

## 5. Unchanged action, now sharper

**B: make the served `/chart/index.html` serve `b82`.** The hot-patch updated `dist-v9/index.html` but not what that URL resolves to for an authenticated user.

**And the census correction from the 00:25 finding stands, unaffected by my error here: `holes=0` from a prober that cannot authenticate means "zero reachable holes".** **That is the defect that let a b75 shell sit on the primary user entry point while every instrument reported green.**
