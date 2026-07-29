# Kill-switch readiness — A's incoming flags (verify as each lands)

**Owner:** Manager B  
**When:** 2026-07-29  
**Rules:** FLAG-01 = testable against **ABSENT** (feature ON when unset). FLAG-02 = flippable **without reload** (read at decision points, not once at init). Independence required — welded flags break the bisect. **Fail either cell = blocking defect**, not a note. Protocol: `FLAG-BISECT-VERIFY-PROTOCOL-20260729.md`. Do **not** wait for the full set.

---

## Tracker

| Flag | Status on B tip / A tips | FLAG-01 | FLAG-02 | Next |
|---|---|---|---|---|
| `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` | **Live on canary b83+** | **PASS** | **PASS** | See `KILL-SWITCH-FLAG-VERIFY-PURGE-20260729.md` |
| `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` | **Live on canary b83+** | **PASS** | **PASS** | In `dist-v9/assets/talaria-v9-live.js` |
| `__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1` | **Live on canary b84+** (A blob `5094522056…` on tip) | **PASS** | **PASS** | P3 harness 16/16; tip chart.js = A's canonical |
| `__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1` | **Live on canary b85** (`f5ee11780` / LEAK-C) | **PASS** | **PASS** | harness 6/6 four-state round-trip; on `multichart-manager.js` |
| `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` | On HELD `da961151e` (**not merged** to critical-path) | **PASS** (pre-merge read) | **PASS** (pre-merge read) | Re-verify when merged to product tip |
| `__TALARIA_DISABLE_REALM_SAFE_BAR_STORE_V1` | Not landed (Shot 1) — **demoted** | — | — | Do not wait |
| `__TALARIA_DISABLE_BARSTORE_REALM_CLONE_V1` | Not landed (Shot 2) — **demoted** | — | — | Do not wait |
| `__TALARIA_DISABLE_MC_BARSTORE_PURGE_V1` | Not landed (Shot 3) — **demoted** | — | — | Do not wait |
| `__TALARIA_DISABLE_SHARED_BAR_STORE` | **Already on tip** (`chart.js` `_sharedBarStore`) | **PASS** | **PASS** | Demoted as leak dominant |

**Next expected from A:** kill-switches on **chart.js data caches**, not the bar-store trio (demoted; may never land). Verify FLAG-01/02 as each lands — do not wait for a set.

**Plan 3 surface (2026-07-29 stand-down):** canary = `31.97.192.82` only. Production out of scope.

---

## Verified now

### `__TALARIA_DISABLE_SHARED_BAR_STORE` (tip)

```js
if (window.__TALARIA_DISABLE_SHARED_BAR_STORE) return null;  // chart.js ~3194
```

- **FLAG-01:** ABSENT → falsy → store path runs (fix ON). Setting `true` disables.
- **FLAG-02:** Read inside `_sharedBarStore()` on every resolve — flip in console takes effect on next call; no reload.

### `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` (HELD `da961151e` only)

```js
_isMultichartBackgroundRenderCadenceDisabled() {
  if (window[SWITCH] === true) return true;
  // then parent realm
}
_shouldSkipMultichartBackgroundRender() {
  if (this._isMultichartBackgroundRenderCadenceDisabled()) return false;
  // ...
}
```

- **FLAG-01:** ABSENT → `=== true` false → cadence throttle **ON**. Explicit `true` disables throttle (legacy full cadence).
- **FLAG-02:** Own realm then parent; evaluated at each skip decision on the render path — not init-sampled.
- **Caveat:** not on B tip / critical-path until A merges. Re-check the same two cells on the merge commit before treating the train as carrying it.

---

## Waiting (poll; verify immediately on land)

1. **`__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1`** — Shot 4 / parent-side panel reference sweep. Reserved name; no product reader yet.
2. **Bar-store Shots 1–3** — `REALM_SAFE_BAR_STORE_V1`, `BARSTORE_REALM_CLONE_V1`, `MC_BARSTORE_PURGE_V1`. Demoted as leak dominant; still verify FLAG-01/02 if/when they land.

**Poll command (any tip):**

```
git grep -n "__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1\|__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1\|__TALARIA_DISABLE_REALM_SAFE_BAR_STORE_V1\|__TALARIA_DISABLE_BARSTORE_REALM_CLONE_V1\|__TALARIA_DISABLE_MC_BARSTORE_PURGE_V1" -- "*.js"
```

On first hit in product path: cell FLAG-01 (unset vs `true`) and FLAG-02 (set/clear mid-session, observe next decision), journal the result, do not batch-wait.
