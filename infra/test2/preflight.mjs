#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const EXPECTED = Object.freeze({
  project: 'talaria-test2',
  port: '3001',
  network: 'talaria-test2-private',
  database: 'talaria_test2',
  role: 'talaria_test2_app',
  cookie: 'talaria_test2_qa_session',
  volumes: new Set([
    'talaria-test2-postgres', 'talaria-test2-redis', 'talaria-test2-questdb',
    'talaria-test2-chart-uploads', 'talaria-test2-chart-data', 'talaria-test2-journal-uploads',
  ]),
});

const fail = (message) => { throw new Error(`TEST-2 PREFLIGHT: ${message}`); };
const values = (object) => Object.values(object || {});
const text = (value) => JSON.stringify(value ?? '');
const hash = (data) => createHash('sha256').update(data).digest('hex');

export function auditCompose(config, policy) {
  if (config.name !== EXPECTED.project) fail(`project must be ${EXPECTED.project}`);
  const services = config.services || {};
  if (!services['postgres-test2'] || !services['redis-test2'] || !services['questdb-test2']) {
    fail('dedicated PostgreSQL, Redis, and QuestDB services are mandatory');
  }
  const environment = (service) => service?.environment || {};
  if (String(environment(services['chart-test2']).AUTH_ENABLED).toLowerCase() !== 'true') {
    fail('chart-test2 AUTH_ENABLED must be true');
  }
  if (String(environment(services['journal-test2']).AUTH_ENABLED).toLowerCase() !== 'true') {
    fail('journal-test2 AUTH_ENABLED must be true');
  }
  if (String(environment(services['worker-test2']).AUTH_ENABLED).toLowerCase() !== 'false') {
    fail('worker-test2 AUTH_ENABLED must be false');
  }
  for (const [name, service] of Object.entries(services)) {
    if (service.container_name) fail(`${name}: container_name is prohibited`);
    if (service.network_mode) fail(`${name}: network_mode is prohibited`);
    if (service.volumes_from) fail(`${name}: volumes_from is prohibited`);
    if (!service.mem_limit || !service.cpus) fail(`${name}: audited memory and CPU caps are mandatory`);
    for (const network of Object.keys(service.networks || {})) {
      if (network !== 'test2_private') fail(`${name}: foreign network ${network}`);
    }
    for (const mount of service.volumes || []) {
      const source = typeof mount === 'string' ? mount.split(':')[0] : mount.source;
      if (!source || source.startsWith('.') || source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) {
        fail(`${name}: bind/shared mount is prohibited`);
      }
    }
  }
  const networks = config.networks || {};
  if (Object.keys(networks).length !== 1 || networks.test2_private?.name !== EXPECTED.network
      || networks.test2_private?.internal !== true) fail('one internal TEST-2 network is required');
  const volumeNames = new Set(values(config.volumes).map((volume) => volume.name));
  if (volumeNames.size !== EXPECTED.volumes.size
      || [...EXPECTED.volumes].some((name) => !volumeNames.has(name))) {
    fail('volume allowlist mismatch or external volume detected');
  }
  if (values(config.volumes).some((volume) => volume.external)) fail('external volumes are prohibited');
  const rendered = text(config).toLowerCase();
  for (const forbidden of policy.test1Tokens || []) {
    if (forbidden && rendered.includes(String(forbidden).toLowerCase())) {
      fail(`TEST-1 token found in rendered profile: ${forbidden}`);
    }
  }
  if (!rendered.includes(EXPECTED.database) || !rendered.includes(EXPECTED.role)) {
    fail('dedicated database and non-superuser role are missing');
  }
  if (!rendered.includes(EXPECTED.cookie)) fail('distinct TEST-2 cookie is missing');
  if ((policy.test1Cookie && rendered.includes(policy.test1Cookie.toLowerCase()))
      || (policy.test1Origin && rendered.includes(policy.test1Origin.toLowerCase()))) {
    fail('TEST-1 cookie/origin reuse detected');
  }
  const homepagePorts = services['homepage-test2']?.ports || [];
  if (homepagePorts.length !== 1 || String(homepagePorts[0].published ?? '') !== EXPECTED.port
      || homepagePorts[0].host_ip !== '127.0.0.1') {
    fail('port 3001 must be published exactly once on 127.0.0.1');
  }
}

export async function auditSecrets({ secretsPath, test1SecretsPath, repoRoot }) {
  const absolute = resolve(secretsPath);
  if (!isAbsolute(secretsPath) || !relative(resolve(repoRoot), absolute).startsWith('..')) {
    fail('secrets file must be an absolute path outside every repository');
  }
  const metadata = await stat(absolute);
  if (process.platform !== 'win32' && (metadata.mode & 0o777) !== 0o600) {
    fail('secrets file mode must be exactly 0600');
  }
  const test2 = await readFile(absolute);
  if (test1SecretsPath) {
    const test1 = await readFile(resolve(test1SecretsPath));
    if (hash(test1) === hash(test2)) fail('TEST-1 and TEST-2 secret-file hashes match');
    const test1Values = new Set(test1.toString().split(/\r?\n/).map((line) => line.split('=').slice(1).join('=')).filter(Boolean));
    for (const value of test2.toString().split(/\r?\n/).map((line) => line.split('=').slice(1).join('=')).filter(Boolean)) {
      if (value.length >= 12 && test1Values.has(value)) fail('a TEST-2 credential matches TEST-1');
    }
  }
}

export function auditSeed(seed) {
  if (seed.qaOnly !== true || !Array.isArray(seed.accountIds) || !seed.accountIds.length
      || seed.accountIds.some((id) => !/^qa-test2-[a-z0-9-]+$/.test(id))) fail('non-QA account ID in seed');
  if (seed.sizeBytes > 15 * 1024 ** 3) fail('seed exceeds 15 GiB');
  if (!Array.isArray(seed.symbols) || new Set(seed.symbols).size < 4) fail('seed needs four symbols');
  if (!Number.isInteger(seed.overlappingOneMinuteBars) || seed.overlappingOneMinuteBars < 98901) {
    fail('seed overlap is below 98,901 one-minute bars');
  }
  for (const cell of ['mixed-2-predictive', 'mixed-4-characterization']) {
    if (seed.cells?.[cell]?.loaded !== true || seed.cells?.[cell]?.ran !== true) fail(`${cell} is not proven`);
  }
}

async function main() {
  const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
  const repoRoot = resolve(here, '../..');
  const secretsPath = process.env.TEST2_SECRETS_FILE || '';
  if (!secretsPath) fail('TEST2_SECRETS_FILE is required');
  await auditSecrets({ secretsPath, test1SecretsPath: process.env.TEST1_SECRETS_FILE, repoRoot });
  const seed = JSON.parse(await readFile(process.env.TEST2_SEED_MANIFEST || resolve(here, 'seed-manifest.json'), 'utf8'));
  auditSeed(seed);
  const postgresInit = await readFile(resolve(here, 'postgres-init.sh'), 'utf8');
  if (!/talaria_test2_app[\s\S]*NOSUPERUSER[\s\S]*NOCREATEDB[\s\S]*NOCREATEROLE/.test(postgresInit)) {
    fail('PostgreSQL application role is not explicitly non-superuser');
  }
  const result = spawnSync('docker', [
    'compose', '--project-name', EXPECTED.project, '--env-file', secretsPath,
    '-f', resolve(here, 'compose.yml'), 'config', '--format', 'json',
  ], { encoding: 'utf8' });
  if (result.status !== 0) fail(`docker compose config failed: ${result.stderr.trim()}`);
  auditCompose(JSON.parse(result.stdout), {
    test1Tokens: (process.env.TEST1_FORBIDDEN_TOKENS || 'talaria-test1,postgres-test1,redis-test1,questdb-test1').split(','),
    test1Cookie: process.env.TEST1_COOKIE_NAME,
    test1Origin: process.env.TEST1_ORIGIN,
  });
  console.log('TEST-2 PREFLIGHT PASS');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
