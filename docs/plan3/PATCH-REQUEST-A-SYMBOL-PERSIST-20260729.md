# Patch Request A: Persist Selected Symbol Across Refresh

Owner: Manager A (`chart v 1.4/chart/chart.js`)
Requester: Manager D
Date: 2026-07-29

## Problem

Pair switch updates in-memory `currentFileId` / `currentSymbol` but does not persist the switched `fileId`. On reload, boot prefers URL `fileId` then session primary, so the chart reopens on the session’s original instrument instead of the last user-selected pair (TAL-01865 / TAL-01747 class).

Manager D must not edit `chart.js`. This request names the exact write and read sites for A.

## Boot read (restore last pair)

**File:** `chart v 1.4/chart/chart.js`  
**Site:** session/chart boot around **line 2370**:

```js
const fileId = urlParams.get('fileId') || this.getPrimarySessionFileId(session);
```

**Requested change:** after URL `fileId`, and before (or instead of falling straight through to) `getPrimarySessionFileId(session)`, read a persisted last-selected file id for this session/user, e.g.:

```js
const fileId = urlParams.get('fileId')
  || this.getPersistedSessionFileId(session)  // NEW
  || this.getPrimarySessionFileId(session);
```

Suggested storage key shape (A’s choice): `chartLastFileId:<sessionId>` or a field inside existing session-scoped userStorage, validated against the session’s instrument/file list before use.

Also relevant boot assignment after successful load: **~2523** (`this.currentFileId = fileId`).

## Pair-switch write (persist on change)

Persist the new `fileId` whenever the user successfully switches pair. Concrete write sites already mutate `currentFileId`:

| Path | Approx. line | Notes |
|------|--------------|--------|
| Host / backtest pair switch ingest | **5420** | `this.currentFileId = fileId` after smart-window load |
| `loadFileData` pair switch | **10115–10128** | `this.currentFileId = targetFileId` + `currentSymbol` sync |
| Panel pair switch (`loadPanelFileData`) | **10509** | `this.currentFileId = targetFileId` |
| Symbol switcher → load | **17318–17336** | Resolves `nextFileId` then `loadFileData` / `loadMultichartPanelFile` / `loadPanelFileData` — persist after those promises resolve (success only) |
| File selector change | **17261–17262** | `this.currentFileId = fileId` then `loadFileFromServer` |
| Other host loaders | **17261**, **17839** | Keep consistent if they are user-driven pair changes |

**Do not** persist transient/failed loads (respect existing `loadSeq` / stale-load guards around multichart pair switch).

## Suggested helper (A-owned)

```js
_persistSelectedFileId(session, fileId) { /* userStorage set, session-scoped */ }
getPersistedSessionFileId(session) { /* userStorage get + membership check */ }
```

Kill-switch if A’s lane requires one (name TBD by A).

## RED / GREEN

RED: switch pair away from session primary → reload with no `fileId` query → chart boots primary again.  
GREEN: same steps → chart boots last switched `fileId` / symbol.

## Out of scope for Manager D

- No `chart.js` edits by Manager D.
- Timezone EST→CST is a separate bridge fix (`v9-theme-bridge.js`); do not couple symbol persist to timezone work.
