# No source maps anywhere on the wire — and a missing script returns HTTP 200 with an HTML body

**From:** Manager B
**Date:** 2026-07-31 22:30
**Asked for:** one look at the served bundle for an inline source map.
**Answer:** there are none. Nothing to fix, no build-config change needed. One unrelated thing turned up
while looking, and it is worth more than the negative result.

---

## The source-map answer [verified]

| check | result |
|---|---|
| files swept on the container | 111 `.js`/`.css`, 15,058,375 bytes |
| files with an **inline** `sourceMappingURL=data:` | **0** |
| inlined map bytes | **0** |
| standalone `.map` files shipped | **0** |
| the six heaviest assets, fetched over HTTP | no source map on any |
| wire bytes vs disk bytes (sha256, all six) | identical — so the disk sweep covers the wire |
| `.map` files requested by the real page at runtime | **none** |

Checked on the wire as well as the disk, because a build step could add one in transit and the disk is
not what the browser gets. It does not: the served bytes hash-match the files for `chart.js` (2,006,564),
`order-manager.js` (2,509,112), `talaria-v9-live.js` (1,720,325), `chart-indicators-full.js` (994,528),
`replay-system.js` (454,931) and `chart-data-pipeline.js` (22,585).

**The hypothesis was sound and worth one look — an inlined map on a 2 MB bundle would indeed be tens of
megabytes of retained string. It just is not there.**

## The number behind the concern, since the answer is "no" [measured]

So that the negative is useful rather than merely reassuring, the actual script weight the real page
pulls, from Resource Timing on an authenticated backtest load:

- **63 scripts, 12.18 MB decoded, 3.1 MB transferred** (143 resources total)
- JS heap in use: **245 MB**
- heaviest: `order-manager.js` 2,450 KB, `chart.js` 1,960 KB, `talaria-v9-live.js` 1,680 KB,
  `chart-indicators-full.js` 971 KB, `drawing-tools-ui.js` 870 KB

So the retained-source concern is real in kind but an order of magnitude smaller than a map would have
been, and it is the product's own code rather than debug freight. There is no free removal here.

## The thing I did not go looking for [verified]

Requests for `/chart/chart.js.map` return **HTTP 200**. So does `/chart/definitely-not-a-real-file-xyz.js`.
Both return **2,973 bytes of `text/html`** beginning `<!DOCTYPE html>` — the SPA shell, served by a
catch-all for anything unmatched under `/chart/`. By contrast `/chart/modules/order-manager.js.map`
correctly returns **404** with `{"detail":"Not Found"}`, so the fallback covers the top-level path and not
the `modules/` subtree.

This briefly fooled me into thinking maps were being generated on demand, which is how I noticed it.

**Why it matters beyond a curiosity.** A missing script at `/chart/<name>.js` is served as a success with
an HTML body. The browser fails on it visibly, but anything checking *status codes* sees 200. That
includes:

- a deploy check that asserts every asset in the shell HTML returns 200 — it cannot detect a missing file
- **TEST-02 marker checks of the form "fetch the URL, assert 200"** — a typo in the path scores a pass.
  My own marker discipline has been to fetch and then `grep` for the marker string, which is immune to
  this, and after today I would say the grep is not optional: it is the only part of that check doing any
  work.

It is the same failure class as the two I hit today — empty grep output read as success, and a state file
trusted over the container. **A success signal that a missing thing can also produce is not a check.**

Not my area to change, and I have not touched it. Flagging it because a 200-for-anything fallback under a
static asset path will eventually hide a real missing-asset bug from exactly the tooling built to catch it.

## Confidence

- [verified] zero inline maps and zero `.map` files, on both disk and wire, with wire-vs-disk hashes
  compared rather than assumed.
- [measured] 63 scripts / 12.18 MB decoded / 245 MB heap, one authenticated page load on b120.
- [verified] the 200-with-HTML for missing paths under `/chart/`, and the correct 404 under
  `/chart/modules/`, both read from live responses including content-type and body prefix.
- [inferred] that the catch-all is the SPA shell fallback rather than a deliberate rewrite rule. The
  behaviour is measured; the intent behind it is not mine to state.
