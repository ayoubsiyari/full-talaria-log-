/**
 * M22 / H-S6 evidence I/O — declared docs/plan3 paths only.
 * RED-PREP-ONLY-M21-1-LOCKED
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findRepoRoot,
  hashBytesSha256,
  hashFileSha256,
} from './m22-hs6-dual-tree-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WRITE_EVIDENCE_ENV = 'M22_HS6_WRITE_EVIDENCE';

export const DECLARED_EVIDENCE_RELS = Object.freeze([
  'docs/plan3/evidence/M22-H-S6-OWNER-FETCH-RED.PRELIMINARY.json',
]);

const DECLARED_SET = new Set(DECLARED_EVIDENCE_RELS.map((r) => r.replace(/\\/g, '/')));

export function isEvidenceWriteEnabled(opts = {}) {
  if (opts.force === true) return true;
  const v = process.env[WRITE_EVIDENCE_ENV];
  return v === '1' || v === 'true' || v === 'yes';
}

export function isDeclaredEvidenceRel(rel) {
  return DECLARED_SET.has(normalizeEvidenceRel(rel));
}

export function normalizeEvidenceRelExport(rel) {
  return normalizeEvidenceRel(rel);
}

export function normalizeEvidenceRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

export function writeHs6EvidenceJson(repoRoot, relPath, data, opts = {}) {
  const rel = normalizeEvidenceRel(relPath);
  if (!isDeclaredEvidenceRel(rel)) {
    return {
      skipped: true,
      written: false,
      reason: `undeclared evidence path: ${rel}`,
      rel,
      abs: null,
    };
  }
  if (!isEvidenceWriteEnabled(opts)) {
    return {
      skipped: true,
      written: false,
      reason: `${WRITE_EVIDENCE_ENV} unset — hermetic no-write`,
      rel,
      abs: null,
    };
  }

  const abs = path.join(repoRoot, rel);
  const sourceHashes = {};
  for (const sp of opts.sourcePaths || []) {
    const sAbs = path.isAbsolute(sp) ? sp : path.join(repoRoot, sp);
    const key = path.relative(repoRoot, sAbs).replace(/\\/g, '/');
    sourceHashes[key] = fs.existsSync(sAbs) ? hashFileSha256(sAbs) : null;
  }

  const payload = {
    ...data,
    hermeticWrite: {
      env: WRITE_EVIDENCE_ENV,
      writtenAt: new Date().toISOString(),
      rel,
      sourceHashes,
      status: 'RED-PREP-ONLY-M21-1-LOCKED',
      ...(opts.meta || {}),
    },
  };
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, abs);
  return {
    skipped: false,
    written: true,
    reason: null,
    rel,
    abs,
    byteLength: Buffer.byteLength(body),
    contentSha256: hashBytesSha256(body),
    sourceHashes,
  };
}
