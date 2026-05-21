/**
 * Pass 3: cleanup stray group.remove, add missing normalizeRenderOpts, fix append variants.
 */
const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '..', 'modules');
const files = fs.readdirSync(modulesDir).filter((f) =>
    f.startsWith('drawing-tools-') &&
    f.endsWith('.js') &&
    f !== 'drawing-tools-manager.js' &&
    f !== 'drawing-tools-ui.js' &&
    f !== 'drawing-tools-base.js'
);

const appendBlockRe = /this\.group = container\.append\('g'\)\s*\n\s*\.attr\('class',\s*'([^']+)'\)\s*\n\s*\.attr\('data-id',\s*this\.id\)\s*(?:\n\s*\.style\('opacity',\s*[^;]+;)?/g;

function migrateFile(filePath) {
    let src = fs.readFileSync(filePath, 'utf8');
    const original = src;

    src = src.replace(
        /render\(container,\s*scales,\s*renderOptsArg\s*=\s*\{\}\)\s*\{\n(?!\s*const renderOpts = BaseDrawing\.normalizeRenderOpts)/g,
        'render(container, scales, renderOptsArg = {}) {\n        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);\n        const isPreview = renderOpts.isPreview;\n'
    );

    src = src.replace(appendBlockRe, (m, className) =>
        `this._prepareRenderGroup(container, '${className}', renderOpts);\n        this._clearDrawingLabels(scales);`
    );

    src = src.replace(/\/\/ Remove existing if any\n\s*if \(this\.group\) \{\n\s*this\.group\.remove\(\);\n\s*\}\n\n/g, '');
    src = src.replace(/        if \(this\.group\) this\.group\.remove\(\);\n/g, '');
    src = src.replace(/        if \(this\.group\) \{\n            this\.group\.remove\(\);\n        \}\n\n/g, '');

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
console.log('Pass 3 done. Files changed:', total);
