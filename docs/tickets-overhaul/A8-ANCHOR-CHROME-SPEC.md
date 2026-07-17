# A7b R5 — Anchor chrome (TAL-01656 / TAL-01657) — inspection + optional impl spec

**Authority:** Final unrouted item in the VP / volume-tool drawing family ([`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §2.4, §4.4).  
**Status:** **PREP ONLY** — docs-only deliverable; no product or harness edits.  
**Priority:** **Lowest** in the post-bless drawing batch — rides combined build **after** CORE/MOD/V9 tranches ([`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md`](POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md) §4).  
**Intake:** [`DAILY-INTAKE.md`](DAILY-INTAKE.md) — “too many control points / double points at start”; UI-polish(L5) fill batch.

---

## 0. Executive verdict (read this first)

| Ticket | Symptom (tester) | Inspection | Functional defect? | **Recommendation** |
|--------|------------------|------------|--------------------|--------------------|
| **TAL-01657** | Anchored VWAP: **double control point at start** | Two **stacked** blue circles at the anchor pixel: dedicated `.anchored-vwap-anchor` (interactive) + `.anchored-vwap-line-point` from guide markers (`isAnchor` branch) | **No** — only anchor handle receives drag; line markers are `pointer-events: none` | **WONTFIX-candidate** (cosmetic duplicate) |
| **TAL-01656** | VP tools: **too many anchor control points** | Fixed-range VP (selected): full-height **boundary hit strokes** + separate **corner resize-handle** circles at the same anchor X; anchored VP: already reduced to **one** interactive handle (boundaries non-interactive) | **No** — resize/drag paths work; clutter is overlapping affordances, not mis-anchor | **WONTFIX-candidate** (visual density / TV parity polish) |

**Default closure path:** Mark both tickets **WONTFIX-candidate** in tracker/scoreboard — **do not** add a kill-switch, harness row, or gate proof bar for pure chrome unless **Manager overrides** for TradingView parity in the UI-polish fill batch.

**Rationale for no switch (D-023 bar):** D-023 discriminators exist for **behavioral** regressions (pan block, anchor drift, label geometry). Counting SVG circles is brittle, low user impact, and switch-OFF would only restore **extra decorative nodes** — not a defect class the gate needs to hold.

**If Manager overrides:** §5–§8 provide a **single optional tranche** (one switch, one harness row, freeze-safe hunks) suitable for lowest-priority combined-build tail.

---

## 1. Problem summary (tester language)

| Ticket | Report |
|--------|--------|
| **TAL-01656** | Volume Profile tools show **too many** blue anchor / control points — visually noisy vs TradingView. |
| **TAL-01657** | Anchored VWAP shows **two** control points **at the same start anchor** — reads as a bug even when drag works. |

**Legacy echo:** TAL-01234 (“too few blue control points… we only need **one** at the beginning”) — opposite complaint on a different tool; same **chrome expectations** family.

**Out of scope:** RC-3 anchor **persistence** (H-S40–H-S42), pan block (R3), axis labels (R4), scale vanish (R2 / D-029), cross-layout preview (R1). R5 is **handle painting only**.

---

## 2. Static code inspection

### 2.1 TAL-01657 — Anchored VWAP duplicate at anchor

**File:** `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` (`AnchoredVWAPTool.render`)

| DOM element | Class | Purpose | Interactive? |
|-------------|-------|---------|--------------|
| Anchor hit disc | `.anchored-vwap-anchor-hit` | Drag target | **Yes** (`ew-resize`) |
| Anchor visible ring | `.anchored-vwap-anchor` | Visible handle | **Yes** |
| Guide marker at bar 0 | `.anchored-vwap-line-point` inside `.anchored-vwap-line-markers` | TV-like stride markers along curve | **No** (`pointer-events: none`) |

**Duplicate mechanism:** `appendGuideMarkers` (~1021–1056) pushes a marker when `barOffset === 0` (`isAnchor`) **and** the render path already appended `.anchored-vwap-anchor` at the same `(anchorX, anchorY)` (~947–973). Y is aligned to VWAP line value at anchor (~909–914).

**Manager already mitigates move-time duplication:** `_pruneAnchoredVwapMoveDom` (`drawing-tools-manager.js` ~6395–6402) removes extra `.anchored-vwap-anchor*` nodes if render ever stacks them during drag — confirms duplicate class is a **known chrome hygiene** concern, not anchor math.

**Anchored VWAP does not** use generic `BaseDrawing.createHandles` — anchor chrome is fully custom.

### 2.2 TAL-01656 — Volume Profile handle inventory

**File:** `drawing-tools-advanced-volume.js` (`VolumeProfileTool.render` + `createHandles`)

#### Fixed-range / session VP (`fixed-range-volume-profile`, `volume-profile`) — **selected, 2 points**

| Layer | Class / selector | Role | Interactive when selected? |
|-------|------------------|------|----------------------------|
| Left/right boundary hit | `.volume-profile-boundary-hit.resize-handle-hit[data-point-index]` | Full-height edge resize | **Yes** (`stroke`) |
| Visible boundary lines | `.volume-profile-boundary` | Visual vertical edges | No |
| Corner resize circles | `.resize-handle-group` / `.resize-handle` | Corner-positioned handles from `createHandles` (~2233–2384) | **Yes** |
| Preview-only corners | `.volume-profile-corner-point` | Placement preview | No (`pointer-events: none`); not steady state |

**Visual “too many”:** Up to **two vertical edges + two corner circles** (four control-like artifacts) for two anchors. Corner handles sit at profile **top/bottom Y** for each anchor X — same X as boundary lines, different Y → reads as extra anchors.

#### Anchored VP (`anchored-volume-profile`) — **selected, 1 point**

Proxy render sets `_isAnchoredProxy = true`; post-render cleanup (~2540–2543) removes point-index **1** handles/boundaries. Manager disables boundary interaction (~7565–7578); **only** `.resize-handle[data-point-index="0"]` is interactive.

**Visual “too many” on anchored VP is mild** (one handle + non-interactive anchor boundary line). Primary 01656 noise is **fixed-range** path.

### 2.3 Interaction paths (why this is not functional)

| Tool | Effective resize entry | Wrong-target risk |
|------|------------------------|-------------------|
| Anchored VWAP | `.anchored-vwap-anchor(-hit)` only | Low — duplicate marker non-interactive |
| Fixed-range VP | Boundary hit **or** corner handle (same point index) | Low — both drive same `onPointHandleDrag` index |
| Anchored VP | Single handle index 0 | Low — boundaries explicitly `pointer-events: none` |

No evidence of anchor drift, failed drag, or spurious `points[]` mutation from extra chrome nodes.

---

## 3. Fence — freeze-safe, combined build

| Rule | Detail |
|------|--------|
| **Allowed files** | `drawing-tools-advanced-volume.js` only (both I8 trees). **No** `drawing-tools-manager.js` unless hover opacity rules must change (prefer render-side dedup first). |
| **Forbidden** | `chart.js`, React/V9 shells, sync bridge, harness edits in Lane 5. |
| **Build stamp** | Module-only land — follow A8 pattern: **no `chart.js` bump required**; FIX report cites module SHA + optional dist rebuild. |
| **Batch slot** | **After** A8 MOD tranches + VP-V9 bridge + [`VP-LANDED-SWITCHES-RED-HARNESS-SPECS.md`](VP-LANDED-SWITCHES-RED-HARNESS-SPECS.md) rows; **do not** block bless. |
| **Gate** | **None required** if WONTFIX-candidate accepted. Optional harness is **nice-to-have**, not ship-gate. |

---

## 4. WONTFIX-candidate closure (default)

### 4.1 Actions (Manager / Lane 1)

| Artifact | Update |
|----------|--------|
| `PLAN2-SCOREBOARD.csv` / `TICKET-STATUS-SIMPLE.csv` | TAL-01656, TAL-01657 → **WONTFIX-candidate** (or **CLOSED-wontfix** per tracker convention) |
| `A8-VP-FAMILY-CLOSURE-SWEEP.md` §4.4 | Mark R5 **closed (wontfix)** — family gap cleared by decision, not code |
| `RESOLUTION-TRACKER.csv` | Optional row: disposition **WONTFIX-candidate**, evidence = this spec §2 |
| `POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md` | Remove R5 from open gap list when wontfix accepted |

### 4.2 PO / tester message (if wontfix)

> Extra VP boundary lines and VWAP stride markers are **intentional TradingView-like chrome**. Duplicate circles at the VWAP anchor are **visual only** — drag uses the primary anchor handle. No chart control, anchor persistence, or resize correctness defect was found. Reopen if chrome blocks interaction or misleads drag hit-testing.

### 4.3 Reopen triggers (would flip to §5 impl)

- User cannot drag anchor because duplicate nodes steal/confuse hit order (interactive overlap).
- Harness or PO documents **wrong anchor index** after resize starting on “extra” handle.
- Product mandate for **strict TV handle parity** in UI-polish batch.

---

## 5. Optional impl spec (Manager override only)

Implement only if UI-polish batch explicitly schedules R5 **after** higher-priority lands.

### 5.1 Switch (single tranche for both tickets)

| Switch | unset = | `= true` |
|--------|---------|----------|
| `window.__TALARIA_DISABLE_VP_ANCHOR_CHROME_DEDUP_FIX` | **Fix ON** — deduped chrome | Revert to current duplicate/excess visuals |

**Enable helper** (top of `drawing-tools-advanced-volume.js` or `drawing-tools-base.js` near other VP helpers):

```javascript
function _isVpAnchorChromeDedupFixEnabled() {
    return typeof window === 'undefined'
        || window.__TALARIA_DISABLE_VP_ANCHOR_CHROME_DEDUP_FIX !== true;
}
```

**CLI (Lane 4, optional):** `--vp-anchor-chrome-off` → `bugSwitches: ['__TALARIA_DISABLE_VP_ANCHOR_CHROME_DEDUP_FIX']`

### 5.2 Hunks

#### Hunk A — TAL-01657 (Anchored VWAP)

**Where:** `appendGuideMarkers` loop (~1026–1035)

**Fix ON:** Skip anchor stride marker when dedicated anchor handle is rendered:

```javascript
// if (_isVpAnchorChromeDedupFixEnabled() && isAnchor) continue;
```

**Do not** remove stride markers at non-anchor bars — only dedupe **barOffset === 0**.

#### Hunk B — TAL-01656 (fixed-range VP)

**Where:** `VolumeProfileTool.createHandles` (~2233) or call sites (~2213)

**Fix ON:** For types `fixed-range-volume-profile` and `volume-profile` (not anchored proxy):

- **Skip** `createHandles` entirely when `this.selected && this.points.length >= 2` — boundary `.volume-profile-boundary-hit` already exposes resize with `data-point-index` and manager wiring.
- **Keep** `createHandles` for anchored proxy (`_isAnchoredProxy`) — single handle still required.

**Do not** remove boundary lines (they are the remaining resize affordance).

#### Hunk C — I8 mirror

Byte-sync `homepage/public/chart/modules/drawing-tools-advanced-volume.js`.

### 5.3 Risk / blast radius

| Risk | Mitigation |
|------|------------|
| Fixed-range resize only via boundary stroke | PO smoke: drag left/right boundary after land |
| Hover handle opacity paths (`drawing-tools-manager.js` ~15597+) | Anchored VP unchanged; fixed-range already uses boundary-hit hover |
| Preview placement corners | Unchanged (`renderCornerPoint` preview-only) |

---

## 6. Optional harness spec (RED-first, only if §5 lands)

**Scenario ID:** `H-A7b-R5`  
**Runner:** host `run.mjs` / `scenarios.mjs` (same as [`A8-RED-HARNESS-SPECS.md`](A8-RED-HARNESS-SPECS.md))

**Not recommended for gate suite** if wontfix — include only when Manager wants regression lock on polish.

### 6.1 Topology

| Param | Value |
|-------|--------|
| Boot | `{ pair: 'same', panels: 1, tf: '1m' }` |
| Sub-rows | **R5a** anchored VWAP · **R5b** fixed-range VP |

### 6.2 Probe — `readAnchorChromeHandleCount(page, panelId, drawId)`

```javascript
// evaluate in host frame
{
  ok: true,
  type: drawing.type,
  anchorPixel: { x, y },           // primary anchor page coords
  interactiveHandleCount,        // circles with pointer-events != none near anchor (±6px)
  decorativeMarkerCount,           // .anchored-vwap-line-point near anchor
  vpCornerHandleCount,             // .resize-handle near boundary x (fixed-range)
  vpBoundaryHitCount,              // .volume-profile-boundary-hit
  totalControlLikeAtAnchor,        // derived
}
```

### 6.3 Assertions

| Sub | Setup | GREEN (fix ON) | RED (switch OFF) |
|-----|-------|----------------|------------------|
| **R5a** | `placeTool` `anchored-vwap`, 1 pt; `selectTool` | `decorativeMarkerCount === 0` at anchor (or `totalControlLikeAtAnchor === 1`) | `totalControlLikeAtAnchor >= 2` |
| **R5b** | `placeTool` `fixed-range-volume-profile`, 2 pt; `selectTool` | `vpCornerHandleCount === 0` && `vpBoundaryHitCount >= 2` | `vpCornerHandleCount >= 2` |

**I15 note:** CORE is **end-state DOM probe** after real `selectTool` click — no drag required (chrome is selection-gated).

### 6.4 Commands

```bash
node run.mjs --only=H-A7b-R5 --runs=10                              # GREEN (if fix landed)
node run.mjs --only=H-A7b-R5 --runs=10 --vp-anchor-chrome-off       # RED
```

### 6.5 Proof bar (optional)

| Leg | Fix ON | Switch-OFF |
|-----|--------|------------|
| H-A7b-R5 | 10/10 PASS | ≥8/10 FAIL |

---

## 7. Landing checklist (override path only)

| Step | Owner | Done when |
|------|-------|-----------|
| 1 | Manager | Explicit go on UI-polish R5 (not wontfix) |
| 2 | Lane 5 | Hunks A+B on both I8 trees; FIX report with switch-OFF PO steps |
| 3 | Lane 4 | (Optional) `H-A7b-R5` + `--vp-anchor-chrome-off` |
| 4 | PO | NEEDS-LIVE: VWAP one circle at anchor; fixed-range VP two vertical edges, no extra corner circles |
| 5 | Lane 1 | Tracker → **RESOLVED-DEV** or leave **wontfix** |

---

## 8. References

| Doc / path | Relevance |
|------------|-----------|
| [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) | §2.4 R5 inventory; §4.4 gap |
| [`worker-reports/A7b-volume-profile-diagnostic-report.md`](worker-reports/A7b-volume-profile-diagnostic-report.md) | R5 explicitly out of A7b core |
| [`POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md`](POST-BLESS-DRAWING-BATCH-LANDING-PLAN.md) | R5 OPEN, lowest priority |
| [`A8-FREEZE-SAFE-IMPL-SPEC.md`](A8-FREEZE-SAFE-IMPL-SPEC.md) | Module-only fence pattern |
| [`VP-LANDED-SWITCHES-RED-HARNESS-SPECS.md`](VP-LANDED-SWITCHES-RED-HARNESS-SPECS.md) | Behavioral VP harness (orthogonal) |
| `chart v 1.4/chart/modules/drawing-tools-advanced-volume.js` | AnchoredVWAPTool, VolumeProfileTool chrome |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | VP / AVWAP interaction + hover handle rules |

---

*End of A7b R5 anchor-chrome spec — default WONTFIX-candidate; optional impl §5–§7 if Manager schedules polish.*
