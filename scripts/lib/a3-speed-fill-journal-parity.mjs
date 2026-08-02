/**
 * A3 — coordinate-invariance money-path helpers.
 *
 * Playback coordinates at step=TF are the integer speed rungs. The oracle requires
 * an identical session across three coordinate pairs (speeds 1, 5, 10) with
 * byte-equal transcripts for fills, journal, and money fields.
 *
 * Live runs also pin the candidate by PASSPORT-3's three identity coordinates:
 * badge, seal digest, source commit SHA. A badge alone is not identity.
 */
import crypto from 'node:crypto';
import { computeSeal } from './seal.mjs';
import { readBuildInfo } from './build-info.mjs';

export const A3_SIGNATURE = 'A3-SPEED-FILL-JOURNAL-PARITY-V1';
export const A3_PLAYBACK_COORDINATES = Object.freeze([1, 5, 10]);

/** Canary b122 candidate pin (badge · digest · source). */
export const A3_CANDIDATE_B122 = Object.freeze({
  badge: '20260802b122',
  digest: '5f0378407c214999ec822eb6a17e165e',
  sourceCommitSha: '1c69bebb496f1fb3bdf4f90317dae84d1507d427',
});

export function stableDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function roundMoney(v) {
  return Number.isFinite(Number(v)) ? Number(Number(v).toFixed(8)) : (v ?? null);
}

export function normalizeMoneyRow(r) {
  return {
    ticker: r.ticker == null ? null : String(r.ticker),
    direction: r.direction == null ? null : String(r.direction).toUpperCase(),
    status: r.status == null ? null : String(r.status).toUpperCase(),
    entryPrice: roundMoney(r.entryPrice),
    openPrice: roundMoney(r.openPrice),
    closePrice: roundMoney(r.closePrice),
    pnl: roundMoney(r.pnl),
    quantity: roundMoney(r.quantity),
    openTime: r.openTime == null ? null : Number(r.openTime),
    closeTime: r.closeTime == null ? null : Number(r.closeTime),
    closeReason: r.closeReason == null ? null : String(r.closeReason),
    takeProfit: roundMoney(r.takeProfit),
    stopLoss: roundMoney(r.stopLoss),
  };
}

/** Three independent transcripts — each must be byte-equal across coordinates. */
export function buildTranscripts(normalized) {
  const fills = (normalized?.closed || []).map(normalizeMoneyRow);
  const journal = (normalized?.journal || []).map(normalizeMoneyRow);
  const money = fills.length ? fills : journal;
  return {
    fills,
    journal,
    money,
    digests: {
      fills: stableDigest(fills),
      journal: stableDigest(journal),
      money: stableDigest(money),
    },
  };
}

export function compareCoordinateTranscripts(arms) {
  if (!Array.isArray(arms) || arms.length < 2) {
    return { ok: false, reason: 'need-at-least-two-arms', pairs: [] };
  }
  const observed = arms.every((a) => a.status === 'OBSERVED');
  if (!observed) {
    return {
      ok: false,
      reason: 'arm-not-observed',
      statuses: arms.map((a) => a.status),
      pairs: [],
    };
  }
  const anchor = arms[0].transcripts;
  const pairs = ['fills', 'journal', 'money'].map((name) => {
    const digests = arms.map((a) => a.transcripts.digests[name]);
    const equal = digests.every((d) => d === digests[0]);
    return {
      name,
      equal,
      digests,
      anchorDigest: digests[0],
    };
  });
  const ok = pairs.every((p) => p.equal);
  return {
    ok,
    reason: ok ? 'byte-equal-across-coordinates' : 'transcript-mismatch',
    pairs,
    anchorDigests: anchor.digests,
    speeds: arms.map((a) => a.speed),
  };
}

export async function readCandidateCoordinates(origin, { timeoutMs = 20000 } = {}) {
  const [seal, info] = await Promise.all([
    computeSeal(origin, { timeoutMs }),
    readBuildInfo(origin, { timeoutMs }),
  ]);
  return {
    origin: String(origin).replace(/\/$/, ''),
    badge: info.ok ? info.buildId : (seal.badge || null),
    digest: seal.digest || null,
    sourceCommitSha: info.ok ? info.sourceCommitSha : null,
    sealOk: !!seal.ok,
    buildInfoOk: !!info.ok,
    buildInfoState: info.state || null,
  };
}

export function matchCoordinatePairs(observed, expected) {
  const pairs = [
    {
      name: 'badge',
      expected: expected.badge,
      observed: observed.badge,
      equal: String(observed.badge || '') === String(expected.badge || ''),
    },
    {
      name: 'digest',
      expected: expected.digest,
      observed: observed.digest,
      equal: String(observed.digest || '') === String(expected.digest || ''),
    },
    {
      name: 'sourceCommitSha',
      expected: expected.sourceCommitSha,
      observed: observed.sourceCommitSha,
      equal: String(observed.sourceCommitSha || '') === String(expected.sourceCommitSha || ''),
    },
  ];
  return {
    ok: pairs.every((p) => p.equal),
    pairs,
  };
}

/**
 * Offline model of coordinate-invariant money path: the bar stream decides
 * fills; playback speed is a wall-clock knob and must not appear in the transcript.
 */
export function modelCoordinateInvariantSession({
  series,
  startIdx,
  hitIdx,
  direction,
  speeds = A3_PLAYBACK_COORDINATES,
} = {}) {
  const entry = Number(series[startIdx]?.c);
  const hit = series[hitIdx];
  const far = entry * 0.05;
  const tp = direction === 'BUY' ? Number(hit.h) : Number(hit.l);
  const sl = direction === 'BUY' ? entry - far : entry + far;
  const closePrice = direction === 'BUY' ? Number(hit.h) : Number(hit.l);
  const row = normalizeMoneyRow({
    ticker: 'EURUSD',
    direction,
    status: 'CLOSED',
    entryPrice: entry,
    openPrice: entry,
    closePrice,
    pnl: direction === 'BUY' ? (closePrice - entry) * 100000 : (entry - closePrice) * 100000,
    quantity: 1,
    openTime: Number(series[startIdx].t),
    closeTime: Number(hit.t),
    closeReason: 'takeProfit',
    takeProfit: tp,
    stopLoss: sl,
  });
  const arms = speeds.map((speed) => {
    // Speed is intentionally unused in the money outcome — if a caller folds it
    // into the transcript, compareCoordinateTranscripts must go red.
    void speed;
    const normalized = { closed: [row], journal: [row] };
    const transcripts = buildTranscripts(normalized);
    return {
      speed,
      status: 'OBSERVED',
      normalized,
      transcripts,
      digest: stableDigest(normalized),
    };
  });
  return {
    arms,
    comparison: compareCoordinateTranscripts(arms),
  };
}
