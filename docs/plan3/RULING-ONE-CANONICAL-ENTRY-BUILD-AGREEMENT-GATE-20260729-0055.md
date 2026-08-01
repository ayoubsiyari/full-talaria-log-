# RULING — The PO's complaint is upheld as a defect, not a preference. `/chart/index.html` and `/chart/dist-v9/index.html` resolve to **the same file in source**, and both committed copies are `b82`, yet the running host serves `b75` at one and `b82` at the other. **The source is correct and the deployment is lying.** Promoting `SURF-3`: one canonical entry URL, and a gate that fails when two URLs for the same logical shell disagree on build ID. Also un-retracting the memory-test validity, now on direct evidence.

**2026-07-29 00:55. The PO: "this is unacceptable to have your builds spread on several links, how would I get the new builds if you do not have them in where I expect them to be." Upheld in full.**

---

## 1. The PO's evidence, which is conclusive

**Same host, same port, two paths, two builds:**

| URL | `__TALARIA_CHART_BUILD_ID` |
|---|---|
| `:3000/chart/dist-v9/index.html?mode=backtest&sessionId=899` | **`'20260728b82'`** |
| `:3000/chart/index.html?mode=backtest&sessionId=900` | **`'20260726b75'`** |

**Both screenshots show a working V9 chart with indicators, so neither is a broken or fallback shell. They are two different builds of the same product, live simultaneously, one URL apart.**

## 2. Why this cannot be explained by the source

**Read directly at B's tip:**

- `_CHART_ROOT_PATH = Path(__file__).resolve().parent` → `chart v 1.4/chart/`
- `_DIST_V9_DIR_PATH = _CHART_ROOT_PATH / "dist-v9"` (line 27029) — what the `/chart/dist-v9` mount serves
- `_DIST_V9_INDEX_PATH = _CHART_ROOT_PATH / "dist-v9" / "index.html"` (line 27028) — what `/chart/index.html` returns via `FileResponse` at line 27043

**These are the same file. The route and the mount cannot diverge in this code.** And both committed copies of that file — `chart v 1.4/chart/dist-v9/index.html` and the homepage mirror — contain `20260728b82` and nothing older.

**I also confirmed the auth helpers at 3547-3581 are subscription gates that decide access, not handlers that choose files.** They explain the 307 to login on an unauthenticated probe. They do not serve bytes.

**So every layer I can read is correct, and the running process still produces two builds. The conclusion is forced: the process answering `:3000` is not running the code at B's tip.** B deployed by hot-patch. **Static files replaced under a running process take effect immediately; `api_server.py` routing does not change until the process restarts.** An older routing table resolving `/chart/index.html` to a different V9 directory would produce exactly what the PO photographed, and the `talaria-v9-live.js?v=20260726b75` tag in their console says the served shell is a genuine older V9 build rather than a legacy fallback.

**I cannot close this from source. It requires reading the running container's filesystem and process.** That is B's, and it now outranks the shell-sync item, because shell-sync as written would patch a file that this URL may not even read.

## 3. The durable ruling

**The PO's framing is the correct one and I am adopting it as a rule rather than fixing this one instance.** "How would I get the new builds if you do not have them where I expect them to be" is the whole problem: **a build that exists is not a build that is delivered, and a URL is part of the product.**

**Promoted — `SURF-3`, two parts, both binding before canary:**

**One canonical entry.** `/chart/index.html` is the entry point users reach — `TalariaV16.jsx:14993` navigates there and `propfirm-script.js:1203` does too. **It must always serve the current build.** `/chart/dist-v9/index.html` is an implementation path that happens to be reachable; **it is not a place testers should need to know about.** Tonight I sent the PO there as a workaround, and that was a workaround, not a fix.

**A build-agreement gate.** Every URL that serves the V9 shell is fetched, its build ID extracted, and **the gate fails if they are not identical.** Under `GATE-01` it must be shown RED against tonight's host, which currently serves `b75` and `b82` one path apart — **we have a live defective input, so there is no excuse for a gate that has never failed.** This closes the class, not the instance: it would have caught this at deploy time instead of the PO catching it by eye at half past midnight.

**Owner: C, as gate work.** **Feed it tonight's host as the RED fixture before B repairs it** — that fixture is perishable and disappears the moment B restarts the process.

## 4. Un-retracting the memory tests, this time on evidence

**At 00:45 I withdrew the assurance that the PO's two memory tests were valid, because I no longer knew their surface. Their screenshots establish it: `:3000/chart/index.html`, the test host. So I can now settle it by measurement rather than inference.**

**I fetched `/chart/modules/replay-system.js` from that running host under `?v=20260726b75`, under `?v=20260728b82`, and unstamped. All three returned byte-identical content — 442,120 bytes, MD5 prefix `f4a6ed228706` — and that content contains both `REPLAY_HIDDEN_PAUSE` and `fullData = null`.** There is one `/chart/modules` mount (line 27079), so there is one copy of that file, and it is current.

**Therefore the `b75` shell loads current module bytes.** FIX 3 and M26 both live in `replay-system.js`. **The PO's two memory tests are valid, and this time that is a measurement of the running server rather than a deduction from a routing table.**

**What remains invalid on that shell is indicator lag**, because `indicator-performance.js` is absent from the `b75` tag list entirely, and a module that is never requested cannot benefit from current bytes. **That asymmetry — current code for every module the old shell knew about, total absence for every module added since — is the precise shape of the delivery hazard, and it is why `SURF-3` is a gate and not a note.**
