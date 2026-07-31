import assert from 'node:assert/strict';
import test from 'node:test';
import {
  M1_REAL_APP_SIGNATURE,
  buildMatches,
  classifyM1,
  isLoginUrl,
  parseBuildId,
} from '../m1-b118-real-app-harness.mjs';

test('M1 harness parses build ids from stamped real-app HTML', () => {
  assert.equal(M1_REAL_APP_SIGNATURE, 'TALARIA_M1_B120_REAL_APP_HARNESS_V2');
  assert.equal(parseBuildId("<script>window.__TALARIA_CHART_BUILD_ID='20260731b120'</script>"), '20260731b120');
  assert.equal(parseBuildId('{"TALARIA_CHART_BUILD_ID":"b120"}'), 'b120');
  assert.equal(parseBuildId('stamp=20260731b117'), '20260731b117');
  assert.equal(parseBuildId('no stamp here'), null);
});

test('M1 harness waits unless the real app build contains b120', () => {
  assert.equal(buildMatches('20260731b120', 'b120'), true);
  assert.equal(buildMatches('b120-hotfix', 'b120'), true);
  assert.equal(buildMatches('20260731b117', 'b120'), false);
  assert.equal(buildMatches(null, 'b120'), false);
});

test('M1 harness refuses GREEN without a b120 journal image surface', () => {
  assert.equal(isLoginUrl('http://31.97.192.82:3000/login/?next=%2Fchart'), true);
  assert.deepEqual(classifyM1({ imageCount: 1, journalLikeImages: 0, dataUrlImages: 0, fullResolutionImages: 0, thumbnailImages: 1 }, 'b118', {
    finalUrl: 'http://31.97.192.82:3000/login/?next=%2Fchart',
    loginLike: true,
  }), {
    status: 'UNPROVEN_LOGIN_PATH',
    reason: 'real-app redirected to login; auth cookie required',
  });
  assert.deepEqual(classifyM1({ imageCount: 1, journalLikeImages: 1, dataUrlImages: 1, fullResolutionImages: 0, thumbnailImages: 1 }, 'b117', { expectedBuild: 'b120' }), {
    status: 'WAITING',
    reason: 'build-not-b120',
  });
  assert.deepEqual(classifyM1({ imageCount: 0 }, 'b120', { expectedBuild: 'b120' }), {
    status: 'UNPROVEN',
    reason: 'no-product-images',
  });
  assert.deepEqual(classifyM1({ imageCount: 3, journalLikeImages: 0, dataUrlImages: 0, fullResolutionImages: 0, thumbnailImages: 3 }, 'b120', { expectedBuild: 'b120' }), {
    status: 'UNPROVEN',
    reason: 'no-journal-image-surface-detected',
  });
  assert.deepEqual(classifyM1({ imageCount: 3, journalLikeImages: 1, dataUrlImages: 1, fullResolutionImages: 1, thumbnailImages: 2 }, 'b120', { expectedBuild: 'b120' }), {
    status: 'RED',
    reason: 'full-resolution-images-still-resident',
  });
  assert.deepEqual(classifyM1({ imageCount: 3, journalLikeImages: 1, dataUrlImages: 1, fullResolutionImages: 0, thumbnailImages: 3 }, 'b120', { expectedBuild: 'b120' }), {
    status: 'GREEN_CANDIDATE',
    reason: 'thumbnail-only-image-surface-detected',
  });
});
