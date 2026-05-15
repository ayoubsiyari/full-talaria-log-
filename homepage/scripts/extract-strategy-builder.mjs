/**
 * One-off splitter: moves strategy builder block from strategyV8.jsx into
 * strategy-lab-v9/strategyBuilderModule.jsx (see package.json if you need to re-run).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const v8Path = path.join(root, "src", "components", "strategy-lab", "strategyV8.jsx");
const outPath = path.join(root, "src", "components", "strategy-lab-v9", "strategyBuilderModule.jsx");

const raw = fs.readFileSync(v8Path, "utf8");
const lines = raw.split(/\r?\n/);

const partImports = lines.slice(0, 4).join("\n");
const partEmojiHelpers = lines.slice(6, 302).join("\n");
const partBuilder = lines.slice(396, 6216).join("\n");

const out =
  `"use client";\n` +
  partImports +
  `\n\n` +
  partEmojiHelpers +
  `\n\n` +
  partBuilder +
  `\n\n` +
  `export { STRATEGY_TEMPLATES, buildNodesFromTemplate, TemplatePickerModal, StrategyBuilderModal };\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, "utf8");

const importBlock = [
  "",
  'import {',
  "  STRATEGY_TEMPLATES,",
  "  buildNodesFromTemplate,",
  "  TemplatePickerModal,",
  "  StrategyBuilderModal,",
  '} from "../strategy-lab-v9/strategyBuilderModule.jsx";',
  "",
].join("\n");

const newV8Lines = [...lines.slice(0, 396), ...importBlock.split("\n"), ...lines.slice(6216)];
fs.writeFileSync(v8Path, newV8Lines.join("\n") + (raw.endsWith("\n") ? "\n" : ""), "utf8");

console.log("Wrote", path.relative(root, outPath));
console.log("Updated", path.relative(root, v8Path), "removed lines 397-6216, added import.");
