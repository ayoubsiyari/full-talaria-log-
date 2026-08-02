# A3 Speed Fill / Journal Parity — 2026-08-02 (CI gate on canary b122)

## Verdict
**PASSED** on candidate pinned by all three identity coordinates:
`badge 20260802b122` · `digest 5f0378407c214999ec822eb6a17e165e` · `source 1c69bebb496f1fb3bdf4f90317dae84d1507d427`.

Identical session across playback coordinates **1 / 5 / 10** produced three byte-equal transcript pairs (fills, journal, money). Digest per transcript: `357f693c501c3ab6921b1c1c520ada27b26a92960009cf7967026fd200fad7ac`.

Prior local `20260728b85` one-off and the two-speed canary smoke are **superseded**. This file is the sealed evidence for the CI-permanent money-path gate.

## Surface (three coordinate pairs)
| coordinate | expected = observed |
|---|---|
| badge | `20260802b122` |
| seal digest | `5f0378407c214999ec822eb6a17e165e` |
| sourceCommitSha | `1c69bebb496f1fb3bdf4f90317dae84d1507d427` |

- Origin: `http://31.97.192.82:3000` (canary, not Cloudflare prod)
- Shell: `/chart/dist-v9/index.html?mode=backtest`
- Runner: `scripts/a3-speed-fill-journal-parity-canary.mjs`
- CI gate: `npm run test:a3-speed-fill-journal-parity`
- Evidence JSON: `docs/plan3/evidence/a3-speed-fill-journal-parity-b122.json`

## Scenario (pinned across all three arms)
- fileId `677` / symbol `EURUSD` / TF `1m`
- startIdx `1400` / startT `1781856060000`
- hitIdx `1403` / direction `BUY`
- takeProfit `1.14546` / stopLoss `1.087769`

## Result
| Arm | Status | Closed | Journal | fills/journal/money digest |
|---|---|---:|---:|---|
| 1 | OBSERVED | 1 | 1 | `357f693c…fad7ac` |
| 5 | OBSERVED | 1 | 1 | `357f693c…fad7ac` |
| 10 | OBSERVED | 1 | 1 | `357f693c…fad7ac` |

Matched money-path fields (all arms):
- `ticker`: `EURUSD`
- `direction`: `BUY`
- `entryPrice`: `1.14502`
- `closePrice`: `1.14744`
- `pnl`: `242`
- `quantity`: `1`
- `openTime`: `1781856060000`
- `closeTime`: `1781892720000`
- `takeProfit`: `1.14546`
- `stopLoss`: `1.087769`

## Companion gate
- **A2** (`npm run test:a2-resolvebar-transcript`): resolveBar from raw/retained series + bar-close transcript census — also CI-permanent at money-path tier.
