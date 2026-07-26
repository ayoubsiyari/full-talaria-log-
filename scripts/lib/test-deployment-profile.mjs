import fs from 'node:fs';
import path from 'node:path';

export function selectTestDeploymentProfile(document, { composeProject, publicOrigin }) {
  if (document?.schema !== 'talaria.test-deployment-profiles/v1'
      || !Array.isArray(document.profiles)) {
    throw new Error('TEST deployment profile document is invalid');
  }
  const matches = document.profiles.filter((profile) =>
    profile?.composeProject === composeProject && profile?.publicOrigin === publicOrigin);
  if (matches.length !== 1) {
    throw new Error('compose project/public origin is not explicitly approved for TEST');
  }
  const profile = matches[0];
  const contract = profile?.deploymentContract;
  const current = profile?.currentIdentity;
  const serviceIdentities = current?.services;
  const validServiceIdentity = (service) => {
    const identity = serviceIdentities?.[service];
    const expectedRepository = service === 'homepage'
      ? 'ghcr.io/ayoubsiyari/talaria-homepage'
      : 'ghcr.io/ayoubsiyari/talaria-trading-chart';
    return identity
      && identity.containerName === `${profile.composeProject}-${service}-1`
      && identity.repository === expectedRepository
      && /^sha256:[a-f0-9]{64}$/.test(identity.digest)
      && /^[a-f0-9]{64}$/.test(identity.composeConfigHash);
  };
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(profile.composeProject)
      || !/^https?:\/\/[^/]+\/?$/.test(profile.publicOrigin)
      || !path.isAbsolute(profile.composeFile)
      || !path.isAbsolute(profile.workingDirectory)
      || !/^[a-f0-9]{64}$/.test(profile.composeFileSha256)
      || !path.isAbsolute(profile.envFile)
      || !/^[A-Za-z0-9._-]+$/.test(profile.hostName)
      || !Array.isArray(profile.services)
      || profile.services.length === 0
      || profile.services.some((service) => !/^[a-z0-9][a-z0-9_-]*$/.test(service))
      || !/^\d{8}b\d+$/.test(current?.buildId)
      || !/^[a-f0-9]{40}$/.test(current?.sourceSha)
      || !path.isAbsolute(current?.composeFile || '')
      || !path.isAbsolute(current?.workingDirectory || '')
      || !/^[a-f0-9]{64}$/.test(current?.composeFileSha256)
      || profile.services.some((service) => !validServiceIdentity(service))
      || Object.keys(serviceIdentities || {}).length !== profile.services.length
      || !/^CKPT-\d+$/.test(contract?.checkpoint)
      || !/^\d{8}b\d+$/.test(contract?.buildId)
      || !/^[a-f0-9]{40}$/.test(contract?.sourceSha)
      || !/^[a-f0-9]{64}$/.test(contract?.manifestSha256)
      || !/^[a-f0-9]{64}$/.test(contract?.proofSha256)
      || !/^sha256:[a-f0-9]{64}$/.test(contract?.chartDigest)
      || !/^sha256:[a-f0-9]{64}$/.test(contract?.homepageDigest)
      || !/^\d{8}b\d+$/.test(contract?.rollbackBuildId)) {
    throw new Error('approved TEST deployment profile fields are invalid');
  }
  return profile;
}

export function validateRunningServiceIdentity(actual, expected, profile) {
  const failures = [];
  const equal = (field, wanted) => {
    if (actual?.[field] !== wanted) failures.push(field);
  };
  equal('project', profile.composeProject);
  equal('service', expected.service);
  equal('containerName', expected.containerName);
  equal('workingDirectory', profile.currentIdentity.workingDirectory);
  equal('composeFile', profile.currentIdentity.composeFile);
  equal('composeFileSha256', profile.currentIdentity.composeFileSha256);
  equal('buildId', profile.currentIdentity.buildId);
  equal('sourceSha', profile.currentIdentity.sourceSha);
  equal('strictCheckpoint', '1');
  equal('repository', expected.repository);
  equal('digest', expected.digest);
  equal('composeConfigHash', expected.composeConfigHash);
  if (actual?.state !== 'running') failures.push('state');
  if (actual?.health !== 'healthy' && actual?.health !== '') failures.push('health');
  if (failures.length) {
    throw new Error(`running service identity mismatch: ${failures.join(',')}`);
  }
  return true;
}

export function loadTestDeploymentProfile(profilePath, requested) {
  return selectTestDeploymentProfile(
    JSON.parse(fs.readFileSync(profilePath, 'utf8')),
    requested,
  );
}

export function validateEnvFileMetadata(metadata, expectedPath) {
  if (metadata?.path !== expectedPath) throw new Error('env file path is not profile-approved');
  if (metadata?.owner !== 'root' || metadata?.group !== 'root') {
    throw new Error('env file must be owned by root:root');
  }
  const mode = Number.parseInt(String(metadata?.mode || ''), 8);
  if (!Number.isInteger(mode) || (mode & 0o077) !== 0) {
    throw new Error('env file must not be accessible by group or others');
  }
  if (metadata?.type !== 'regular') throw new Error('env file must be a regular file');
  return true;
}
