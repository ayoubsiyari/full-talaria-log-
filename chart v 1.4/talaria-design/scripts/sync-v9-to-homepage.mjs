/**
 * After `vite build --config vite.config.live.js`, chart output lives at
 * `chart v 1.4/chart/dist-v9/`. The Next.js design iframe loads the same
 * tree from `homepage/public/chart/dist-v9/` — if it drifts, users see an
 * old bundle (e.g. stale mock trades) while FastAPI `/chart/index.html` is fine.
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
