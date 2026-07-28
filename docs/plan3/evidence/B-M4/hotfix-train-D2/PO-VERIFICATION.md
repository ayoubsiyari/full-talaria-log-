# B-5 — PO verification check for the D-2 hotfix train

**Six steps. Ten minutes. Safe to run even if the build in front of you is still the
defective one** — that is the constraint this check is written to, because the
tester export notice has not gone out and some testers are still unprotected.

**Read this first — it is what makes the check safe.** Step 1 identifies the build
before you touch any session, and Steps 4–5 are the only steps that can destroy
data on a defective build, so they are performed **exclusively on a throwaway
session you create in Step 3**. Do not substitute one of your own sessions at any
point, and do not run this against a session whose trades you would miss.

---

## THE STOP CONDITION — applies at every step, and after this check is over

> **If you open a session and the Journal tab looks empty or noticeably shorter
> than you remember, stop and do not place, close, or modify any trade, and do not
> reload.** Acting in that state is what makes the loss permanent. Tell us instead
> and we will look at it with you.

This is the operationally important sentence in the whole document. It matters more
than the verification result. If it fires at any point below, abandon the check and
report — do not "try once more".

---

## 1. Identify the build — do this before touching anything

Open the chart, press **F12**, and select the **Console** tab. On load the chart
prints one line:

```
[Talaria chart engine] <build id>
```

Compare it against the build id recorded in `MANIFEST.json` for this train.

- **Matches** → continue to Step 2.
- **Does not match, or no line appears** → **you are not on the fixed build. Stop
  here.** Nothing below is meaningful, and Steps 4–5 would be genuinely dangerous.
  This step exists precisely so that a stale cache or an unreplaced container is
  caught before anything else happens.

Hard refresh (**Ctrl+Shift+R**) once and re-check before concluding it failed;
nginx serves the chart statically and a stale asset is the likeliest cause.

## 2. Confirm the guard is present, without exercising it

Still in the Console, type:

```js
window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1
```

Expected: **`undefined`**. That means the kill-switch is unset and the guard is
**active**, which is the shipped default. If it returns `true`, the guard is
switched off and the build is not protecting anyone — stop and tell us.

## 3. Create a throwaway session

Make a **new** backtesting session, place and close **three** trades in it, and
note the count. Call it something obvious like `HOTFIX-CHECK`.

Everything below happens in this session and nowhere else.

## 4. Confirm normal operation is undamaged

With the network working normally, reload the page and reopen `HOTFIX-CHECK`.

- **Expected:** all three trades are present.
- If they are not, the fix has broken the normal path. **Stop and tell us** — that
  is a worse outcome than the bug and we would roll back immediately.

This step is the one that would catch an over-blocking guard, which is the main
risk of a fix shaped like this one.

## 5. Confirm the guard actually fires

Still in `HOTFIX-CHECK`, in DevTools open the **Network** tab and set throttling to
**Offline**. Then reload the page and reopen the session.

**On the fixed build**, the Console shows, in words:

```
📔 durable journal write suppressed: this session's journal was never hydrated
from the server ...
```

Set throttling back to **Online**, reload, and confirm **all three trades are still
there**.

- **Trades intact + suppression message** → the fix works. This is the pass.
- **Trades gone** → the guard did not engage. Stop, tell us, and do not repeat the
  step.

**This is the step that would have destroyed a real journal on the old build**, and
it is why Step 3 exists. Run it only in `HOTFIX-CHECK`.

## 6. Confirm deletions are now recorded (server side)

Ask whoever has host access to check the `trading-chart` container log for either
line while you were running Steps 4–5:

```
[JOURNAL-DELETE] session_id=... rows_before=... rows_after=... rows_added=... deleted_count=... resolver=...
[JOURNAL-SWEEP-REFUSED] session_id=... unresolved_incoming=... resolver=...
```

Seeing **either** is a pass: it proves durable journal deletions are no longer
silent. Before this train they left no trace at all, which is why we cannot say
today whether any tester has already lost data.

---

## If something goes wrong — rollback

Both guards can be switched off independently without a redeploy of the fix:

| To disable | Do this | Effect |
|---|---|---|
| Client guard | set `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1 = true` | reverts to pre-fix durable-write behaviour |
| Backend guard | set env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED=false` and restart `trading-chart` | sweep deletes as before |

**Use those exact values.** Each switch recognises only a short vocabulary and
treats anything else as "leave the guard on": the client accepts `true`/`1`/`yes`/`on`,
the backend accepts `0`/`false`/`no`/`off`. A typo does **not** disable the guard, on
purpose. So if you disable one and nothing changes, check the spelling before
concluding the switch is broken.

**Deletion logging cannot be switched off, deliberately.** If a guard is disabled
the sweep can delete again, and that is exactly when we most need the record.

**Disabling either guard re-opens the trade-loss path.** Do it only to escape a
worse failure, and tell us the moment you do.

---

## What this check does not prove

Stated plainly so the result is not over-read:

- It does not tell us whether any tester **has already lost trades**. That remains
  unanswerable for anything that happened before this train, because the deletion
  was never recorded. From now on it is answerable.
- It does not fix the underlying backend replace semantics, which are out of scope
  for this train by ruling and remain the deeper defect.
- Step 5 exercises one route to a failed hydration (offline). A slow server reaches
  the same branch by timing, which cannot be reproduced on demand from a browser.
