/**
 * Pass 4: inject normalizeRenderOpts everywhere; strip redundant group.remove before _prepareRenderGroup.
 */
const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '..', 'modules');
const files = fs.readdirSync(modulesDir).filter((f) =>
    f.startsWith('drawing-tools-') &&
    f.endsWith('.js') &&
    f !== 'drawing-tools-manager.js' &&
    f !== 'drawing-tools-ui.js'
);

function migrateFile(filePath) {
    let src = fs.readFileSync(filePath, 'utf8');
    const original = src;

    const marker = '        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);';
    src = src.replace(/render\(container,\s*scales,\s*renderOptsArg\s*=\s*\{\}\)\s*\{/g, (match, offset) => {
        const after = src.slice(offset + match.length, offset + match.length + 120);
        if (after.includes('const renderOpts = BaseDrawing.normalizeRenderOpts')) {
            return match;
        }
        return `${match}\n${marker}\n        const isPreview = renderOpts.isPreview;`;
    });

    // Also handle render(container, scales) without third arg in base destroy area - skip

    src = src.replace(/\/\/ Remove existing if any\n\s*if \(this\.group\) \{\n\s*this\.group\.remove\(\);\n\s*\}\n\n/g, '');
    src = src.replace(/^        if \(this\.group\) this\.group\.remove\(\);\n/gm, '');
    src = src.replace(/^        if \(this\.group\) \{\n            this\.group\.remove\(\);\n        \}\n\n/gm, '');

    if (src !== original) {
        fs.writeFileSync(filePath, src, 'utf8');
        return true;
    }
    return false;
}

let total = 0;
files.forEach((file) => {
    if (migrateFile(path.join(modulesDir, file))) {
        console.log('Fixed:', file);
        total++;
    }
});
console.log('Pass 4 done. Files changed:', total);
