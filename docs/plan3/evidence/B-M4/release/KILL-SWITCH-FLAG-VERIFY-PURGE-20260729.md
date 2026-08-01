# FLAG-01 / FLAG-02 verify — `MC_PANEL_STATE_PURGE_V1` + `MC_GRID_STATE_PURGE_V1`

**From:** Manager B  
**When:** 2026-07-29  
**Source tip:** `manager-a/critical-path` @ `3e75ed996` (packets `b034b33d3` PURGE-1, `c2ad645f3` PURGE-2)  
**Worktree:** `manager-a-critical-path`

Rules: **FLAG-01** = testable against ABSENT (feature ON when unset). **FLAG-02** = flippable without reload.

---

## Results

| Flag | File | FLAG-01 | FLAG-02 | Evidence |
|---|---|---|---|---|
| `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` | `multichart-prod/multichart-manager.js` `mcPanelStatePurgeV1Enabled()` | **PASS** | **PASS** | `purge1-panel-ref-release.test.mjs` — 11/11 pass; includes `switch-round-trip-without-reload` (absent→false→undefined→true→delete in one realm) |
| `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` | `talaria-design/src/MultichartGrid.jsx` `mcGridStatePurgeV1Enabled()` | **PASS** | **PASS** | `purge2-grid-ref-release.test.mjs` — 10/10 pass; `exerciseSwitch` cells absent/true/false/undefined + delete re-enables without reload |

### Read shape (both)

```js
// PANEL (manager.js)
return !(global && global.__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1);

// GRID (MultichartGrid.jsx)
return !(typeof window !== "undefined" && window[MC_GRID_STATE_PURGE_SWITCH]);
```

- ABSENT → purge **ON** (FLAG-01).
- `true` → purge OFF (legacy retain).
- `false` / `undefined` → still ON (not treated as disable).
- `delete` property → ON again without reload (FLAG-02).
- Call sites invoke the helper at decision points (removeChart / reconcile / cleanup), not once at init.

### Delivery caveat (not a FLAG fail)

- **PANEL** ships as a static `multichart-manager.js` module — reachable once that file is on the surface.
- **GRID** lives in `MultichartGrid.jsx` — needs the talaria-design / dist-v9 build path to reach served bytes. A's note that one packet is “inert” on the live product until that build lands is consistent; FLAG cells still hold on the landed source.

### Expectation update

Bar-store Shots 1–3 remain demoted. Next A flags expected on **chart.js data caches**, not the bar-store trio — poll those names as they appear; verify FLAG-01/02 per land, do not wait for a set.

---

## Commands (reproducible)

```
cd manager-a-critical-path
node "chart v 1.4/chart/multichart-prod/harness/purge1-panel-ref-release.test.mjs"
node "chart v 1.4/chart/multichart-prod/harness/purge2-grid-ref-release.test.mjs"
```
