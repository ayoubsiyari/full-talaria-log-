# FINDING — The PO was right to refuse my claim. `b75` is served by **no surface I can reach**: the test host is `b82`, production is `b56`. I cannot validate any of tonight's PO measurements until the PO's actual URL is known, and I retract the "your two memory tests are valid" assurance I gave at 00:32. Separately and independently serious: **production has been sitting at `b56` (23 July) and does not reference `indicator-performance.js` at all.**

**2026-07-29 00:45. The PO said "I am not convinced that 75 is 82, try again, where is the 82 build." They were right to, and probing instead of arguing produced two findings, one of which nobody was looking for.**

---

## 1. What direct probes establish

**On the `?v=` question, my claim was correct and is now proven rather than asserted.** `replay-system.js` fetched from the test host under three different stamps — `?v=20260726b75`, `?v=20260728b82`, and no stamp at all — returned **byte-identical content in all three cases**: length 442,120, MD5 prefix `f4a6ed228706`, and containing both `REPLAY_HIDDEN_PAUSE` and `fullData = null`. **The stamp does not select bytes. That part holds.**

**But the conclusion I drew from it does not, because the premise underneath it was wrong.**

## 2. The premise that collapsed

**`api_server.py:27041-27043` returns `FileResponse(_DIST_V9_INDEX_PATH)` for `/chart/index.html` — the same file the `/chart/dist-v9` mount serves.** So the two URLs are the same bytes by construction.

**I measured `/chart/dist-v9/index.html` on the test host: HTTP 200, 91,860 bytes, and the only build string present anywhere in it is `20260728b82`.**

**Therefore the authenticated `/chart/index.html` on that host serves `b82`, and the PO's `b75` page cannot have come from it.** My whole 00:32 explanation assumed the PO was on that host and that the `b75` stamp was a stale-shell artefact. **The stamp is not stale. The host is not theirs.**

## 3. Where `b75` is not

| surface | result | `indicator-performance.js` |
|---|---|---|
| test `31.97.192.82:3000` | **`b82`** | present |
| `talaria-log.com` | **`b56`** | **absent** |
| `www.talaria-log.com` | **`b56`** | **absent** |
| `31.97.192.82` ports 80, 8000, 8080, 5000 | no route | — |
| `test.` / `staging.` / `app.` subdomains | do not resolve | — |

**Nothing I can reach serves `b75`.** So the PO's surface is one of: a machine-local server, a host nobody has named, or an edge cache holding a 26 July shell. **I cannot narrow it further from here — the URL is the only thing that resolves it, and I asked for it at 00:25 and did not get it.**

## 4. Retraction

**I told the PO at 00:32 that their two memory tests were valid because the fixes live in a file their shell loads.** **That rested on their being on the test host. I no longer know that they are, so I withdraw the assurance.** If they are on an unnamed surface, I do not know which build, which modules, or which fixes are present, and **no measurement taken there can be admitted until the surface is identified.**

**This is the second time tonight I have built a conclusion on a surface identity I assumed rather than checked**, after the `chart-host.html` panel-engine claim I had to withdraw. The pattern is specific enough to name.

**Promoted — `SURF-2`: a measurement is attributed to a build, never to a person's browser.** Any observation entering the record carries the surface URL and the build string read from that surface at the time of observation. **An observation whose surface is unknown is not weak evidence, it is not evidence.**

## 5. The finding nobody asked for

**Production is at `b56`, dated 23 July, and does not reference `indicator-performance.js` anywhere.**

**That module's absence is the diagnosed cause of indicator lag.** So the production surface has the indicator-lag defect in the plain form we identified days ago, and has had it continuously. **This is consistent with the PO's statement that production is deliberately untouched — but "untouched" has been quietly meaning "five builds and six days behind," and the gap includes the trade-loss hotfix.**

**That last part decides urgency.** The trade-loss path was confirmed live on production earlier tonight, and the fix for it is in `b82` on the test host. **Production at `b56` does not have it.** The canary plan assumed a push at the end; it did not account for production being this far back, nor for the exposure window running the whole length of Plan 3.

**Action — B, on the deploy question, and this outranks the shell-sync item: state plainly what production is running, what the delta to `b82` contains, and whether the trade-loss fix can reach production independently of the canary train.** Do not deploy anything to production. **Report only.**
