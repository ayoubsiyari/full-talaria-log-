# M20 Q8 alert-checker transaction correction

Status: `PENDING-FRESH-GPT-REVIEW`
Acceptance claimed: no
Commit / push / deploy / install: none
Bound working HEAD for this packet evidence: `f38333b95617fb6600c5fe9ddbfe710822d8bcbb`
Future D-034 checkpoint source SHA: external CKPT manifest/proof after commit; not embedded here.

## Provenance

- Immutable quick-kill commit: `5cd010bb8649fec301983c6ee964379e8d3be3f7`
- Immutable product SHA-256, both trees: `fb17b18698a18605d9051183c7f867abb9cf77b353abb2df0baf34e01825093d`
- Rejected round-1 fixture SHA-256: `bcbb37c2422a3385ad2d274ca597ce8a5fd8b63b8e55efb25e8cd9c5d63cfdcf`
- Current corrected product SHA-256, both trees: `a958373415867597b7efd6b31ca80cb4b04c6f7f0ae38a92b4cb53ad53bb9b45`
- Rejected fixture file: `rejected-alert-system-bcbb37c.fixture.js`
- Kill switch: `__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1`

The immutable source is loaded directly with `git show`. The rejected uncommitted source is preserved only as the frozen RED fixture and is not a product shadow. Current product and test mirrors are byte-identical.

## Evidence Results

- RED: 38/38 rows; immutable invariant violations 3; rejected binding failures 22.
- GREEN: 109/109 adversarial rows.
- KILL: 22/22 rows; verdict intentionally `RED`; legacy invariant violations 4.

All three evidence files were regenerated through `M20_Q8_EVIDENCE=red|green|kill node --test --test-concurrency=1 chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs`.

## File Hashes

```json
{
  "chart v 1.4/chart/modules/alert-system.js": "a958373415867597b7efd6b31ca80cb4b04c6f7f0ae38a92b4cb53ad53bb9b45",
  "homepage/public/chart/modules/alert-system.js": "a958373415867597b7efd6b31ca80cb4b04c6f7f0ae38a92b4cb53ad53bb9b45",
  "chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs": "0c469c5def6687425506dc12ca9aa4c6420ae2df97b0df90b04d5410232590b4",
  "homepage/public/chart/modules/m20-q8-alert-checker-transaction.test.mjs": "0c469c5def6687425506dc12ca9aa4c6420ae2df97b0df90b04d5410232590b4",
  "chart v 1.4/chart/modules/m20-q1-q2-q8-idle-drains.test.mjs": "2bf060af2a0ab5c4bb57e8d778e00adf14aa3466c66105b6567029a435df6659",
  "homepage/public/chart/modules/m20-q1-q2-q8-idle-drains.test.mjs": "2bf060af2a0ab5c4bb57e8d778e00adf14aa3466c66105b6567029a435df6659",
  "chart v 1.4/chart/modules/m20-q8-transaction-packet/rejected-alert-system-bcbb37c.fixture.js": "bcbb37c2422a3385ad2d274ca597ce8a5fd8b63b8e55efb25e8cd9c5d63cfdcf",
  "chart v 1.4/chart/modules/m20-q8-transaction-packet/evidence/W4-Q8-ALERT-CHECKER-TRANSACTION-20260724-red.json": "e33b9b2069b04fb792760d6cd7076c521b06886d29d15ae4d5ec58fdcadc3efb",
  "chart v 1.4/chart/modules/m20-q8-transaction-packet/evidence/W4-Q8-ALERT-CHECKER-TRANSACTION-20260724-green.json": "979f20764added23b723fbdda7b2538f304046301aea372fc8c7010abcb68285",
  "chart v 1.4/chart/modules/m20-q8-transaction-packet/evidence/W4-Q8-ALERT-CHECKER-TRANSACTION-20260724-kill.json": "b7ea787adc18aa7cbfd7257f512ccc7285e966705bb4db61f3683ae8a00dda23"
}
```

## Source-SHA Semantics

This packet binds Q8's historical RED fixture and the physical hashes used by the Q8 tests. It deliberately does not embed the final D-034 correction commit SHA, because committing this file would change that SHA. The future checkpoint provenance manifest and uniformity proof must bind the final committed source externally after acceptance.

Residual gate: `PENDING-FRESH-GPT-REVIEW`. This report is not self-acceptance.
