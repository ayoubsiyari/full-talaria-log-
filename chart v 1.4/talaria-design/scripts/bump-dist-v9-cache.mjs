/**
 * After `vite build`, rewrite every `<script src="/chart/...">` query string in
 * `chart/dist-v9/index.html` to `?v=<buildId>` so browsers and CDNs always
 * fetch fresh JS after each `npm run build:live` — no hand-editing ?v= in dist.
 *
 * Override: BUILD_ID=mytag npm run build:live
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, "../../chart/dist-v9/index.html");

const buildId =
  process.env.BUILD_ID?.trim() ||
  process.env.GITHUB_SHA?.slice(0, 10) ||
  `b${Date.now().toString(36)}`;

if (!fs.existsSync(indexPath)) {
  console.error("[bump-dist-v9-cache] Missing:", indexPath);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");
const before = html;

html = html.replace(
  /(<script\b[^>]*\ssrc=")(\/chart\/[^"?]+)(?:\?[^"#]*)?(")/g,
  `$1$2?v=${buildId}$3`,
);

if (html === before) {
  console.warn("[bump-dist-v9-cache] No /chart/ script src= matched — check index.html format.");
} else {
  fs.writeFileSync(indexPath, html, "utf8");
  console.log("[bump-dist-v9-cache] Set ?v=" + buildId + " on chart scripts in", indexPath);
}
