/**
 * ASSET-DECODED-BUDGET-V1 — CI check.
 *
 * No served image may exceed a stated decoded-size budget. This is the check that has to
 * survive the next design handover, because the previous one shipped wordmarks at
 * 4720x2234 and file-size review could not see it: 87 KB on disk, 40.2 MB in RAM.
 *
 * It measures pixels, not bytes on disk, and it fails closed — an image it cannot parse
 * is a failure, not a skip, so an unreadable format can never slip through.
 *
 * Run: node --test scripts/tests/asset-decoded-budget.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DECODED_BUDGET_BYTES,
    SERVED_IMAGE_ROOTS,
    TARGETS,
    auditImages,
    isBudgetedImage,
    decodedBytes,
    targetFor,
} from '../lib/asset-decoded-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            walk(full, out);
        } else out.push(full);
    }
    return out;
}

/* ── dimension parsing, kept minimal and explicit ──────────────────────────── */

function pngSize(buf) {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) return null;
        i += 2 + len;
    }
    return null;
}

function gifSize(buf) {
    if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') return null;
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function webpSize(buf) {
    if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8X') {
        return {
            width: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
            height: (buf.readUIntLE(27, 3) & 0xffffff) + 1
        };
    }
    return null;
}

function measure(file) {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') return pngSize(buf);
    if (ext === '.jpg' || ext === '.jpeg') return jpegSize(buf);
    if (ext === '.gif') return gifSize(buf);
    if (ext === '.webp') return webpSize(buf);
    return null;
}

/** Every raster image under the served roots, measured. */
function surveyServedImages() {
    const seen = new Set();
    const images = [];
    for (const root of SERVED_IMAGE_ROOTS) {
        for (const file of walk(path.join(ROOT, root))) {
            const rel = path.relative(ROOT, file).replace(/\\/g, '/');
            if (seen.has(rel) || !isBudgetedImage(rel)) continue;
            seen.add(rel);
            const dim = measure(file);
            images.push({
                path: rel,
                basename: path.basename(file),
                width: dim?.width ?? null,
                height: dim?.height ?? null,
                diskBytes: fs.statSync(file).size,
            });
        }
    }
    return images;
}

const survey = surveyServedImages();

test('CELL 1 — the survey is non-vacuous', () => {
    // A budget check that finds no images proves nothing.
    assert.ok(survey.length >= 20,
        `expected the served trees to hold images; found ${survey.length}`);
});

test('CELL 2 — no served image exceeds the decoded-size budget', () => {
    const result = auditImages(survey);
    const report = result.overBudget
        .map((o) => `  ${o.path} ${o.pixels} = ${o.decodedMB} MB decoded`)
        .join('\n');
    assert.deepEqual(
        result.overBudget, [],
        `these images exceed the ${(DECODED_BUDGET_BYTES / 1048576).toFixed(0)} MB decoded budget ` +
        `(decoded size is width x height x 4 and is independent of file size):\n${report}\n` +
        'Resize the file. CSS width does not reduce decoded size.'
    );
});

test('CELL 3 — every brand asset is within its recorded target', () => {
    const result = auditImages(survey);
    const report = result.overTarget
        .map((o) => `  ${o.path} is ${o.pixels}, target max edge ${o.maxEdge} (displayed: ${o.displayed})`)
        .join('\n');
    assert.deepEqual(result.overTarget, [],
        `these assets are larger than the size their own display justifies:\n${report}`);
});

test('CELL 4 — every image in scope could actually be measured', () => {
    const result = auditImages(survey);
    assert.deepEqual(result.unmeasurable, [],
        'an image the budget cannot measure is an image it cannot police; ' +
        'either add a parser or put it out of scope with a stated reason');
});

test('CELL 5 — every target names the displayed size that justifies it', () => {
    for (const target of TARGETS) {
        assert.match(target.displayed, /\d|no load path/,
            `${target.basename} must record the displayed size behind its target`);
        assert.ok(target.rationale && target.rationale.length > 20,
            `${target.basename} must record why that number, not just the number`);
        assert.ok(target.maxEdge > 0 && target.maxEdge <= 1200,
            `${target.basename} target ${target.maxEdge} is outside anything a UI displays`);
    }
});

/* ── mutants ───────────────────────────────────────────────────────────────── */

test('CELL 6 — MUTANT: a 4720x2234 wordmark is caught', () => {
    const result = auditImages([
        ...survey,
        { path: 'homepage/public/chart/modules/logo-99.png', basename: 'logo-99.png', width: 4720, height: 2234 }
    ]);
    assert.equal(result.pass, false, 'the original defect must not pass');
    assert.equal(result.overBudget.length, 1);
    assert.equal(result.overBudget[0].decodedMB, 40.22,
        'and it should report the decoded size, which is the number that matters');
});

test('CELL 7 — MUTANT: an unparseable in-scope image fails rather than passing quietly', () => {
    const result = auditImages([
        ...survey,
        { path: 'homepage/public/mystery.png', basename: 'mystery.png', width: null, height: null }
    ]);
    assert.equal(result.pass, false, 'fail closed');
    assert.deepEqual(result.unmeasurable, [{ path: 'homepage/public/mystery.png' }]);
});

test('CELL 8 — MUTANT: a known asset re-exported oversized is caught by its target', () => {
    // The realistic regression: a handover replaces logo-08 at its old size. It is under
    // the 4 MB budget at 900px, so only the per-asset target catches it.
    const result = auditImages([
        { path: 'homepage/public/chart/modules/logo-08.png', basename: 'logo-08.png', width: 900, height: 841 }
    ]);
    assert.ok(decodedBytes(900, 841) < DECODED_BUDGET_BYTES, 'premise: under the global budget');
    assert.equal(result.overBudget.length, 0);
    assert.equal(result.overTarget.length, 1, 'the per-asset target is what catches this');
    assert.equal(result.overTarget[0].maxEdge, targetFor('logo-08.png').maxEdge);
});

test('CELL 9 — out-of-scope paths are excluded only where a reason is recorded', () => {
    assert.equal(isBudgetedImage('chart v 1.4/chart/multichart-prod/harness/docs/x/evidence/a.png'), false,
        'harness evidence is out of scope');
    assert.equal(isBudgetedImage('homepage/public/logo-04.png'), true,
        'product art is always in scope');
    assert.equal(isBudgetedImage('homepage/public/icon.svg'), false,
        'vectors have no fixed decoded size');
});

test('CELL 10 — report the current total for the record', () => {
    const result = auditImages(survey);
    const worst = [...survey]
        .filter((i) => i.width && i.height)
        .sort((a, b) => decodedBytes(b.width, b.height) - decodedBytes(a.width, a.height))
        .slice(0, 5);
    console.log(
        `\n  served images checked: ${result.checked}\n` +
        `  total decoded: ${(result.totalDecodedBytes / 1048576).toFixed(2)} MB\n` +
        `  budget per image: ${(DECODED_BUDGET_BYTES / 1048576).toFixed(0)} MB\n  largest:\n` +
        worst.map((w) => `    ${(decodedBytes(w.width, w.height) / 1048576).toFixed(2)} MB  ${w.width}x${w.height}  ${w.path}`).join('\n')
    );
    assert.ok(result.totalDecodedBytes > 0);
});
