/**
 * png-downscale.mjs — box-downsample a PNG with no third-party dependencies.
 *
 *   node scripts/png-downscale.mjs <in.png> <out.png> <maxEdgePx>
 *   node scripts/png-downscale.mjs --selftest
 *
 * Why hand-rolled: this machine has no ImageMagick, no PIL and no sharp, and adding an
 * image dependency to a product repo hours before a canary to resize four logos is a
 * worse trade than 150 lines of zlib. Node ships the only hard part (inflate/deflate).
 *
 * Supported: bit depth 8, colour types 0/2/3/4/6, non-interlaced — which covers every
 * asset in this repo. Anything else is REFUSED loudly rather than silently mangled.
 *
 * The output is always RGBA (colour type 6). Logos here are flat colour with sharp
 * edges, and a box filter over an integer-ish ratio is the right resampler for that:
 * no ringing, no halo, and it averages the alpha edge so the wordmark stays clean.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

function readChunks(buf) {
    if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
    const chunks = [];
    let i = 8;
    while (i < buf.length) {
        const len = buf.readUInt32BE(i);
        const type = buf.toString('ascii', i + 4, i + 8);
        chunks.push({ type, data: buf.subarray(i + 8, i + 8 + len) });
        i += 12 + len;
    }
    return chunks;
}

function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** @returns {{width:number,height:number,rgba:Buffer}} */
function decode(buf) {
    const chunks = readChunks(buf);
    const ihdr = chunks.find((c) => c.type === 'IHDR');
    if (!ihdr) throw new Error('no IHDR');
    const width = ihdr.data.readUInt32BE(0);
    const height = ihdr.data.readUInt32BE(4);
    const depth = ihdr.data[8];
    const colour = ihdr.data[9];
    const interlace = ihdr.data[12];
    if (depth !== 8) throw new Error(`REFUSED: bit depth ${depth} unsupported (need 8)`);
    if (interlace !== 0) throw new Error('REFUSED: interlaced PNG unsupported');
    if (!(colour in CHANNELS)) throw new Error(`REFUSED: colour type ${colour}`);

    const palette = chunks.find((c) => c.type === 'PLTE');
    const trns = chunks.find((c) => c.type === 'tRNS');
    if (colour === 3 && !palette) throw new Error('REFUSED: palette image without PLTE');

    const idat = zlib.inflateSync(
        Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
    );

    const ch = CHANNELS[colour];
    const stride = width * ch;
    const raw = Buffer.alloc(height * stride);

    // Undo the per-scanline filters (PNG spec 9.2).
    let pos = 0;
    for (let y = 0; y < height; y++) {
        const filter = idat[pos++];
        const line = idat.subarray(pos, pos + stride);
        pos += stride;
        const cur = raw.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= ch ? cur[x - ch] : 0;
            const b = prev ? prev[x] : 0;
            const c = prev && x >= ch ? prev[x - ch] : 0;
            let v = line[x];
            switch (filter) {
                case 0: break;
                case 1: v = (v + a) & 0xff; break;
                case 2: v = (v + b) & 0xff; break;
                case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
                    break;
                }
                default: throw new Error(`bad filter ${filter} on row ${y}`);
            }
            cur[x] = v;
        }
    }

    // Normalise to RGBA.
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, n = width * height; i < n; i++) {
        const s = i * ch;
        const d = i * 4;
        if (colour === 6) {
            raw.copy(rgba, d, s, s + 4);
        } else if (colour === 2) {
            rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2]; rgba[d + 3] = 255;
        } else if (colour === 0) {
            rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s]; rgba[d + 3] = 255;
        } else if (colour === 4) {
            rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s]; rgba[d + 3] = raw[s + 1];
        } else {
            const idx = raw[s];
            rgba[d] = palette.data[idx * 3];
            rgba[d + 1] = palette.data[idx * 3 + 1];
            rgba[d + 2] = palette.data[idx * 3 + 2];
            rgba[d + 3] = trns && idx < trns.data.length ? trns.data[idx] : 255;
        }
    }
    return { width, height, rgba };
}

/**
 * Box downsample. Alpha-weighted on the colour channels so transparent source pixels
 * cannot drag a halo into the edge — the usual way a naive resize ruins a wordmark.
 */
function downscale({ width, height, rgba }, outW, outH) {
    const out = Buffer.alloc(outW * outH * 4);
    for (let y = 0; y < outH; y++) {
        const y0 = Math.floor((y * height) / outH);
        const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outH));
        for (let x = 0; x < outW; x++) {
            const x0 = Math.floor((x * width) / outW);
            const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outW));
            let r = 0, g = 0, b = 0, a = 0, wsum = 0, n = 0;
            for (let sy = y0; sy < y1; sy++) {
                for (let sx = x0; sx < x1; sx++) {
                    const s = (sy * width + sx) * 4;
                    const alpha = rgba[s + 3];
                    r += rgba[s] * alpha;
                    g += rgba[s + 1] * alpha;
                    b += rgba[s + 2] * alpha;
                    a += alpha;
                    wsum += alpha;
                    n += 1;
                }
            }
            const d = (y * outW + x) * 4;
            out[d] = wsum ? Math.round(r / wsum) : 0;
            out[d + 1] = wsum ? Math.round(g / wsum) : 0;
            out[d + 2] = wsum ? Math.round(b / wsum) : 0;
            out[d + 3] = Math.round(a / n);
        }
    }
    return { width: outW, height: outH, rgba: out };
}

function encode({ width, height, rgba }) {
    const stride = width * 4;
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 1; // Sub filter: cheap and effective on flat artwork.
        const src = rgba.subarray(y * stride, (y + 1) * stride);
        const dst = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            dst[x] = (src[x] - (x >= 4 ? src[x - 4] : 0)) & 0xff;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        PNG_SIG,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

export function resizeFile(inPath, outPath, maxEdge) {
    const src = decode(fs.readFileSync(inPath));
    const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
    if (scale >= 1) return { skipped: true, width: src.width, height: src.height };
    const outW = Math.max(1, Math.round(src.width * scale));
    const outH = Math.max(1, Math.round(src.height * scale));
    const buf = encode(downscale(src, outW, outH));
    fs.writeFileSync(outPath, buf);
    return {
        skipped: false,
        from: { width: src.width, height: src.height },
        to: { width: outW, height: outH },
        diskBytes: buf.length,
        decodedBytesBefore: src.width * src.height * 4,
        decodedBytesAfter: outW * outH * 4
    };
}

/* ── self-test: the resizer must be proven before it touches shipped art ── */
function selftest() {
    let failures = 0;
    const check = (name, cond, detail = '') => {
        console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
        if (!cond) failures += 1;
    };

    // A 4x4 image: opaque red left half, transparent right half.
    const w = 4, h = 4;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const d = (y * w + x) * 4;
            if (x < 2) { rgba[d] = 255; rgba[d + 3] = 255; }
        }
    }
    const png = encode({ width: w, height: h, rgba });
    const round = decode(png);
    check('round-trip dimensions', round.width === 4 && round.height === 4);
    check('round-trip pixels are byte-identical', round.rgba.equals(rgba));

    const half = downscale({ width: w, height: h, rgba }, 2, 2);
    const p0 = half.rgba.subarray(0, 4);
    const p1 = half.rgba.subarray(4, 8);
    check('left pixel stays fully opaque red', p0[0] === 255 && p0[3] === 255, `rgba=${[...p0]}`);
    check('right pixel stays fully transparent', p1[3] === 0, `rgba=${[...p1]}`);

    // Alpha weighting: a half-transparent black pixel beside an opaque red one must not
    // drag the colour towards black more than its alpha justifies.
    const mix = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0]);
    const mixed = downscale({ width: 2, height: 1, rgba: mix }, 1, 1);
    check(
        'transparent neighbour does not darken the colour (alpha-weighted)',
        mixed.rgba[0] === 255,
        `r=${mixed.rgba[0]} (naive average would be 128)`
    );
    check('averaged alpha is the mean', mixed.rgba[3] === 128, `a=${mixed.rgba[3]}`);

    const refused = (() => {
        try {
            const bad = Buffer.concat([PNG_SIG, chunk('IHDR', (() => {
                const d = Buffer.alloc(13);
                d.writeUInt32BE(2, 0); d.writeUInt32BE(2, 4); d[8] = 16; d[9] = 6;
                return d;
            })())]);
            decode(bad);
            return false;
        } catch (e) {
            return /REFUSED/.test(e.message);
        }
    })();
    check('unsupported bit depth is REFUSED, not mangled', refused);

    console.log(failures ? `\n${failures} FAILURE(S)` : '\nself-test GREEN');
    process.exit(failures ? 1 : 0);
}

if (process.argv[2] === '--selftest') selftest();
else if (process.argv.length >= 5) {
    const [, , inPath, outPath, maxEdge] = process.argv;
    console.log(JSON.stringify(resizeFile(inPath, outPath, Number(maxEdge)), null, 2));
}
