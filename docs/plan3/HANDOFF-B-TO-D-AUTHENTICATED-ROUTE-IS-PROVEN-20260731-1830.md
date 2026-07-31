# HANDOFF B → D — the authenticated route is proven on b120, as a module rather than an account

**2026-07-31 18:30 · Manager B · answers D's `UNPROVEN_LOGIN_PATH`**

A route, not a credential, so this is solved once. Nothing below contains or prints a password.

## The route, proven against the running product

```
_evidence/manager-B/m20-j1/talaria-auth-route.mjs     <- import this
_evidence/manager-B/m20-j1/verify-journal-route.mjs   <- run this to confirm before you rely on it
```

On the host both are in `/root/b-tal01891/`. Verified output, just now:

| check | result |
|---|---|
| login | HTTP **200** |
| final URL | `/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677` |
| on the login page | **false** — this is the condition your run reported |
| chart loaded | true, **4,347 bars** |
| build actually serving | **20260731b120** |
| journal API | `/api/sessions/936/journal-trades` → **200** |
| journal trades | **182** |
| screenshots in payload | **395** |
| payload size | **51.6 MB** |

Verdict from the probe: `ROUTE_PROVEN`.

```js
import { readTestEnv, login, openBacktest, readJournal, JOURNAL_BEARING } from './talaria-auth-route.mjs';
const env = readTestEnv();                                  // /root/.talaria-test-env
await login(page, { email: 'qa-canary@talaria-log.com', password: env.TEST_PASSWORD });
const ready = await openBacktest(page);                     // throws UNPROVEN_LOGIN_PATH if it lands on login
const journal = await readJournal(page);                    // { trades: 182, withScreenshot: 395, ... }
```

## The five things that decide whether you land on the app or back on `/login/`

Each of these cost me a run at some point today, and they are encoded in the module so you do not
have to rediscover them.

1. **Be on an origin page before posting the login.** A `fetch` from `about:blank` has no origin for
   the cookie to attach to. `page.goto(BASE + '/login/')` first.
2. **Wait after the login POST before navigating.** The app redirects itself. Navigating into that
   redirect destroys the execution context, and the symptom is either a confusing
   "Execution context was destroyed" or a login URL at the end — which is what you saw.
3. **Never use `waitUntil: 'networkidle*'` on the chart.** It holds a websocket and streams, so
   networkidle never arrives and the timeout is indistinguishable from an auth failure.
4. **Assert the final URL is not the login page, and fail loudly.** `openBacktest` throws
   `UNPROVEN_LOGIN_PATH` with which of these five it most likely is.
5. **Poll for a fact the app reports — bars on the chart — not a fixed sleep.** A fixed sleep passes
   on a blank page.

One more that is not about auth: a `402`/`403` from the journal endpoint means the **account** lacks
journal access, not that the route is wrong. `readJournal` reports the status per endpoint it tried
so those two cases stay distinguishable.

## The session to use, and why that one

**`sessionId=936`, `fileId=677`.** Measured from the database: **182 journal trades, all 182 carrying
a `data:image` screenshot, 49 MB of `payload_json`** — the heaviest session present by an order of
magnitude (the next is 5,968 kB). A correct route into an empty session still returns UNPROVEN, so
the session choice is part of the fix.

## What I did NOT close, stated plainly

**I did not get the full journal list rendering.** The route reaches the app and the API returns the
trades, but I could not find the journal panel's control in the DOM — my sweep of buttons, tabs,
roles and `data-tab`/`data-panel` attributes matching `journal|trades|trade log` returned **zero
candidates**. So the journal view is opened some other way (a different shell, a route, or a trade
click), and that last step is yours.

**Two observations that bear directly on `M1`, offered as leads and not conclusions:**

1. **The default backtest view already decodes screenshots.** With no clicking at all: 2 data-url
   images decoded, **2,686,186 pixels, ~10.2 MB of RGBA** — about 1.34 Mpixels each. On b120, which
   carries the M20-J1 fix. That does not look thumbnail-sized to me, so it is worth establishing
   whether the fix covers this path or only the journal list. I am not asserting it does not; I do
   not know what size the thumbnail is meant to be, and that is your item.
2. **The count is timing-dependent and a single sample will lie.** The same probe read
   `dataUrlImages: 0` on one run and `2` on the next, because the images decode asynchronously after
   the chart reports ready. **Poll until the count is stable rather than sampling once**, or M1 will
   report whatever the timing gave you. `window._m20J1RasterizeThumb` was also **not present** on
   `window` in this build/path, so do not gate on its presence.

## Session cap, since it collided with C tonight

`qa-canary` is now at **`max_sessions = 6`** (product value 2). It must go back before the release —
it is on the checklist at `docs/plan3/RELEASE-CHECKLIST-TEST-STATE-TO-UNDO-20260731.md`. Relevant to
you only if you open more than a couple of top-level chart windows at once; **multichart panels do
not consume slots**, which I proved separately today.
