/**
 * teardown-handler-match.mjs
 *
 * Handler-level teardown census. Counting addEventListener against removeEventListener says nothing:
 * removeEventListener only detaches when the handler is the SAME FUNCTION REFERENCE, so a listener
 * registered with an inline arrow or a fresh .bind(this) can never be removed no matter how many
 * remove calls the file contains. Those sites are unremovable BY CONSTRUCTION and need the
 * registration changed, not a remove call added — which is a different unit of work, and the reason
 * a count is not a plan.
 *
 * Same logic for timers: a setTimeout whose id is never stored cannot be cleared.
 *
 * No parser is available in this repo, so the source is masked (strings, template literals, comments
 * and regex literals blanked, length-preserving) before scanning. A self-check runs first over
 * synthetic fixtures of every shape and refuses to report if any is misclassified.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------------------ masking */

/** Blank out strings/comments/regex, preserving offsets and length so slices map back cleanly. */
export function maskSource(src) {
    const out = src.split('');
    const n = src.length;
    let i = 0;
    // Tracks whether a '/' starts a regex literal or is division.
    let prevMeaningful = '';
    const blank = (from, to) => {
        for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    while (i < n) {
        const c = src[i];
        const d = src[i + 1];
        if (c === '/' && d === '/') {
            let j = i + 2;
            while (j < n && src[j] !== '\n') j++;
            blank(i, j);
            i = j;
            continue;
        }
        if (c === '/' && d === '*') {
            let j = i + 2;
            while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            blank(i, Math.min(j + 2, n));
            i = j + 2;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) break;
                j++;
            }
            blank(i + 1, j);
            i = j + 1;
            prevMeaningful = 'x';
            continue;
        }
        if (c === '/' && /[=(,:[!&|?{};+\-*%<>~^]|^$/.test(prevMeaningful)) {
            // Regex literal position.
            let j = i + 1;
            let inClass = false;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '[') inClass = true;
                else if (src[j] === ']') inClass = false;
                else if (src[j] === '/' && !inClass) break;
                else if (src[j] === '\n') { j = -1; break; }
                j++;
            }
            if (j > 0) {
                blank(i + 1, j);
                i = j + 1;
                prevMeaningful = 'x';
                continue;
            }
        }
        if (!/\s/.test(c)) prevMeaningful = c;
        i++;
    }
    return out.join('');
}

/* ------------------------------------------------------------------ scanning */

function matchParen(masked, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function splitTopLevelArgs(text) {
    const args = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) {
            args.push(text.slice(start, i));
            start = i + 1;
        }
    }
    args.push(text.slice(start));
    return args.map((a) => a.trim()).filter((a) => a.length);
}

/** Walk backwards from a '.' to capture the receiver expression. */
function receiverBefore(masked, dotIdx) {
    let i = dotIdx - 1;
    while (i >= 0 && /\s/.test(masked[i])) i--;
    const end = i + 1;
    let depth = 0;
    while (i >= 0) {
        const c = masked[i];
        if (c === ')' || c === ']') depth++;
        else if (c === '(' || c === '[') {
            if (depth === 0) break;
            depth--;
        } else if (depth === 0 && !/[A-Za-z0-9_$.]/.test(c)) break;
        i--;
    }
    return masked.slice(i + 1, end).trim();
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/**
 * Can this handler argument ever be passed to removeEventListener as the same reference?
 * The distinction the whole census exists to make.
 */
export function classifyHandler(expr) {
    const e = expr.trim();
    if (/^(async\s+)?function\b/.test(e)) return 'INLINE_FUNCTION';
    if (/^\(?[A-Za-z0-9_$,\s{}[\]:=]*\)?\s*=>/.test(e) && /=>/.test(e)) return 'INLINE_ARROW';
    if (/\.bind\s*\(/.test(e)) return 'FRESH_BIND';
    if (/^[A-Za-z_$][\w$]*$/.test(e)) return 'NAMED_REF';
    if (/^this\.[\w$.]+$/.test(e)) return 'STORED_REF';
    if (/^[\w$]+\.[\w$.]+$/.test(e)) return 'STORED_REF';
    return 'OTHER';
}

const REMOVABLE = new Set(['NAMED_REF', 'STORED_REF']);

export function scanListeners(src) {
    const masked = maskSource(src);
    const sites = [];
    for (const kind of ['addEventListener', 'removeEventListener']) {
        const re = new RegExp(`\\.${kind}\\s*\\(`, 'g');
        let m;
        while ((m = re.exec(masked))) {
            const openIdx = masked.indexOf('(', m.index);
            const closeIdx = matchParen(masked, openIdx);
            if (closeIdx === -1) continue;
            const args = splitTopLevelArgs(masked.slice(openIdx + 1, closeIdx));
            const rawArgs = splitTopLevelArgs(src.slice(openIdx + 1, closeIdx));
            sites.push({
                kind,
                line: lineOf(src, m.index),
                target: receiverBefore(masked, m.index),
                // Event type comes from a string literal, which masking blanked — read the original.
                type: (rawArgs[0] || '').replace(/^['"`]|['"`]$/g, '').trim(),
                handler: (args[1] || '').replace(/\s+/g, ' ').trim(),
                rawHandler: (rawArgs[1] || '').replace(/\s+/g, ' ').trim()
            });
        }
    }
    return sites;
}

export function scanTimers(src) {
    const masked = maskSource(src);
    const out = [];
    const re = /\b(setTimeout|setInterval|requestAnimationFrame|setImmediate)\s*\(/g;
    let m;
    while ((m = re.exec(masked))) {
        // Definition sites and property lookups are not scheduling calls.
        const before = masked.slice(Math.max(0, m.index - 40), m.index);
        if (/[.\w$]$/.test(before.trimEnd()) && !/(=|\(|,|;|\{|\}|return|await)\s*$/.test(before.trimEnd())) continue;
        const stmtStart = Math.max(
            masked.lastIndexOf(';', m.index),
            masked.lastIndexOf('{', m.index),
            masked.lastIndexOf('\n', m.index)
        );
        const lead = masked.slice(stmtStart + 1, m.index);
        const assigned = /(=|\breturn\b)\s*$/.test(lead.trim()) || /=\s*$/.test(lead.trim());
        const slot = assigned ? (lead.match(/([\w$.[\]']+)\s*=\s*$/) || [])[1] || null : null;
        out.push({ api: m[1], line: lineOf(src, m.index), retained: !!slot, slot });
    }
    return out;
}

export function scanClears(src) {
    const masked = maskSource(src);
    const out = [];
    const re = /\b(clearTimeout|clearInterval|cancelAnimationFrame)\s*\(/g;
    let m;
    while ((m = re.exec(masked))) {
        const openIdx = masked.indexOf('(', m.index);
        const closeIdx = matchParen(masked, openIdx);
        out.push({
            api: m[1],
            line: lineOf(src, m.index),
            arg: masked.slice(openIdx + 1, closeIdx).replace(/\s+/g, ' ').trim()
        });
    }
    return out;
}

/* ------------------------------------------------------------------ self-check */

const FIXTURE = `
class T {
    attach() {
        window.addEventListener('resize', () => this.a());          // F1 inline arrow
        document.addEventListener('keydown', function (e) { });      // F2 inline function
        window.addEventListener('blur', this.onBlur.bind(this));     // F3 fresh bind
        this._onScroll = () => {};
        window.addEventListener('scroll', this._onScroll);           // F4 stored, removed below
        document.addEventListener('click', namedHandler);            // F5 named, never removed
        window.removeEventListener('scroll', this._onScroll);
        this._t = setTimeout(() => {}, 10);                          // F6 retained
        setTimeout(() => {}, 20);                                    // F7 bare
        this._raf = requestAnimationFrame(() => {});                 // F8 retained
        requestAnimationFrame(() => {});                             // F9 bare
        clearTimeout(this._t);
        const s = "window.addEventListener('DECOY', x)";             // must NOT be seen
        // window.addEventListener('COMMENT_DECOY', x)               must NOT be seen
    }
}
`;

function selfCheck() {
    const L = scanListeners(FIXTURE);
    const adds = L.filter((s) => s.kind === 'addEventListener');
    const problems = [];
    const expect = [
        ['resize', 'INLINE_ARROW'],
        ['keydown', 'INLINE_FUNCTION'],
        ['blur', 'FRESH_BIND'],
        ['scroll', 'STORED_REF'],
        ['click', 'NAMED_REF']
    ];
    if (adds.length !== expect.length) {
        problems.push(`expected ${expect.length} add sites, saw ${adds.length}: ${adds.map((a) => a.type)}`);
    }
    expect.forEach(([type, cls], i) => {
        const a = adds[i];
        if (!a) return problems.push(`missing add site ${type}`);
        if (a.type !== type) problems.push(`site ${i} type ${a.type} !== ${type}`);
        const got = classifyHandler(a.handler);
        if (got !== cls) problems.push(`site ${type} classified ${got}, expected ${cls}`);
    });
    if (L.some((s) => s.type === 'DECOY' || s.type === 'COMMENT_DECOY')) {
        problems.push('masking failed: string or comment decoy was scanned');
    }
    const timers = scanTimers(FIXTURE);
    const retained = timers.filter((t) => t.retained).length;
    const bare = timers.filter((t) => !t.retained).length;
    if (retained !== 2) problems.push(`expected 2 retained timers, saw ${retained}`);
    if (bare !== 2) problems.push(`expected 2 bare timers, saw ${bare}`);
    return problems;
}

/* ------------------------------------------------------------------ report */

const problems = selfCheck();
if (problems.length) {
    console.error('SELF-CHECK FAILED — census not reported, the instrument is wrong:');
    for (const p of problems) console.error('  ' + p);
    process.exit(2);
}
console.log('self-check: 5 listener shapes + 4 timer shapes classified correctly, decoys masked\n');

const target = process.argv[2] || path.join('chart v 1.4', 'chart', 'modules', 'order-manager.js');
const src = fs.readFileSync(path.join(REPO, target), 'utf8');
console.log(`${target}  (${src.split('\n').length.toLocaleString()} lines)\n`);

const listeners = scanListeners(src);
const adds = listeners.filter((s) => s.kind === 'addEventListener');
const removes = listeners.filter((s) => s.kind === 'removeEventListener');

const norm = (s) => `${s.target}|${s.type}|${s.handler}`;
const removeKeys = new Set(removes.map(norm));

const buckets = { unremovable: [], removableNotRemoved: [], matched: [], other: [] };
for (const a of adds) {
    const cls = classifyHandler(a.handler);
    if (!REMOVABLE.has(cls)) buckets.unremovable.push({ ...a, cls });
    else if (removeKeys.has(norm(a))) buckets.matched.push({ ...a, cls });
    else buckets.removableNotRemoved.push({ ...a, cls });
}

console.log('=== LISTENERS ===');
console.log(`  add sites .................. ${adds.length}`);
console.log(`  remove sites ............... ${removes.length}`);
console.log(`  MATCHED (same reference) ... ${buckets.matched.length}`);
console.log(`  removable, never removed ... ${buckets.removableNotRemoved.length}`);
console.log(`  UNREMOVABLE by construction  ${buckets.unremovable.length}`);
const byCls = {};
for (const b of buckets.unremovable) byCls[b.cls] = (byCls[b.cls] || 0) + 1;
for (const [k, v] of Object.entries(byCls)) console.log(`      ${k}: ${v}`);

const globals = (s) => /^(window|document|globalThis|window\.parent|window\.top)$/.test(s.target);
console.log(`\n  on window/document (survive a realm) .... ${adds.filter(globals).length}`);
console.log(`      of those, UNREMOVABLE ................ ${buckets.unremovable.filter(globals).length}`);
console.log(`      of those, removable but not removed .. ${buckets.removableNotRemoved.filter(globals).length}`);

console.log('\n  global-target sites needing work (first 40):');
for (const b of [...buckets.unremovable, ...buckets.removableNotRemoved].filter(globals).sort((x, y) => x.line - y.line).slice(0, 40)) {
    console.log(`    ${String(b.line).padStart(6)}  ${b.cls.padEnd(16)} ${b.target}.${b.type}`);
}

const timers = scanTimers(src);
const clears = scanClears(src);
const clearedSlots = new Set(clears.map((c) => c.arg));
const byApi = {};
for (const t of timers) {
    const k = t.api;
    byApi[k] = byApi[k] || { total: 0, retained: 0, cleared: 0 };
    byApi[k].total++;
    if (t.retained) {
        byApi[k].retained++;
        if (clearedSlots.has(t.slot)) byApi[k].cleared++;
    }
}
console.log('\n=== TIMERS / FRAMES ===');
for (const [api, v] of Object.entries(byApi)) {
    console.log(`  ${api.padEnd(24)} sites=${String(v.total).padStart(3)}  id retained=${String(v.retained).padStart(3)}  retained AND cleared=${String(v.cleared).padStart(3)}  UNCANCELLABLE=${v.total - v.retained}`);
}
console.log(`  clear/cancel call sites: ${clears.length}`);

console.log('\n=== EXISTING TEARDOWN ===');
for (const name of ['destroy', '_m20A1Teardown', 'dispose', 'cleanup', 'detach']) {
    const c = (src.match(new RegExp(`\\n    ${name}\\s*\\(`, 'g')) || []).length;
    console.log(`  ${name.padEnd(20)} defined: ${c}`);
}
