/**
 * One-time migration: wire all drawing tool render() methods to BaseDrawing._prepareRenderGroup
 * for TradingView-style hot-path reuse during pan/resize.
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
    let changed = false;

    // Signature: isPreview default param -> renderOptsArg
    const sigPreview = /render\(container,\s*scales,\s*isPreview\s*=\s*false\)/g;
    if (sigPreview.test(src)) {
        src = src.replace(sigPreview, 'render(container, scales, renderOptsArg = {})');
        changed = true;
    }

    const sigBasic = /render\(container,\s*scales\)(?!\s*,)/g;
    if (sigBasic.test(src)) {
        src = src.replace(sigBasic, 'render(container, scales, renderOptsArg = {})');
        changed = true;
    }

    // Insert normalizeRenderOpts after render( opening brace when missing
    src = src.replace(
        /render\(container,\s*scales,\s*renderOptsArg\s*=\s*\{\}\)\s*\{\n(?!\s*const renderOpts = BaseDrawing\.normalizeRenderOpts)/g,
        (match) => `${match}        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);\n        const isPreview = renderOpts.isPreview;\n`
    );

    // Pattern: one-line remove + append block with class
    const blockRe = /if \(this\.group\) this\.group\.remove\(\);\n(?:\s*if \(this\.points[^\n]*\n)?\s*this\.group = container\.append\('g'\)\n\s*\.attr\('class',\s*'([^']+)'\)\n\s*\.attr\('data-id',\s*this\.id\)\n\s*\.style\('opacity',\s*[^)]+\);/g;
    src = src.replace(blockRe, (match, className) => {
        changed = true;
        return `this._prepareRenderGroup(container, '${className}', renderOpts);\n        this._clearDrawingLabels(scales);`;
    });

    // Pattern: multiline remove block + append
    const blockRe2 = /\/\/ Remove existing if any\n\s*if \(this\.group\) \{\n\s*this\.group\.remove\(\);\n\s*\}\n\n\s*if \(this\.points[^\n]*\n[\s\S]*?this\.group = container\.append\('g'\)\n\s*\.attr\('class',\s*'([^']+)'\)\n\s*\.attr\('data-id',\s*this\.id\)\n\s*\.style\('opacity',\s*[^)]+\);/g;
    src = src.replace(blockRe2, (match, className) => {
        changed = true;
        return match.replace(
            /\/\/ Remove existing if any\n\s*if \(this\.group\) \{\n\s*this\.group\.remove\(\);\n\s*\}\n\n/,
            ''
        ).replace(
            /this\.group = container\.append\('g'\)\n\s*\.attr\('class',\s*'[^']+'\)\n\s*\.attr\('data-id',\s*this\.id\)\n\s*\.style\('opacity',\s*[^)]+\);/,
            `this._prepareRenderGroup(container, '${className}', renderOpts);\n        this._clearDrawingLabels(scales);`
        );
    });

    // createHandles guard
    src = src.replace(
        /this\.createHandles\(this\.group,\s*scales\);/g,
        () => {
            changed = true;
            return 'if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);';
        }
    );

    if (changed) {
        fs.writeFileSync(filePath, src, 'utf8');
    }
    return changed;
}

let total = 0;
files.forEach((file) => {
    const fp = path.join(modulesDir, file);
    if (migrateFile(fp)) {
        console.log('Migrated:', file);
        total++;
    }
});
console.log('Done. Files changed:', total);
