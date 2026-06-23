/**
 * Cache-bust chart module scripts in V9 HTML entrypoints.
 *
 * - `live/index.html` (source; copied into dist by Vite)
 * - `chart/dist-v9/index.html` (production output)
 * - `chart/legacy-index.html` (standalone monolith chart — not multichart iframes)
 *
 * Usage (via npm run build:live):
 *   node scripts/bump-dist-v9-cache.mjs --live
 *   vite build ...
 *   node scripts/bump-dist-v9-cache.mjs --dist
 *
 * Override build id: BUILD_ID=20260516a2 npm run build:live
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const liveIndexPath = path.resolve(__dirname, "../live/index.html");
const distIndexPath = path.resolve(__dirname, "../../chart/dist-v9/index.html");
const legacyIndexPath = path.resolve(__dirname, "../../chart/legacy-index.html");

const SCRIPT_SRC_RE = /(<script\b[^>]*\ssrc=")(\/chart\/[^"?]+)(?:\?[^"#]*)?(")/g;
const LINK_HREF_RE = /(<link\b[^>]*\shref=")(\/chart\/[^"?]+)(?:\?[^"#]*)?(")/g;
/** Relative chart assets in legacy-index.html (modules/*.js, chart.js, settings-panel*.js). */
const LEGACY_SCRIPT_SRC_RE = /(<script\b[^>]*\ssrc=")((?:modules\/[^"?]+|chart\.js|settings-panel[^"?]*\.js))(?:\?[^"#]*)?(")/g;
const LEGACY_LINK_HREF_RE = /(<link\b[^>]*\shref=")((?:modules\/)[^"?]+)(?:\?[^"#]*)?(")/g;
/** Multichart iframe inject() cache bust in live/index.html */
const INLINE_MULTICHART_V_RE = /var V = '[^']+';/g;
const SW_VERSION_RE = /const SW_VERSION = "[^"]+";/;
const swPath = path.resolve(__dirname, "../live/public/sw.js");

function defaultBuildId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}b1`;
}

/** Bump `20260516b1` → `20260516b2` (or legacy `…aN`) when rebuilding the same day. */
function incrementBuildId(id) {
  const m = /^(\d{8})([ab])(\d+)$/i.exec(String(id || "").trim());
  if (m) return `${m[1]}${m[2]}${parseInt(m[3], 10) + 1}`;
  return `${defaultBuildId()}2`;
}

function readCurrentChartBuildId(html) {
  const m = html.match(/\/chart\/[^"?]+\?v=([^"'#\s]+)/)
    || html.match(/(?:src|href)="(?:modules\/[^"?]+|chart\.js|settings-panel[^"?]*\.js)\?v=([^"'#\s]+)/);
  return m ? m[1] : null;
}

function resolveBuildId(html) {
  if (process.env.BUILD_ID?.trim()) return process.env.BUILD_ID.trim();
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 10);
  const current = readCurrentChartBuildId(html);
  if (current) return incrementBuildId(current);
  return defaultBuildId();
}

function bumpChartScriptsInHtml(filePath, { required, buildId: buildIdOverride }) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      console.error("[bump-dist-v9-cache] Missing:", filePath);
      process.exit(1);
    }
    return 0;
  }

  const before = fs.readFileSync(filePath, "utf8");
  const buildId = buildIdOverride ?? resolveBuildId(before);
  let after = before.replace(SCRIPT_SRC_RE, `$1$2?v=${buildId}$3`);
  after = after.replace(LINK_HREF_RE, `$1$2?v=${buildId}$3`);
  after = after.replace(INLINE_MULTICHART_V_RE, `var V = '${buildId}';`);

  if (after === before) {
    console.warn("[bump-dist-v9-cache] No /chart/ asset references matched in", filePath);
    return 0;
  }

  fs.writeFileSync(filePath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set ?v=" + buildId + " on chart assets in", filePath);
  return 1;
}

function bumpLegacyChartScriptsInHtml(filePath, { required, buildId: buildIdOverride }) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      console.error("[bump-dist-v9-cache] Missing:", filePath);
      process.exit(1);
    }
    return 0;
  }

  const before = fs.readFileSync(filePath, "utf8");
  const buildId = buildIdOverride ?? resolveBuildId(before);
  let after = before.replace(LEGACY_SCRIPT_SRC_RE, `$1$2?v=${buildId}$3`);
  after = after.replace(LEGACY_LINK_HREF_RE, `$1$2?v=${buildId}$3`);

  if (after === before) {
    console.warn("[bump-dist-v9-cache] No legacy chart asset references matched in", filePath);
    return 0;
  }

  fs.writeFileSync(filePath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set ?v=" + buildId + " on legacy chart assets in", filePath);
  return 1;
}

function bumpServiceWorkerVersion(buildId) {
  if (!buildId || !fs.existsSync(swPath)) return 0;
  const before = fs.readFileSync(swPath, "utf8");
  const after = before.replace(SW_VERSION_RE, `const SW_VERSION = "talaria-chart-${buildId}";`);
  if (after === before) return 0;
  fs.writeFileSync(swPath, after, "utf8");
  console.log("[bump-dist-v9-cache] Set SW_VERSION=" + buildId + " in", swPath);
  return 1;
}

const mode = process.argv.includes("--dist")
  ? "dist"
  : process.argv.includes("--live")
    ? "live"
    : "both";

let touched = 0;
let buildIdForDist = null;

if (mode === "live" || mode === "both") {
  if (fs.existsSync(liveIndexPath)) {
    const liveBefore = fs.readFileSync(liveIndexPath, "utf8");
    buildIdForDist = resolveBuildId(liveBefore);
  }
  touched += bumpChartScriptsInHtml(liveIndexPath, {
    required: mode === "live",
    buildId: buildIdForDist,
  });
  if (buildIdForDist) {
    touched += bumpServiceWorkerVersion(buildIdForDist);
    touched += bumpLegacyChartScriptsInHtml(legacyIndexPath, {
      required: false,
      buildId: buildIdForDist,
    });
  }
}

if (mode === "dist" || mode === "both") {
  let distBuildId = buildIdForDist;
  if (process.env.BUILD_ID?.trim()) {
    distBuildId = process.env.BUILD_ID.trim();
  } else if (fs.existsSync(distIndexPath)) {
    const distCurrent = readCurrentChartBuildId(fs.readFileSync(distIndexPath, "utf8"));
    // After `vite build`, dist copies live's id — bump dist one step so browsers reload modules.
    distBuildId = distCurrent ? incrementBuildId(distCurrent) : distBuildId;
  }
  if (!distBuildId && fs.existsSync(liveIndexPath)) {
    distBuildId = readCurrentChartBuildId(fs.readFileSync(liveIndexPath, "utf8"));
  }
  touched += bumpChartScriptsInHtml(distIndexPath, {
    required: mode === "dist" || mode === "both",
    buildId: distBuildId,
  });
  // Keep live/index.html on the same final id as dist (vite copies live → dist, then dist bumps).
  if (distBuildId && fs.existsSync(liveIndexPath)) {
    touched += bumpChartScriptsInHtml(liveIndexPath, {
      required: false,
      buildId: distBuildId,
    });
    touched += bumpServiceWorkerVersion(distBuildId);
    touched += bumpLegacyChartScriptsInHtml(legacyIndexPath, {
      required: false,
      buildId: distBuildId,
    });
  }
}

if (touched === 0 && (mode === "dist" || mode === "both")) {
  process.exit(1);
}
