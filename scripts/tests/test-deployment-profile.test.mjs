import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  selectTestDeploymentProfile,
  validateEnvFileMetadata,
  validateRunningServiceIdentity,
} from '../lib/test-deployment-profile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profiles = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts/test-deployment-profiles.json'),
  'utf8',
));
const request = {
  composeProject: 'talaria',
  publicOrigin: 'http://31.97.192.82:3000',
};

test('only the configured existing talaria TEST stack is approved', () => {
  const profile = selectTestDeploymentProfile(profiles, request);
  assert.equal(profile.composeProject, 'talaria');
  assert.equal(profile.workingDirectory,
    '/var/lib/talaria/checkpoints/rollback-20260726b73/source');
  assert.equal(profile.currentIdentity.workingDirectory,
    '/var/lib/talaria/checkpoints/rollback-20260725b70/source');
  assert.equal(profile.envFile, '/opt/talaria/.env');
  assert.equal(profile.hostName, 'srv904606');
  assert.equal(profile.deploymentContract.manifestSha256,
    'cc9bc55cc986142b4426b20c690c447c1ea620ab5e0e33ea3eb38f67258cc8b0');
  assert.deepEqual(profile.services, ['trading-chart', 'trading-chart-worker', 'homepage']);
  for (const composeProject of ['talaria-test', 'production', 'arbitrary-test']) {
    assert.throws(
      () => selectTestDeploymentProfile(profiles, { ...request, composeProject }),
      /not explicitly approved/,
    );
  }
});

test('accepted B70 identity is immutable and alternate stacks fail closed', () => {
  const profile = selectTestDeploymentProfile(profiles, request);
  const expected = {
    service: 'trading-chart',
    ...profile.currentIdentity.services['trading-chart'],
  };
  const actual = {
    project: 'talaria',
    service: 'trading-chart',
    containerName: 'talaria-trading-chart-1',
    workingDirectory: '/var/lib/talaria/checkpoints/rollback-20260725b70/source',
    composeFile: '/var/lib/talaria/checkpoints/rollback-20260725b70/source/docker-compose.yml',
    composeFileSha256: 'c3191f9eae8e088a385b12c249ad8034abacabcf29779cb7b8c374fbcff92a77',
    buildId: '20260725b70',
    sourceSha: '6cb10495e6d5d329af3691cc13f6623812adbe31',
    strictCheckpoint: '1',
    repository: 'ghcr.io/ayoubsiyari/talaria-trading-chart',
    digest: 'sha256:5127e3e82f63927f3d8ba988bb668da660f56c293605ec5314e16fbdae323aef',
    composeConfigHash: '88fe584e6e784c8708c30864ce867fc3d7cf144a84e9c08e6e271fb766859f4c',
    state: 'running',
    health: 'healthy',
  };
  assert.equal(validateRunningServiceIdentity(actual, expected, profile), true);
  for (const change of [
    { containerName: 'talaria-trading-chrat-1' },
    { repository: 'ghcr.io/other/talaria-trading-chart' },
    { digest: `sha256:${'0'.repeat(64)}` },
    { service: 'trading-chart-worker' },
    { project: 'talaria-test' },
  ]) {
    assert.throws(
      () => validateRunningServiceIdentity({ ...actual, ...change }, expected, profile),
      /running service identity mismatch/,
    );
  }
});

test('env file metadata is root-owned, fixed-path, and non-writable outside owner', () => {
  const secure = {
    path: '/opt/talaria/.env',
    owner: 'root',
    group: 'root',
    mode: '600',
    type: 'regular',
  };
  assert.equal(validateEnvFileMetadata(secure, '/opt/talaria/.env'), true);
  for (const change of [
    { path: '/tmp/.env' },
    { owner: 'ubuntu' },
    { group: 'users' },
    { mode: '644' },
    { mode: '664' },
    { mode: '646' },
    { type: 'symlink' },
  ]) {
    assert.throws(() => validateEnvFileMetadata({ ...secure, ...change }, '/opt/talaria/.env'));
  }
});

test('deployment wrapper parses env-file without exposing secret values', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/deploy-test-checkpoint.sh'), 'utf8');
  assert.match(source, /--env-file=\*\) ENV_FILE=/);
  assert.match(source, /COMPOSE_ENV_FILES="\$ENV_FILE"/);
  assert.match(source, /COMPOSE_PROJECT_DIRECTORY="\$PROFILE_WORKING_DIRECTORY"/);
  assert.match(source, /test-deployment-profile-check\.mjs/);
  assert.match(source, /approved target compose file hash mismatch/);
  assert.match(source, /MANIFEST_SHA256.*PROFILE_FIELDS\[8\]/s);
  assert.match(source, /--env-file='\$ENV_FILE'/);
  assert.match(source, /no files, images, or containers changed/);
  assert.doesNotMatch(source, /(?:cat|printf|echo).*\$ENV_FILE/);
  assert.doesNotMatch(source, /POSTGRES_PASSWORD|SECRET_KEY|JWT_SECRET/);
});
