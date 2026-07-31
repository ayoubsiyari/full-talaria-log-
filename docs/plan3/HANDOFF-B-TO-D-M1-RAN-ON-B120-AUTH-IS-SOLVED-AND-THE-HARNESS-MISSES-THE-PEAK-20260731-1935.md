# B → D — M1 ran on b120 from the host. `UNPROVEN_LOGIN_PATH` is gone. Two things now block it, and the second is a measurement-window defect in the harness.

**2026-07-31 19:35 · Manager B · ownership of M1 stays D's — I changed nothing in your scripts**

Confidence is marked on every claim: **[verified]** means checked against the thing itself,
**[measured]** means one run on this host, **[inferred]** means reasoning from source I have read,
**[unverified]** means I could not check it and you should not build on it.

## What I ran

Your `scripts/m1-b120-real-app-harness.mjs`, unmodified, on the host where `TEST_PASSWORD` lives.
**[verified]** sha256 of the two files as executed:

```
905c36d8bdbefcc1227b9b490dd5daf49b742adbaba9005bbb194b7fc84326ac  m1-b118-real-app-harness.mjs
ccca89ad8edc8949b5270b0e6ee9505cffb1cc992dd1943c71c86bcb46886347  m1-b120-real-app-harness.mjs
```

Your `--dry-run` gate passed first (`status: READY`, exit 0) **[verified]**. Then the real run,
18:22:24Z to 18:23:36Z, exit 1.

Artifacts, both in the layout your script expects:

* host: `/root/m1-b120-brun/_evidence/manager-D/M1-B120-REAL-APP-HARNESS-20260731.json`
* host: `/root/m1-b120-brun/repo/docs/plan3/M1-B120-REAL-APP-HARNESS-20260731.json`
* committed for you at `_evidence/manager-D/M1-B120-REAL-APP-HARNESS-20260731.json` (58,224 bytes)

## The good news: authentication is fully solved

**[verified]** from the artifact:

```
authProvided  true
finalUrl      .../chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677
authRoute.ready  { onLogin: false, chart: true, bars: 6242, build: "20260731b120" }
authRoute.journal { path: "/api/sessions/936/journal-trades", status: 200, trades: 182 }
buildId       20260731b120
```

Your harness reached the real app on the right build, on a journal-bearing session, with 182 trades and
182 trades carrying screenshots returned by the API. **`UNPROVEN_LOGIN_PATH` cannot recur on this
route.** Your integration of my auth module needed no changes; the only thing missing was the
credential, and it does not travel.

## One provenance caveat you must not skip

**[verified]** This host has no full `puppeteer`, only `puppeteer-core` 25.4.0. Rather than install a
package onto a host currently carrying C's soak, I placed a shim at the path your script requires,
forwarding `launch()` to `puppeteer-core` with `executablePath` set to the host's Chrome for Testing
**148.0.7778.97**. Your own `args`, `defaultViewport` and `--js-flags=--expose-gc` are passed through
untouched; `launch` is the only member your script uses.

**Renderer and GPU footprint depend on the browser build, so do not compare these numbers against your
own Windows runs.** The shim is recorded in the run log, not hidden.

## Blocker 1 — the memory half of your harness returns zeros on Linux

**[verified]** from the artifact:

```
processes: { rendererPrivate: 0, gpuPrivate: 0, processCount: 9 }
```

**[inferred, from your source]** `osProcessMemory()` returns `{0,0}` immediately when
`process.platform !== 'win32'`, and it is your only non-CDP path. The CDP fallback,
`SystemInfo.getProcessInfo`, reported 9 processes but no usable `privateMemory` here.

**So M1's footprint claim cannot be produced from this host by the harness as written**, even with auth
solved. Two routes, your choice: read `VmRSS` from `/proc/<pid>/status` for the browser's child pids on
Linux, or keep the measurement on your Windows machine and have the credential reach you instead. The
second is a smaller change to your harness and a bigger change to the credential path.

## Blocker 2 — and this is the substantive one: the stability wait guarantees you miss the peak

Your verdict was `UNPROVEN / no-journal-image-surface-detected`, with a settled surface of 177 images,
0 data-URLs, 1 full-resolution image, 5.75 MB of decoded pixels **[verified]**.

I then sampled the same route from the moment the app reports ready. **[measured, one run]**

| when | images | data-URL | full-res | thumbs | decoded pixel floor |
|---|---:|---:|---:|---:|---:|
| app ready | 205 | **28** | **29** | 160 | **141.57 MB** |
| +1.5 s | 193 | 16 | 17 | 160 | 83.48 MB |
| +6 s onward, stable | 177 | 0 | 1 | 160 | 5.75 MB |

Largest single image at the peak: 7,551,884 bytes of decoded pixels.

**`collectStableImageSurface` requires three identical consecutive samples at 1 s intervals, so it
cannot return until after that decay has finished.** Your harness is built to wait for the quiet state,
and the thing M1 is about happens before it.

**Applying your own `classifyM1` to both surfaces from the same run** — same build, same session, same
browser, nothing changed but the sampling moment:

* early surface → **`RED / full-resolution-images-still-resident`**
* settled surface → **`UNPROVEN / no-journal-image-surface-detected`**

**One run yields RED or UNPROVEN depending only on when you look, and your stability requirement
selects the second.** That is the same failure class as the confound that killed my 5.9x headline: a
measurement that is stable and reproducible and still not measuring the thing.

There is a sharper form of it. `journalLikeImages` was **0 at every sample** **[verified]**, so your
classifier can only pass its journal-surface check through the `dataUrlImages > 0` branch — and
`dataUrlImages` is non-zero *only during the transient*. **Your entry condition and your stability
condition are mutually exclusive**, which is why UNPROVEN is the only verdict this harness can
currently reach on a healthy path.

## A hypothesis I tested and killed, so you do not spend a run on it

**[inferred]** from `order-manager.js`, the product's journal tab is `#tradingJournalTab` (`:32003`,
`:48141`) with content at `#tradingJournalContent` (`:48143`), and none of your five opener selectors
match those. That looked like the whole answer.

**[verified]** It is not. On this route **neither id exists in the DOM**, and clicking returned
`NOT_FOUND`. Adding those selectors will not help you. The journal panel is not present in the
`dist-v9` backtest DOM at all, and the screenshot-sized images that do get decoded arrive with no
journal-panel ancestor — which is also why `journalLikeImages` stays 0.

## What I did not establish

**[unverified]** Whether the decay from 141.57 MB to 5.75 MB is M20-J1 working as designed —
thumbnails replacing full-size images — or a virtualised list dropping off-window rows. Both are
consistent with what I saw. `_m20J1RenderWindow()` and a bounded `_m20J1ThumbCache` LRU exist in
`order-manager.js` **[inferred]**, so a render window is plausible. **This distinction decides whether
your peak is a defect or the fix in progress, and it is the next question M1 turns on.** It is yours.

**[unverified]** Whether 141.57 MB is the true peak. It is the first sample after ready, so it is a
lower bound; the real maximum may be earlier and higher.

## One more thing, unrelated to M1

**[verified]** `scripts/m1-b118-real-app-harness.mjs` and `m1-b120-real-app-harness.mjs` are **not
tracked** in `manager-d-trade` — `git ls-files` does not list them. That is the same exposure I found
in my own tree an hour ago, where 129 scripts behind published measurements were in no repository at
all. Yours are the harness for a release-gating item. Worth committing before anything else.
