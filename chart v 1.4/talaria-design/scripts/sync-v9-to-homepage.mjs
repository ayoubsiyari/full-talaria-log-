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
import { syncHomepageModules } from "./sync-homepage-modules.mjs";

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

const vendorSrc = path.resolve(__dirname, "../../chart/vendor");
const vendorDest = path.resolve(__dirname, "../../../homepage/public/chart/vendor");
if (fs.existsSync(vendorSrc)) {
  if (fs.existsSync(vendorDest)) {
    fs.rmSync(vendorDest, { recursive: true, force: true });
  }
  fs.cpSync(vendorSrc, vendorDest, { recursive: true });
  console.log("[sync-v9-to-homepage] Copied chart/vendor", vendorSrc, "→", vendorDest);
}

// Mirror self-hosted fonts (woff2 + talaria-fonts.css) for /chart/fonts/* on homepage.
const fontsSrc = path.resolve(__dirname, "../../chart/fonts");
const fontsDest = path.resolve(__dirname, "../../../homepage/public/chart/fonts");
if (fs.existsSync(fontsSrc)) {
  if (fs.existsSync(fontsDest)) {
    fs.rmSync(fontsDest, { recursive: true, force: true });
  }
  fs.cpSync(fontsSrc, fontsDest, { recursive: true });
  console.log("[sync-v9-to-homepage] Copied chart/fonts", fontsSrc, "→", fontsDest);
} else {
  console.warn("[sync-v9-to-homepage] chart/fonts not found — run: node chart/scripts/bundle-self-hosted-fonts.mjs");
}

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
  try {
    syncHomepageModules(modulesSrc, modulesDest);
  } catch (error) {
    console.error("[sync-v9-to-homepage]", error?.message || error);
    process.exit(1);
  }
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

// LEGACY SHELL: copied ONLY during CHECKPOINT_BUILD image builds.
//
// Two requirements point opposite ways and both are real:
//   - Inside the image build this copy is load-bearing. `deploy-test-checkpoint.sh:327` exports
//     CHECKPOINT_BUILD=1, and the D-034 layout / I8 assert reads the in-image mirror at
//     /homepage/public/chart/legacy-index.html.
//   - Outside it the file must NOT exist. A14.3 removed the public legacy shell and
//     `scripts/module-contracts.json` declares `legacy-public-shell` status=removed with an
//     assertion that the path is absent, so an unconditional copy makes every build write a file
//     that blocks the NEXT build's `preflight:module-contracts`. That is not hypothetical: it
//     stranded b125 on 2026-08-03 and it put a 1.4 MB untracked stray into the served tree before
//     that (B, BOARD-B 15:32, preserved as blob 62c649802d5).
//
// So the copy is conditional, and the non-checkpoint branch actively REMOVES a stale mirror
// rather than merely skipping. Skipping would leave any copy from an earlier build in place, and
// the whole failure mode here is a file that outlives the build that wrote it.
//
// The previous comment claimed "Homepage Dockerfile also copies this file explicitly". It does
// not — there is no legacy-index reference in homepage/Dockerfile — so that justification was
// stale and is corrected rather than carried forward.
const isCheckpointBuild = !!process.env.CHECKPOINT_BUILD
  && process.env.CHECKPOINT_BUILD !== "0"
  && process.env.CHECKPOINT_BUILD !== "false";
const legacyIndexSrc = path.resolve(__dirname, "../../chart/legacy-index.html");
const legacyIndexDest = path.resolve(__dirname, "../../../homepage/public/chart/legacy-index.html");
if (isCheckpointBuild) {
  if (fs.existsSync(legacyIndexSrc)) {
    fs.mkdirSync(path.dirname(legacyIndexDest), { recursive: true });
    fs.copyFileSync(legacyIndexSrc, legacyIndexDest);
    console.log("[sync-v9-to-homepage] Copied legacy-index (CHECKPOINT_BUILD)", legacyIndexSrc, "→", legacyIndexDest);
  } else {
    console.warn("[sync-v9-to-homepage] legacy-index.html not found, skip:", legacyIndexSrc);
  }
} else if (fs.existsSync(legacyIndexDest)) {
  fs.rmSync(legacyIndexDest, { force: true });
  console.log("[sync-v9-to-homepage] Removed stale legacy-index mirror (not a CHECKPOINT_BUILD):", legacyIndexDest);
} else {
  console.log("[sync-v9-to-homepage] legacy-index mirror correctly absent (not a CHECKPOINT_BUILD)");
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
  // A swallowed failure here leaves the homepage mirror carrying whatever stamp it
  // had before the sync, which is the mixed-id state the layout proof exists to catch.
  if (r.status !== 0) {
    console.error("[sync-v9-to-homepage] bump-dist-v9-cache --dist exited", r.status);
    process.exit(r.status);
  }
} catch (e) {
  console.error("[sync-v9-to-homepage] bump-dist-v9-cache failed:", e && e.message || e);
  process.exit(1);
}

// Regenerate opaque transparent-background icons from logo-04.png (run scripts/generate-pwa-icons.ps1 before release).
const homepagePwa = path.resolve(__dirname, "../../../homepage/public/pwa");
const homepageFavicon = path.resolve(__dirname, "../../../homepage/public/favicon.png");
if (fs.existsSync(path.join(homepagePwa, "icon-32.png"))) {
  fs.copyFileSync(path.join(homepagePwa, "icon-32.png"), homepageFavicon);
}

