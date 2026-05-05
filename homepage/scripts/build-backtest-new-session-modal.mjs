import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const sessionsView = path.join(repoRoot, "chart v 1.4", "Design", "src", "pages", "session", "SessionsView.jsx");
const headPath = path.join(__dirname, "backtest-modal-head.tsx");
const tailPath = path.join(__dirname, "backtest-modal-tail.tsx");
const outPath = path.join(repoRoot, "homepage", "src", "app", "dashboard", "BacktestNewSessionModal.tsx");

const lines = fs.readFileSync(sessionsView, "utf8").split(/\r?\n/);
let body = lines.slice(832, 2366).join("\n");
body = body.replace(/\{newSessOpen&&\(/, "{open && (");
body = body.replace(/closeNewSess\(\);\s*startNewSession\(\)/g, "void startNewSession()");

const head = fs.readFileSync(headPath, "utf8").replace(/\n\s*void currencyCountry;\s*\n/s, "\n");
const tail = fs.readFileSync(tailPath, "utf8");

fs.writeFileSync(outPath, `${head}\n${body}\n${tail}`, "utf8");
console.log("Wrote", outPath, "lines ~", head.split("\n").length + body.split("\n").length + tail.split("\n").length);
