#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const run = (command, args, input) => {
  const result = spawnSync(command, args, { encoding: 'utf8', input });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const docker = (...args) => run('docker', args);
const digest = (value) => createHash('sha256').update(value).digest('hex');

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

function assertSentinelAbsent(project, sentinel) {
  const postgres = docker('compose', '--project-name', project, 'ps', '-q', 'db');
  const sql = `
DO $proof$
DECLARE r record; hits bigint;
BEGIN
  FOR r IN SELECT quote_ident(table_schema) s, quote_ident(table_name) t, quote_ident(column_name) c
    FROM information_schema.columns
    WHERE data_type IN ('text','character varying','character') AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    EXECUTE format('SELECT count(*) FROM %s.%s WHERE %s = $1', r.s,r.t,r.c) INTO hits USING '${sentinel}';
    IF hits > 0 THEN RAISE EXCEPTION 'TEST-2 sentinel leaked into %.%', r.s,r.t; END IF;
  END LOOP;
END $proof$;`;
  run('docker', ['exec', '-i', postgres, 'psql', '-v', 'ON_ERROR_STOP=1', '-U',
    process.env.TEST1_POSTGRES_USER, '-d', process.env.TEST1_POSTGRES_DB], sql);
  const redis = docker('compose', '--project-name', project, 'ps', '-q', 'redis');
  const scan = docker('exec', redis, 'redis-cli', '--scan', '--pattern', `*${sentinel}*`);
  if (scan) throw new Error('TEST-2 sentinel leaked into TEST-1 queue/cache');
}

async function main() {
  const [command, path] = process.argv.slice(2);
  const project = process.env.TEST1_COMPOSE_PROJECT;
  if (!project || project === 'talaria-test2') throw new Error('distinct TEST1_COMPOSE_PROJECT is required');
  if (command === 'snapshot') {
    const proof = { schema: 'talaria.test2-isolation-snapshot/v1', sentinel: `qa-test2-${randomBytes(12).toString('hex')}`,
      inventory: test1Inventory(project) };
    await writeFile(path, JSON.stringify(proof, null, 2), { mode: 0o600 });
    console.log(proof.sentinel);
    return;
  }
  if (command === 'verify') {
    const before = JSON.parse(await readFile(path, 'utf8'));
    assertSentinelAbsent(project, before.sentinel);
    const after = test1Inventory(project);
    if (after.digest !== before.inventory.digest) throw new Error('TEST-1 container/volume inventory digest changed');
    console.log(JSON.stringify({ sentinelAbsent: true, test1DigestUnchanged: true, digest: after.digest }));
    return;
  }
  throw new Error('usage: isolation-proof.mjs snapshot <proof.json> | verify <proof.json>');
}

main().catch((error) => { console.error(`TEST-2 ISOLATION FAIL: ${error.message}`); process.exitCode = 1; });
