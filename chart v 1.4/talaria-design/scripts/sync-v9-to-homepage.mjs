/**
 * After `vite build` + `bump-dist-v9-cache.mjs`, chart output lives at
 * `chart v 1.4/chart/dist-v9/`. This copies it to `homepage/public/chart/dist-v9/`
 * so `next build` ships the same files in `out/`.
 *
 * Single workflow for V9 + TalariaV8bLive.jsx:
 *   — Edit only `talaria-design/src/` and `talaria-design/live/`.
 *   — Run `npm run build:live` here (or `npm run build:chart-v9` from repo root).
 *   — Do not maintain a second Vite live tree under `chart/` (removed to prevent drift).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../../chart/dist-v9");
const dest = path.resolve(__dirname, "../../../homepage/public/chart/dist-v9");

if (!fs.existsSync(src)) {
  console.error("[sync-v9-to-homepage] Missing build output:", src);
  console.error("Run: npm run build:live (vite.config.live.js)");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}
fs.cpSync(src, dest, { recursive: true });
console.log("[sync-v9-to-homepage] Copied", src, "→", dest);

// Vite only bundles React; `/chart/chart.js` is loaded at runtime. Copy the engine
// from source so `homepage/public` self-hosts the same file the chart server would
// serve (avoids "nothing changed" when only dist-v9/ was updated).
const chartJsSrc = path.resolve(__dirname, "../../chart/chart.js");
const chartJsDest = path.resolve(__dirname, "../../../homepage/public/chart/chart.js");
if (fs.existsSync(chartJsSrc)) {
  fs.mkdirSync(path.dirname(chartJsDest), { recursive: true });
  fs.copyFileSync(chartJsSrc, chartJsDest);
  console.log("[sync-v9-to-homepage] Copied chart engine", chartJsSrc, "→", chartJsDest);
} else {
  console.warn("[sync-v9-to-homepage] chart.js not found, skip:", chartJsSrc);
}

const compareOverlaySrc = path.resolve(__dirname, "../../chart/modules/compare-overlay.js");
const compareOverlayDest = path.resolve(__dirname, "../../../homepage/public/chart/modules/compare-overlay.js");
if (fs.existsSync(compareOverlaySrc)) {
  fs.mkdirSync(path.dirname(compareOverlayDest), { recursive: true });
  fs.copyFileSync(compareOverlaySrc, compareOverlayDest);
  console.log("[sync-v9-to-homepage] Copied compare-overlay", compareOverlaySrc, "→", compareOverlayDest);
} else {
  console.warn("[sync-v9-to-homepage] compare-overlay.js not found, skip:", compareOverlaySrc);
}

// Mirror full chart/modules so runtime /chart/modules/* matches source (not just dist-v9).
const modulesSrc = path.resolve(__dirname, "../../chart/modules");
const modulesDest = path.resolve(__dirname, "../../../homepage/public/chart/modules");
if (fs.existsSync(modulesSrc)) {
  if (fs.existsSync(modulesDest)) {
    fs.rmSync(modulesDest, { recursive: true, force: true });
  }
  fs.cpSync(modulesSrc, modulesDest, { recursive: true });
  console.log("[sync-v9-to-homepage] Copied chart/modules", modulesSrc, "→", modulesDest);
} else {
  console.warn("[sync-v9-to-homepage] chart/modules not found, skip:", modulesSrc);
}

// Web Worker scripts: indicator-worker.js (Track A) is loaded by the chart at
// runtime from /chart/workers/indicator-worker.js. Copy the full workers/
// directory so changes are picked up on every build+sync without manual steps.
const workersSrc = path.resolve(__dirname, "../../chart/workers");
const workersDest = path.resolve(__dirname, "../../../homepage/public/chart/workers");
if (fs.existsSync(workersSrc)) {
  if (fs.existsSync(workersDest)) {
    fs.rmSync(workersDest, { recursive: true, force: true });
  }
  fs.cpSync(workersSrc, workersDest, { recursive: true });
  console.log("[sync-v9-to-homepage] Copied chart/workers", workersSrc, "→", workersDest);
} else {
  console.warn("[sync-v9-to-homepage] chart/workers not found, skip:", workersSrc);
}

// Phase 7.2.x multichart bridge scripts: dist-v9 shim loads these at runtime
// from /chart/multichart-prod/ (sync-bridge.js, multichart-manager.js,
// engine-api-guards.js, embed-bridge.js, panel-cmd-bridge.js). Copy the
// whole folder so homepage `/chart/multichart-prod/*` serves the latest
// versions — without this, edits to sync-bridge.js / multichart-manager.js
// silently never reach the deployed site even after a build.
const mcpSrc = path.resolve(__dirname, "../../chart/multichart-prod");
const mcpDest = path.resolve(__dirname, "../../../homepage/public/chart/multichart-prod");
if (fs.existsSync(mcpSrc)) {
  if (fs.existsSync(mcpDest)) {
    fs.rmSync(mcpDest, { recursive: true, force: true });
  }
  fs.cpSync(mcpSrc, mcpDest, { recursive: true });
  console.log("[sync-v9-to-homepage] Copied multichart-prod", mcpSrc, "→", mcpDest);
} else {
  console.warn("[sync-v9-to-homepage] multichart-prod not found, skip:", mcpSrc);
}

// PWA install assets: served at /chart/* (index.html is dist-v9 content but URL is /chart/index.html).
const pwaPublic = path.resolve(__dirname, "../live/public");
const pwaFiles = ["manifest.webmanifest", "sw.js", "pwa-install.js"];
const pwaTargets = [
  path.resolve(__dirname, "../../chart"),
  path.resolve(__dirname, "../../../homepage/public/chart"),
];
for (const targetRoot of pwaTargets) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const file of pwaFiles) {
    const from = path.join(pwaPublic, file);
    const to = path.join(targetRoot, file);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, to);
    }
  }
  const pwaDirFrom = path.join(pwaPublic, "pwa");
  const pwaDirTo = path.join(targetRoot, "pwa");
  if (fs.existsSync(pwaDirFrom)) {
    fs.mkdirSync(pwaDirTo, { recursive: true });
    fs.cpSync(pwaDirFrom, pwaDirTo, { recursive: true });
  }
  console.log("[sync-v9-to-homepage] Copied PWA assets →", targetRoot);
}

// Re-apply ?v= to homepage mirror (dist was already bumped; homepage copy must match).
const bumpScript = path.resolve(__dirname, "bump-dist-v9-cache.mjs");
try {
  const r = spawnSync(process.execPath, [bumpScript, "--dist"], {
    stdio: "inherit",
    env: { ...process.env },
  });
  if (r.status !== 0) {
    console.warn("[sync-v9-to-homepage] bump-dist-v9-cache --dist exited", r.status);
  }
} catch (e) {
  console.warn("[sync-v9-to-homepage] bump-dist-v9-cache failed:", e && e.message || e);
}

// Regenerate opaque transparent-background icons from logo-04.png (run scripts/generate-pwa-icons.ps1 before release).
const homepagePwa = path.resolve(__dirname, "../../../homepage/public/pwa");
const homepageFavicon = path.resolve(__dirname, "../../../homepage/public/favicon.png");
if (fs.existsSync(path.join(homepagePwa, "icon-32.png"))) {
  fs.copyFileSync(path.join(homepagePwa, "icon-32.png"), homepageFavicon);
}

