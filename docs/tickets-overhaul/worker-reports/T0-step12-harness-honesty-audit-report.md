# T0 step 12 — harness honesty audit (false-green hunt)

## 1. Task + RC

**Task:** T0 step 12 (Lane 4) — READ-ONLY audit of all `H-S*` and `H-R*` scenarios for proxy assertions and synthetic actuation that can mask broken product paths (same class as ESC-011 / `readParentReactSettings` false-green).

**RC:** Tooling/diagnostic — no RC. Feeds pending real cross-frame mouse/keyboard actuation work (Lane 1 P0 on `react-parity-lib.mjs`).

---

## 2. What I changed — file by file

**N/A — audit.** Static read of `scenarios.mjs`, `react-parity-scenarios.mjs`, `interactive-helpers.mjs`, `harness-lib.mjs`, and `react-parity-lib.mjs` (read-only; not edited per guardrail). No other files touched.

---

## 3. Kill-switch (I3 + I13)

**N/A — audit.** Switch-OFF rows noted in table where scenarios explicitly probe them (H-S22, H-S54–H-S58).

---

## 4. Proof — RED → GREEN

**N/A — no runs required.** Findings are from code inspection. Confirmed against step-11 honest-probe evidence: settings rows RED on `b88` while old proxy probe had been GREEN.

**Anchor false-green (already proven):** `readParentReactSettings` counted V9 quick-bar shell (`childElementCount > 0`, text `"A"`) as settings-open. Scenarios H-R04/H-R09/H-R13 used it; H-R12 used gear + same proxy. Step 11 disambiguation + `waitForParentDrawingSettingsOpen` in H-R12/H-R13 scenarios now require `hasStyleSection` / message probe — those rows are honestly RED on `b88`.

---

## 5. Invariants checked

| Invariant | Audit coverage |
|-----------|----------------|
| **D-010** | Flagged react-parity rows that pass on synthetic iframe paths while built-product user paths fail. |
| **I14 (parent↔iframe)** | Called out panel-B actuation that never crosses the frame boundary with real Puppeteer input. |
| **I8** | N/A (no edits). |

---

## 6. What I did NOT do / limits

- Did not edit harness code (`react-parity-lib.mjs` reserved for Lane 1 step 18).
- Did not re-run scenarios (static audit only).
- `H-R12A` exists in `react-parity-scenarios.mjs` but is **not** in `reactParity.expectedTests` / gate — noted separately.
- H-S2–H-S31 summarized as a **family** (57 individual cells would repeat the same drag/replay/diag pattern); each row ID is still listed with family-level actuation/assertion.

---

## 7. Live-verification handoff

PO should treat any row in **§HIGH-risk ranked** as “harness-green ≠ product-green” until real cross-frame actuation lands. Parity checklist live retest is mandatory for settings/Esc/Delete/marquee/gear regardless of gate color.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)** — audit complete; remediation owned by Lane 1 (P0 actuation) + per-row tightening.

---

## Risk table — `H-R*` (react-parity)

| ID | Gate on b88 | Actuation | Assertion | Risk | Reason (file:line) |
|----|-------------|-----------|-----------|------|---------------------|
| H-R01 | **GREEN** | **Mixed** — host: real `page.mouse` (`react-parity-lib.mjs:560`); panel-B: real mouse **+** `selectDrawing` fallback (`:561-571`) | **Mixed** — `isDrawingSelected` (real) + `toolbarVisible`/`v9QuickBarVisible` proxy via `assertReactMenuState` (`react-parity-scenarios.mjs:60-63`, `react-parity-lib.mjs:939-959`) | **HIGH** (panel-B) / MED (host) | Fallback can green select even if iframe hit-test routing is broken |
| H-R02 | **GREEN** | Same click path as H-R01 | **Proxy** — `hasBlueBorder` = resize-handle count, not stroke color (`react-parity-scenarios.mjs:96-99`, `react-parity-lib.mjs:401-414`) | **MED** | Handle chrome can exist without user-visible “blue border” contract |
| H-R03 | **GREEN** | Host: real mouse + `page.keyboard` Control; panel-B: parent `keyboard.down('Control')` + mouse — **Ctrl may not reach iframe** (`react-parity-lib.mjs:672-676`) | **Real** — `isDrawingSelected` on both IDs (`react-parity-scenarios.mjs:127-131`) | **MED** (panel-B) / LOW (host) | Cross-frame modifier fidelity unproven |
| H-R04 | RED | panel-B dbl: **synthetic** `dispatchEvent` + **`editDrawing` fallback** (`react-parity-lib.mjs:579-639`); host dbl: real `page.mouse` | **Proxy** — probe checks `dbl.ok` only (click dispatched, **not** settings) (`react-parity-scenarios.mjs:149-150`); CORE uses settings union | **HIGH** | Probe name lies; iframe path bypasses real dbl-click routing |
| H-R05 | RED | `pressEscapeReact`: `page.keyboard` + **synthetic** `handleKeyDown` in iframe (`react-parity-lib.mjs:802-826`) | **Mixed** — `isDrawingSelected` real; settings closed = `!toolbarVisible && !parent.open` proxy (`react-parity-scenarios.mjs:181-182`) | **HIGH** | Esc may pass on synthetic key path while host forwarder broken |
| H-R06 | RED | `deleteSelectedViaKeyboard`: `page.keyboard` + **synthetic** `handleKeyDown` (`react-parity-lib.mjs:836-860`) | **Mixed** — drawing gone from store (real); repaint = render counter; ghost = label/axis counts (`react-parity-scenarios.mjs:204-210`) | **HIGH** | Delete can pass without parent `deleteSelectedDrawings` cmd |
| H-R07 | **GREEN** | Real mouse clicks cross-panel (`react-parity-scenarios.mjs:227-232`) | **Proxy** — peer isolation via `!host?.toolbarVisible && !host?.v9QuickBarVisible` (`:243-246`) | **HIGH** | Selection can desync while parent quick-bar DOM still “visible” |
| H-R08 | RED | Host: real mouse Ctrl+drag (`react-parity-lib.mjs:772-791`); panel-B: **synthetic** canvas/pointer events in iframe (`:684-760`) | **Mixed** — marquee `active/w/h` from `ctrlMarqueeSelect` object; selection via `isDrawingSelected` | **HIGH** (panel-B) / MED (host) | iframe marquee does not use real cross-frame drag |
| H-R09 | RED | Same as H-R04/H-R05 chain | **Proxy** — settings via `readParentReactSettings`; Esc via toolbar/parent probe (`react-parity-scenarios.mjs:312-326`) | **HIGH** | Entire chain depends on false settings-open semantics |
| H-R12 | RED | **`selectDrawing` in iframe** setup (`react-parity-scenarios.mjs:350-355`); **synthetic** gear `dispatchEvent` (`react-parity-lib.mjs:496-504`) | **Improved** — `waitForParentDrawingSettingsOpen` + `hasStyleSection` (`react-parity-scenarios.mjs:370-376`) | **HIGH** | Gear click not real user input; honestly RED on b88 |
| H-R12A | *(not gated)* | Same as H-R12 but host panel A (`react-parity-scenarios.mjs:388-428`) | Same honest settings wait | **MED** | Not in gate; synthetic gear remains |
| H-R13 | RED | panel-B **synthetic** dbl + `editDrawing` fallback (`react-parity-lib.mjs:579-639`) | **Improved** — `waitForParentDrawingSettingsOpen` + style section (`react-parity-scenarios.mjs:442-448`) | **HIGH** | Proven false-green class; now honestly RED |
| H-R14 | RED | **Synthetic** iframe Ctrl+drag (`react-parity-lib.mjs:684-760`) | **Proxy** — marquee border `w/h`; multi-select = `dm.selectedIds` length (`react-parity-scenarios.mjs:485-491`) | **HIGH** | Border can be inactive while ids pass on fallback select |

---

## Risk table — `H-S*` (manager gate)

### Family A — replay / sync / pan / boot (H-S2–H-S31)

| IDs | Gate on b88 | Actuation | Assertion | Risk | Notes |
|-----|-------------|-----------|-----------|------|-------|
| H-S2–H-S8, H-S10–H-S31 | **GREEN** (except none in this family tracked-red) | **Real** `page.mouse` drag (`harness-lib.mjs:430-481`); replay/TF via `page.evaluate` helpers | **Real** engine diag: `fetches`, `firstBarT`, `offsetX`, `seams`, playhead samples (`scenarios.mjs` per row) | **LOW** | Data/sync paths; weak spot is `enterReplayPausedAll` etc. if implemented as direct API calls (still asserts real chart state) |
| H-S22 | GREEN | `evaluate` build-id injection | Toast/DOM text probe | **LOW-MED** | UI toast is inherently DOM; kill-switch probed |

### Family B — drawing interaction (H-S32–H-S50)

| ID | Gate | Actuation | Assertion | Risk | Reason (file:line) |
|----|------|-----------|-----------|------|---------------------|
| H-S32 | GREEN | **Real** `page.mouse` via `selectTool` (`scenarios.mjs:4846`, `interactive-helpers.mjs:162-179`) | **Proxy** `toolbarVisible` Quick Menu (`scenarios.mjs:4852-4855`) | **MED** | Host-only; menu visibility ≠ parent V9 bar contract |
| H-S33 | GREEN | **Synthetic** `openSettings` → `dm.editDrawing` / `settingsPanel.show`; **synthetic** delete (`interactive-helpers.mjs:185-254`, `scenarios.mjs:4871-4877`) | Store count + ghost label counts (`scenarios.mjs:4881-4883`) | **HIGH** | Tests manager API path, not gear/dbl-click/user delete |
| H-S34 | RED (intentional) | **Synthetic** `placeTool` only — no user click (`scenarios.mjs:4898-4902`) | `selectedIds` + `toolbarVisible` on placement side-effect (`:4905-4916`) | **HIGH** | No cross-panel select actuation at all |
| H-S35 | RED (intentional) | Same placement-only | `toolbarVisible` owner string (`:4940-4949`) | **HIGH** | Proxy quick-menu ownership |
| H-S36 | GREEN | **Synthetic** `page.evaluate` order injection + `checkPendingOrders` (`scenarios.mjs:4967-5022`) | Internal order manager state | **MED** | Correct for unit-style probe; not user place-order click |
| H-S37 | GREEN | **Synthetic** order/TP setup in evaluate | Line geometry stability | **MED** | Same |
| H-S38 | GREEN | **Synthetic** `commitDrawingStyleInPanel` (`scenarios.mjs:5166`, `interactive-helpers.mjs:532+`) | Render counter delta (`:5168-5171`) | **MED** | Tests invalidation API, not settings UI commit |
| H-S39 | GREEN | Same as H-S38 | Same | **MED** | Same |
| H-S40 | RED | **Synthetic** `placeTool` | Anchor timestamp/price from `drawing.points` (`scenarios.mjs:5299-5305`) | **LOW-MED** | Assertion is real anchor math; placement synthetic |
| H-S41 | RED | Same | Same | **LOW-MED** | Same |
| H-S42 | RED | Same | Same | **LOW-MED** | Same |
| H-S43 | GREEN | **Real** cross-frame `page.mouse` + `keyboard` Control (`scenarios.mjs:5436-5444`) | `selectedIds` from geometry read (`:5447-5453`) | **LOW-MED** | Best-in-class iframe interaction in manager harness |
| H-S44 | RED | Real select click; **synthetic** `openSettings` (`:5483-5493`) | **Real** `readParentSettingsProbe` message (`:5495-5502`) | **MED** | Open path synthetic; parent message assertion is strong |
| H-S45 | RED | **Real** `focusPanelByClick` + `drawRectangleViaMouse` (`:5533-5536`) | Drawing counts per panel (`:5541-5544`) | **LOW** | Trustworthy actuation; RED is product bug not harness |
| H-S46 | RED | **Real** cross-frame mouse draw + Ctrl-click (`:5561-5590`) | Selected IDs + pixel separation (`:5602-5610`) | **LOW-MED** | Strong actuation |
| H-S47 | RED | Real draw via mouse (`:5628-5630`) | **Proxy** parent DOM selector count + `toolbarVisible` (`:5633-5648`) | **HIGH** | DOM node count ≠ live quick-menu contract |
| H-S48 | RED | **Synthetic** `addIndicator` / `removeAllIndicators` | DOM `.indicator-list-item.active` count proxy (`:5669-5689`) | **MED** | List UI state proxy |
| H-S49 | RED | **Real** mouse drag with leave-tile (`interactive-helpers.mjs:598-655`, `scenarios.mjs:5738+`) | Geometry after drag | **LOW-MED** | Real cross-frame drag |
| H-S50 | RED | **Synthetic** style commit in panel (`scenarios.mjs:5777+`) | Render counter | **MED** | API-path invalidation |

### Family C — layout / A3 / order-entry (H-S51–H-S58)

| ID | Gate | Actuation | Assertion | Risk | Reason |
|----|------|-----------|-----------|------|--------|
| H-S51 | GREEN | `localStorage` seed + `page.goto` reload (`scenarios.mjs:5827-5850`) | `appliedPanels` probe | **LOW-MED** | Persistence contract; notes own URL proxy (`:5859-5861`) |
| H-S52 | GREEN | Layout boot only | Canvas vs cell rect geometry | **LOW** | Real layout metrics |
| H-S53 | GREEN | `evaluate` symbol/focus helpers | Convergence on ticker/file id | **LOW-MED** | Mostly state reads |
| H-S54–H-S57 | GREEN | **`page.evaluate` probe fns only** — no play UI click (`scenarios.mjs:6072-6149`) | Internal replay routing predicates | **MED** | Correct for cadence logic; not user pressing Play |
| H-S58 | GREEN | **`orderEntryCloseHitTargetProbe` in evaluate** (`:6202-6224`) | Stack offset `y2===16` | **MED** | Hit-target math probe, not mouse on close button |

---

## HIGH-risk ranked (most likely false confidence today)

| Rank | ID | Currently GREEN? | Why I would **not** trust a GREEN |
|------|----|------------------|-------------------------------------|
| 1 | **H-R04** probe leg | RED (baseline) | Probe asserts click dispatched, not settings (`react-parity-scenarios.mjs:149-150`) — classic false-green naming |
| 2 | **H-R13 / H-R12** | RED | Settings/gear paths: synthetic iframe dbl / gear + historical quick-bar proxy (step-11 proved) |
| 3 | **H-R09 / H-R05** | RED | Chains assume settings opened; Esc/delete use synthetic `handleKeyDown` + toolbar proxies |
| 4 | **H-R07** | **YES — do not trust** | GREEN on `!toolbarVisible` only (`react-parity-scenarios.mjs:243-246`) — peer deselect can fail while DOM says cleared |
| 5 | **H-R01 panel-B** | **YES — do not trust** | `selectDrawing` fallback after mouse (`react-parity-lib.mjs:561-571`) masks broken iframe click routing |
| 6 | **H-R06** | RED | Synthetic Delete + render-count proxy |
| 7 | **H-R08 / H-R14 panel-B** | RED / baseline | iframe Ctrl+drag is 100% synthetic events |
| 8 | **H-S33** | **YES — do not trust for user paths** | Entirely `editDrawing` / `settingsPanel.show` / `onDelete` — GREEN does not prove gear/Esc/Delete UX |
| 9 | **H-S47** | RED | Parent menu = DOM selector count (`scenarios.mjs:5633-5648`) |
| 10 | **H-S32** | **YES — partial trust** | Host click real; pass condition is `toolbarVisible` proxy not parent V9 bar |
| 11 | **doubleClickDrawing B** | *(helper)* | `editDrawing` fallback (`react-parity-lib.mjs:628-637`) can hide broken dbl-click — **must be removed or gated** when honest probe enforced |
| 12 | **clickV9QuickBarGear** | *(helper)* | Synthetic `dispatchEvent` on `#tl-sett` (`react-parity-lib.mjs:496-504`) |

### Currently-GREEN on b88 — trust summary

| ID | Trust? | Verdict |
|----|--------|---------|
| H-R01 host | **Partial** | Real mouse + selection chrome — reasonable |
| H-R01 panel-B | **No** | Fallback + toolbar proxy |
| H-R02 host | **Partial** | Real click; border = handle proxy |
| H-R02 panel-B | **No** | Same as H-R01 panel-B |
| H-R03 host | **Yes** | Real mouse + Ctrl + selection state |
| H-R03 panel-B | **Partial** | Cross-frame Ctrl fidelity suspect |
| H-R07 | **No** | Toolbar visibility proxy for peer isolation |
| H-S2–S31 (most) | **Yes** | Drag/replay diag on real engine state |
| H-S32 | **Partial** | Real host click; proxy menu assertion |
| H-S33 | **No** (for UX) | API-only path |
| H-S36–S39, S58 | **Partial** | Valid for logic probes, not user gestures |
| H-S43 | **Yes** | Real cross-frame mouse |
| H-S51–S53 | **Partial** | Layout/persistence probes |

---

## Remediation plan (feeds step 18 / real actuation)

| Row / helper | Real actuation needed | Real assertion needed |
|--------------|----------------------|------------------------|
| **All panel-B clicks** | Puppeteer `page.mouse` at iframe-offset coords **only**; remove `selectDrawing` fallback (`react-parity-lib.mjs:561-571`) | `dm.selected` + parent `multichart-drawing-selected` message |
| **panel-B dbl-click** | Cross-frame `page.mouse` double-click; **remove** `editDrawing` fallback (`:628-637`) | `waitForParentDrawingSettingsOpen`: message probe + `.tv-settings-modal` + `hasStyleSection` |
| **Gear (H-R12)** | Real mouse on parent `#tl-sett` after iframe selection via user click path | Same settings modal probe |
| **Esc / Delete (H-R05/06/09)** | `page.keyboard` on **focused** target; parent forwarder must receive key (no direct `handleKeyDown`) | Parent `multichart-close-drawing-settings` message; drawing absent from **both** panels' stores |
| **Ctrl+drag marquee (H-R08/14)** | Cross-frame mouse down/move/up with Control held at page level | Visible marquee DOM + `dm.selectedDrawings` after **real** pointer-up |
| **H-R07** | Real cross-panel clicks only | Host drawing deselected in iframe store **and** parent quick-bar hidden via V9 visibility API, not `toolbar.visible` |
| **H-R02** | Keep real click | Pixel-sample stroke color or computed style on selection outline, not handle count alone |
| **H-S33** | Add parallel row: user dbl-click → settings → UI delete button | Same ghost checks after **user** path |
| **H-S47** | Already uses real draw | Assert parent V9 quick-bar visible via same probe as H-R12, not selector counts |
| **H-S32** | OK on host | Assert parent `#tl-*` bar or message bus, not `dm.toolbar.visible` |

---

## Cross-check: b88 GREEN react rows (H-R01, H-R02, H-R03, H-R07)

Under the **honest settings probe**, settings rows are RED — good. Of the four GREEN gate rows:

- **H-R03 (host)** — trustworthy enough for selection semantics.
- **H-R01/H-R02 (host)** — acceptable with MED caveat on menu/border proxies.
- **H-R01/H-R02/H-R03 (panel-B)** — **not trustworthy** until cross-frame real mouse is mandatory and fallbacks removed.
- **H-R07** — **not trustworthy**; HIGH risk of false-green on peer isolation (toolbar proxy).

**Bottom line:** Only **host-side selection clicks on H-R01/R02/R03** merit provisional trust. All iframe legs and H-R07 should be treated as **unproven** until Lane 1 lands real cross-frame actuation.
