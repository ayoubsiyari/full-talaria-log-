const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'modules');
const files = [
    'drawing-tools-channels.js',
    'drawing-tools-fib-gann.js',
    'drawing-tools-advanced-volume.js',
    'drawing-tools-image.js'
];

for (const f of files) {
    const fp = path.join(dir, f);
    let s = fs.readFileSync(fp, 'utf8');

    s = s.replace(
        /this\._clearDrawingLabels\(scales\);\.style\('pointer-events', 'none'\)\s*\n\s*\.style\('cursor', 'default'\)\s*\n\s*\.style\('opacity', this\.visible \? \(this\.style\.opacity \|\| 1\) : 0\);/g,
        "this._clearDrawingLabels(scales);\n        this.group.style('pointer-events', 'none')\n            .style('cursor', 'default')\n            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);"
    );
    s = s.replace(
        /this\._clearDrawingLabels\(scales\);\.style\('pointer-events', 'none'\)\s*\n\s*\.style\('cursor', 'default'\);/g,
        "this._clearDrawingLabels(scales);\n        this.group.style('pointer-events', 'none').style('cursor', 'default');"
    );
    s = s.replace(
        /this\._clearDrawingLabels\(scales\);\.style\('pointer-events', 'none'\);/g,
        "this._clearDrawingLabels(scales);\n        this.group.style('pointer-events', 'none');"
    );
    s = s.replace(
        /this\._clearDrawingLabels\(scales\);\.attr\('transform', `translate\(\$\{x\}, \$\{y\}\)`\)\s*\n\s*\.style\('opacity', this\.visible \? \(this\.style\.opacity \|\| 1\) : 0\);/g,
        "this._clearDrawingLabels(scales);\n        this.group.attr('transform', `translate(${x}, ${y})`)\n            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);"
    );

    s = s.replace(/^        if \(this\.group\) \{\r?\n            this\.group\.remove\(\);\r?\n        \}\r?\n\r?\n/gm, '');

    fs.writeFileSync(fp, s);
    console.log('fixed', f);
}
