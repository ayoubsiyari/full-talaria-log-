/**
 * Pass 2: replace group.remove + append with _prepareRenderGroup in drawing tools.
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

const appendBlockRe = /this\.group = container\.append\('g'\)\s*\n\s*\.attr\('class',\s*'([^']+)'\)\s*\n\s*\.attr\('data-id',\s*this\.id\)\s*\n\s*\.style\('opacity',\s*[^;]+;/g;

function ensureRenderOpts(src) {
    return src.replace(
        /render\(container,\s*scales,\s*renderOptsArg\s*=\s*\{\}\)\s*\{\n(?!\s*const renderOpts = BaseDrawing\.normalizeRenderOpts)/g,
        'render(container, scales, renderOptsArg = {}) {\n        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);\n        const isPreview = renderOpts.isPreview;\n'
    );
}

function migrateFile(filePath) {
    let src = fs.readFileSync(filePath, 'utf8');
    const original = src;

    src = ensureRenderOpts(src);

    src = src.replace(appendBlockRe, (m, className) =>
        `this._prepareRenderGroup(container, '${className}', renderOpts);\n        this._clearDrawingLabels(scales);`
    );

    // Remove one-line remove immediately before _prepareRenderGroup or points guard
    src = src.replace(/if \(this\.group\) this\.group\.remove\(\);\n/g, '');
    src = src.replace(/\/\/ Remove existing if any\n\s*if \(this\.group\) \{\n\s*this\.group\.remove\(\);\n\s*\}\n\n/g, '');

    // createHandles guard (idempotent)
    src = src.replace(
        /(?<!if \(this\._shouldCreateHandles\(renderOpts\)\) )this\.createHandles\(this\.group,\s*scales\);/g,
        'if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);'
    );

    if (src !== original) {
        fs.writeFileSync(filePath, src, 'utf8');
        return true;
    }
    return false;
}

let total = 0;
files.forEach((file) => {
    if (migrateFile(path.join(modulesDir, file))) {
        console.log('Migrated:', file);
        total++;
    }
});
console.log('Pass 2 done. Files changed:', total);
