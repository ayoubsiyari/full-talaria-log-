import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FORWARDING_MIRROR_CONTRACTS } from './homepage-forwarding-contracts.mjs';

export const MANIFEST_SCHEMA = 'talaria.checkpoint-provenance/v1';
export const UNIFORMITY_SIGNATURE = 'TALARIA_CHECKPOINT_UNIFORMITY_V2';
export const BUILD_ID_RE = /^\d{8}b\d+$/;
export const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;
export const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

const MIRROR_DIRECTORIES = [
  ['dist-v9', 'dist-v9'],
  ['modules', 'modules'],
  ['workers', 'workers'],
  ['vendor', 'vendor'],
  ['fonts', 'fonts'],
  ['multichart-prod', 'multichart-prod'],
];

const MIRROR_FILES = [
  ['chart.js', 'chart.js'],
  ['legacy-index.html', 'legacy-index.html'],
  ['sw.js', 'sw.js'],
];

function string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

export function incrementBuildId(value) {
  const match = /^(\d{8})b(\d+)$/.exec(string(value));
  if (!match) throw new Error(`Cannot increment invalid build id: ${value || '<empty>'}`);
  return `${match[1]}b${Number(match[2]) + 1}`;
}

export function simulateLegacyTripleIncrement(startBuildId, engineBuildId, serviceWorkerBuildId) {
  const pass1 = incrementBuildId(startBuildId);
  const pass2 = incrementBuildId(pass1);
  const pass3 = incrementBuildId(pass2);
  return {
    explicitBuildId: '',
    sourceShellBuildId: startBuildId,
    passes: [pass1, pass2, pass3],
    shellBuildId: pass3,
    moduleQueryBuildId: pass3,
    embedBuildId: pass3,
    engineBuildId,
    serviceWorkerBuildId,
  };
}

export function parseImmutableImageRef(value) {
  const ref = string(value);
  const match = /^(.*)@(sha256:[a-f0-9]{64})$/.exec(ref);
  if (!match) {
    return { ok: false, error: 'must be an image reference pinned with @sha256:<64 hex>' };
  }
  const repository = match[1];
  const digest = match[2];
  const finalComponent = repository.slice(repository.lastIndexOf('/') + 1);
  if (!repository.includes('/') || !finalComponent || finalComponent.includes(':')) {
    return {
      ok: false,
      error: 'must be digest-only; mutable image tags (including latest and SHA tags) are rejected',
    };
  }
  if (!/^[A-Za-z0-9._:/-]+$/.test(repository)) {
    return { ok: false, error: 'contains unsupported image-reference characters' };
  }
  return { ok: true, ref, repository, digest };
}

function validateImageEntry(errors, entry, label) {
  const parsed = parseImmutableImageRef(entry?.ref);
  push(errors, parsed.ok, `${label}.ref ${parsed.error || 'is invalid'}`);
  push(errors, DIGEST_RE.test(string(entry?.digest)), `${label}.digest is missing or invalid`);
  if (parsed.ok && DIGEST_RE.test(string(entry?.digest))) {
    push(errors, parsed.digest === string(entry.digest), `${label}.digest differs from its ref`);
  }
}

function validateRollback(errors, rollback) {
  push(errors, BUILD_ID_RE.test(string(rollback?.buildId)), 'rollback.buildId is missing or invalid');
  push(
    errors,
    SOURCE_SHA_RE.test(string(rollback?.sourceSha)),
    'rollback.sourceSha must be a full 40-character SHA',
  );
  validateImageEntry(errors, rollback?.images?.chart, 'rollback.images.chart');
  validateImageEntry(errors, rollback?.images?.homepage, 'rollback.images.homepage');
}

export function validateManifest(manifest) {
  const errors = [];
  push(errors, manifest?.schema === MANIFEST_SCHEMA, `schema must equal ${MANIFEST_SCHEMA}`);
  push(errors, /^CKPT-\d+$/.test(string(manifest?.checkpoint)), 'checkpoint must match CKPT-N');
  push(errors, BUILD_ID_RE.test(string(manifest?.buildId)), 'buildId must match YYYYMMDDbN');
  push(
    errors,
    SOURCE_SHA_RE.test(string(manifest?.source?.sha)),
    'source.sha must be a full 40-character SHA',
  );
  push(
    errors,
    /^[A-Za-z0-9._-]+$/.test(string(manifest?.source?.remote)),
    'source.remote is missing or invalid',
  );
  push(
    errors,
    /^refs\/tags\/[A-Za-z0-9._/-]+$/.test(string(manifest?.source?.ref)),
    'source.ref must be an explicit refs/tags/... checkpoint ref',
  );
  push(
    errors,
    Number.isFinite(Date.parse(string(manifest?.createdAt))),
    'createdAt must be an ISO-8601 timestamp',
  );

  validateImageEntry(errors, manifest?.images?.chart, 'images.chart');
  validateImageEntry(errors, manifest?.images?.homepage, 'images.homepage');

  const proofPath = string(manifest?.proof?.uniformityReport);
  push(
    errors,
    proofPath.length > 0 && !path.isAbsolute(proofPath) && !proofPath.split(/[\\/]/).includes('..'),
    'proof.uniformityReport must be a safe relative path',
  );
  push(
    errors,
    /^[a-f0-9]{64}$/.test(string(manifest?.proof?.sha256)),
    'proof.sha256 must be a 64-character SHA-256',
  );

  validateRollback(errors, manifest?.rollback);

  return {
    ok: errors.length === 0,
    errors,
    manifest,
  };
}

export function loadManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid checkpoint manifest:\n- ${validation.errors.join('\n- ')}`);
  }
  return { manifest, manifestPath: absolutePath };
}

export function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function validateForwardingMirrorRecord(record, failures, repoRoot = null) {
  const contract = FORWARDING_MIRROR_CONTRACTS[record?.path];
  if (!contract) {
    failures.push(`unapproved forwarding mirror path: ${record?.path || '<missing>'}`);
    return;
  }
  const expected = {
    contractId: contract.contractId,
    importTarget: contract.importTarget,
    canonicalHash: record?.canonicalHash,
    wrapperHash: sha256Buffer(contract.wrapper),
    effectiveCanonicalTargetHash: record?.canonicalHash,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record?.[field] !== value || (field.endsWith('Hash') && !/^[a-f0-9]{64}$/.test(value || ''))) {
      failures.push(`forwarding mirror ${record.path}.${field} is invalid`);
    }
  }
  if (repoRoot) {
    const canonicalFile = path.join(repoRoot, 'chart v 1.4/chart', record.path);
    const wrapperFile = path.join(repoRoot, 'homepage/public/chart', record.path);
    const effectiveTarget = path.resolve(path.dirname(wrapperFile), contract.importTarget);
    if (!fs.existsSync(canonicalFile) || sha256File(canonicalFile) !== record.canonicalHash) {
      failures.push(`forwarding mirror ${record.path} canonical hash is stale`);
    }
    if (!fs.existsSync(wrapperFile) || sha256File(wrapperFile) !== record.wrapperHash) {
      failures.push(`forwarding mirror ${record.path} wrapper hash is stale`);
    }
    if (effectiveTarget !== path.resolve(canonicalFile)
        || !fs.existsSync(effectiveTarget)
        || sha256File(effectiveTarget) !== record.effectiveCanonicalTargetHash) {
      failures.push(`forwarding mirror ${record.path} effective canonical target is invalid`);
    }
  }
}

export function verifyUniformityProof(manifest, manifestPath, { repoRoot = null } = {}) {
  const failures = [];
  const proofPath = path.resolve(path.dirname(manifestPath), manifest.proof.uniformityReport);
  if (!fs.existsSync(proofPath)) {
    return { ok: false, failures: [`uniformity proof is missing: ${proofPath}`], proofPath };
  }
  const actualHash = sha256File(proofPath);
  if (actualHash !== manifest.proof.sha256) {
    failures.push(`uniformity proof hash mismatch: expected ${manifest.proof.sha256}, got ${actualHash}`);
  }
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  } catch (error) {
    failures.push(`uniformity proof is not valid JSON: ${error.message}`);
  }
  if (report) {
    if (report.signature !== UNIFORMITY_SIGNATURE) {
      failures.push(`uniformity proof signature is ${report.signature || '<missing>'}`);
    }
    if (report.ok !== true) failures.push('uniformity proof is not green');
    if (report.expectedBuildId !== manifest.buildId) {
      failures.push('uniformity proof build id differs from manifest');
    }
    if (report.sourceSha !== manifest.source.sha) {
      failures.push('uniformity proof source SHA differs from manifest');
    }
    if (!Array.isArray(report.forwardingMirrors)) {
      failures.push('uniformity proof forwardingMirrors is missing');
    } else {
      const seen = new Set();
      for (const record of report.forwardingMirrors) {
        if (seen.has(record?.path)) failures.push(`duplicate forwarding mirror: ${record?.path}`);
        seen.add(record?.path);
        validateForwardingMirrorRecord(record, failures, repoRoot);
      }
    }
  }
  return { ok: failures.length === 0, failures, proofPath, actualHash, report };
}

export function verifyRepositoryEvidence(manifest, evidence) {
  const failures = [];
  if (evidence.dirty) failures.push('worktree is dirty');
  if (evidence.headSha !== manifest.source.sha) {
    failures.push(`HEAD ${evidence.headSha || '<missing>'} differs from ${manifest.source.sha}`);
  }
  if (evidence.remoteSha !== manifest.source.sha) {
    failures.push(
      `remote ref ${manifest.source.remote}/${manifest.source.ref} resolves to `
      + `${evidence.remoteSha || '<missing>'}, not ${manifest.source.sha}`,
    );
  }
  return { ok: failures.length === 0, failures };
}

export function resolveAdvertisedTagCommit(output, remoteRef) {
  const refs = new Map();
  for (const line of String(output || '').split(/\r?\n/).filter(Boolean)) {
    const [sha, ref, ...extra] = line.trim().split(/\s+/);
    if (extra.length || !SOURCE_SHA_RE.test(sha || '')) {
      throw new Error('remote tag advertisement contains an invalid object id or line');
    }
    if (ref !== remoteRef && ref !== `${remoteRef}^{}`) {
      throw new Error(`remote tag advertisement contains unexpected ref ${ref || '<missing>'}`);
    }
    if (refs.has(ref)) throw new Error(`remote tag advertisement is ambiguous for ${ref}`);
    refs.set(ref, sha);
  }
  const tagObjectSha = refs.get(remoteRef);
  if (!tagObjectSha) throw new Error(`remote tag is missing: ${remoteRef}`);
  const peeledSha = refs.get(`${remoteRef}^{}`) || null;
  if (peeledSha === tagObjectSha) {
    throw new Error('remote tag object and peeled target unexpectedly match');
  }
  return {
    tagObjectSha,
    commitSha: peeledSha || tagObjectSha,
    annotated: peeledSha !== null,
  };
}

export function createDeployPlan(manifest, { rollback = false } = {}) {
  const source = rollback
    ? {
        buildId: manifest.rollback.buildId,
        sourceSha: manifest.rollback.sourceSha,
        chart: manifest.rollback.images.chart,
        homepage: manifest.rollback.images.homepage,
      }
    : {
        buildId: manifest.buildId,
        sourceSha: manifest.source.sha,
        chart: manifest.images.chart,
        homepage: manifest.images.homepage,
      };
  const environment = {
    TRADING_CHART_IMAGE: source.chart.ref,
    HOMEPAGE_IMAGE: source.homepage.ref,
  };
  const envPrefix = `TRADING_CHART_IMAGE=${environment.TRADING_CHART_IMAGE} `
    + `HOMEPAGE_IMAGE=${environment.HOMEPAGE_IMAGE}`;
  return {
    mode: rollback ? 'rollback' : 'deploy',
    checkpoint: manifest.checkpoint,
    buildId: source.buildId,
    sourceSha: source.sourceSha,
    environment,
    imageDigests: {
      chart: source.chart.digest,
      homepage: source.homepage.digest,
    },
    pullServices: ['trading-chart', 'trading-chart-worker', 'homepage'],
    upServices: ['trading-chart', 'trading-chart-worker', 'homepage'],
    commands: [
      `${envPrefix} docker compose pull trading-chart trading-chart-worker homepage`,
      `${envPrefix} docker compose up -d --no-build --no-deps `
        + 'trading-chart trading-chart-worker homepage',
    ],
    buildAllowed: false,
  };
}

function readText(filePath, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${filePath}: missing`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function record(checks, failures, name, actual, expected) {
  const ok = actual === expected;
  checks.push({ name, actual, expected, ok });
  if (!ok) failures.push(`${name}: expected ${expected}, got ${actual || '<missing>'}`);
}

function matchOne(checks, failures, filePath, name, regex, expected) {
  const content = readText(filePath, failures);
  const match = content.match(regex);
  record(checks, failures, name, match?.[1] || null, expected);
}

function matchAllCacheIds(checks, failures, filePath, name, expected) {
  const content = readText(filePath, failures);
  const ids = [...content.matchAll(/[?&]v=([^"'&#\s]+)/g)].map((match) => match[1]);
  const unique = [...new Set(ids)];
  const actual = unique.length === 1 ? unique[0] : unique.join(',');
  record(checks, failures, name, actual || null, expected);
  if (ids.length === 0) failures.push(`${name}: no cache-bust ids found`);
}

function listFiles(root, relative = '') {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'test-results', 'screenshots', '.playwright'].includes(entry.name)) {
        continue;
      }
      files.push(...listFiles(root, next));
      continue;
    }
    if (/\.(jsonl|log|txt)$/.test(entry.name)) continue;
    files.push(next.replaceAll('\\', '/'));
  }
  return files.sort();
}

function forwardingMirrorRecord(relativePath, canonicalFile, homepageFile) {
  const contract = FORWARDING_MIRROR_CONTRACTS[`modules/${relativePath}`];
  if (!contract || !fs.existsSync(canonicalFile) || !fs.existsSync(homepageFile)) return null;
  if (fs.readFileSync(homepageFile, 'utf8') !== contract.wrapper) return null;
  const canonicalHash = sha256File(canonicalFile);
  return {
    path: `modules/${relativePath}`,
    contractId: contract.contractId,
    importTarget: contract.importTarget,
    canonicalHash,
    wrapperHash: sha256File(homepageFile),
    effectiveCanonicalTargetHash: canonicalHash,
  };
}

function compareMirrorTree(
  checks,
  failures,
  forwardingMirrors,
  canonicalRoot,
  homepageRoot,
  name,
  expected,
) {
  const canonicalFiles = listFiles(canonicalRoot);
  const homepageFiles = listFiles(homepageRoot);
  const allFiles = [...new Set([...canonicalFiles, ...homepageFiles])].sort();
  const mismatches = [];
  for (const relativeFile of allFiles) {
    const canonicalFile = path.join(canonicalRoot, relativeFile);
    const homepageFile = path.join(homepageRoot, relativeFile);
    if (!fs.existsSync(canonicalFile) || !fs.existsSync(homepageFile)) {
      mismatches.push(
        `${relativeFile}: missing ${fs.existsSync(canonicalFile) ? 'homepage' : 'canonical'}`,
      );
      continue;
    }
    if (sha256File(canonicalFile) !== sha256File(homepageFile)) {
      const forwardingMirror = name === 'modules'
        ? forwardingMirrorRecord(relativeFile, canonicalFile, homepageFile)
        : null;
      if (forwardingMirror) {
        forwardingMirrors.push(forwardingMirror);
        checks.push({
          name: `I8 modules/${relativeFile} forwarding-contract`,
          mode: 'contract-bound-forwarding-mirror',
          contractId: forwardingMirror.contractId,
          canonicalHash: forwardingMirror.canonicalHash,
          wrapperHash: forwardingMirror.wrapperHash,
          ok: true,
        });
      } else {
        mismatches.push(`${relativeFile}: hash mismatch`);
      }
    }
  }
  record(
    checks,
    failures,
    `I8 ${name} (${allFiles.length} files)`,
    mismatches.length === 0 ? expected : mismatches.join('; '),
    expected,
  );
}

export function verifyTreeLayout({
  chartRoot,
  liveRoot,
  homepageChartRoot,
  expectedBuildId,
  sourceSha,
  requireLive = true,
}) {
  const checks = [];
  const failures = [];
  const forwardingMirrors = [];
  const shellFiles = [
    [path.join(chartRoot, 'dist-v9/index.html'), 'canonical dist'],
    [path.join(homepageChartRoot, 'dist-v9/index.html'), 'homepage dist'],
  ];
  if (requireLive) shellFiles.push([path.join(liveRoot, 'index.html'), 'live source']);
  for (const [filePath, label] of shellFiles) {
    matchOne(
      checks,
      failures,
      filePath,
      `${label} window build`,
      /window\.__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
      expectedBuildId,
    );
    matchOne(
      checks,
      failures,
      filePath,
      `${label} drawing module query`,
      /\/chart\/modules\/drawing-tools-manager\.js\?v=([^"'&\s]+)/,
      expectedBuildId,
    );
    matchAllCacheIds(checks, failures, filePath, `${label} cache ids`, expectedBuildId);
  }

  // Fallback stub for /chart/index.html when dist-v9 is absent. No module tags —
  // only the window build id must match, or a PO session on the fallback path
  // cannot be named (DEPLOY-01). Required when the stub is present in the tree;
  // harness fixtures that omit it are skipped (not a silent pass on a real tree).
  const chartIndexStub = path.join(chartRoot, 'index.html');
  if (fs.existsSync(chartIndexStub)) {
    matchOne(
      checks,
      failures,
      chartIndexStub,
      'chart index stub window build',
      /window\.__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
      expectedBuildId,
    );
  }

  for (const [filePath, label] of [
    [path.join(chartRoot, 'chart.js'), 'canonical engine'],
    [path.join(homepageChartRoot, 'chart.js'), 'homepage engine'],
  ]) {
    matchOne(
      checks,
      failures,
      filePath,
      label,
      /const CHART_ENGINE_BUILD = '([^']+)'/,
      expectedBuildId,
    );
  }

  for (const [filePath, label] of [
    [path.join(chartRoot, 'multichart-prod/chart-embed.html'), 'canonical embed'],
    [path.join(homepageChartRoot, 'multichart-prod/chart-embed.html'), 'homepage embed'],
  ]) {
    matchOne(
      checks,
      failures,
      filePath,
      `${label} default`,
      /window\.__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/,
      expectedBuildId,
    );
    matchAllCacheIds(checks, failures, filePath, `${label} cache ids`, expectedBuildId);
  }

  for (const [filePath, label] of [
    [path.join(chartRoot, 'multichart-prod/harness/serve.mjs'), 'canonical harness'],
    [path.join(homepageChartRoot, 'multichart-prod/harness/serve.mjs'), 'homepage harness'],
  ]) {
    matchOne(checks, failures, filePath, label, /const buildId = '([^']+)'/, expectedBuildId);
  }

  for (const [filePath, label] of [
    [path.join(chartRoot, 'sw.js'), 'canonical SW'],
    [path.join(chartRoot, 'dist-v9/sw.js'), 'canonical dist SW'],
    [path.join(homepageChartRoot, 'sw.js'), 'homepage SW'],
    [path.join(homepageChartRoot, 'dist-v9/sw.js'), 'homepage dist SW'],
  ]) {
    matchOne(
      checks,
      failures,
      filePath,
      label,
      /const SW_VERSION = "talaria-chart-([^"]+)"/,
      expectedBuildId,
    );
  }
  if (requireLive) {
    matchOne(
      checks,
      failures,
      path.join(liveRoot, 'public/sw.js'),
      'live SW',
      /const SW_VERSION = "talaria-chart-([^"]+)"/,
      expectedBuildId,
    );
  }

  for (const [filePath, label] of [
    [path.join(chartRoot, 'legacy-index.html'), 'canonical legacy cache ids'],
    [path.join(homepageChartRoot, 'legacy-index.html'), 'homepage legacy cache ids'],
  ]) {
    matchAllCacheIds(checks, failures, filePath, label, expectedBuildId);
  }

  for (const [canonicalName, homepageName] of MIRROR_DIRECTORIES) {
    compareMirrorTree(
      checks,
      failures,
      forwardingMirrors,
      path.join(chartRoot, canonicalName),
      path.join(homepageChartRoot, homepageName),
      canonicalName,
      expectedBuildId,
    );
  }
  for (const [canonicalName, homepageName] of MIRROR_FILES) {
    const canonicalFile = path.join(chartRoot, canonicalName);
    const homepageFile = path.join(homepageChartRoot, homepageName);
    const equal = fs.existsSync(canonicalFile)
      && fs.existsSync(homepageFile)
      && sha256File(canonicalFile) === sha256File(homepageFile);
    record(
      checks,
      failures,
      `I8 ${canonicalName}`,
      equal ? expectedBuildId : 'hash mismatch',
      expectedBuildId,
    );
  }

  return {
    signature: UNIFORMITY_SIGNATURE,
    expectedBuildId,
    sourceSha,
    forwardingMirrors,
    ok: failures.length === 0,
    checks,
    failures,
  };
}

function verifyRuntimeSurface(failures, surface, expectedBuildId, label) {
  if (!surface) {
    failures.push(`${label} runtime surface is missing`);
    return;
  }
  for (const field of [
    'shellBuildId',
    'moduleQueryBuildId',
    'embedBuildId',
    'engineBuildId',
    'serviceWorkerBuildId',
    'legacyBuildId',
    'harnessBuildId',
  ]) {
    if (surface[field] !== expectedBuildId) {
      failures.push(
        `${label}.${field}: expected ${expectedBuildId}, got ${surface[field] || '<missing>'}`,
      );
    }
  }
  if (surface.browserHostBuildId !== expectedBuildId) {
    failures.push(`${label}.browserHostBuildId does not match ${expectedBuildId}`);
  }
  if (!Array.isArray(surface.browserFrameBuildIds) || surface.browserFrameBuildIds.length === 0) {
    failures.push(`${label} has no chart iframe runtime ids`);
  } else {
    for (const [index, id] of surface.browserFrameBuildIds.entries()) {
      if (id !== expectedBuildId) {
        failures.push(`${label}.browserFrameBuildIds[${index}] is ${id || '<missing>'}`);
      }
    }
  }
}

export function verifyRuntimeSnapshot(snapshot, manifest) {
  const failures = [];
  verifyRuntimeSurface(failures, snapshot?.direct, manifest.buildId, 'direct');
  verifyRuntimeSurface(failures, snapshot?.public, manifest.buildId, 'public');
  const hashFields = ['shell', 'embed', 'engine', 'module', 'serviceWorker', 'legacy', 'harness'];
  for (const field of hashFields) {
    const directHash = snapshot?.direct?.hashes?.[field];
    const publicHash = snapshot?.public?.hashes?.[field];
    if (!directHash || directHash !== publicHash) {
      failures.push(
        `direct/public ${field} hash mismatch: ${directHash || '<missing>'} vs `
        + `${publicHash || '<missing>'}`,
      );
    }
  }
  return {
    signature: 'TALARIA_CHECKPOINT_RUNTIME_V1',
    checkpoint: manifest.checkpoint,
    buildId: manifest.buildId,
    sourceSha: manifest.source.sha,
    ok: failures.length === 0,
    failures,
    snapshot,
  };
}
