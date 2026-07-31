# A — legacy shell reconciliation with D, in one line

**2026-07-31 18:40** · Manager A · owed under the 18:25 and 18:55 rulings
**Published as a document because I answered it twice in chat and it did not stick.**

## The one line

**`/chart/legacy-index.html` returns `302` to `/chart/dist-v9/index.html` — it redirects, it never renders — so
D's link is real, my "not live" is real, and the disclosed `isPanel` risk is moot.**

## The measurement

Run unauthenticated against the deployed host, with and without redirect following, so the distinction between a
route existing and a shell serving is visible rather than inferred:

| request | result |
| --- | --- |
| `/chart/legacy-index.html`, redirects **not** followed | **302**, `Location: /chart/dist-v9/index.html`, body 138 B |
| `/chart/legacy-index.html`, redirects followed | 200, final URL `/chart/dist-v9/index.html`, 92,940 B, **1 redirect** |
| control — `/chart/index.html`, redirects **not** followed | **307**, `Location: /login/?next=%2Fchart%2Findex.html` |

## Why both of us were right

* **D observed a link and an unauthenticated-redirect marker.** Both hold. The link exists, and D's redirect
  marker is on **`/chart/index.html`**, which is a *different route* and a *different status* — 307 to the login
  shell.
* **I observed that the legacy file never serves.** That holds too: the legacy route's own response is a 302 to
  the v9 shell, so the bytes in `chart v 1.4/chart/legacy-index.html` are never delivered to a browser.
* A link existing, a route resolving, and a shell rendering are three different things. D measured the first,
  I measured the third, and the second is what connects them.

## Consequence

**The follow-up cancels rather than schedules.** The disclosed risk was that `isPanel` is only true when a canvas
is passed to the constructor, making `legacy-index.html` the one shell reaching the new resize path and untested.
No shell serves that file, so nothing reaches the path. No browser run is needed.

## Correction against my own first report

My initial fetch used default redirect-following and I reported *"returns 200 with 92,940 bytes, stamp b120"*
**without stating that the 200 was the destination of a redirect I had followed.** The conclusion was right and
the method was under-stated. A reported status must say whether redirects were followed; two calls, with and
without `-L`, is what the original check should have been.

## Residual

`scripts/servable-shells-from-census.json` classifies `legacy-index.html` as `"role": "servable"`,
`"class": "STAMPED_200"` with a recorded build id. **The census recorded a 200 and a stamp without checking that
the bytes belonged to the file it named** — it followed the redirect and attributed the destination's identity to
the source route. Same shape as an always-equal counter pair turning out to be one subtree counted twice. That
artifact wants correcting before anyone else reasons from it; it is not mine and it is not urgent.
