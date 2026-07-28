import crypto from 'node:crypto';
import fs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISCOVERY_SIGNATURE = 'TALARIA_SERVABLE_SHELL_DISCOVERY_V1';

const REPO_ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../..');

// The servable universe is pinned here and cross-checked by the preflight against the
// inventory's own roots. An author who narrows the walk to a quiet subtree cannot make the
// gate pass by choosing where it looks.
export const DEFAULT_ROOTS = Object.freeze(['chart v 1.4', 'homepage/public', 'homepage/out']);

// Reasons a shell's loader graph could not be resolved from its own text. Any non-empty set
// means parseComplete=false: the shell may load modules this scanner cannot see.
export const PARSE_HAZARDS = Object.freeze({
  documentWrite: 'document-write-outside-loader',
  esImport: 'es-import',
  importMap: 'import-map',
  importScripts: 'import-scripts',
  injectNonLiteral: 'inject-non-literal-argument',
  pathsNonLiteral: 'paths-array-non-literal',
  rawTextForeignContent: 'raw-text-in-foreign-content',
  scriptDataDoubleEscape: 'script-data-double-escape',
  scriptElementCreation: 'script-element-creation',
  scriptForeignContent: 'script-in-foreign-content',
  scriptHref: 'script-href-attribute',
  scriptSrcUnreadable: 'script-src-unreadable',
  scriptTypeUnreadable: 'script-type-unreadable',
  templateForeignContent: 'template-in-foreign-content',
  worker: 'worker-constructor',
});

function toPosix(value) {
  return String(value).replaceAll('\\', '/');
}

function normalizeRelativePosix(value, label) {
  const normalized = toPosix(value).replace(/^\.\//, '').replace(/\/+$/g, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`${label} must be a repo-relative posix path`);
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`${label} must not escape the repository`);
  }
  return normalized;
}

function stripCacheToken(value) {
  const asString = String(value);
  const queryAt = asString.indexOf('?');
  const hashAt = asString.indexOf('#');
  const cutAt = [queryAt, hashAt].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return cutAt === undefined ? asString : asString.slice(0, cutAt);
}

function stableDigest(values) {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function normalizeLoaderOrder(scriptSrcs) {
  const order = scriptSrcs.map(stripCacheToken);
  return { order, digest: stableDigest(order) };
}

// ---------------------------------------------------------------------------
// One tokenizer walk, no scan order to get wrong.
//
// HTML comments, script text, quoted attribute values and raw-text elements can
// each carry the other's opening sequence. Two independent passes therefore have
// no sound order: whichever runs first can be handed a false region by text the
// other pass would have neutralised, and the loser's markup disappears from the
// scan while the browser still loads it. Both directions of that trade were live
// holes here — `"<!--"` inside a script string swallowing the markup after it, and
// `<!-- <script>var x = " -->` letting the `<script src>` that follows the comment
// vanish into a script region that the browser never opens.
//
// The walk below is the fixed point: a single left-to-right pass in the tokenizer's
// own state order, so each construct is resolved in document order and a construct
// that begins inside an inert region is never a construct at all.
//
// Modelled boundary. Foreign content is tracked as a stack of open `svg`/`math`
// elements, which is enough to know whether markup is HTML or foreign, and no more.
// Two parser behaviours inside foreign content are deliberately not modelled:
//
//   * the breakout start tags (`p`, `div`, `table`, `font` with a presentational
//     attribute and the rest of that list), which pop foreign elements and re-run the
//     token as HTML; and
//   * the HTML integration points (`foreignObject`, `desc`, `title`, `annotation-xml`
//     with an HTML encoding) and the MathML text integration points (`mi`, `mo`, `mn`,
//     `ms`, `mtext`), whose contents are HTML again.
//
// This comment used to claim both were unmodelled in the same, safe direction: that the walk
// only ever keeps treating markup as foreign for longer than a browser would, so the worst
// case is an over-reported `script-in-foreign-content`. The claim is false, and this input is
// the counterexample:
//
//   <svg><desc><title></svg><style></title><script src="/chart/chart.js"></script>
//
// `desc` is an HTML integration point, so a browser runs the `title` start tag under HTML
// rules and switches the tokenizer to escapable raw text. `</svg>` and `<style>` are then
// text, `</title>` ends the run, and the engine script loads. The walk instead reads `title`
// as an ordinary foreign element, honours the `</svg>`, and opens an HTML `<style>` that is
// never closed — so the tail of the document, engine binding included, disappears into a
// raw-text body the browser never opened. Empty loader graph at parseComplete=true: a dropped
// load, which is the direction that must never be reachable.
//
// The region model is deliberately left alone, because inside genuine foreign content those
// same tags really are ordinary elements with markup contents, and consuming them as raw text
// would re-open the W25 hole from the other side. What closes the miss is a hazard: a raw-text
// or escapable-raw-text start tag anywhere inside foreign content means the walk cannot know
// whether the browser opened a text region there, so the shell is named unreadable through
// `raw-text-in-foreign-content` rather than guessed at. Only markup that enters foreign content
// can reach it, so `<style>` and `<title>` in ordinary HTML are untouched.
//
// A `<template>` start tag inside foreign content is named the same way and for the same reason,
// through `template-in-foreign-content`. That one is raised while bounding a template body, where
// the divergence moves the `</template>` the walk trusts to blank a region; the argument is at
// `templateContentEnd`.
// ---------------------------------------------------------------------------

const TAG_TERMINATORS = new Set(['\t', '\n', '\f', '\r', ' ', '/', '>']);
// Content models in which markup is text: nothing inside them can load a script,
// and an HTML comment cannot be opened from inside them either.
const RAW_TEXT_ELEMENTS = new Set(['iframe', 'noembed', 'noframes', 'noscript', 'plaintext', 'style', 'xmp']);
const ESCAPABLE_RAW_TEXT_ELEMENTS = new Set(['textarea', 'title']);
const FOREIGN_CONTENT_ELEMENTS = new Set(['svg', 'math']);
const SCRIPT_DATA = 0;
const SCRIPT_DATA_ESCAPED = 1;
const SCRIPT_DATA_DOUBLE_ESCAPED = 2;

// A named-reference table restricted to the characters that can change what a URL
// means. Anything outside it stays encoded and is reported as an unreadable src
// rather than guessed at.
const NAMED_CHARACTER_REFERENCES = new Map(Object.entries({
  Tab: '\t',
  amp: '&',
  apos: "'",
  colon: ':',
  commat: '@',
  dollar: '$',
  equals: '=',
  excl: '!',
  gt: '>',
  lowbar: '_',
  lpar: '(',
  lt: '<',
  num: '#',
  period: '.',
  quest: '?',
  quot: '"',
  rpar: ')',
  semi: ';',
  sol: '/',
  tilde: '~',
  verbar: '|',
}));

function isSpaceChar(char) {
  return char === '\t' || char === '\n' || char === '\f' || char === '\r' || char === ' ';
}

// True when the tag name at `index` is `name` and is closed off the way the tokenizer
// requires. `</scriptx>` does not end a script element, and a bare `</script` at end of
// input is text, not a tag.
function tagNameAt(html, index, name) {
  if (html.slice(index, index + name.length).toLowerCase() !== name) return false;
  const after = html[index + name.length];
  return after !== undefined && TAG_TERMINATORS.has(after);
}

// Reads the tag beginning at `index`. Attribute values are consumed with their quoting, so
// a `>` or a `<!--` living inside an attribute value can neither terminate the tag nor open
// a comment. Duplicate attributes keep the first value, as the parser does.
function readTag(html, index) {
  const isEndTag = html[index + 1] === '/';
  const nameStart = index + (isEndTag ? 2 : 1);
  if (!/^[A-Za-z]$/.test(html[nameStart] ?? '')) return null;

  let cursor = nameStart;
  while (cursor < html.length && !TAG_TERMINATORS.has(html[cursor])) cursor += 1;
  const name = html.slice(nameStart, cursor).toLowerCase();
  const attributes = new Map();
  let selfClosing = false;

  while (cursor < html.length) {
    const char = html[cursor];
    if (isSpaceChar(char)) {
      cursor += 1;
      continue;
    }
    if (char === '>') {
      return { name, isEndTag, selfClosing, attributes, end: cursor + 1, truncated: false };
    }
    if (char === '/') {
      selfClosing = html[cursor + 1] === '>';
      cursor += 1;
      continue;
    }

    const attributeNameStart = cursor;
    while (cursor < html.length
      && !isSpaceChar(html[cursor])
      && html[cursor] !== '='
      && html[cursor] !== '>'
      && html[cursor] !== '/') cursor += 1;
    const attributeName = html.slice(attributeNameStart, cursor).toLowerCase();
    if (attributeName === '') {
      cursor += 1;
      continue;
    }

    let lookahead = cursor;
    while (lookahead < html.length && isSpaceChar(html[lookahead])) lookahead += 1;
    let value = '';
    if (html[lookahead] === '=') {
      lookahead += 1;
      while (lookahead < html.length && isSpaceChar(html[lookahead])) lookahead += 1;
      const quote = html[lookahead];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, lookahead + 1);
        value = html.slice(lookahead + 1, close === -1 ? html.length : close);
        cursor = close === -1 ? html.length : close + 1;
      } else {
        const valueStart = lookahead;
        while (lookahead < html.length && !isSpaceChar(html[lookahead]) && html[lookahead] !== '>') lookahead += 1;
        value = html.slice(valueStart, lookahead);
        cursor = lookahead;
      }
    }
    if (!attributes.has(attributeName)) attributes.set(attributeName, value);
  }

  return { name, isEndTag, selfClosing, attributes, end: html.length, truncated: true };
}

// Open `svg`/`math` elements, innermost last. A depth counter cannot stand in for the
// names: `</math>` while only an `<svg>` is open is not a pop but a token the parser
// ignores, and a counter that decrements on it returns the walk to the HTML branch a
// level early — which is all it takes for an unterminated `<style>` to swallow the engine
// binding that follows. Only the names can tell those two cases apart.
function inForeignContent(foreignStack) {
  return foreignStack.length > 0;
}

// The standard's foreign-content end-tag walk, narrowed to the two elements that open
// foreign content. The innermost entry carrying the token's name is popped together with
// everything nested inside it; when no entry carries that name the token is ignored, the
// way both "in body" and "in template" ignore an end tag for an element never opened.
function popForeignElement(foreignStack, name) {
  const matchAt = foreignStack.lastIndexOf(name);
  if (matchAt === -1) return;
  foreignStack.length = matchAt;
}

function elementEmptyInCurrentContext(tag, foreignStack) {
  const foreign = inForeignContent(foreignStack) || FOREIGN_CONTENT_ELEMENTS.has(tag.name);
  return tag.truncated || (tag.selfClosing && foreign);
}

function commentEnd(html, start) {
  const contentStart = start + 4;
  if (html[contentStart] === '>') return contentStart + 1;
  if (html[contentStart] === '-' && html[contentStart + 1] === '>') return contentStart + 2;
  for (let cursor = contentStart; cursor < html.length; cursor += 1) {
    if (html.startsWith('-->', cursor)) return cursor + 3;
    if (html.startsWith('--!>', cursor)) return cursor + 4;
  }
  return html.length;
}

function rawTextEnd(html, start, name) {
  for (let cursor = start; cursor < html.length; cursor += 1) {
    if (html[cursor] !== '<' || html[cursor + 1] !== '/' || !tagNameAt(html, cursor + 2, name)) continue;
    const tag = readTag(html, cursor);
    return { contentEnd: cursor, end: tag ? tag.end : html.length };
  }
  return { contentEnd: html.length, end: html.length };
}

// A template body is inert to every content scan, but its *extent* is not: the walk trusts the
// `</template>` it finds here to bound the blanked region. So structural hazards found inside
// the body — markup whose content model the walk cannot resolve, and which therefore moves the
// end tag a browser would honour — are returned to the caller, while the loader and hazard
// scans over the body's text stay suppressed. A `document.write` parked in a template is not a
// load and stays inert; a `<style>` inside `<svg>`, or a script body that reaches the
// double-escaped run, is a `</template>` this walk may be reading in the wrong place, and is
// named for the same reason it would be named at top level.
//
// W27. A `<template>` start tag inside foreign content is the third such hazard, and it was the
// sibling of the W25/W26 witnesses that the two branches below disagreed about: the end-tag
// branch honours `</template>` from anywhere, while the start-tag branch counted depth only in
// HTML content. This input is the witness:
//
//   <template><svg><template></template><style></template><script src="/chart/chart.js"></script>
//
// A browser opens a `template` element in the SVG namespace — `template` is not on the
// foreign-content breakout list — and spends the *first* `</template>` on it, because the
// foreign-content end-tag walk pops the innermost entry up the stack carrying the token's name.
// The `<style>` that follows is then an SVG element with markup contents, and only the *second*
// `</template>` reaches the HTML template and closes it, so the engine script that follows is
// ordinary top-level HTML and loads. This walk never opened the foreign `template` — foreign
// content is modelled as a stack of `svg`/`math` names and nothing below them — so it spent the
// first `</template>` on the body it was bounding, handed the tail back to HTML content a token
// early, and let an unterminated `<style>` swallow the engine binding: empty loader graph at
// parseComplete=true, the one report this scanner may never produce.
//
// Counting depth for the foreign case instead would be a guess in the other direction, because
// which element `</template>` closes depends on structure this walk does not keep: inside an
// HTML integration point (`foreignObject`, `desc`, `title`) a `<template>` is an HTML template
// again, and a foreign `template` left unclosed keeps the HTML one open past markup this walk
// would have released. Both readings are reachable from inputs one token apart, so the walk
// names the ambiguity and lets the shell fail closed.
//
// The `!empty` guard is what keeps the W25 control green: a self-closing `<svg><template/>` is
// acknowledged and popped immediately, so ignoring it is not a guess — it is what a browser
// does, and the following `</template>` really does close the body. In HTML content the slash is
// ignored, so a self-closing `<template/>` there still counts depth.
function templateContentEnd(html, start) {
  let depth = 1;
  const foreignStack = [];
  const hazards = new Set();
  let cursor = start;

  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) break;

    if (html.startsWith('<!--', open)) {
      cursor = Math.max(commentEnd(html, open), open + 1);
      continue;
    }

    const tag = readTag(html, open);
    if (!tag) {
      cursor = open + 1;
      continue;
    }

    const empty = elementEmptyInCurrentContext(tag, foreignStack);
    const foreign = inForeignContent(foreignStack);

    if (tag.isEndTag && FOREIGN_CONTENT_ELEMENTS.has(tag.name)) {
      popForeignElement(foreignStack, tag.name);
      cursor = Math.max(tag.end, open + 1);
      continue;
    }

    if (!foreign && !tag.isEndTag && tag.name === 'script' && !empty) {
      const body = scriptTextEnd(html, tag.end);
      if (body.doubleEscaped) hazards.add(PARSE_HAZARDS.scriptDataDoubleEscape);
      cursor = Math.max(body.end, open + 1);
      continue;
    }
    if (!tag.isEndTag && (RAW_TEXT_ELEMENTS.has(tag.name) || ESCAPABLE_RAW_TEXT_ELEMENTS.has(tag.name))) {
      if (foreign) {
        hazards.add(PARSE_HAZARDS.rawTextForeignContent);
      } else if (!empty) {
        cursor = Math.max(rawTextEnd(html, tag.end, tag.name).end, open + 1);
        continue;
      }
      cursor = Math.max(tag.end, open + 1);
      continue;
    }
    if (!tag.isEndTag && tag.name === 'template' && !empty) {
      // Inside foreign content the walk cannot say which element the next `</template>`
      // closes, so it counts no depth here and names the ambiguity instead.
      if (foreign) hazards.add(PARSE_HAZARDS.templateForeignContent);
      else depth += 1;
      cursor = Math.max(tag.end, open + 1);
      continue;
    }
    if (tag.isEndTag && tag.name === 'template') {
      depth -= 1;
      if (depth === 0) return { contentEnd: open, end: tag.end, hazards };
      // `</template>` pops everything up to the template, so any foreign element opened
      // inside the template body that just closed is gone with it.
      foreignStack.length = 0;
      cursor = Math.max(tag.end, open + 1);
      continue;
    }

    if (!tag.isEndTag && FOREIGN_CONTENT_ELEMENTS.has(tag.name) && !empty) {
      foreignStack.push(tag.name);
    }

    cursor = Math.max(tag.end, open + 1);
  }

  return { contentEnd: html.length, end: html.length, hazards };
}

// Script text is raw text with one exception the tokenizer really does implement: after a
// `<!--`, a nested `<script` opens a double-escaped run in which `</script>` no longer closes
// the element. A shell that reaches that state is reported as a hazard rather than guessed at.
function scriptTextEnd(html, start) {
  let state = SCRIPT_DATA;
  let doubleEscaped = false;
  let cursor = start;

  while (cursor < html.length) {
    if (state !== SCRIPT_DATA_DOUBLE_ESCAPED
      && html[cursor] === '<'
      && html[cursor + 1] === '/'
      && tagNameAt(html, cursor + 2, 'script')) {
      const tag = readTag(html, cursor);
      return { contentEnd: cursor, end: tag ? tag.end : html.length, doubleEscaped };
    }
    if (state === SCRIPT_DATA && html.startsWith('<!--', cursor)) {
      state = SCRIPT_DATA_ESCAPED;
      cursor += 4;
      continue;
    }
    if (state === SCRIPT_DATA_ESCAPED) {
      if (html.startsWith('-->', cursor)) {
        state = SCRIPT_DATA;
        cursor += 3;
        continue;
      }
      if (html[cursor] === '<' && tagNameAt(html, cursor + 1, 'script')) {
        state = SCRIPT_DATA_DOUBLE_ESCAPED;
        doubleEscaped = true;
        cursor += 7;
        continue;
      }
    }
    if (state === SCRIPT_DATA_DOUBLE_ESCAPED) {
      if (html.startsWith('-->', cursor)) {
        state = SCRIPT_DATA_ESCAPED;
        cursor += 3;
        continue;
      }
      if (html[cursor] === '<' && html[cursor + 1] === '/' && tagNameAt(html, cursor + 2, 'script')) {
        state = SCRIPT_DATA_ESCAPED;
        cursor += 8;
        continue;
      }
    }
    cursor += 1;
  }

  return { contentEnd: html.length, end: html.length, doubleEscaped };
}

// `scripts` are the script elements a browser would actually open, in document order.
// `inert` are the ranges no loader can live in: comment contents and raw-text bodies.
export function tokenizeShellDocument(html) {
  const scripts = [];
  const inert = [];
  const hazards = new Set();
  let doubleEscaped = false;
  const foreignStack = [];
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) break;

    if (html.startsWith('<!--', open)) {
      const end = commentEnd(html, open);
      inert.push({ start: open, end });
      index = Math.max(end, open + 1);
      continue;
    }

    const tag = readTag(html, open);
    if (!tag) {
      index = open + 1;
      continue;
    }

    // HTML ignores a self-closing slash on non-void elements. Foreign content honours it, and a
    // truncated tag still fails closed as empty so the walk can keep moving.
    const empty = elementEmptyInCurrentContext(tag, foreignStack);
    const foreign = inForeignContent(foreignStack);

    if (tag.isEndTag && FOREIGN_CONTENT_ELEMENTS.has(tag.name)) {
      popForeignElement(foreignStack, tag.name);
      index = Math.max(tag.end, open + 1);
      continue;
    }

    if (!foreign && !tag.isEndTag && tag.name === 'template' && !empty) {
      const body = templateContentEnd(html, tag.end);
      for (const hazard of body.hazards) hazards.add(hazard);
      inert.push({ start: tag.end, end: body.contentEnd });
      index = Math.max(body.end, open + 1);
      continue;
    }

    if (!tag.isEndTag && tag.name === 'script') {
      const contentStart = tag.end;
      const body = empty
        ? { contentEnd: contentStart, end: contentStart, doubleEscaped: false }
        : scriptTextEnd(html, contentStart);
      if (body.doubleEscaped) doubleEscaped = true;
      if (foreign) hazards.add(PARSE_HAZARDS.scriptForeignContent);
      if (tag.attributes.has('href') || tag.attributes.has('xlink:href')) hazards.add(PARSE_HAZARDS.scriptHref);
      scripts.push({
        tagStart: open,
        start: contentStart,
        end: body.contentEnd,
        attributes: tag.attributes,
        foreign,
      });
      index = Math.max(body.end, open + 1);
      continue;
    }

    if (!tag.isEndTag && FOREIGN_CONTENT_ELEMENTS.has(tag.name) && !empty) {
      foreignStack.push(tag.name);
      index = Math.max(tag.end, open + 1);
      continue;
    }

    if (!tag.isEndTag && (RAW_TEXT_ELEMENTS.has(tag.name) || ESCAPABLE_RAW_TEXT_ELEMENTS.has(tag.name))) {
      if (foreign) {
        hazards.add(PARSE_HAZARDS.rawTextForeignContent);
      } else if (!empty) {
        const body = rawTextEnd(html, tag.end, tag.name);
        inert.push({ start: tag.end, end: body.contentEnd });
        index = Math.max(body.end, open + 1);
        continue;
      }
      index = Math.max(tag.end, open + 1);
      continue;
    }

    index = Math.max(tag.end, open + 1);
  }

  return { scripts, inert, doubleEscaped, hazards: [...hazards].sort() };
}

function decodeCharacterReferences(value) {
  return value.replace(/&(#[Xx][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (match, body) => {
    if (body[0] !== '#') return NAMED_CHARACTER_REFERENCES.get(body) ?? match;
    const code = body[1] === 'x' || body[1] === 'X'
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return match;
    return String.fromCodePoint(code);
  });
}

// A src the browser resolves but this scanner cannot read is not a src it may drop: an
// undecodable reference left in the path is reported as unreadable, which fails the shell
// closed instead of comparing a mangled path against the module contract.
function scriptSourceOf(attributes) {
  if (!attributes.has('src')) return { present: false, value: null };
  const decoded = decodeCharacterReferences(String(attributes.get('src')))
    .replace(/[\t\n\f\r]/g, '')
    .trim();
  const value = stripCacheToken(decoded);
  if (value === '' || value.includes('&')) return { present: true, value: null };
  return { present: true, value };
}

function scriptTypeOf(attributes) {
  if (!attributes.has('type')) return { present: false, value: '', unreadable: false };
  const decoded = decodeCharacterReferences(String(attributes.get('type')))
    .trim()
    .toLowerCase();
  if (decoded.includes('&')) return { present: true, value: null, unreadable: true };
  return { present: true, value: decoded, unreadable: false };
}

function isImportMapScript(attributes) {
  const type = scriptTypeOf(attributes);
  return type.value === 'importmap';
}

function isExecutableScriptType(attributes) {
  const type = scriptTypeOf(attributes);
  if (type.unreadable) return false;
  if (type.value === 'module') return true;
  const essence = type.value.split(';', 1)[0].trim();
  const classic = essence === ''
    || essence === 'text/javascript'
    || essence === 'application/javascript'
    || essence === 'text/ecmascript'
    || essence === 'application/ecmascript'
    || essence === 'application/x-javascript'
    || essence === 'text/javascript1.0'
    || essence === 'text/javascript1.1'
    || essence === 'text/javascript1.2'
    || essence === 'text/javascript1.3'
    || essence === 'text/javascript1.4'
    || essence === 'text/javascript1.5'
    || essence === 'text/jscript'
    || essence === 'text/livescript'
    || essence === 'text/x-javascript';
  return classic && !attributes.has('nomodule');
}

function isFunctionDeclaration(html, index) {
  return /\bfunction\s*$/.test(html.slice(Math.max(0, index - 24), index));
}

function matchingBraceIndex(value, openBraceIndex) {
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;

  for (let index = openBraceIndex; index < value.length; index++) {
    const char = value[index];
    const next = value[index + 1];

    if (lineComment) {
      if (char === '\n' || char === '\r') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        index++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index++;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function helperDefinitionSpans(html) {
  const spans = [];
  const helperName = String.raw`(?:inject|__loadHostOnlyScript)`;
  const patterns = [
    new RegExp(String.raw`\bfunction\s+${helperName}\s*\([^)]*\)\s*\{`, 'g'),
    new RegExp(String.raw`(?:(?:\b(?:const|let|var)\s+)|(?:\b(?:window|globalThis|self)\s*\.\s*)?)${helperName}\s*=\s*(?:async\s+)?function(?:\s+\w+)?\s*\([^)]*\)\s*\{`, 'g'),
    new RegExp(String.raw`(?:(?:\b(?:const|let|var)\s+)|(?:\b(?:window|globalThis|self)\s*\.\s*)?)${helperName}\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{`, 'g'),
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const openBraceIndex = match.index + match[0].lastIndexOf('{');
      const closeBraceIndex = matchingBraceIndex(html, openBraceIndex);
      if (closeBraceIndex >= 0) {
        spans.push({ start: match.index, end: closeBraceIndex + 1 });
      }
    }
  }

  return spans;
}

// Length-preserving blanking. Every scan text below has the same index space as the source
// HTML, so positions taken from one view can be compared against spans taken from another.
function blankRanges(value, ranges) {
  if (ranges.length === 0) return value;
  const units = value.split('');
  for (const { start, end } of ranges) {
    for (let index = Math.max(0, start); index < Math.min(end, units.length); index++) {
      if (units[index] !== '\n' && units[index] !== '\r') units[index] = ' ';
    }
  }
  return units.join('');
}

function replaceRange(units, start, replacement) {
  for (let offset = 0; offset < replacement.length; offset++) {
    units[start + offset] = replacement[offset];
  }
}

function stripJavaScriptCommentsAndStrings(value) {
  let output = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const next = value[index + 1];

    if (lineComment) {
      if (char === '\n' || char === '\r') {
        lineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        blockComment = false;
        index++;
      } else {
        output += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        output += ' ';
        if (index + 1 < value.length) {
          output += value[index + 1] === '\n' || value[index + 1] === '\r' ? value[index + 1] : ' ';
          index++;
        }
      } else if (char === quote) {
        output += ' ';
        quote = null;
      } else {
        output += char === '\n' || char === '\r' ? char : ' ';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      lineComment = true;
      index++;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      blockComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      output += ' ';
      quote = char;
      continue;
    }

    output += char;
  }

  return output;
}

// Both views are derived from the one tokenizer walk, so no scan can invent a region the
// walk did not find. Inert ranges are blanked in both; the code view additionally drops
// JavaScript comment and string contents inside the live script bodies.
function scanTexts(html) {
  const { scripts, inert, doubleEscaped, hazards } = tokenizeShellDocument(html);
  const regions = scripts.map((script) => ({
    start: script.start,
    end: script.end,
    hasSrc: script.attributes.has('src'),
    isImportMap: isImportMapScript(script.attributes),
    typeUnreadable: scriptTypeOf(script.attributes).unreadable,
    executable: isExecutableScriptType(script.attributes),
  }));

  const nonExecutableScriptBodies = regions
    .filter((region) => !region.executable)
    .map((region) => ({ start: region.start, end: region.end }));
  const literalScanText = blankRanges(html, [...inert, ...nonExecutableScriptBodies]);
  const units = literalScanText.split('');
  for (const region of regions) {
    if (!region.executable) continue;
    replaceRange(units, region.start, stripJavaScriptCommentsAndStrings(literalScanText.slice(region.start, region.end)));
  }

  return { scripts, regions, doubleEscaped, hazards, literalScanText, codeScanText: units.join('') };
}

function inSpans(spans, index) {
  return spans.some((span) => span.start <= index && index < span.end);
}

function hasUnrecognizedScriptElementCreation(html, helperSpans) {
  for (const match of html.matchAll(/\b(?:document\.)?createElement\s*\(\s*["']script["']\s*\)/gi)) {
    if (!inSpans(helperSpans, match.index)) return true;
  }

  return false;
}

// Any document.write outside a recognized loader helper is opaque: the written string can be
// assembled at runtime, so requiring a literal `<script` in the argument only detects the
// authors who were not hiding anything.
function hasUnrecognizedDocumentWrite(codeScanText, helperSpans) {
  for (const match of codeScanText.matchAll(/\bdocument\s*\.\s*write(?:ln)?\s*\(/gi)) {
    if (!inSpans(helperSpans, match.index)) return true;
  }

  return false;
}

// Scanned on the code view only, and only inside inline script bodies: the word "import"
// is common in prose, comments and UI strings, and none of those load a module. A bare
// `import` at statement position is a reserved word and can only be a module load.
function hasEsImport({ regions, codeScanText }) {
  for (const region of regions) {
    if (!region.executable) continue;
    if (region.hasSrc) continue;
    const code = codeScanText.slice(region.start, region.end);
    if (/(?:^|[^.\w$])import\s*\(/.test(code)) return true;
    if (/(?:^|[;{}\n])\s*import\s/.test(code)) return true;
  }

  return false;
}

function withoutCommentsAndStrings(value) {
  return stripJavaScriptCommentsAndStrings(value);
}

function scriptSources(html) {
  const values = [];
  const hazards = new Set();
  let sequence = 0;
  const texts = scanTexts(html);
  const { scripts, regions, doubleEscaped, codeScanText, literalScanText } = texts;
  const helperSpans = helperDefinitionSpans(codeScanText);

  const addSource = (index, value) => {
    values.push({ index, sequence: sequence++, value });
  };

  for (const script of scripts) {
    const src = scriptSourceOf(script.attributes);
    if (!src.present) continue;
    if (src.value === null) {
      hazards.add(PARSE_HAZARDS.scriptSrcUnreadable);
      continue;
    }
    if (!isExecutableScriptType(script.attributes)) continue;
    addSource(script.tagStart, src.value);
  }

  for (const match of literalScanText.matchAll(/\b(?:inject|__loadHostOnlyScript)\s*\(([\s\S]*?)\)/g)) {
    if (isFunctionDeclaration(literalScanText, match.index)) continue;
    const literal = match[0].match(/^(?:inject|__loadHostOnlyScript)\s*\(\s*(["'])([^"']+\.(?:mjs|js)(?:[?#][^"']*)?)\1\s*\)$/);
    if (literal) {
      addSource(match.index, stripCacheToken(literal[2]));
    } else {
      hazards.add(PARSE_HAZARDS.injectNonLiteral);
    }
  }

  for (const block of literalScanText.matchAll(/(?:var|const|let)\s+paths\s*=\s*\[([\s\S]*?)\]/g)) {
    const blockContentAt = block.index + block[0].indexOf(block[1]);
    for (const match of block[1].matchAll(/["']([^"']+\.(?:mjs|js)(?:[?#][^"']*)?)["']/g)) {
      addSource(blockContentAt + match.index, stripCacheToken(match[1]));
    }
    if (withoutCommentsAndStrings(block[1]).replace(/[,\s]/g, '') !== '') {
      hazards.add(PARSE_HAZARDS.pathsNonLiteral);
    }
  }

  if (hasUnrecognizedScriptElementCreation(literalScanText, helperSpans)) {
    hazards.add(PARSE_HAZARDS.scriptElementCreation);
  }
  if (hasUnrecognizedDocumentWrite(codeScanText, helperSpans)) {
    hazards.add(PARSE_HAZARDS.documentWrite);
  }
  if (/\bimportScripts\s*\(/.test(literalScanText)) {
    hazards.add(PARSE_HAZARDS.importScripts);
  }
  if (hasEsImport(texts)) {
    hazards.add(PARSE_HAZARDS.esImport);
  }
  if (/\bnew\s+(?:Shared)?Worker\s*\(/.test(codeScanText)) {
    hazards.add(PARSE_HAZARDS.worker);
  }
  if (regions.some((region) => region.isImportMap)) {
    hazards.add(PARSE_HAZARDS.importMap);
  }
  if (regions.some((region) => region.typeUnreadable)) {
    hazards.add(PARSE_HAZARDS.scriptTypeUnreadable);
  }
  if (doubleEscaped) {
    hazards.add(PARSE_HAZARDS.scriptDataDoubleEscape);
  }
  for (const hazard of texts.hazards) {
    hazards.add(hazard);
  }

  return {
    values: values
      .sort((a, b) => a.index - b.index || a.sequence - b.sequence)
      .map((entry) => entry.value),
    scriptCount: scripts.length,
    parseComplete: hazards.size === 0,
    parseIncompleteReasons: [...hazards].sort(),
  };
}

function defaultReadFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function defaultListFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true });
}

function entryDetails(directory, entry) {
  if (typeof entry === 'string') {
    const absolute = nodePath.isAbsolute(entry) ? entry : nodePath.join(directory, entry);
    const stat = fs.statSync(absolute);
    return {
      name: nodePath.basename(entry),
      absolute,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
    };
  }

  const absolute = nodePath.join(directory, entry.name);
  return {
    name: entry.name,
    absolute,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  };
}

function walkHtmlFiles({ directory, relativeDirectory, listFiles, found }) {
  const entries = listFiles(directory)
    .map((entry) => entryDetails(directory, entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory) {
      walkHtmlFiles({ directory: entry.absolute, relativeDirectory: relative, listFiles, found });
    } else if (entry.isFile && entry.name.toLowerCase().endsWith('.html')) {
      found.push({ absolute: entry.absolute, relative: toPosix(relative) });
    }
  }
}

// The chart engine is identified by basename, so `chart.js`, `./chart.js`, `/chart/chart.js`
// and `../../chart/chart.js` all bind the shell to the exposure class.
export function referencesChartEngine(src) {
  return stripCacheToken(src).split('/').pop().toLowerCase() === 'chart.js';
}

export function shellFacts(html, documentPath) {
  const relativePath = normalizeRelativePosix(documentPath, 'path');
  const htmlText = String(html);
  const stampTokens = [...new Set(htmlText.match(/\d{8}b\d+/g) || [])].sort();
  const extracted = scriptSources(htmlText);
  const loader = normalizeLoaderOrder(extracted.values);

  return {
    path: relativePath,
    sizeBytes: Buffer.byteLength(htmlText, 'utf8'),
    stampTokens,
    scriptSrcs: loader.order,
    loaderDigest: loader.digest,
    // Script elements the tokenizer walk actually opens: a `<script` sitting inside a comment,
    // an attribute value or a raw-text body is text, and is not counted here.
    scriptCount: extracted.scriptCount,
    referencesChartJs: loader.order.some((src) => referencesChartEngine(src)),
    parseComplete: extracted.parseComplete,
    parseIncompleteReasons: extracted.parseIncompleteReasons,
  };
}

export function discoverShells({
  root = REPO_ROOT,
  roots = DEFAULT_ROOTS,
  readFile = defaultReadFile,
  listFiles = defaultListFiles,
} = {}) {
  const normalizedRoots = roots.map((entry) => normalizeRelativePosix(entry, 'root'));
  const shells = [];

  for (const relativeRoot of normalizedRoots) {
    const absoluteRoot = nodePath.resolve(root, ...relativeRoot.split('/'));
    const files = [];
    walkHtmlFiles({ directory: absoluteRoot, relativeDirectory: relativeRoot, listFiles, found: files });
    for (const file of files) {
      shells.push(shellFacts(readFile(file.absolute), file.relative));
    }
  }

  shells.sort((a, b) => a.path.localeCompare(b.path));
  return { signature: DISCOVERY_SIGNATURE, roots: normalizedRoots, shells };
}
