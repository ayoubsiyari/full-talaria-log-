#!/usr/bin/env node
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const run = (command, args, input) => {
  const result = spawnSync(command, args, { encoding: 'utf8', input });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const docker = (...args) => run('docker', args);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const SENTINEL = /^qa-test2-[a-f0-9]{24}$/;
export const validateSentinel = (value) => {
  if (!SENTINEL.test(value || '')) throw new Error('invalid TEST-2 sentinel format');
  return value;
};
const proofKey = () => {
  const key = process.env.TEST2_PROOF_HMAC_KEY || '';
  if (key.length < 32) throw new Error('TEST2_PROOF_HMAC_KEY must contain at least 32 characters');
  return key;
};
const sign = (payload) => createHmac('sha256', proofKey()).update(JSON.stringify(payload)).digest('hex');
export const sealProof = (payload) => ({ ...payload, integrity: { algorithm: 'HMAC-SHA256', value: sign(payload) } });
export function verifySeal(document) {
  const { integrity, ...payload } = document;
  if (integrity?.algorithm !== 'HMAC-SHA256' || !/^[a-f0-9]{64}$/.test(integrity.value || '')) {
    throw new Error('proof integrity metadata is missing');
  }
  const actual = Buffer.from(sign(payload), 'hex');
  const expected = Buffer.from(integrity.value, 'hex');
  if (!timingSafeEqual(actual, expected)) throw new Error('proof artifact integrity check failed');
  return payload;
}

function test1Inventory(project) {
  const ids = docker('compose', '--project-name', project, 'ps', '-aq').split(/\s+/).filter(Boolean).sort();
  const containers = ids.map((id) => JSON.parse(docker('inspect', id))[0])
    .map((item) => ({ id: item.Id, image: item.Image, mounts: item.Mounts.map((mount) => mount.Name || mount.Source).sort() }));
  const volumeNames = [...new Set(containers.flatMap((container) => container.mounts).filter(Boolean))].sort();
  const volumes = Object.fromEntries(volumeNames.map((name) => {
    const metadata = JSON.parse(docker('volume', 'inspect', name))[0];
    const content = docker('run', '--rm', '--network', 'none', '-v', `${name}:/proof:ro`, 'alpine:3.20',
      'sh', '-c', "find /proof -type f -exec sha256sum '{}' + | sort | sha256sum");
    return [name, digest(JSON.stringify({
      name: metadata.Name, driver: metadata.Driver, labels: metadata.Labels, content,
    }))];
  }));
  return { project, containers, volumes, digest: digest(JSON.stringify({ containers, volumes })) };
}

export const SENTINEL_SCAN_SQL = String.raw`
\set ON_ERROR_STOP on
SELECT set_config('talaria.proof_sentinel', :'sentinel', false);
DO $proof$
DECLARE r record; hits bigint;
BEGIN
  FOR r IN
    SELECT quote_ident(table_schema) s, quote_ident(table_name) t, quote_ident(column_name) c, data_type
    FROM information_schema.columns
    WHERE data_type IN ('text','character varying','character','json','jsonb')
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    IF r.data_type IN ('json','jsonb') THEN
      EXECUTE format('SELECT count(*) FROM %s.%s WHERE position($1 in %s::text) > 0', r.s,r.t,r.c)
        INTO hits USING current_setting('talaria.proof_sentinel');
    ELSE
      EXECUTE format('SELECT count(*) FROM %s.%s WHERE %s = $1', r.s,r.t,r.c)
        INTO hits USING current_setting('talaria.proof_sentinel');
    END IF;
    IF hits > 0 THEN RAISE EXCEPTION 'TEST-2 sentinel leaked into %.%', r.s,r.t; END IF;
  END LOOP;
END $proof$;
SELECT json_build_object(
  'sessions', count(*) FILTER (WHERE table_name ~* 'session'),
  'trades', count(*) FILTER (WHERE table_name ~* 'trade'),
  'queue_tables', count(*) FILTER (WHERE table_name ~* 'queue|job')
) AS relational_coverage
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema');`;

export function assertSentinelAbsent(project, sentinel) {
  validateSentinel(sentinel);
  const postgres = docker('compose', '--project-name', project, 'ps', '-q', 'db');
  const relationalCoverage = run('docker', ['exec', '-i', postgres, 'psql', `--set=sentinel=${sentinel}`,
    '-U', process.env.TEST1_POSTGRES_USER, '-d', process.env.TEST1_POSTGRES_DB], SENTINEL_SCAN_SQL);
  const redis = docker('compose', '--project-name', project, 'ps', '-q', 'redis');
  const scan = docker('exec', redis, 'redis-cli', '--scan', '--pattern', `*${sentinel}*`);
  if (scan) throw new Error('TEST-2 sentinel leaked into TEST-1 queue/cache');
  const keys = docker('exec', redis, 'redis-cli', '--scan', '--pattern', '*').split(/\r?\n/).filter(Boolean);
  for (const key of keys) {
    const dumped = spawnSync('docker', ['exec', redis, 'redis-cli', '--raw', 'DUMP', key]);
    if (dumped.status !== 0) throw new Error('Redis queue/value scan failed');
    if (dumped.stdout?.includes(Buffer.from(sentinel))) throw new Error('TEST-2 sentinel leaked into TEST-1 queue/cache value');
  }
  return { relationalCoverage, redisKeysAndValuesScanned: keys.length };
}

async function main() {
  const [command, path] = process.argv.slice(2);
  const project = process.env.TEST1_COMPOSE_PROJECT;
  if (!project || project === 'talaria-test2') throw new Error('distinct TEST1_COMPOSE_PROJECT is required');
  if (command === 'snapshot') {
    const proof = sealProof({ schema: 'talaria.test2-isolation-snapshot/v2',
      sentinel: validateSentinel(`qa-test2-${randomBytes(12).toString('hex')}`), inventory: test1Inventory(project) });
    await writeFile(path, JSON.stringify(proof, null, 2), { mode: 0o600 });
    console.log(proof.sentinel);
    return;
  }
  if (command === 'verify') {
    const before = verifySeal(JSON.parse(await readFile(path, 'utf8')));
    const coverage = assertSentinelAbsent(project, before.sentinel);
    const after = test1Inventory(project);
    if (after.digest !== before.inventory.digest) throw new Error('TEST-1 container/volume inventory digest changed');
    console.log(JSON.stringify({ sentinelAbsent: true, test1DigestUnchanged: true, digest: after.digest, coverage }));
    return;
  }
  throw new Error('usage: isolation-proof.mjs snapshot <proof.json> | verify <proof.json>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`TEST-2 ISOLATION FAIL: ${error.message}`); process.exitCode = 1; });
}
