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
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(profile.composeProject)
      || !/^https?:\/\/[^/]+\/?$/.test(profile.publicOrigin)
      || !path.isAbsolute(profile.composeFile)
      || !path.isAbsolute(profile.workingDirectory)
      || !path.isAbsolute(profile.envFile)
      || !Array.isArray(profile.services)
      || profile.services.length === 0
      || profile.services.some((service) => !/^[a-z0-9][a-z0-9_-]*$/.test(service))) {
    throw new Error('approved TEST deployment profile fields are invalid');
  }
  return profile;
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
  if (!Number.isInteger(mode) || (mode & 0o022) !== 0) {
    throw new Error('env file must not be writable by group or others');
  }
  if (metadata?.type !== 'regular') throw new Error('env file must be a regular file');
  return true;
}
