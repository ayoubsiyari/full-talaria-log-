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

const drawingManagerSrc = path.resolve(__dirname, "../../chart/modules/drawing-tools-manager.js");
const drawingManagerDest = path.resolve(
  __dirname,
  "../../../homepage/public/chart/modules/drawing-tools-manager.js",
);
if (fs.existsSync(drawingManagerSrc)) {
  fs.mkdirSync(path.dirname(drawingManagerDest), { recursive: true });
  fs.copyFileSync(drawingManagerSrc, drawingManagerDest);
  console.log("[sync-v9-to-homepage] Copied drawing-tools-manager", drawingManagerSrc, "→", drawingManagerDest);
} else {
  console.warn("[sync-v9-to-homepage] drawing-tools-manager.js not found, skip:", drawingManagerSrc);
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
