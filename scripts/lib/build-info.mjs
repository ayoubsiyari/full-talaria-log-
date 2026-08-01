/**
 * PASSPORT-3 reader: the source commit SHA, read over HTTP from the origin actually being measured.
 *
 * B's emitter (bump-chart-engine-build.mjs) writes chart/build-info.json at image build:
 *   { signature: 'TALARIA_BUILD_INFO_V1', buildId, sourceCommitSha, checkpointBuild, builtAt }
 * and refuses to emit at all when CHECKPOINT_BUILD=1 and the SHA is not full 40-hex.
 *
 * THE TRAP THIS EXISTS TO CATCH, and it is live on the test origin right now: /chart/build-info.json
 * returns HTTP 200 with 29,406 bytes of SPA fallback HTML. A reader that checks `res.ok` is GREEN. A
 * reader that does `await res.json()` inside a try/catch records `sourceCommitSha: null` - and B's own
 * commit message names that as worse than no passport, because it looks like an answer.
 *
 * So every failure mode below is DISTINCT and NAMED. There is no path that returns a null SHA quietly.
 */

const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;

export const BUILD_INFO_PATH = '/chart/build-info.json';

export async function readBuildInfo(origin, { timeoutMs = 15000 } = {}) {
  const url = `${String(origin).replace(/\/$/, '')}${BUILD_INFO_PATH}`;
  const fail = (state, why, extra = {}) => ({ ok: false, state, sourceCommitSha: null, buildId: null, checkpointBuild: null, why, url, ...extra });

  let res;
  let body;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    res = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: ac.signal });
    body = await res.text();
    clearTimeout(t);
  } catch (err) {
    return fail('UNREACHABLE', `Could not fetch ${url}: ${String(err && err.message).slice(0, 120)}`);
  }

  if (res.status === 404) {
    return fail('NOT_DEPLOYED', `${url} is 404. PASSPORT-3 is not in the served image: the build predates it, or the artefact did not survive the image build.`, { httpStatus: 404 });
  }
  if (!res.ok) return fail('HTTP_ERROR', `${url} returned HTTP ${res.status}.`, { httpStatus: res.status });

  // The live failure. A 200 that is not JSON is the app shell claiming the route, and it is
  // indistinguishable from success to anything that only checks the status code.
  const ct = String(res.headers.get('content-type') || '');
  if (/^\s*</.test(body) || /text\/html/i.test(ct)) {
    return fail('SPA_FALLBACK',
      `${url} returned HTTP 200 with ${ct || 'unknown content-type'} and ${body.length} bytes of HTML, not JSON. `
      + 'The route is being swallowed by the app shell, so the SHA is NOT reachable over HTTP on this origin. '
      + 'PASSPORT-3 is present in the source and unwired on the wire.',
      { httpStatus: res.status, contentType: ct, bytes: body.length });
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (err) {
    return fail('MALFORMED', `${url} returned 200 but the body is not parseable JSON: ${String(err && err.message).slice(0, 90)}`, { httpStatus: res.status });
  }

  if (json.signature !== 'TALARIA_BUILD_INFO_V1') {
    return fail('WRONG_SIGNATURE', `Expected signature TALARIA_BUILD_INFO_V1, got ${JSON.stringify(json.signature)}. The artefact shape changed and this reader has not been updated to match.`, { httpStatus: res.status });
  }

  const sha = typeof json.sourceCommitSha === 'string' ? json.sourceCommitSha.trim().toLowerCase() : null;
  if (sha == null) {
    return fail('NULL_SHA',
      `build-info.json is served and well-formed but carries sourceCommitSha: null (buildId ${json.buildId}, checkpointBuild ${json.checkpointBuild}). `
      + 'That is a non-checkpoint build. It names no source, so a soak against it cannot say which commit it measured.',
      { httpStatus: res.status, buildId: json.buildId ?? null, checkpointBuild: !!json.checkpointBuild });
  }
  if (!SOURCE_SHA_RE.test(sha)) {
    return fail('BAD_SHA', `sourceCommitSha is not full 40-character hex: ${JSON.stringify(json.sourceCommitSha)}.`, { httpStatus: res.status });
  }

  return {
    ok: true,
    state: 'OK',
    sourceCommitSha: sha,
    buildId: json.buildId ?? null,
    checkpointBuild: !!json.checkpointBuild,
    builtAt: json.builtAt ?? null,
    why: null,
    url,
    httpStatus: res.status,
  };
}

/**
 * Compare a freshly-read SHA against the one pinned at run start. Any change mid-run means the origin was
 * rebuilt underneath the measurement, and a series spanning two sources is worse than no series.
 */
export function shaChanged(pinned, now) {
  if (!pinned) return null;
  if (now.ok && now.sourceCommitSha === pinned) return null;
  return now.ok
    ? `SOURCE COMMIT CHANGED MID-RUN: pinned ${pinned.slice(0, 12)}, now serving ${now.sourceCommitSha.slice(0, 12)}. The origin was rebuilt from a different tree while the run was measuring.`
    : `SOURCE COMMIT UNREADABLE MID-RUN (${now.state}): ${now.why}`;
}
