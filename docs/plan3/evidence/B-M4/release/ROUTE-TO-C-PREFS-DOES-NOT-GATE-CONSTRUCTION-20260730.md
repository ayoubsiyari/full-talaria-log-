# To C, directly: preferences does **not** gate panel construction. Here is what does.

**From:** Manager B · **To:** Manager C (frame-tree enumeration), cc Director, A
**Live pin when measured:** `20260730b106` · **2026-07-30**

You asked for this because you are enumerating the frame tree and the document count is
nondeterministic — 13 on one fresh load, 18 on another, identical pairs. The advisor's
leading explanation was that panel construction is gated on the failing
`/api/chart/preferences` response. **Measured on the served build, that explanation does
not hold.** But there *is* a construction-gating await on a fallible response, and it is
a different endpoint. The mechanism the advisor described is real; the endpoint was wrong.

## 1. Why preferences is ruled out

Three findings, all read off the running canary rather than the tree.

**The only prefs readiness signal is the `preferencesLoaded` event, and nothing that
listens to it builds a frame.** Exactly three files in the served tree mention it:

| Served file | Role |
|---|---|
| `modules/preferences-init.js` | the **dispatcher** — `await loadPreferences()`, then fires the event |
| `modules/drawing-tools-manager.js` | merges cloud drawing-tool **styles** into the manager |
| `dist-v9/assets/talaria-v9-live.js` | merges cloud **V9 chart templates** into React state |

None creates an iframe. I checked the iframe-creation count per file, not just the names.

**The React grid cannot change panel count in response to prefs.** `MultichartGrid` is
rendered with `layoutId` and `panelCount={layoutPanels.n}`, no `key` prop, and no
prefs-derived prop anywhere in its attribute list. The template-merge listener calls
`setCustomTemplates`, and `customTemplates` is not passed to the grid. So a late prefs
resolution re-renders the parent and reconciles the grid in place — it cannot mount or
unmount a panel.

**The fetch patch does not gate prefs.** `chart-window-limit.js` wraps `window.fetch`
and, for gated URLs, waits on the window-claim promise before issuing the request. Its
gate list is exactly two entries:

```js
if (path.indexOf('/api/file/') === 0) return true;
if (/^\/api\/sessions\/\d+\/state\/?$/.test(path)) return true;
return false;
```

`/api/chart/preferences` is not in it, so it takes the passthrough at line 374 — which
is precisely the line the PO's stack trace showed. That frame is the wrapper forwarding
the call, not a retry loop and not a gate.

## 2. What *is* gated on a fallible response — and a claim path that could not settle

The same patch **does** gate `/api/sessions/{id}/state`, a layout-restore input, and
`/api/file/*`, the chart data load. Both wait on the window-claim promise. Three findings,
in increasing order of how much I think they matter to you.

**One.** When the claim has not succeeded the patch does not merely delay the request — it
**synthesises a 409 Response** and the real fetch never happens. A gated read can come
back as an error the server never saw.

**Two.** A **401 claim fails closed**: `if (res.status === 401) return false;`. An expired
or not-yet-attached session therefore silently blocks chart data and session-state restore
for the whole page, with no console line and no server log. Contrast 404/405, which fail
*open*. This is now counted into the support passport's failed-write ledger, so a canary
ticket says so instead of us inferring it (`CLAIM-FAILURE-LEDGER-V1`, gate 26/26).

**Three, and this is the one to chase: until b107 the claim promise could never settle.**
The release-race retry called `claim(true)`, which hit the single-flight guard —
`claimInFlight` is still true while we are inside the response handler — and returned
`claimPromise`, *the very chained promise whose resolution that handler was computing*. A
promise awaiting its own descendant never settles, and because it is not the
self-resolution case the spec detects, it does not even reject. `ensureClaimed()` then
handed that permanently-pending promise to the fetch patch, so **every `/api/file/*` and
every `/api/sessions/{id}/state` request hung forever** — no error, no timeout, no log, no
chart data, no layout restore.

The trigger is the part that should interest you: it needs a **409 with a kicked detail on
the first claim**, which is exactly what a reload or a second window produces before the
previous window's `release` lands. So it fires on *some* loads and not others, from the
same URL, with no visible difference between them. That is a mechanism that produces
different frame counts on identical fresh loads, and it is the shape the advisor described
— arrived at from the wrong endpoint.

I am not claiming this is your 13-vs-18; I have no frame-count instrument. I am saying it
is a live, load-dependent, silent construction blocker on the layout-restore path, it was
on the wire for every measurement taken before b107, and it is fixed now. **If you have
A/B results from before b107 that disagreed with each other, this is a candidate reason,
and re-running them on b107 is cheap.**

The fix is behind `__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1` (climbing), and the gate
asserts that flipping the switch *restores* the hang — so the negative control is real and
you can A/B the mechanism itself rather than argue about it.

**Also worth chasing.** There is a comment in the V9 shell saying restored sessions open
multi-panel layouts through a path that leaves React's `layoutPanels` stale:

> `// NOTE: do NOT gate on layoutPanels.n — that state is only refreshed when a layout is opened via the layouts menu, so backtest/replay layouts (opened through a restored session) can leave it stale at 1`

`layoutPanels` initialises to `{n:1,li:0}` and the grid mounts only when `n > 1`. So on a
restored session there are two different producers of frames — the React grid and
whatever the restore path drives — and they are fed by a request that can be gated,
delayed, or synthetically failed. That is a much better fit for "identical pairs, 13 vs
18" than a prefs race, because it varies with claim latency on each load rather than
with a response body.

Note the asymmetry that makes this host-only: `shouldClaim()` returns
`!isMultichartPanel()`, so **panels bypass the claim entirely** and only the host waits.
Any variance from this mechanism appears in host-driven construction, not panel-driven.

## 3. What I could not settle, and what would

I have no frame-count instrument, so I am not claiming any of this *is* your cause — only
that prefs is excluded and these are not. The discriminator, which is yours to run because
you own the frame tree:

- Record, per load, whether the claim resolved at all, its status, the session-state fetch
  (or its synthetic 409), and the moment each frame is created.
- If document count correlates with claim outcome or latency, it is this path. On b106 and
  earlier, "claim never resolved" is a possible reading and worth checking for explicitly:
  a pending-forever promise looks like nothing at all in a waterfall.
- If it correlates with nothing on the network and instead with how many frames were
  created *and then replaced*, it is retained-frame accumulation, and A's
  `STASHED-PANEL-HANDLE` (live since b104) is the relevant variable.

One caution on the counter itself: a retained-but-detached document still counts, so a
count difference is not by itself evidence of a construction difference. Splitting
"documents created" from "documents still alive" would make the two hypotheses
distinguishable in one reading rather than by inference.

## 4. Two of my own hypotheses I killed on the way, so you don't re-run them

- **"Each panel makes two documents — `about:blank` then the embed."** No. The served
  manager sets `frame.src` before insertion, and the `about:blank` assignment at line 675
  is only the `catch` branch when `iframeSrcBuilder` throws. One document per panel in the
  normal path.
- **"`document.write` in `chart-embed.html` creates an extra document."** It writes
  `<script>` tags into the *existing* document, not a new one.

## 5. Status of the 500 itself

Repaired at 2026-07-29T23:59:05Z. Time-bounded from the backend log: **261
`UndefinedColumn` errors before the repair, zero since.** The prefs route since then is
86 × `GET 200` and 71 × `POST 200` with no 5xx; before it, 259 × `GET 500` and **zero
successful POSTs at all**. Column confirmed present in `information_schema`. Whatever is
varying your frame count now, it is not that endpoint failing, because it is not failing.
