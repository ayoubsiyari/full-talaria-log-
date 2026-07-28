# ESCALATE — `/chart/multichart/chart-host.html` is the live panel loader (a10)

**Director:** `RULING-DO-NOT-404-MULTICHART-20260728-2100.md`  
**Owner:** Manager B → Director / A  
**Observed:** 2026-07-28 ~21:03 UTC+1 on test host `http://31.97.192.82:3000`  
**Action taken:** **Held** the nginx `404` for `/chart/multichart/`. Redirect half of P6 (design-live → dist-v9) unchanged. Harness prefix 404s kept.

---

## Consumer evidence (required before any block)

| Check | Result |
|---|---|
| `GET /chart/multichart/multichart-shell.html` | **HTTP 200** (unstamped shell; title build `2026-05-09T20:30` / v10.5.0) |
| Shell constructs manager | `new MultichartManager({ container, onLog, onState, onAssertion })` — **no** `iframeSrcBuilder` |
| Default iframe path (`multichart-manager.js`) | `frame.src = 'chart-host.html?' + params` (relative) |
| Resolved panel URL | **`/chart/multichart/chart-host.html?...`** |
| `GET /chart/multichart/chart-host.html` | **HTTP 200**, bridge stamps **`?v=20260524a10`**, loads `../chart.js` |
| `GET /chart/multichart-prod/{shell,host}` | **307 → login** (auth-gated; not the unauth surface that answered 200) |

Relative resolution from the live shell URL is deterministic: opening multichart at `/chart/multichart/multichart-shell.html` makes every panel iframe hit `/chart/multichart/chart-host.html`. That is the live loader, not a disposable duplicate.

---

## Why this is the day’s critical stamp finding

Field current on primary V9 is **b75**. Panel host still serves **a10** (`20260524a10`). Every today’s chart fix that only lands on dist-v9 / bumped modules is **invisible** inside this multichart path — same leak class as P6 design-live, but for the actual multichart product surface that answers 200 without auth.

**Do not 404. Do not redirect blindly** (redirect to dist-v9 would break the shell/host contract unless a full product cutover is designed). Needs a deliberate bring-current or cutover plan (A/product), not an edge-block.

---

## Remedy correction (applied)

| Route class | Prior B-0139 plan | Corrected |
|---|---|---|
| `/chart/talaria-design/live` | 302 → dist-v9 | **kept** (redirect = stop stale) |
| `/chart/multichart/` | 404 | **held / removed** — escalate a10 |
| m20 / m21 harness prefixes | 404 | **kept** (proven non-product) |

**General rule (accepted):** redirect by default; 404 only where proven unused.
