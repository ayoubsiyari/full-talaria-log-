/**
 * After `vite build --config vite.config.live.js`, chart output lives at
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
