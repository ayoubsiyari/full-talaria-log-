/**
 * image-asset-census.mjs — enumerate every image asset the app can load, with decoded
 * bytes, and separate the ones that actually load from the ones merely sitting on disk.
 *
 *   node scripts/image-asset-census.mjs [--json out.json]
 *
 * Why decoded bytes and not file size: a decoded bitmap costs width x height x 4 bytes
 * regardless of how well it compressed. Flat-colour artwork compresses superbly, so an
 * asset that looks harmless in a directory listing can be catastrophic in the image
 * cache. That is the whole mechanism behind the measured 63,075K.
 *
 * Load classification is deliberately conservative: EAGER only when a reference is
 * reached without user interaction (an <img> in shipped HTML, a CSS background on a
 * selector, or a module-scope JS reference). Anything reached from inside a function
 * that a user action calls is LAZY-OR-CONDITIONAL. When in doubt this reports
 * REFERENCED and names the site rather than guessing, because the Director asked for
 * knowledge before cutting.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Trees that nginx serves, plus the vite source that generates the served shell. */
const ASSET_ROOTS = [
    'homepage/public',
    'chart v 1.4/chart',
    'chart v 1.4/talaria-design',
];

/** Trees searched for references to those assets. */
const REFERENCE_ROOTS = [
    'homepage/public',
    'homepage/src',
    'chart v 1.4/chart',
    'chart v 1.4/talaria-design',
];

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']);
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.json']);

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

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
            if (SKIP_DIR.has(entry.name)) continue;
            walk(full, out);
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

/* ── dimension parsers ─────────────────────────────────────────────────────── */

function pngSize(buf) {
    // IHDR is the first chunk: 8-byte signature, 4 length, 4 type, then w/h big-endian.
    if (buf.length < 24) return null;
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        // SOF0..SOF15 except DHT(c4) DAC(cc) and RSTn — these carry the frame header.
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
    if (fmt === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
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

function svgSize(buf) {
    const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(head);
    if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]), vector: true };
    const w = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(head);
    const h = /\bheight\s*=\s*["']?([\d.]+)/i.exec(head);
    if (w && h) return { width: Math.round(+w[1]), height: Math.round(+h[1]), vector: true };
    return { vector: true };
}

function dimensions(file, buf) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') return pngSize(buf);
    if (ext === '.jpg' || ext === '.jpeg') return jpegSize(buf);
    if (ext === '.gif') return gifSize(buf);
    if (ext === '.webp') return webpSize(buf);
    if (ext === '.svg') return svgSize(buf);
    return null;
}

/* ── reference index ───────────────────────────────────────────────────────── */

const textFiles = [];
for (const root of REFERENCE_ROOTS) {
    const abs = path.join(ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs)) {
        if (TEXT_EXT.has(path.extname(f).toLowerCase())) textFiles.push(f);
    }
}

const textCache = new Map();
function readText(file) {
    if (!textCache.has(file)) {
        try {
            textCache.set(file, fs.readFileSync(file, 'utf8'));
        } catch {
            textCache.set(file, '');
        }
    }
    return textCache.get(file);
}

/**
 * Classify a single reference line. Conservative by design — see file header.
 */
function classifyReference(line, file) {
    const ext = path.extname(file).toLowerCase();
    const trimmed = line.trim();
    if (/^\s*(\/\/|\*|\/\*|<!--)/.test(trimmed)) return 'COMMENT';
    if (ext === '.html' || ext === '.htm') {
        if (/<img\b/i.test(line)) return 'EAGER <img> in shipped HTML';
        if (/<link\b[^>]*rel=["']?(icon|apple-touch-icon|preload)/i.test(line)) return 'EAGER <link>';
        return 'REFERENCED in HTML';
    }
    if (ext === '.css') return 'EAGER-IF-SELECTOR-MATCHES (css url)';
    if (/\bnew Image\(|\.src\s*=/.test(line)) return 'JS image load';
    if (/backgroundImage|background-image|style\.background/.test(line)) return 'JS style background';
    if (/icon\s*:/.test(line)) return 'JS notification/icon option';
    return 'JS reference';
}

function findReferences(basename) {
    const hits = [];
    const needle = basename.toLowerCase();
    for (const file of textFiles) {
        const text = readText(file);
        if (!text || text.toLowerCase().indexOf(needle) < 0) continue;
        const lines = text.split(/\r?\n/);
        lines.forEach((line, i) => {
            if (line.toLowerCase().indexOf(needle) < 0) return;
            hits.push({
                file: path.relative(ROOT, file).replace(/\\/g, '/'),
                line: i + 1,
                kind: classifyReference(line, file),
                text: line.trim().slice(0, 160)
            });
        });
    }
    return hits;
}

/* ── base64 data URLs embedded in text ─────────────────────────────────────── */

function base64Census() {
    const found = [];
    const re = /data:image\/([a-z+]+);base64,([A-Za-z0-9+/=]{256,})/gi;
    for (const file of textFiles) {
        const text = readText(file);
        if (!text || text.indexOf('data:image/') < 0) continue;
        let m;
        while ((m = re.exec(text)) !== null) {
            const bytes = Math.floor(m[2].length * 3 / 4);
            const before = text.slice(0, m.index);
            const line = before.split(/\r?\n/).length;
            let dim = null;
            try {
                dim = dimensions(`x.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
            } catch { /* malformed payload: size still counts */ }
            found.push({
                file: path.relative(ROOT, file).replace(/\\/g, '/'),
                line,
                format: m[1],
                encodedBytes: m[2].length,
                decodedFileBytes: bytes,
                width: dim?.width ?? null,
                height: dim?.height ?? null,
                bitmapBytes: dim?.width && dim?.height ? dim.width * dim.height * 4 : null
            });
        }
    }
    return found.sort((a, b) => (b.bitmapBytes ?? b.decodedFileBytes) - (a.bitmapBytes ?? a.decodedFileBytes));
}

/* ── main ──────────────────────────────────────────────────────────────────── */

const seen = new Set();
const assets = [];
for (const root of ASSET_ROOTS) {
    const abs = path.join(ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXT.has(ext)) continue;
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (seen.has(rel)) continue;
        seen.add(rel);
        let buf;
        try {
            buf = fs.readFileSync(file);
        } catch {
            continue;
        }
        const dim = dimensions(file, buf) || {};
        const bitmapBytes = dim.width && dim.height && !dim.vector
            ? dim.width * dim.height * 4
            : null;
        assets.push({
            path: rel,
            basename: path.basename(file),
            format: ext.replace('.', ''),
            diskBytes: buf.length,
            width: dim.width ?? null,
            height: dim.height ?? null,
            vector: !!dim.vector,
            bitmapBytes
        });
    }
}

// Reference lookup is per basename so duplicated files share it.
const refsByBase = new Map();
for (const asset of assets) {
    if (!refsByBase.has(asset.basename)) {
        refsByBase.set(asset.basename, findReferences(asset.basename));
    }
    asset.references = refsByBase.get(asset.basename);
    const kinds = new Set(asset.references.map((r) => r.kind));
    asset.referenced = asset.references.some((r) => r.kind !== 'COMMENT');
    asset.eager = [...kinds].some((k) => k.startsWith('EAGER'));
}

const mb = (n) => (n == null ? null : +(n / 1048576).toFixed(2));

const loaded = assets.filter((a) => a.referenced);
const orphans = assets.filter((a) => !a.referenced);
const byBitmap = [...loaded].sort((a, b) => (b.bitmapBytes ?? 0) - (a.bitmapBytes ?? 0));

console.log('=== TOP 20 REFERENCED ASSETS BY DECODED (BITMAP) BYTES ===');
console.log(
    ['rank', 'decodedMB', 'diskKB', 'px', 'fmt', 'eager', 'path'].join('\t')
);
byBitmap.slice(0, 20).forEach((a, i) => {
    console.log([
        i + 1,
        mb(a.bitmapBytes) ?? 'vector',
        Math.round(a.diskBytes / 1024),
        a.width && a.height ? `${a.width}x${a.height}` : '-',
        a.format,
        a.eager ? 'EAGER' : 'cond',
        a.path
    ].join('\t'));
});

const totalReferenced = loaded.reduce((s, a) => s + (a.bitmapBytes ?? 0), 0);
const totalEager = loaded.filter((a) => a.eager).reduce((s, a) => s + (a.bitmapBytes ?? 0), 0);
const oversize = loaded.filter((a) => (a.width ?? 0) > 1024 || (a.height ?? 0) > 1024);

console.log('\n=== TOTALS ===');
console.log(JSON.stringify({
    imageFilesOnDisk: assets.length,
    referenced: loaded.length,
    neverReferenced: orphans.length,
    decodedMB_allReferenced: mb(totalReferenced),
    decodedMB_eagerOnly: mb(totalEager),
    diskMB_allReferenced: mb(loaded.reduce((s, a) => s + a.diskBytes, 0)),
    assetsOver1024px: oversize.length,
    decodedMB_over1024px: mb(oversize.reduce((s, a) => s + (a.bitmapBytes ?? 0), 0))
}, null, 2));

console.log('\n=== EVERY REFERENCED ASSET WIDER OR TALLER THAN 1024px ===');
oversize
    .sort((a, b) => (b.bitmapBytes ?? 0) - (a.bitmapBytes ?? 0))
    .forEach((a) => {
        console.log(`\n${a.path}  ${a.width}x${a.height}  disk=${Math.round(a.diskBytes / 1024)}KB  decoded=${mb(a.bitmapBytes)}MB  ${a.eager ? 'EAGER' : 'conditional'}`);
        a.references.filter((r) => r.kind !== 'COMMENT').slice(0, 6).forEach((r) => {
            console.log(`    ${r.kind}  ${r.file}:${r.line}  ${r.text}`);
        });
    });

const b64 = base64Census();
console.log('\n=== BASE64 DATA URLS EMBEDDED IN CSS/JS (top 10) ===');
if (!b64.length) console.log('none over 256 encoded chars');
b64.slice(0, 10).forEach((d) => {
    console.log(`${d.file}:${d.line}  ${d.format}  encoded=${Math.round(d.encodedBytes / 1024)}KB  px=${d.width ?? '?'}x${d.height ?? '?'}  decoded=${mb(d.bitmapBytes) ?? '?'}MB`);
});

const jsonArg = process.argv.indexOf('--json');
if (jsonArg > 0 && process.argv[jsonArg + 1]) {
    fs.writeFileSync(process.argv[jsonArg + 1], JSON.stringify({
        generatedAt: new Date().toISOString(),
        totals: {
            imageFilesOnDisk: assets.length,
            referenced: loaded.length,
            neverReferenced: orphans.length,
            decodedBytesAllReferenced: totalReferenced,
            decodedBytesEagerOnly: totalEager
        },
        assets,
        base64: b64
    }, null, 2));
    console.log(`\nwrote ${process.argv[jsonArg + 1]}`);
}
