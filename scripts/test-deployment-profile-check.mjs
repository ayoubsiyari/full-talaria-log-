#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  loadTestDeploymentProfile,
  validateRunningServiceIdentity,
} from './lib/test-deployment-profile.mjs';

const [profilePath, composeProject, publicOrigin, service] = process.argv.slice(2);
const profile = loadTestDeploymentProfile(profilePath, { composeProject, publicOrigin });
if (!profile.services.includes(service)) throw new Error('service is not profile-approved');
const expected = { service, ...profile.currentIdentity.services[service] };
const listed = spawnSync('docker', [
  'ps', '-aq',
  '--filter', `label=com.docker.compose.project=${composeProject}`,
  '--filter', `label=com.docker.compose.service=${service}`,
], { encoding: 'utf8' });
if (listed.status !== 0) throw new Error('could not enumerate approved service identity');
const ids = listed.stdout.trim().split(/\s+/).filter(Boolean);
if (ids.length !== 1) throw new Error(`approved TEST service is not uniquely present: ${service}`);
const inspected = spawnSync('docker', ['inspect', ids[0]], { encoding: 'utf8' });
if (inspected.status !== 0) throw new Error(`could not inspect approved service: ${service}`);
const container = JSON.parse(inspected.stdout)[0];
const labels = container?.Config?.Labels || {};
const configuredImage = String(container?.Config?.Image || '');
const separator = configuredImage.lastIndexOf('@');
const composePath = labels['com.docker.compose.project.config_files'];
const composeMetadata = fs.lstatSync(composePath);
if (!composeMetadata.isFile() || composeMetadata.isSymbolicLink()) {
  throw new Error('running compose identity is not a regular non-symlink file');
}
const actual = {
  project: labels['com.docker.compose.project'],
  service: labels['com.docker.compose.service'],
  containerName: String(container?.Name || '').replace(/^\//, ''),
  workingDirectory: labels['com.docker.compose.project.working_dir'],
  composeFile: composePath,
  composeFileSha256: crypto.createHash('sha256')
    .update(fs.readFileSync(composePath))
    .digest('hex'),
  buildId: labels['io.talaria.checkpoint.build-id'],
  sourceSha: labels['org.opencontainers.image.revision'],
  strictCheckpoint: labels['io.talaria.checkpoint.strict'],
  repository: separator > 0 ? configuredImage.slice(0, separator) : '',
  digest: separator > 0 ? configuredImage.slice(separator + 1) : '',
  composeConfigHash: labels['com.docker.compose.config-hash'],
  state: container?.State?.Status || '',
  health: container?.State?.Health?.Status || '',
};
validateRunningServiceIdentity(actual, expected, profile);
process.stdout.write(`${service}: approved immutable identity\n`);
