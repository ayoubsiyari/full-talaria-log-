/**
 * The sealed byte set, and the one function that turns it into a digest.
 *
 * This exists because the path list has already diverged once: the soak harness hashed four paths and
 * build-passport hashed six, so the two tools produced DIFFERENT digests for the SAME build and it read
 * like a seal break. I aligned them by hand. A third consumer (the launcher's smoke-transfer gate) would
 * reintroduce exactly that risk, so the list and the hash now live in one place and every consumer
 * imports them.
 *
 * A BADGE IS NOT A BUILD IDENTITY. The origin served `20260802b121` with source commit `a17e00e8…` at
 * 14:50 and with `c0585e68…` at 21:25 on 2026-08-01 — same buildId, two different source trees. Nothing
 * in this file gates on the badge. The badge is carried for human reading only; the gates are the
 * DIGEST (what the bytes are) and the SOURCE COMMIT SHA (which tree made them), and neither implies the
 * other.
 */
import crypto from 'node:crypto';

export const SEAL_PATHS = [
  '/chart/dist-v9/index.html',
  '/chart/dist-v9/assets/talaria-v9-live.js',
  '/chart/dist-v9/sw.js',
  '/chart/chart.js',
  '/chart/multichart-prod/multichart-manager.js',
  '/chart/modules/chart-window-limit.js',
];

/**
 * @returns {Promise<{badge: string|null, digest: string, at: string, files: object[], ok: boolean}>}
 */
export async function computeSeal(origin, { timeoutMs = 30000 } = {}) {
  const base = String(origin).replace(/\/$/, '');
  const parts = [];
  const files = [];
  let badge = null;
  let ok = true;
  for (const p of SEAL_PATHS) {
    try {
      const res = await fetch(`${base}${p}`, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      const buf = Buffer.from(await res.arrayBuffer());
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      parts.push(`${p}:${sha}`);
      files.push({ path: p, status: res.status, bytes: buf.length, sha256: sha });
      if (!badge) { const m = String(buf).match(/20\d{6}b\d+/); if (m) badge = m[0]; }
    } catch (err) {
      parts.push(`${p}:ERROR`);
      files.push({ path: p, error: String(err).slice(0, 160) });
      ok = false;
    }
  }
  return {
    ok,
    badge,
    digest: crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32),
    at: new Date().toISOString(),
    files,
  };
}
