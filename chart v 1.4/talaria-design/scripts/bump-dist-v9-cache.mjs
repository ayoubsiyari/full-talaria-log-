/**
 * Cache-bust chart module scripts in V9 HTML entrypoints.
 *
 * - `live/index.html` (source; copied into dist by Vite)
 * - `chart/dist-v9/index.html` (production output)
 * - `homepage/public/chart/dist-v9/index.html` (static deploy mirror)
 *
 * Usage (via npm run build:live):
 *   node scripts/bump-dist-v9-cache.mjs --live
 *   vite build ...
 *   node scripts/bump-dist-v9-cache.mjs --dist
 *
 * The build id is required, not derived: BUILD_ID=20260516a2 npm run build:live
 * (CI may supply GITHUB_SHA instead). Without one the script exits 2 having
 * written nothing — see resolveBuildId.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertCleanBuildInputs,
  DirtyTreeRefusal,
} from "../../../scripts/clean-build-tree-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const liveIndexPath = path.resolve(__dirname, "../live/index.html");
const distIndexPath = path.resolve(__dirname, "../../chart/dist-v9/index.html");
const homepageDistIndexPath = path.resolve(repoRoot, "homepage/public/chart/dist-v9/index.html");
/** Homepage twin of design-live; Docker overwrites from chart_assets, but local sync/bump must move stamps too. */
const homepageLiveIndexPath = path.resolve(
  repoRoot,
  "homepage/public/chart/talaria-design/live/index.html",
);
const legacyIndexPath = path.resolve(__dirname, "../../chart/legacy-index.html");
/** Fallback stub served as /chart/index.html only when dist-v9 is absent. */
const chartIndexStubPath = path.resolve(__dirname, "../../chart/index.html");

const SCRIPT_SRC_RE = /(<script\b[^>]*\ssrc=")(\/chart\/[^"?]+)(?:\?[^"#]*)?(")/g;
const LINK_HREF_RE = /(<link\b[^>]*\shref=")(\/chart\/[^"?]+)(?:\?[^"#]*)?(")/g;
/**
 * Legacy shell scripts may be relative (`modules/...`, `chart.js`) or absolute
 * (`/chart/modules/...`). Absolute paths must be stamped too — otherwise
 * CHECKPOINT layout proof sees mixed cache ids (e.g. b01 + stale b03).
 */
export const LEGACY_SCRIPT_SRC_RE =
  /(<script\b[^>]*\ssrc=")(\/chart\/[^"?]+|modules\/[^"?]+|chart\.js|settings-panel[^"?]*)(?:\?[^"#]*)?(")/g;
/**
 * Same dual-form rule for stylesheet links under checkpoint builds.
 */
export const LEGACY_LINK_HREF_RE =
  /(<link\b[^>]*\shref=")(\/chart\/(?:modules|fonts)\/[^"?]+|(?:modules|fonts)\/[^"?]+)(?:\?[^"#]*)?(")/g;
/** Multichart iframe inject() cache bust in live/index.html */
const INLINE_MULTICHART_V_RE = /var V = '[^']+';/g;
const WINDOW_BUILD_ID_RE = /window\.__TALARIA_CHART_BUILD_ID\s*=\s*'[^']+'/g;
const SW_VERSION_RE = /const SW_VERSION = "[^"]+";/;

const swPaths = [
  path.resolve(__dirname, "../live/public/sw.js"),
  path.resolve(__dirname, "../../chart/sw.js"),
  path.resolve(repoRoot, "homepage/public/chart/sw.js"),
  path.resolve(__dirname, "../../chart/dist-v9/sw.js"),
  path.resolve(repoRoot, "homepage/public/chart/dist-v9/sw.js"),
];

function readCurrentChartBuildId(html) {
  const m = html.match(/\/chart\/[^"?]+\?v=([^"'#\s]+)/);
  if (m) return m[1];
  const w = html.match(/window\.__TALARIA_CHART_BUILD_ID\s*=\s*'([^']+)'/);
  return w ? w[1] : null;
}

export class BuildIdRefusal extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "BuildIdRefusal";
    this.reason = reason;
  }
}

/**
 * The build id becomes a served cache key, so it must carry identity from
 * outside this tree. It used to fall back to incrementing the stamp committed
 * in `live/index.html`; that stamp trails what production has served, so the
 * derived id could land *behind* an id already in the field (b61→b62 against a
 * deployed b80) and cache-bust nothing while reporting success. A wrong id is
 * indistinguishable from a right one by eye and outlives the build, so the
 * absence of an explicit id is a refusal, never a guess.
 */
export function resolveBuildId(env = process.env) {
  const explicit = env.BUILD_ID?.trim();
  if (explicit) return { id: explicit, source: "BUILD_ID" };
  const sha = env.GITHUB_SHA?.trim();
  if (sha) return { id: sha.slice(0, 10), source: "GITHUB_SHA" };
  const reason =
    "BUILD_ID" in env ? "BUILD_ID_EMPTY" : "BUILD_ID_ABSENT";
  throw new BuildIdRefusal(
    reason,
    [
      "[bump-dist-v9-cache] REFUSING TO STAMP — no explicit build id. Nothing was written.",
      reason === "BUILD_ID_EMPTY"
        ? "  BUILD_ID is set but empty (docker-compose passes CHART_BUILD_ID through as BUILD_ID;"
          + " an unset CHART_BUILD_ID arrives here as an empty string)."
        : "  BUILD_ID is not set.",
      "  This script no longer derives an id from the committed stamp: that stamp trails what",
      "  production has served, so the derived id can collide with or go behind a live one.",
      "",
      "  Local build:      BUILD_ID=20260802b123 npm run build:chart-v9",
      "  Checkpoint build: CHECKPOINT_BUILD=1 CHART_BUILD_ID=<id> docker compose build",
      "  CI:               GITHUB_SHA is accepted automatically.",
    ].join("\n"),
  );
}

/**
 * Stamp legacy-index script (and optionally link) cache-bust query ids.
 * Exported for permanent regression proof of relative + absolute paths.
 */
export function stampLegacyHtml(html, buildId, { stampLinks = false } = {}) {
  let scriptMatches = 0;
  let after = String(html).replace(LEGACY_SCRIPT_SRC_RE, (...args) => {
    scriptMatches += 1;
    return `${args[1]}${args[2]}?v=${buildId}${args[3]}`;
  });
  if (scriptMatches === 0) {
    throw new Error('legacy stamp found no supported script cache tokens');
  }
  if (stampLinks) {
    let linkMatches = 0;
    after = after.replace(LEGACY_LINK_HREF_RE, (...args) => {
      linkMatches += 1;
      return `${args[1]}${args[2]}?v=${buildId}${args[3]}`;
    });
    if (linkMatches === 0) {
      throw new Error('legacy stamp found no supported link cache tokens');
    }
    const ids = uniqueCacheIds(after);
    if (ids.length !== 1 || ids[0] !== buildId) {
      throw new Error(`legacy stamp left mixed cache ids: ${ids.join(',') || '<none>'}`);
    }
  }
  return after;
}

const CHART_ENGINE_BUILD_RE = /const CHART_ENGINE_BUILD = '([^']+)';/g;

export function stampChartEngineSource(source, buildId) {
  let matches = 0;
  const after = String(source).replace(CHART_ENGINE_BUILD_RE, () => {
    matches += 1;
    return `const CHART_ENGINE_BUILD = '${buildId}';`;
  });
  if (matches !== 1) {
    throw new Error(`chart engine stamp expected 1 build token, found ${matches}`);
  }
  const remaining = [...after.matchAll(CHART_ENGINE_BUILD_RE)].map((match) => match[1]);
  if (remaining.length !== 1 || remaining[0] !== buildId) {
    throw new Error(`chart engine stamp retained stale build ids: ${remaining.join(',')}`);
  }
  return after;
}

/** Unique `?v=` / `&v=` cache ids in HTML (same extraction as layout proof). */
export function uniqueCacheIds(html) {
  const ids = [...String(html).matchAll(/[?&]v=([^"'&#\s]+)/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

function bumpChartScriptsInHtml(filePath, { required, buildId: buildIdOverride }) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      console.error("[bump-dist-v9-cache] Missing:", filePath);
      process.exit(1);
    }
    return { touched: 0, buildId: buildIdOverride || null };
  }

  if (!buildIdOverride) {
    throw new BuildIdRefusal(
      "BUILD_ID_ABSENT",
      `[bump-dist-v9-cache] internal: no build id supplied for ${filePath}`,
    );
  }
  const before = fs.readFileSync(filePath, "utf8");
  const buildId = buildIdOverride;
  let after = before.replace(SCRIPT_SRC_RE, `$1$2?v=${buildId}$3`);
  after = after.replace(LINK_HREF_RE, `$1$2?v=${buildId}$3`);
  after = after.replace(INLINE_MULTICHART_V_RE, `var V = '${buildId}';`);
  if (before.includes("window.__TALARIA_CHART_BUILD_ID")) {
    after = after.replace(WINDOW_BUILD_ID_RE, `window.__TALARIA_CHART_BUILD_ID='${buildId}'`);
  }

  if (after === before) {
    console.warn("[bump-dist-v9-cache] No /chart/ asset references matched in", filePath);
    return { touched: 0, buildId };
  }

  fs.writeFileSync(filePath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set ?v=" + buildId + " on chart assets in", filePath);
  return { touched: 1, buildId };
}

function bumpLegacyIndexHtml(filePath, buildId) {
  if (!fs.existsSync(filePath) || !buildId) return 0;
  const before = fs.readFileSync(filePath, "utf8");
  let after = stampLegacyHtml(before, buildId, { stampLinks: true });
  // DEPLOY-01: legacy now carries window.__TALARIA_CHART_BUILD_ID for PO attribution.
  if (/window\.__TALARIA_CHART_BUILD_ID\s*=/.test(after)) {
    after = after.replace(WINDOW_BUILD_ID_RE, `window.__TALARIA_CHART_BUILD_ID='${buildId}'`);
  }
  if (after === before) return 0;
  fs.writeFileSync(filePath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set ?v=" + buildId + " on legacy-index scripts in", filePath);
  return 1;
}

/**
 * Stamp the /chart/index.html fallback stub. It has no module script tags — only
 * the window build id + meta — so a missing stamp used to leave PO measurements
 * on the fallback path with no attributable build.
 */
function bumpChartIndexStub(buildId) {
  if (!fs.existsSync(chartIndexStubPath) || !buildId) return 0;
  const before = fs.readFileSync(chartIndexStubPath, "utf8");
  let after = before;
  // Do not use WINDOW_BUILD_ID_RE.test — the /g lastIndex makes a following
  // replace miss on the same regex instance.
  if (/window\.__TALARIA_CHART_BUILD_ID\s*=/.test(after)) {
    after = after.replace(WINDOW_BUILD_ID_RE, `window.__TALARIA_CHART_BUILD_ID='${buildId}'`);
  } else {
    after = after.replace(
      /<head>/i,
      `<head>\n  <script>window.__TALARIA_CHART_BUILD_ID='${buildId}';try{console.info('[Talaria] chart build',window.__TALARIA_CHART_BUILD_ID);}catch(_){}</script>`,
    );
  }
  after = after.replace(
    /(<meta\s+name="talaria-chart-build-id"\s+content=")[^"]*(")/i,
    `$1${buildId}$2`,
  );
  after = after.replace(
    /(<code id="build-id">)[^<]*(<\/code>)/i,
    `$1${buildId}$2`,
  );
  if (after === before) return 0;
  fs.writeFileSync(chartIndexStubPath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set stub __TALARIA_CHART_BUILD_ID=" + buildId + " in", chartIndexStubPath);
  return 1;
}

function bumpChartEngine(buildId) {
  const enginePaths = [
    path.resolve(__dirname, "../../chart/chart.js"),
    path.resolve(repoRoot, "homepage/public/chart/chart.js"),
  ];
  let touched = 0;
  for (const enginePath of enginePaths) {
    if (!fs.existsSync(enginePath) || !buildId) continue;
    const before = fs.readFileSync(enginePath, "utf8");
    const after = stampChartEngineSource(before, buildId);
    if (after === before) continue;
    fs.writeFileSync(enginePath, after, "utf8");
    console.log("[bump-dist-v9-cache] Set chart engine build=" + buildId + " in", enginePath);
    touched += 1;
  }
  return touched;
}

/** multichart-prod/chart-embed.html default build id + font query (iframe panels). */
function bumpChartEmbedHtml(buildId) {
  const embedPaths = [
    path.resolve(__dirname, "../../chart/multichart-prod/chart-embed.html"),
    path.resolve(repoRoot, "homepage/public/chart/multichart-prod/chart-embed.html"),
  ];
  const DEFAULT_BUILD_RE = /window\.__TALARIA_CHART_BUILD_ID = p\.get\('v'\) \|\| '[^']+'/;
  let touched = 0;
  for (const embedPath of embedPaths) {
    if (!fs.existsSync(embedPath) || !buildId) continue;
    let before = fs.readFileSync(embedPath, "utf8");
    let after = before.replace(DEFAULT_BUILD_RE, `window.__TALARIA_CHART_BUILD_ID = p.get('v') || '${buildId}'`);
    after = after.replace(/(\/chart\/fonts\/talaria-fonts\.css)\?v=[^"']+/g, `$1?v=${buildId}`);
    // Vendor libs (d3, lz-string) are hardcoded with ?v= in the embed shell
    // (they load before __TALARIA_CHART_BUILD_ID-driven injection). Bump them
    // too so every panel asset carries the current build id.
    after = after.replace(/(\/chart\/vendor\/[^"'?]+)\?v=[^"']+/g, `$1?v=${buildId}`);
    if (after === before) continue;
    fs.writeFileSync(embedPath, after, "utf8");
    console.log("[bump-dist-v9-cache] Set embed default ?v=" + buildId + " in", embedPath);
    touched += 1;
  }
  return touched;
}

/** multichart-prod/harness/serve.mjs hardcoded host-page build id. */
function bumpHarnessServeMjs(buildId) {
  const servePaths = [
    path.resolve(__dirname, "../../chart/multichart-prod/harness/serve.mjs"),
    path.resolve(repoRoot, "homepage/public/chart/multichart-prod/harness/serve.mjs"),
  ];
  const SERVE_BUILD_ID_RE = /const buildId = '[^']+'/;
  let touched = 0;
  for (const servePath of servePaths) {
    if (!fs.existsSync(servePath) || !buildId) continue;
    const before = fs.readFileSync(servePath, "utf8");
    const after = before.replace(SERVE_BUILD_ID_RE, `const buildId = '${buildId}'`);
    if (after === before) continue;
    fs.writeFileSync(servePath, after, "utf8");
    console.log("[bump-dist-v9-cache] Set harness serve.mjs buildId=" + buildId + " in", servePath);
    touched += 1;
  }
  return touched;
}

function bumpServiceWorkerVersion(buildId) {
  if (!buildId) return 0;
  let touched = 0;
  for (const swPath of swPaths) {
    if (!fs.existsSync(swPath)) continue;
    const before = fs.readFileSync(swPath, "utf8");
    const after = before.replace(SW_VERSION_RE, `const SW_VERSION = "talaria-chart-${buildId}";`);
    if (after === before) continue;
    fs.writeFileSync(swPath, after, "utf8");
    console.log("[bump-dist-v9-cache] Set SW_VERSION=" + buildId + " in", swPath);
    touched += 1;
  }
  return touched;
}

function main() {
  const mode = process.argv.includes("--dist")
    ? "dist"
    : process.argv.includes("--live")
      ? "live"
      : "both";

  // Resolve before the first write: a half-stamped tree is worse than an unstamped one.
  const { id: buildId, source: buildIdSource } = resolveBuildId();

  // CLEAN-TREE-01, same rule one step earlier: this script is the first writer
  // in the chain, so a build that would compile another lane's uncommitted
  // source has to die here rather than be detected in the artefact afterwards.
  assertCleanBuildInputs();

  console.log(`[bump-dist-v9-cache] build id ${buildId} (from ${buildIdSource})`);

  let touched = 0;

  if (mode === "live" || mode === "both") {
    const liveRes = bumpChartScriptsInHtml(liveIndexPath, {
      required: mode === "live",
      buildId,
    });
    touched += liveRes.touched;
    touched += bumpServiceWorkerVersion(buildId);
  }

  if (mode === "dist" || mode === "both") {
    const distBuildId = buildId;

    const distRes = bumpChartScriptsInHtml(distIndexPath, {
      required: mode === "dist" || mode === "both",
      buildId: distBuildId,
    });
    touched += distRes.touched;

    if (fs.existsSync(liveIndexPath)) {
      touched += bumpChartScriptsInHtml(liveIndexPath, {
        required: false,
        buildId: distBuildId,
      }).touched;
      touched += bumpChartScriptsInHtml(homepageDistIndexPath, {
        required: false,
        buildId: distBuildId,
      }).touched;
      touched += bumpChartScriptsInHtml(homepageLiveIndexPath, {
        required: false,
        buildId: distBuildId,
      }).touched;
      touched += bumpServiceWorkerVersion(distBuildId);
      touched += bumpChartEngine(distBuildId);
      touched += bumpLegacyIndexHtml(legacyIndexPath, distBuildId);
      // homepage copy of legacy if present
      touched += bumpLegacyIndexHtml(
        path.resolve(repoRoot, "homepage/public/chart/legacy-index.html"),
        distBuildId,
      );
      touched += bumpChartEmbedHtml(distBuildId);
      touched += bumpHarnessServeMjs(distBuildId);
      touched += bumpChartIndexStub(distBuildId);
    }
  }

  if (touched === 0 && (mode === "dist" || mode === "both")) {
    const checkPath = fs.existsSync(distIndexPath) ? distIndexPath : liveIndexPath;
    if (fs.existsSync(checkPath) && readCurrentChartBuildId(fs.readFileSync(checkPath, "utf8"))) {
      console.log("[bump-dist-v9-cache] No changes needed (already bumped)");
    } else {
      process.exit(1);
    }
  }

  {
    const finalId = fs.existsSync(distIndexPath)
      ? readCurrentChartBuildId(fs.readFileSync(distIndexPath, "utf8"))
      : buildId;
    if (finalId) {
      console.log("[bump-dist-v9-cache] Active build id:", finalId);
    }
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    main();
  } catch (error) {
    if (error instanceof BuildIdRefusal || error instanceof DirtyTreeRefusal) {
      // Distinct from a crash: the tree is untouched and the operator has an action.
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}
