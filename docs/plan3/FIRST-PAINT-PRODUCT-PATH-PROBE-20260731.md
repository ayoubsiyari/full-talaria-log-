# First-Paint Product Path Probe

**Date:** 2026-07-31  
**Manager:** D  
**Probe:** `scripts/first-paint-product-path-probe.mjs`  
**Artifact:** `docs/plan3/FIRST-PAINT-PRODUCT-PATH-PROBE-HARNESS-20260731.json`

## Verdict

C's logged first-paint times of **17.1 / 19.1 / 19.1 s** are **not reproduced on the product path without login**.

On the local harness product URL (`mcLayout=2v`, no login):

| Median | Value |
|---|---:|
| First contentful paint | **152 ms** |
| DOMContentLoaded | **230 ms** |
| Wall to settle sample | **644 ms** |
| First API mark | **14 ms** |

Classification: **`NOT_REPRODUCED`**.

## Mechanism reading

The slow sequence C recorded included login. This probe isolates the chart product path and finds sub-second startup. Do **not** spend a CONF-01 slot on a 17–19 s first-paint product defect until someone reproduces that number on an authenticated product page without counting login/navigation overhead.

## Limits

- Local harness build stamp was `20260728b82`, not canary b118.
- Headless paint entries are sometimes sparse; the classifier uses FCP, else load, else DCL, else wall, ignoring zeros.
- This is a front-door mechanism check, not CONF-01.
