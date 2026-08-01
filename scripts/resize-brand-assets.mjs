/**
 * resize-brand-assets.mjs — bring every served brand asset inside its recorded target.
 *
 *   node scripts/resize-brand-assets.mjs            # report only
 *   node scripts/resize-brand-assets.mjs --apply    # rewrite the files
 *
 * Targets and their justification live in scripts/lib/asset-decoded-budget.mjs, so the
 * resize and the CI check read the same manifest and cannot drift apart.
 *
 * Copies of the same basename are resized once and written to every path, so the chart
 * tree and the homepage/public mirror stay byte-identical. That matters: the mirror is
 * what nginx actually serves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TARGETS, SERVED_IMAGE_ROOTS, decodedBytes } from './lib/asset-decoded-budget.mjs';
import { resizeFile } from './png-downscale.mjs';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');

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

function pngSize(file) {
    const buf = fs.readFileSync(file, { flag: 'r' }).subarray(0, 24);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const allFiles = SERVED_IMAGE_ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
// The repo root also holds a stray copy of the loader brand that ships with the homepage.
allFiles.push(...fs.readdirSync(ROOT).map((f) => path.join(ROOT, f)).filter((f) => /logo-\d+\.png$/i.test(f)));

let beforeTotal = 0;
let afterTotal = 0;
const summary = [];

for (const target of TARGETS) {
    const copies = allFiles.filter((f) => path.basename(f).toLowerCase() === target.basename.toLowerCase());
    if (!copies.length) {
        summary.push({ asset: target.basename, status: 'NOT FOUND' });
        continue;
    }

    // Distinct source contents under one basename — homepage/public/logo-05.png is a
    // different export from chart/modules/logo-05.png, so each is resized on its own.
    const groups = new Map();
    for (const file of copies) {
        const key = fs.readFileSync(file).toString('base64');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(file);
    }

    let variant = 0;
    for (const [, paths] of groups) {
        variant += 1;
        const source = paths[0];
        const before = pngSize(source);
        const beforeBytes = decodedBytes(before.width, before.height);
        beforeTotal += beforeBytes;

        if (Math.max(before.width, before.height) <= target.maxEdge) {
            afterTotal += beforeBytes;
            summary.push({
                asset: `${target.basename}${variant > 1 ? ` (variant ${variant})` : ''}`,
                status: 'already within target',
                pixels: `${before.width}x${before.height}`,
                decodedMB: +(beforeBytes / 1048576).toFixed(2),
                copies: paths.length,
            });
            continue;
        }

        const tmp = path.join(ROOT, `.scratch-resize-${target.basename.replace(/[^\w.-]/g, '_')}-${variant}.png`);
        const result = resizeFile(source, tmp, target.maxEdge);
        const afterBytes = decodedBytes(result.to.width, result.to.height);
        afterTotal += afterBytes;

        if (APPLY) {
            const bytes = fs.readFileSync(tmp);
            for (const p of paths) fs.writeFileSync(p, bytes);
        }
        fs.rmSync(tmp, { force: true });

        summary.push({
            asset: `${target.basename}${variant > 1 ? ` (variant ${variant})` : ''}`,
            status: APPLY ? 'RESIZED' : 'would resize',
            pixels: `${before.width}x${before.height} -> ${result.to.width}x${result.to.height}`,
            decodedMB: `${(beforeBytes / 1048576).toFixed(2)} -> ${(afterBytes / 1048576).toFixed(2)}`,
            diskKB: `${Math.round(fs.statSync(source).size / 1024)} -> ${Math.round(result.diskBytes / 1024)}`,
            copies: paths.length,
        });
    }
}

for (const row of summary) {
    console.log(
        `${row.status.padEnd(22)} ${String(row.asset).padEnd(26)} ${String(row.pixels ?? '').padEnd(24)} ` +
        `decodedMB=${String(row.decodedMB ?? '')} diskKB=${String(row.diskKB ?? '')} copies=${row.copies ?? 0}`
    );
}
console.log(
    `\ntotal decoded across brand assets: ${(beforeTotal / 1048576).toFixed(2)} MB -> ` +
    `${(afterTotal / 1048576).toFixed(2)} MB` + (APPLY ? '' : '  (dry run — pass --apply)')
);
