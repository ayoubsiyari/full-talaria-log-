# T8 step 3 (Lane 2) — independent-symbol play-advance FIX (TAL-01590 P1 freeze)

## Authorization
D-014 ruling 2: this is the **T8 priority item**. It may land **ahead of and independently of** the policy-v2 migration (its own kill-switch). Freeze-exempt (data/replay path). Your own step-2 policy table (`T8-MIRROR-POLICY-TABLE.md` §1) is the spec.

## Root (from your own trace — do not re-diagnose)
Independent-symbol panels have **no BL-10 equivalent**. Same-symbol panels advance during play via `scheduleCoalescedSeek` (gated on `isSameSymbolAsHost`, `panel-cmd-bridge.js:701`); independent panels advance only by chasing host mirror-frame timestamps + async `ensureReplayDataCoversTimestamp`. When fetch lags or the 3-strike catch-up breaker trips (`panel-cmd-bridge.js:1135–1143`), the panel **freezes at its loaded edge 2.5s+** while the host plays on — TAL-01590.

## Approved policy for the cell (D-014 ruling 2)
Advance independent-symbol panels **on the panel's own master during play**:
- adopt-data **Y** from the panel's own master (`_panelFullRawData`), keyed to the shared playhead timestamp;
- adopt-X **Y** on the panel's own bars;
- keep async catch-up + breaker as the **fallback for genuinely missing data only**, NOT the primary advance path.
This mirrors the coarser-panel BL-10 mechanism.

## Kill-switch
`window.__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` — default = **fix ON** (ON of the switch = revert to current freeze-prone path). Must cover every file the fix touches (I13).

## RED FIRST — H-S59b (mandatory; the fix may NOT accept against current H-S59)
Build it per your §1 spec + D-014 ruling 4:
- **Setup:** extend `serve.mjs` to serve **≥2 distinct symbols** (panel B on a different fileId than host); 2v+ layout; sync all OFF; enter replay paused.
- **Actuation (production-faithful, no synthetic seek in the inner loop):** host `replayPlay` + tick-animation frames (`animatedCandle` + `tickProgress`). No `hostReplaySeek` driving the loop.
- **Measure (I15 — real end-state per panel iframe, no proxies):** `replaySystem.replayTimestamp` advances every ~2s wall-clock; the forming bar `data[data.length-1].t` advances; **no panel frozen while peers move**.
- **RED condition:** any independent panel with `replayTs` delta = 0 over N play frames while host `replayTs` delta > 0.
- Must be RED before the fix, GREEN after, RED again with the kill-switch ON.

## Lane 4 sign-off (D-014 ruling 4 — required before H-S59b is trusted)
Lane 4 reviews your actuation method and writes ONE sign-off line in `MANAGER-FINDINGS.md`. This is a review, not a hand-off — you build it (host harness, NOT `react-parity-lib.mjs`, so no D-012 collision). Flag the Manager when H-S59b is ready for Lane 4 review.

## Acceptance (D-014 ruling 2)
H-S59b RED→GREEN + kill-switch A/B + **BL-10/11/12/13 family stays green** + Lane 4 actuation sign-off + **PO live-confirm on a staging build** (deploy freeze unaffected — staging only).

## Guardrails
- I8: mirror both trees byte-identical (`homepage/public/chart/...`); SHA256.
- I9: full `npm run gate` stays green (29 scenarios + coverage rows).
- I11/T8 ownership: this is a sanctioned policy-cell change, NOT a new guard on the mirror-frame tail.
- Do NOT touch `react-parity-lib.mjs`.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Diff + kill-switch coverage table, H-S59b RED→GREEN→RED(switch) evidence with the actuation + measurement stated (I15), BL-10/11/12/13 family gate result, both trees SHA256, and the staging build id for PO live-confirm.
