# ESCALATE — Canary delivery broken for warm `/chart/` clients

**From:** Manager B  
**To:** Director (cc PO)  
**When:** 2026-07-28 ~23:20Z  
**Severity:** Blocks honest canary / DEPLOY-01 warm-path claim  
**Host:** `http://31.97.192.82:3000` (test only)

## Fact

PO browser read `20260726b75` while cold origin served `20260728b82`. Tonight's census and deploy-gate were cold fetches. That gap is real and explained in product code + live headers.

## Verdict

**`CANARY_DELIVERY_BROKEN`.** Server-side stamp-census / probe-PRESENT describe the origin, not what a returning user with a controlling SW or hour-long HTTP-cached shell receives.

## Evidence

- Finding: `FINDING-SW-WARM-CLIENT-DELIVERY-20260728.md`
- Probe: `sw-warm-client-delivery-probe.mjs` → exit 3, verdict `CANARY_DELIVERY_BROKEN`
- Observation: `observations/sw-warm-client-delivery-2026-07-28T23-17-37-860Z.json`

## Why unaided transition fails

1. Product shells (`dist-v9`, `chart-embed`) **do not load** `talaria-version-reload.js`.
2. That module is **retired default OFF** (harness opt-in only).
3. Even when enabled, `check()` only toasts; **SW unregister + cache clear runs only on Reload click**.
4. Shells ship `Cache-Control: max-age=3600`; dist-v9 registers `/chart/sw.js` via `pwa-install.js`. A warm tab on old HTML never re-registers → never activates tip SW.

## Ask

1. Treat warm-client delivery as a **named DEPLOY / canary gate**, not implied by cold census.
2. Rule the fix path (B will not invent product SW policy without a ticket): e.g. restore version-reload on shells + auto-hardReload on mismatch; and/or `Cache-Control: no-store` on HTML shells; and/or unregister/migrate legacy controllers once.
3. Until that lands, do **not** claim that a returning canary user is on `20260728b82` from origin green alone.
