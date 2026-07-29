/**
 * SPLITTER-BORDERS-B90 — hairline helpers + source wiring pins (no puppeteer).
 * Run: node --test "chart v 1.4/talaria-design/src/mc-splitter-hairline.test.mjs"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    MC_SPLITTER_HAIRLINE_COLOR,
    MC_SPLITTER_HAIRLINE_SWITCH,
    MC_SPLITTER_HOVER_BG,
    mcSplitterHairlineV1Enabled,
    mcSplitterRestingBackground,
} from "./mc-splitter-hairline.mjs";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const GRID_SRC = readFileSync(join(SRC_DIR, "MultichartGrid.jsx"), "utf8");

test("default ON: resting hairline is 1px #2a2e3a on col and row", () => {
    delete globalThis.window;
    assert.equal(mcSplitterHairlineV1Enabled(), true);
    const col = mcSplitterRestingBackground("col");
    const row = mcSplitterRestingBackground("row");
    assert.ok(col.includes(MC_SPLITTER_HAIRLINE_COLOR));
    assert.ok(row.includes(MC_SPLITTER_HAIRLINE_COLOR));
    assert.match(col, /to right/);
    assert.match(row, /to bottom/);
    assert.match(col, /4\.5px/);
    assert.match(col, /5\.5px/);
    assert.notEqual(col, "transparent");
    assert.notEqual(row, "transparent");
});

test("kill-switch truthiness restores transparent (pre-b90 invisible)", () => {
    globalThis.window = { [MC_SPLITTER_HAIRLINE_SWITCH]: true };
    assert.equal(mcSplitterHairlineV1Enabled(), false);
    assert.equal(mcSplitterRestingBackground("col"), "transparent");
    assert.equal(mcSplitterRestingBackground("row"), "transparent");

    globalThis.window = { [MC_SPLITTER_HAIRLINE_SWITCH]: 1 };
    assert.equal(mcSplitterHairlineV1Enabled(), false);
    assert.equal(mcSplitterRestingBackground("col"), "transparent");

    globalThis.window = { [MC_SPLITTER_HAIRLINE_SWITCH]: false };
    assert.equal(mcSplitterHairlineV1Enabled(), true);
    assert.notEqual(mcSplitterRestingBackground("col"), "transparent");

    delete globalThis.window;
});

test("MultichartGrid wires hairline helpers and keeps black gutter", () => {
    assert.match(GRID_SRC, /from\s+["']\.\/mc-splitter-hairline\.mjs["']/);
    assert.match(GRID_SRC, /mcSplitterRestingBackground\("col"\)/);
    assert.match(GRID_SRC, /mcSplitterRestingBackground\("row"\)/);
    assert.match(GRID_SRC, /data-col-splitter/);
    assert.match(GRID_SRC, /data-row-splitter/);
    assert.match(GRID_SRC, /MC_SPLITTER_HOVER_BG/);
    // Layout-gap flash fix must remain — do not recolour the grid gutter.
    assert.match(
        GRID_SRC,
        /gap:\s*`\$\{MULTICHART_GRID_GAP_PX\}px`[\s\S]{0,120}background:\s*"#000000"/,
    );
    assert.equal(MC_SPLITTER_HOVER_BG, "rgba(41,98,255,0.45)");
    assert.equal(MC_SPLITTER_HAIRLINE_SWITCH, "__TALARIA_DISABLE_MC_SPLITTER_HAIRLINE_V1");
});
